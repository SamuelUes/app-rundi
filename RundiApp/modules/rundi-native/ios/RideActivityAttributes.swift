import ActivityKit

// Keep this struct in sync with targets/RideActivity/RideActivityAttributes.swift
// (the app process encodes, the widget extension decodes — layouts must match).
@available(iOS 16.1, *)
struct RideActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var rideId: String
        var price: Double
        var distanceKm: Double
        var clientName: String
        var variant: String
    }
}
