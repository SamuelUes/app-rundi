import ExpoModulesCore
import CallKit
import AVFoundation

public class CallKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CallKitModule")

    Events("onCallKitAnswer", "onCallKitEnd")

    OnStartObserving {
      CallKitManager.shared.onAction = { [weak self] event, body in
        self?.sendEvent(event, body)
      }
    }

    OnStopObserving {
      CallKitManager.shared.onAction = nil
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
  }
}

final class CallKitManager: NSObject {
  static let shared = CallKitManager()

  var onAction: ((_ event: String, _ body: [String: Any?]) -> Void)?

  private let provider: CXProvider
  private let callController = CXCallController()
  private var uuidsByCallId: [String: UUID] = [:]

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

  func reportIncomingCall(callId: String, callerName: String) {
    let update = CXCallUpdate()
    update.localizedCallerName = callerName
    update.hasVideo = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsHolding = false
    provider.reportNewIncomingCall(with: uuid(for: callId), update: update) { _ in }
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
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    action.fulfill()
    if let callId = callId(for: action.callUUID) {
      onAction?("onCallKitAnswer", ["callId": callId])
    }
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    action.fulfill()
    if let callId = callId(for: action.callUUID) {
      uuidsByCallId.removeValue(forKey: callId)
      onAction?("onCallKitEnd", ["callId": callId])
    }
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    // LiveKit gestiona su propia audio session al conectar al room.
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}
