package compliance

import (
	"testing"
	"time"
)

func TestReusableDailyDecision(t *testing.T) {
	now := time.Date(2026, 11, 5, 18, 0, 0, 0, time.UTC)
	context := func() DailyContext {
		return DailyContext{
			DriverID: "driver", VehicleID: "vehicle", ServiceCodes: []string{"taxi", "delivery"},
			DriverGeneration: 1, RulesGeneration: 2, EngineVersion: "1.0",
			InputGenerations: map[string]int64{"license:key": 3},
		}
	}
	tests := []struct {
		name   string
		change func(*DailyDecision, *DailyContext, *time.Time)
		want   bool
	}{
		{"valid", nil, true},
		{"service order", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.ServiceCodes = []string{"delivery", "taxi"} }, true},
		{"rejected", func(d *DailyDecision, _ *DailyContext, _ *time.Time) { d.Allowed = false }, false},
		{"midnight", func(_ *DailyDecision, _ *DailyContext, n *time.Time) {
			*n = time.Date(2026, 11, 6, 6, 0, 0, 0, time.UTC)
		}, false},
		{"future evaluation", func(d *DailyDecision, _ *DailyContext, n *time.Time) { *n = d.EvaluatedAt.Add(-time.Second) }, false},
		{"wrong day", func(d *DailyDecision, _ *DailyContext, _ *time.Time) { d.Day = "2026-11-04" }, false},
		{"wrong expiration", func(d *DailyDecision, _ *DailyContext, _ *time.Time) { d.ExpiresAt = d.ExpiresAt.Add(time.Second) }, false},
		{"earlier expiration", func(d *DailyDecision, _ *DailyContext, _ *time.Time) {
			d.ExpiresAt = d.EvaluatedAt.Add(time.Hour)
		}, true},
		{"earlier expiration reached", func(d *DailyDecision, _ *DailyContext, n *time.Time) {
			d.ExpiresAt = d.EvaluatedAt.Add(time.Hour)
			*n = d.ExpiresAt
		}, false},
		{"expiration at evaluation", func(d *DailyDecision, _ *DailyContext, _ *time.Time) {
			d.ExpiresAt = d.EvaluatedAt
		}, false},
		{"driver changed", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.DriverID = "other" }, false},
		{"vehicle changed", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.VehicleID = "other" }, false},
		{"service changed", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.ServiceCodes = []string{"taxi"} }, false},
		{"duplicate service", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.ServiceCodes = []string{"taxi", "taxi"} }, false},
		{"driver generation", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.DriverGeneration++ }, false},
		{"rules generation", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.RulesGeneration++ }, false},
		{"engine version", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.EngineVersion = "2.0" }, false},
		{"duplicate generation", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.InputGenerations["license:key"]++ }, false},
		{"missing signals", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.InputGenerations = nil }, false},
		{"zero generation", func(_ *DailyDecision, c *DailyContext, _ *time.Time) { c.DriverGeneration = 0 }, false},
		{"missing vehicle", func(d *DailyDecision, c *DailyContext, _ *time.Time) { d.Context.VehicleID, c.VehicleID = "", "" }, false},
		{"missing services", func(d *DailyDecision, c *DailyContext, _ *time.Time) {
			d.Context.ServiceCodes, c.ServiceCodes = nil, nil
		}, false},
		{"invalid duplicate signal", func(d *DailyDecision, c *DailyContext, _ *time.Time) {
			d.Context.InputGenerations["license:key"], c.InputGenerations["license:key"] = 0, 0
		}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			day, end := NicaraguaDayWindow(now)
			decision := DailyDecision{Allowed: true, Day: day, EvaluatedAt: now, ExpiresAt: end, Context: context()}
			current := context()
			at := now
			if tt.change != nil {
				tt.change(&decision, &current, &at)
			}
			if got := ReusableDailyDecision(decision, current, at); got != tt.want {
				t.Fatalf("reusable=%v want=%v", got, tt.want)
			}
		})
	}
}
