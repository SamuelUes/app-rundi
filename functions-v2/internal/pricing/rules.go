// Package pricing — Pricing v2 portado de helpers/pricingRules.ts +
// priceCalculator.ts: Service + Features + Surge, snapshots, moneda C$.
package pricing

import (
	"fmt"
	"math"
	"sort"
	"time"
)

const (
	StopFee           = 20.0
	MinSurgeMult      = 1.0
	MaxSurgeMult      = 1.6
	MinSurgeRequests  = 5
	surgePriorRides   = 4
	surgePriorDrivers = 5
	defaultTZ         = "America/Managua"
)

var PricingServiceCodes = map[string]bool{
	"normal":                 true,
	"motorcycle":             true,
	"designated_driver_auto": true,
	"designated_driver_moto": true,
}

type FeaturePricingType string

const (
	FeatureNone       FeaturePricingType = "none"
	FeatureSurcharge  FeaturePricingType = "surcharge"
	FeatureDiscount   FeaturePricingType = "discount"
	FeatureMultiplier FeaturePricingType = "multiplier"
)

// PricingFeature — espejo de public.features (+overrides de assignment).
type PricingFeature struct {
	Code            string
	Name            string
	PricingType     FeaturePricingType
	PricingValue    float64
	Priority        int
	Stackable       bool
	DefaultSelected *bool // nil = default true (v1: !== false)
	Enabled         bool
	StartTime       string // "HH:MM" local
	EndTime         string
	Timezone        string
	StartsAt        *time.Time
	EndsAt          *time.Time
}

type AppliedFeature struct {
	Code        string             `json:"code"`
	Name        string             `json:"name"`
	Adjustment  float64            `json:"adjustment"`
	PricingType FeaturePricingType `json:"pricingType"`
}

type SurgeRule struct {
	MinRatio float64
	MaxRatio *float64
	Mult     float64
	Priority int
}

var DefaultSurgeRules = []SurgeRule{
	{MinRatio: 0, MaxRatio: f(0.8), Mult: 1, Priority: 10},
	{MinRatio: 0.8, MaxRatio: f(1.2), Mult: 1.05, Priority: 20},
	{MinRatio: 1.2, MaxRatio: f(1.5), Mult: 1.15, Priority: 30},
	{MinRatio: 1.5, MaxRatio: f(2), Mult: 1.3, Priority: 40},
	{MinRatio: 2, MaxRatio: f(3), Mult: 1.45, Priority: 50},
	{MinRatio: 3, MaxRatio: nil, Mult: 1.6, Priority: 60},
}

func f(v float64) *float64 { return &v }

func IsFeatureActiveAt(feat PricingFeature, at time.Time) bool {
	if feat.StartsAt != nil && at.Before(*feat.StartsAt) {
		return false
	}
	if feat.EndsAt != nil && !at.Before(*feat.EndsAt) {
		return false
	}
	if feat.StartTime == "" || feat.EndTime == "" {
		return true
	}
	start := parseClock(feat.StartTime)
	end := parseClock(feat.EndTime)
	tz := feat.Timezone
	if tz == "" {
		tz = defaultTZ
	}
	loc, err := time.LoadLocation(tz)
	if err != nil || start < 0 || end < 0 {
		return false
	}
	local := at.In(loc)
	cur := local.Hour()*60 + local.Minute()
	if start == end {
		return true
	}
	if start < end {
		return cur >= start && cur < end
	}
	return cur >= start || cur < end
}

// "HH:MM[:SS]" → minutos desde medianoche; -1 inválido.
func parseClock(s string) int {
	var h, m int
	if n, _ := fmt.Sscanf(s, "%d:%d", &h, &m); n != 2 {
		return -1
	}
	if h < 0 || h > 23 || m < 0 || m > 59 {
		return -1
	}
	return h*60 + m
}

func ValidateSelectedFeatureCodes(codes []string, assigned []PricingFeature, at time.Time) ([]string, error) {
	byCode := make(map[string]PricingFeature, len(assigned))
	for _, feat := range assigned {
		byCode[feat.Code] = feat
	}
	seen := map[string]bool{}
	var unique []string
	for _, c := range codes {
		if seen[c] {
			continue
		}
		seen[c] = true
		unique = append(unique, c)
		feat, ok := byCode[c]
		if !ok {
			return nil, fmt.Errorf("selected feature is not assigned: %s", c)
		}
		if !IsFeatureActiveAt(feat, at) {
			return nil, fmt.Errorf("selected feature is not eligible: %s", c)
		}
	}
	return unique, nil
}

func DefaultSelectedFeatureCodes(features []PricingFeature, at time.Time) []string {
	var out []string
	for _, feat := range features {
		if feat.DefaultSelected != nil && !*feat.DefaultSelected {
			continue
		}
		if IsFeatureActiveAt(feat, at) {
			out = append(out, feat.Code)
		}
	}
	return out
}

// ApplyPricingFeatures — ordena por priority, aplica surcharge/discount/
// multiplier; un no-stackable frena los siguientes (v1 líneas 123-169).
func ApplyPricingFeatures(baseFare float64, features []PricingFeature, at time.Time, selected []string) (fare float64, applied []AppliedFeature) {
	sel := map[string]bool{}
	for _, c := range selected {
		sel[c] = true
	}
	ordered := make([]PricingFeature, 0, len(features))
	for _, feat := range features {
		if len(sel) > 0 && !sel[feat.Code] {
			continue
		}
		switch feat.PricingType {
		case FeatureNone, FeatureSurcharge, FeatureDiscount, FeatureMultiplier:
		default:
			continue
		}
		if math.IsNaN(feat.PricingValue) || feat.PricingValue < 0 || !IsFeatureActiveAt(feat, at) {
			continue
		}
		ordered = append(ordered, feat)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].Priority != ordered[j].Priority {
			return ordered[i].Priority < ordered[j].Priority
		}
		return ordered[i].Code < ordered[j].Code
	})

	fare = baseFare
	nonStackableUsed := false
	for _, feat := range ordered {
		if nonStackableUsed || (!feat.Stackable && len(applied) > 0) {
			continue
		}
		before := fare
		switch feat.PricingType {
		case FeatureSurcharge:
			fare += feat.PricingValue
		case FeatureDiscount:
			fare = math.Max(0, fare-feat.PricingValue)
		case FeatureMultiplier:
			fare *= feat.PricingValue
		}
		fare = math.Round(fare*100) / 100
		applied = append(applied, AppliedFeature{
			Code: feat.Code, Name: feat.Name,
			Adjustment: fare - before, PricingType: feat.PricingType,
		})
		if !feat.Stackable {
			nonStackableUsed = true
		}
	}
	return fare, applied
}

func ResolveSurgeMultiplier(ratio *float64, rules []SurgeRule) float64 {
	if ratio == nil || math.IsNaN(*ratio) || *ratio < 0 {
		return MinSurgeMult
	}
	valid := make([]SurgeRule, 0, len(rules))
	for _, r := range rules {
		if r.MinRatio >= 0 && (r.MaxRatio == nil || *r.MaxRatio > r.MinRatio) {
			valid = append(valid, r)
		}
	}
	sort.Slice(valid, func(i, j int) bool { return valid[i].Priority < valid[j].Priority })
	for _, r := range valid {
		if *ratio >= r.MinRatio && (r.MaxRatio == nil || *ratio < *r.MaxRatio) {
			return math.Min(MaxSurgeMult, math.Max(MinSurgeMult, r.Mult))
		}
	}
	return MinSurgeMult
}

// CalculateSurgeRatio — (demand+4)/(supply+5); nil si demand < 5 (v1 198-202).
func CalculateSurgeRatio(demand, supply int) *float64 {
	if demand < 0 || supply < 0 || demand < MinSurgeRequests {
		return nil
	}
	r := float64(demand+surgePriorRides) / float64(supply+surgePriorDrivers)
	return &r
}

func RoundFareToNearestFive(v float64) float64 {
	if math.IsNaN(v) || v < 0 {
		return 0
	}
	return math.Round(v/5) * 5
}

func CommissionAmount(finalFare, rate float64) float64 {
	if finalFare < 0 || rate < 0 || rate > 1 || math.IsNaN(finalFare) || math.IsNaN(rate) {
		return 0
	}
	return math.Round(finalFare*rate*100) / 100
}

func DynamicMinimumFare(fareBeforeSurge, finalFare, surgeMult float64) float64 {
	if math.IsNaN(fareBeforeSurge) || fareBeforeSurge < 0 ||
		math.IsNaN(finalFare) || finalFare < 0 || math.IsNaN(surgeMult) {
		return 50
	}
	retained := 0.0
	if surgeMult > 1 {
		retained = fareBeforeSurge * (1 + (math.Min(MaxSurgeMult, surgeMult)-1)*0.5)
	}
	return math.Round(math.Max(50, math.Max(finalFare*0.6667, retained))*100) / 100
}
