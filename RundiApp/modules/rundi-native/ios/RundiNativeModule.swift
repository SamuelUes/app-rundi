import ExpoModulesCore
import UIKit

public class RundiNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RundiNative")

    Events("onOverlayOpened", "onOverlayClosed", "onOverlayClicked")

    AsyncFunction("liveActivitiesEnabled") { () -> Bool in
      guard #available(iOS 16.1, *) else { return false }
      return RideActivityManager.shared.areActivitiesEnabled()
    }

    AsyncFunction("hasRideActivity") { () -> Bool in
      guard #available(iOS 16.1, *) else { return false }
      return RideActivityManager.shared.currentActivity() != nil
    }

    AsyncFunction("showRideActivity") { (payload: RideActivityPayload) async throws -> Bool in
      guard #available(iOS 16.1, *) else { return false }
      return try await RideActivityManager.shared.showOrUpdate(payload: payload)
    }

    AsyncFunction("hideRideActivity") { () async -> Bool in
      guard #available(iOS 16.1, *) else { return true }
      await RideActivityManager.shared.endAll()
      return true
    }

    AsyncFunction("openLiveActivitySettings") { () async -> Bool in
      await MainActor.run {
        if let url = URL(string: UIApplication.openSettingsURLString) {
          UIApplication.shared.open(url)
        }
      }
      return true
    }
  }
}
