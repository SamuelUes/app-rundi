package pricing

import (
	"testing"
	"time"
)

func TestLegacyMultiplier(t *testing.T) {
	cases := []struct {
		km   float64
		vt   string
		rt   string
		want float64
	}{
		{0.15, "car", "normal", 13},
		{0.5, "car", "normal", 16},
		{1.5, "car", "normal", 14},
		{2.5, "car", "normal", 11},
		{4.0, "car", "normal", 11.5},
		{7.0, "car", "normal", 13},
		{9.0, "car", "normal", 12.5},
		{1.5, "motorcycle", "normal", 2},
		{3.0, "motorcycle", "normal", 4},
		{5.0, "motorcycle", "normal", 6},
		{7.0, "motorcycle", "normal", 7},
		{0.1, "car", "designated_driver", 16},
		{2.5, "car", "designated_driver", 32.5},
		{9.6, "car", "designated_driver", 21.5},
		{0.005, "car", "normal", 2}, // mínimo
	}
	for _, c := range cases {
		if got := LegacyMultiplier(c.km, c.vt, c.rt); got != c.want {
			t.Errorf("LegacyMultiplier(%v,%s,%s)=%v want %v", c.km, c.vt, c.rt, got, c.want)
		}
	}
}

func TestMapRideTypeToServiceCode(t *testing.T) {
	if got := MapRideTypeToServiceCode("car", "normal"); got != "normal" {
		t.Errorf("car/normal → %s", got)
	}
	if got := MapRideTypeToServiceCode("motorcycle", "normal"); got != "motorcycle" {
		t.Errorf("moto/normal → %s", got)
	}
	if got := MapRideTypeToServiceCode("car", "designated_driver"); got != "designated_driver_auto" {
		t.Errorf("car/dd → %s", got)
	}
	if got := MapRideTypeToServiceCode("moto", "designated_driver"); got != "designated_driver_moto" {
		t.Errorf("moto/dd → %s", got)
	}
}

func TestApplyPricingFeatures(t *testing.T) {
	at := time.Now()
	feats := []PricingFeature{
		{Code: "b", Name: "B", PricingType: FeatureSurcharge, PricingValue: 10, Priority: 20, Stackable: true},
		{Code: "a", Name: "A", PricingType: FeatureMultiplier, PricingValue: 1.5, Priority: 10, Stackable: true},
		{Code: "c", Name: "C", PricingType: FeatureDiscount, PricingValue: 5, Priority: 30, Stackable: true},
	}
	fare, applied := ApplyPricingFeatures(100, feats, at, []string{"a", "b", "c"})
	// Orden: a(×1.5=150) → b(+10=160) → c(−5=155)
	if fare != 155 {
		t.Errorf("fare=%v want 155", fare)
	}
	if len(applied) != 3 || applied[0].Code != "a" || applied[1].Code != "b" {
		t.Errorf("orden/aplicados incorrectos: %+v", applied)
	}

	// Feature no-stackable detiene los siguientes
	feats2 := []PricingFeature{
		{Code: "x", PricingType: FeatureSurcharge, PricingValue: 50, Priority: 10, Stackable: false},
		{Code: "y", PricingType: FeatureSurcharge, PricingValue: 10, Priority: 20, Stackable: true},
	}
	fare2, _ := ApplyPricingFeatures(100, feats2, at, []string{"x", "y"})
	if fare2 != 150 {
		t.Errorf("no-stackable fare=%v want 150", fare2)
	}
}

func TestSurgeMultiplier(t *testing.T) {
	r := 1.4
	if got := ResolveSurgeMultiplier(&r, DefaultSurgeRules); got != 1.15 {
		t.Errorf("ratio 1.4 → %v want 1.15", got)
	}
	r2 := 3.5
	if got := ResolveSurgeMultiplier(&r2, DefaultSurgeRules); got != 1.6 {
		t.Errorf("ratio 3.5 → %v want 1.6 (cap)", got)
	}
	if got := ResolveSurgeMultiplier(nil, DefaultSurgeRules); got != 1.0 {
		t.Errorf("nil ratio → %v want 1.0", got)
	}
}

func TestCalculateSurgeRatio(t *testing.T) {
	if CalculateSurgeRatio(4, 10) != nil {
		t.Error("demand<5 debe ser nil (sin surge)")
	}
	r := CalculateSurgeRatio(10, 10)
	want := 14.0 / 15.0
	if r == nil || *r != want {
		t.Errorf("ratio=%v want %v", r, want)
	}
}

func TestRoundFareToNearestFive(t *testing.T) {
	if got := RoundFareToNearestFive(103); got != 105 {
		t.Errorf("103 → %v want 105", got)
	}
	if got := RoundFareToNearestFive(102); got != 100 {
		t.Errorf("102 → %v want 100", got)
	}
}

func TestIsFeatureActiveAt(t *testing.T) {
	loc, _ := time.LoadLocation("America/Managua")
	noon := time.Date(2026, 1, 1, 12, 0, 0, 0, loc)

	// Ventana horaria 22:00-05:00 (cruza medianoche) — night feature
	night := PricingFeature{Code: "night", StartTime: "22:00", EndTime: "05:00", Timezone: "America/Managua"}
	if IsFeatureActiveAt(night, noon) {
		t.Error("night activo al mediodía?")
	}
	midnight := time.Date(2026, 1, 1, 23, 30, 0, 0, loc)
	if !IsFeatureActiveAt(night, midnight) {
		t.Error("night inactivo a las 23:30?")
	}
}
