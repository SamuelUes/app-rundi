package compliance

import "time"

type DailyContext struct {
	DriverID, VehicleID               string
	ServiceCodes                      []string
	DriverGeneration, RulesGeneration int64
	EngineVersion                     string
	InputGenerations                  map[string]int64
}

type DailyDecision struct {
	Allowed                bool
	Status                 string
	Reasons                []Reason
	Day                    string
	EvaluatedAt, ExpiresAt time.Time
	Context                DailyContext
}

// recordableDailyDecision — una decisión solo se almacena si está completa:
// permitida, con día Nicaragua coherente, vigencia dentro del día y todas las
// señales presentes. Guardar menos que esto podría leerse luego como permiso.
func recordableDailyDecision(d DailyDecision) bool {
	if !d.Allowed || d.Day == "" || d.EvaluatedAt.IsZero() || d.ExpiresAt.IsZero() {
		return false
	}
	day, end := NicaraguaDayWindow(d.EvaluatedAt)
	if d.Day != day || !d.ExpiresAt.After(d.EvaluatedAt) || d.ExpiresAt.After(end) {
		return false
	}
	c := d.Context
	if c.DriverID == "" || c.VehicleID == "" || c.EngineVersion == "" ||
		c.DriverGeneration <= 0 || c.RulesGeneration <= 0 ||
		len(c.ServiceCodes) == 0 || len(c.InputGenerations) == 0 {
		return false
	}
	for _, code := range c.ServiceCodes {
		if code == "" {
			return false
		}
	}
	for key, version := range c.InputGenerations {
		if key == "" || version <= 0 {
			return false
		}
	}
	return true
}

// ReusableDailyDecision requires authoritative signals and an expiration no
// later than every time-dependent input, including service expiry.
func ReusableDailyDecision(d DailyDecision, current DailyContext, now time.Time) bool {
	if !recordableDailyDecision(d) || now.IsZero() || now.Before(d.EvaluatedAt) {
		return false
	}
	currentDay, _ := NicaraguaDayWindow(now)
	if currentDay != d.Day || !now.Before(d.ExpiresAt) {
		return false
	}
	cached := d.Context
	if cached.DriverID != current.DriverID || cached.VehicleID != current.VehicleID ||
		cached.EngineVersion != current.EngineVersion ||
		cached.DriverGeneration != current.DriverGeneration || cached.RulesGeneration != current.RulesGeneration {
		return false
	}
	if !sameServiceCodes(cached.ServiceCodes, current.ServiceCodes) ||
		cached.InputGenerations == nil || current.InputGenerations == nil ||
		len(cached.InputGenerations) != len(current.InputGenerations) {
		return false
	}
	for key, version := range cached.InputGenerations {
		if current.InputGenerations[key] != version {
			return false
		}
	}
	return true
}

func sameServiceCodes(a, b []string) bool {
	if len(a) == 0 || len(a) != len(b) {
		return false
	}
	set := make(map[string]bool, len(a))
	for _, code := range a {
		if code == "" || set[code] {
			return false
		}
		set[code] = true
	}
	for _, code := range b {
		if !set[code] {
			return false
		}
		delete(set, code)
	}
	return len(set) == 0
}
