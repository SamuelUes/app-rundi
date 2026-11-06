import ActivityKit
import SwiftUI
import WidgetKit

private enum RideActivityUI {
    static let fallbackRideId = "__overlay_home__"
    static let deepLinkScheme = "com.gruporzc.rundi"

    static func deepLink(rideId: String) -> URL? {
        let encoded = rideId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? rideId
        return URL(string: "\(deepLinkScheme)://overlay?rideId=\(encoded)")
    }

    static func isFallback(_ state: RideActivityAttributes.ContentState) -> Bool {
        state.variant != "nearby_ride" || state.rideId == fallbackRideId
    }

    static func features(_ state: RideActivityAttributes.ContentState) -> [String] {
        guard !isFallback(state) else { return [] }
        let codes = state.featureCodes ?? []
        return ["senior", "pet_friendly", "premium"].filter { codes.contains($0) }
    }

    static func featureSymbol(_ code: String) -> String {
        switch code {
        case "senior": return "figure.walk"
        case "pet_friendly": return "pawprint.fill"
        default: return "star.circle.fill"
        }
    }

    static func featureLabel(_ code: String) -> String {
        switch code {
        case "senior": return "Adulto mayor"
        case "pet_friendly": return "Mascotas"
        default: return "Prémium"
        }
    }

    static var priceFormatter: NumberFormatter {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        return formatter
    }

    static func priceText(_ price: Double) -> String {
        let value = NSNumber(value: price)
        return "C$\(priceFormatter.string(from: value) ?? "\(Int(price))")"
    }

    static func distanceText(_ km: Double) -> String {
        if km < 1 {
            return "\(Int((km * 1000).rounded())) m"
        }
        return String(format: "%.1f km", km)
    }
}

@main
struct RideActivityBundle: WidgetBundle {
    var body: some Widget {
        RideActivityLiveActivity()
    }
}

struct RideActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RideActivityAttributes.self) { context in
            LockScreenRideView(state: context.state)
                .widgetURL(RideActivityUI.deepLink(rideId: context.state.rideId))
                .activityBackgroundTint(Color("rideBackground"))
                .activitySystemActionForegroundColor(Color("rideAccent"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        Image("appIcon")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 36, height: 36)
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        Text("Rundi")
                            .font(.headline)
                            .foregroundStyle(Color("rideText"))
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if RideActivityUI.isFallback(context.state) {
                        Image(systemName: "car.fill")
                            .foregroundStyle(Color("rideAccent"))
                            .font(.title3)
                    } else {
                        Text(RideActivityUI.priceText(context.state.price))
                            .font(.title3.weight(.bold))
                            .foregroundStyle(Color("rideAccent"))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Group {
                        if RideActivityUI.isFallback(context.state) {
                            Text("Listo para nuevos viajes")
                                .font(.subheadline)
                                .foregroundStyle(Color("rideSubtext"))
                        } else {
                            Link(destination: RideActivityUI.deepLink(rideId: context.state.rideId) ?? URL(string: "\(RideActivityUI.deepLinkScheme)://")!) {
                                HStack(spacing: 10) {
                                    Label(RideActivityUI.distanceText(context.state.distanceKm), systemImage: "location.fill")
                                        .font(.subheadline.weight(.medium))
                                    RideFeatureIcons(state: context.state)
                                    if !context.state.clientName.isEmpty {
                                        Text(context.state.clientName)
                                            .font(.subheadline)
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                    Text("Ver viaje")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Color("rideAccent"))
                                }
                                .foregroundStyle(Color("rideText"))
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                if let feature = RideActivityUI.features(context.state).first {
                    Image(systemName: RideActivityUI.featureSymbol(feature))
                        .foregroundStyle(Color("rideAccent"))
                        .accessibilityLabel(Text(RideActivityUI.featureLabel(feature)))
                } else {
                    Image("appIcon")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 20, height: 20)
                        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                }
            } compactTrailing: {
                if RideActivityUI.isFallback(context.state) {
                    Image(systemName: "car.fill")
                        .foregroundStyle(Color("rideAccent"))
                        .font(.caption)
                } else {
                    Text(RideActivityUI.priceText(context.state.price))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color("rideAccent"))
                }
            } minimal: {
                if RideActivityUI.isFallback(context.state) {
                    Image("appIcon")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .clipShape(Circle())
                } else if let feature = RideActivityUI.features(context.state).first {
                    Image(systemName: RideActivityUI.featureSymbol(feature))
                        .foregroundStyle(Color("rideAccent"))
                        .accessibilityLabel(Text(RideActivityUI.featureLabel(feature)))
                } else {
                    Image(systemName: "car.fill")
                        .foregroundStyle(Color("rideAccent"))
                }
            }
        }
    }
}

private struct RideFeatureIcons: View {
    let state: RideActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 5) {
            ForEach(RideActivityUI.features(state), id: \.self) { feature in
                Image(systemName: RideActivityUI.featureSymbol(feature))
                    .accessibilityLabel(Text(RideActivityUI.featureLabel(feature)))
            }
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(Color("rideAccent"))
    }
}

private struct LockScreenRideView: View {
    let state: RideActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            Image("appIcon")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

            if RideActivityUI.isFallback(state) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Rundi")
                        .font(.headline)
                        .foregroundStyle(Color("rideText"))
                    Text("Listo para nuevos viajes")
                        .font(.subheadline)
                        .foregroundStyle(Color("rideSubtext"))
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Viaje cercano")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color("rideSubtext"))
                    HStack(spacing: 6) {
                        Text(RideActivityUI.priceText(state.price))
                            .font(.headline.weight(.bold))
                            .foregroundStyle(Color("rideAccent"))
                        Text("•")
                            .foregroundStyle(Color("rideSubtext"))
                        Text(RideActivityUI.distanceText(state.distanceKm))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color("rideText"))
                        RideFeatureIcons(state: state)
                    }
                    if !state.clientName.isEmpty {
                        Text(state.clientName)
                            .font(.caption)
                            .foregroundStyle(Color("rideSubtext"))
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right.circle.fill")
                .font(.title2)
                .foregroundStyle(Color("rideAccent"))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}
