import ExpoModulesCore
import CallKit
import PushKit
import AVFoundation
import UIKit

public class CallKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CallKitModule")

    Events("onCallKitAnswer", "onCallKitEnd", "onVoipToken")

    OnStartObserving {
      CallKitManager.shared.onAction = { [weak self] event, body in
        self?.sendEvent(event, body)
      }
      CallKitManager.shared.flushPending()
      VoipPushManager.shared.onToken = { [weak self] token in
        self?.sendEvent("onVoipToken", ["token": token])
      }
    }

    OnStopObserving {
      CallKitManager.shared.onAction = nil
      VoipPushManager.shared.onToken = nil
    }

    AsyncFunction("reportIncomingCall") { (callId: String, callerName: String) -> Bool in
      CallKitManager.shared.reportIncomingCall(callId: callId, callerName: callerName)
      return true
    }

    AsyncFunction("answerCall") { (callId: String) -> Bool in
      CallKitManager.shared.answerCall(callId: callId)
      return true
    }

    AsyncFunction("endCall") { (callId: String) -> Bool in
      CallKitManager.shared.endCall(callId: callId)
      return true
    }

    AsyncFunction("reportCallEnded") { (callId: String, reason: String) -> Bool in
      CallKitManager.shared.reportCallEnded(callId: callId, reason: reason)
      return true
    }

    AsyncFunction("endAllCalls") { () -> Bool in
      CallKitManager.shared.endAllCalls()
      return true
    }

    AsyncFunction("getVoipToken") { () -> String? in
      VoipPushManager.shared.cachedToken
    }
  }
}

// MARK: - CallKit

final class CallKitManager: NSObject {
  static let shared = CallKitManager()

  var onAction: ((_ event: String, _ body: [String: Any?]) -> Void)?

  private let provider: CXProvider
  private let callController = CXCallController()
  private var uuidsByCallId: [String: UUID] = [:]
  private var reportedCallIds = Set<String>()
  // Acciones CallKit ocurridas antes de que JS suscriba listeners (cold start
  // por respuesta a llamada con la app muerta). Se vacían en OnStartObserving.
  private var pendingActions: [(String, [String: Any?])] = []

  override init() {
    let configuration = CXProviderConfiguration()
    configuration.supportsVideo = false
    configuration.maximumCallsPerCallGroup = 1
    configuration.supportedHandleTypes = [.generic]
    provider = CXProvider(configuration: configuration)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  private func uuid(for callId: String) -> UUID {
    if let existing = uuidsByCallId[callId] { return existing }
    let created = UUID()
    uuidsByCallId[callId] = created
    return created
  }

  private func callId(for uuid: UUID) -> String? {
    uuidsByCallId.first(where: { $0.value == uuid })?.key
  }

  private func emit(_ event: String, _ body: [String: Any?]) {
    if let onAction {
      onAction(event, body)
    } else {
      pendingActions.append((event, body))
    }
  }

  func flushPending() {
    guard let onAction, !pendingActions.isEmpty else { return }
    let queued = pendingActions
    pendingActions.removeAll()
    for (event, body) in queued {
      onAction(event, body)
    }
  }

  func reportIncomingCall(callId: String, callerName: String) {
    // Dedupe: el mismo callId puede llegar por push VoIP y por el listener
    // de Firestore a la vez; reportarlo dos veces duplicaría la UI nativa.
    guard !reportedCallIds.contains(callId) else { return }
    let update = CXCallUpdate()
    update.localizedCallerName = callerName
    update.hasVideo = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsHolding = false
    provider.reportNewIncomingCall(with: uuid(for: callId), update: update) { _ in }
    reportedCallIds.insert(callId)
  }

  func answerCall(callId: String) {
    guard let uuid = uuidsByCallId[callId] else { return }
    callController.request(CXTransaction(action: CXAnswerCallAction(call: uuid))) { _ in }
  }

  func endCall(callId: String) {
    guard let uuid = uuidsByCallId[callId] else { return }
    callController.request(CXTransaction(action: CXEndCallAction(call: uuid))) { _ in }
  }

  func reportCallEnded(callId: String, reason: String) {
    guard let uuid = uuidsByCallId[callId] else { return }
    let endedReason: CXCallEndedReason =
      reason == "unanswered" ? .unanswered :
      reason == "failed" ? .failed : .remoteEnded
    provider.reportCall(with: uuid, endedAt: Date(), reason: endedReason)
    uuidsByCallId.removeValue(forKey: callId)
  }

  func endAllCalls() {
    for uuid in uuidsByCallId.values {
      callController.request(CXTransaction(action: CXEndCallAction(call: uuid))) { _ in }
    }
  }
}

extension CallKitManager: CXProviderDelegate {
  func providerDidReset(_ provider: CXProvider) {
    uuidsByCallId.removeAll()
    reportedCallIds.removeAll()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    action.fulfill()
    if let callId = callId(for: action.callUUID) {
      emit("onCallKitAnswer", ["callId": callId])
    }
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    action.fulfill()
    if let callId = callId(for: action.callUUID) {
      uuidsByCallId.removeValue(forKey: callId)
      emit("onCallKitEnd", ["callId": callId])
    }
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    // LiveKit gestiona su propia audio session al conectar al room.
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}

// MARK: - PushKit (VoIP pushes — llamadas entrantes con la app muerta)

final class VoipPushManager: NSObject {
  static let shared = VoipPushManager()

  var onToken: ((_ token: String) -> Void)?
  private(set) var cachedToken: String?
  private var registry: PKPushRegistry?

  // Debe llamarse en main thread durante el launch (VoipPushAppDelegateSubscriber).
  func start() {
    guard registry == nil else { return }
    let registry = PKPushRegistry(queue: .main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    self.registry = registry
  }
}

extension VoipPushManager: PKPushRegistryDelegate {
  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    cachedToken = token
    onToken?(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    cachedToken = nil
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    // iOS 13+: el push VoIP DEBE reportarse a CallKit en este callback o el
    // sistema mata la app. Corre 100% en nativo (JS puede ni estar vivo).
    let data = payload.dictionaryPayload
    let callId = data["callId"] as? String ?? UUID().uuidString
    let callerName = data["callerName"] as? String ?? "Rundi"
    CallKitManager.shared.reportIncomingCall(callId: callId, callerName: callerName)
    completion()
  }
}

// Inicia PKPushRegistry en el launch sin esperar a que JS requiera el módulo
// (sin registry no llega el push VoIP con la app muerta).
public class VoipPushAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    VoipPushManager.shared.start()
    return true
  }
}
