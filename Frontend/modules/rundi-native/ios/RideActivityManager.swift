import ActivityKit
import ExpoModulesCore
import UIKit

struct RideActivityPayload: Record {
    @Field var rideId: String = ""
    @Field var price: Double = 0
    @Field var distanceKm: Double = 0
    @Field var clientName: String? = nil
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
            variant: payload.variant
        )

        if #available(iOS 16.2, *) {
            let content = ActivityContent(state: state, staleDate: nil)

            if let existing = currentActivity() {
                await existing.update(content)
                return true
            }

            _ = try Activity<RideActivityAttributes>.request(
                attributes: RideActivityAttributes(),
                content: content,
                pushType: nil
            )
            return true
        }

        if let existing = currentActivity() {
            await existing.update(using: state)
            return true
        }

        _ = try Activity<RideActivityAttributes>.request(
            attributes: RideActivityAttributes(),
            contentState: state,
            pushType: nil
        )
        return true
    }

    func endAll() async {
        for activity in Activity<RideActivityAttributes>.activities {
            if #available(iOS 16.2, *) {
                await activity.end(
                    ActivityContent(state: activity.content.state, staleDate: nil),
                    dismissalPolicy: .immediate
                )
            } else {
                await activity.end(using: activity.contentState, dismissalPolicy: .immediate)
            }
        }
    }
}
