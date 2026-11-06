import ActivityKit
import ExpoModulesCore
import UIKit

struct RideActivityPayload: Record {
    @Field var rideId: String = ""
    @Field var price: Double = 0
    @Field var distanceKm: Double = 0
    @Field var clientName: String? = nil
    @Field var featureCodes: [String] = []
    @Field var variant: String = "app"
}

@available(iOS 16.1, *)
final class RideActivityManager {
    static let shared = RideActivityManager()

    func areActivitiesEnabled() -> Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func currentActivity() -> Activity<RideActivityAttributes>? {
        Activity<RideActivityAttributes>.activities.first
    }

    @discardableResult
    func showOrUpdate(payload: RideActivityPayload) async throws -> Bool {
        let state = RideActivityAttributes.ContentState(
            rideId: payload.rideId,
            price: payload.price,
            distanceKm: payload.distanceKm,
            clientName: payload.clientName ?? "",
            featureCodes: payload.featureCodes,
            variant: payload.variant
        )

        // Activity.request exige la app en foreground ("Target is not
        // foreground"); los update de una activity existente sí corren en
        // background. Sin activity activa + app en background → skip.
        let canRequest = await MainActor.run {
            UIApplication.shared.applicationState == .active
        }

        let content = ActivityContent(state: state, staleDate: nil)

        if let existing = currentActivity() {
            await existing.update(content)
            return true
        }
        guard canRequest else { return false }

        _ = try Activity<RideActivityAttributes>.request(
            attributes: RideActivityAttributes(),
            content: content,
            pushType: nil
        )
        return true
    }

    func endAll() async {
        for activity in Activity<RideActivityAttributes>.activities {
            await activity.end(
                ActivityContent(state: activity.content.state, staleDate: nil),
                dismissalPolicy: .immediate
            )
        }
    }
}
