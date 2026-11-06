package projections

import "testing"

func TestCounterOfferStatus(t *testing.T) {
	driver := "driver"
	for _, tc := range []struct {
		ride, offer string
		assigned    *string
		want        string
	}{
		{"driver_offered", "sent", nil, "pending"},
		{"requested", "rejected", nil, "rejected"},
		{"accepted", "accepted", &driver, "accepted"},
		{"accepted", "sent", nil, "canceled"},
		{"canceled", "sent", &driver, "canceled"},
	} {
		if got := counterOfferStatus(tc.ride, tc.assigned, driver, tc.offer); got != tc.want {
			t.Errorf("ride=%s offer=%s: got %s, want %s", tc.ride, tc.offer, got, tc.want)
		}
	}
}
