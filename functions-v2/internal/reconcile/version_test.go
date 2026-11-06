package reconcile

import "testing"

func TestReconciledVersionUsesFreshRideVersion(t *testing.T) {
	tests := []struct {
		name      string
		candidate float64
		payload   map[string]any
		want      float64
	}{
		{"newer snapshot", 4, map[string]any{"version": float64(5)}, 5},
		{"same snapshot", 4, map[string]any{"version": float64(4)}, 4},
		{"missing snapshot version", 4, map[string]any{}, 4},
		{"older snapshot", 4, map[string]any{"version": float64(3)}, 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := reconciledVersion(tt.candidate, tt.payload); got != tt.want {
				t.Fatalf("got version %v, want %v", got, tt.want)
			}
		})
	}
}
