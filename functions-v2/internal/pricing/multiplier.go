package pricing

// LegacyMultiplier — tabla de tramos legacy por distancia (priceCalculator.ts
// getMultiplier). Fallback cuando services.price_per_km <= 0.
func LegacyMultiplier(distanceKm float64, vehicleType, rideType string) float64 {
	switch {
	case rideType == "designated_driver":
		switch {
		case distanceKm >= 0.01 && distanceKm <= 0.2:
			return 16
		case distanceKm >= 0.201 && distanceKm <= 1:
			return 24
		case distanceKm >= 1.01 && distanceKm <= 2:
			return 30
		case distanceKm >= 2.01 && distanceKm <= 3:
			return 32.5
		case distanceKm >= 3.01 && distanceKm <= 4.5:
			return 28.5
		case distanceKm >= 4.51 && distanceKm <= 6:
			return 26
		case distanceKm >= 6.01 && distanceKm <= 8:
			return 24.5
		case distanceKm >= 8.01 && distanceKm <= 9.5:
			return 20.5
		case distanceKm >= 9.51:
			return 21.5
		default:
			return 2
		}
	case vehicleType == "motorcycle" || vehicleType == "moto":
		switch {
		case distanceKm >= 0.1 && distanceKm <= 2:
			return 2
		case distanceKm >= 2.01 && distanceKm <= 4:
			return 4
		case distanceKm >= 4.01 && distanceKm <= 6:
			return 6
		case distanceKm >= 6.01:
			return 7
		default:
			return 2
		}
	default: // car/auto
		switch {
		case distanceKm >= 0.01 && distanceKm <= 0.2:
			return 13
		case distanceKm >= 0.201 && distanceKm <= 0.7:
			return 16
		case distanceKm >= 0.701 && distanceKm <= 1:
			return 19
		case distanceKm >= 1.01 && distanceKm <= 2:
			return 14
		case distanceKm >= 2.01 && distanceKm <= 3:
			return 11
		case distanceKm >= 3.01 && distanceKm <= 4.5:
			return 11.5
		case distanceKm >= 4.51 && distanceKm <= 6:
			return 12
		case distanceKm >= 6.01 && distanceKm <= 8:
			return 13
		case distanceKm >= 8.01:
			return 12.5
		default:
			return 2
		}
	}
}

// MapRideTypeToServiceCode — mapa legacy (vehicle+ride → service.code).
func MapRideTypeToServiceCode(vehicleType, rideType string) string {
	if rideType == "designated_driver" {
		if vehicleType == "motorcycle" || vehicleType == "moto" {
			return "designated_driver_moto"
		}
		return "designated_driver_auto"
	}
	if vehicleType == "motorcycle" || vehicleType == "moto" {
		return "motorcycle"
	}
	return "normal"
}

// FallbackCommissionRate — defaults del RPC unificado (mismo CASE en SQL).
func FallbackCommissionRate(serviceCode string) float64 {
	switch serviceCode {
	case "designated_driver_moto":
		return 0.125
	case "designated_driver_auto", "designated_driver":
		return 0.25
	case "motorcycle":
		return 0.075
	case "night":
		return 0.12
	default:
		return 0.15
	}
}
