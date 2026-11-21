package rides

import "testing"

func TestNegotiatedPriceLimits(t *testing.T) {
	estimated := 120.0
	tests := []struct {
		name  string
		price float64
		valid bool
	}{
		{"below estimate", 119, false},
		{"estimate", 120, true},
		{"above estimate", 200, true},
		{"technical maximum", 100000, true},
		{"above technical maximum", 100001, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := validNegotiatedPrice(tt.price, &estimated); got != tt.valid {
				t.Fatalf("validNegotiatedPrice(%v) = %v, want %v", tt.price, got, tt.valid)
			}
		})
	}
}
