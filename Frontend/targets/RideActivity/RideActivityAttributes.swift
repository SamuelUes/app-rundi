import ActivityKit

// Keep this struct in sync with modules/rundi-native/ios/RideActivityAttributes.swift
// (the app process encodes, the widget extension decodes — layouts must match).
struct RideActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var rideId: String
        var price: Double
        var distanceKm: Double
        var clientName: String
        var variant: String
    }
}
