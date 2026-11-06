package compliance

import (
	"testing"
	"time"
)

func dailyEvalFixture() *Evaluation {
	driverID, vehicleID := "d-1", "v-1"
	service := "rides"
	return &Evaluation{
		Allowed: true, Status: "compliant", RulesVersion: RulesVersion,
		EvaluatedAt:  "2026-11-05T10:30:00-06:00",
		NicaraguaDay: "2026-11-05",
		DriverID:     &driverID, VehicleID: &vehicleID, ServiceCode: &service,
		InputGenerations: map[string]int64{
			"rules:global": 3, "driver:d-1": 2, "vehicle:v-1": 4, "plate:m123": 1,
		},
	}
}

func TestDailyDecisionFromEvaluation(t *testing.T) {
	t.Run("authorized evaluation becomes a recordable decision", func(t *testing.T) {
		d, err := DailyDecisionFromEvaluation(dailyEvalFixture(), []string{"rides"})
		if err != nil {
			t.Fatal(err)
		}
		if d.Day != "2026-11-05" || !d.Allowed {
			t.Fatalf("decision=%+v", d)
		}
		wantEnd := time.Date(2026, 11, 6, 6, 0, 0, 0, time.UTC) // medianoche Managua
		if !d.ExpiresAt.Equal(wantEnd) {
			t.Fatalf("expiresAt=%v want %v", d.ExpiresAt, wantEnd)
		}
		c := d.Context
		if c.DriverID != "d-1" || c.VehicleID != "v-1" || c.DriverGeneration != 2 ||
			c.RulesGeneration != 3 || c.EngineVersion != RulesVersion {
			t.Fatalf("context=%+v", c)
		}
		if !recordableDailyDecision(d) {
			t.Fatal("decision should be recordable")
		}
	})

	t.Run("rejections and missing data never produce a cache", func(t *testing.T) {
		for name, mutate := range map[string]func(*Evaluation){
			"rejected":        func(e *Evaluation) { e.Allowed = false },
			"nil driver":      func(e *Evaluation) { e.DriverID = nil },
			"nil vehicle":     func(e *Evaluation) { e.VehicleID = nil },
			"no day":          func(e *Evaluation) { e.NicaraguaDay = "" },
			"no generations":  func(e *Evaluation) { e.InputGenerations = nil },
			"no driver gen":   func(e *Evaluation) { delete(e.InputGenerations, "driver:d-1") },
			"no rules gen":    func(e *Evaluation) { delete(e.InputGenerations, "rules:global") },
			"zero generation": func(e *Evaluation) { e.InputGenerations["driver:d-1"] = 0 },
			"wrong day":       func(e *Evaluation) { e.NicaraguaDay = "2026-11-04" },
			"bad timestamp":   func(e *Evaluation) { e.EvaluatedAt = "not-a-time" },
		} {
			ev := dailyEvalFixture()
			mutate(ev)
			if _, err := DailyDecisionFromEvaluation(ev, []string{"rides"}); err == nil {
				t.Fatalf("%s: expected error", name)
			}
		}
	})

	t.Run("a decision without services is not recordable", func(t *testing.T) {
		if _, err := DailyDecisionFromEvaluation(dailyEvalFixture(), nil); err == nil {
			t.Fatal("expected error without service codes")
		}
	})
}
