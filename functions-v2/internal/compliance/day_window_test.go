package compliance

import (
	"testing"
	"time"
)

func TestNicaraguaDayWindow(t *testing.T) {
	tests := []struct {
		name, instant, day, end string
	}{
		{"before midnight", "2026-11-06T05:59:59Z", "2026-11-05", "2026-11-06T06:00:00Z"},
		{"at midnight", "2026-11-06T06:00:00Z", "2026-11-06", "2026-11-07T06:00:00Z"},
		{"leap day", "2028-02-29T18:00:00Z", "2028-02-29", "2028-03-01T06:00:00Z"},
		{"year boundary", "2026-12-31T23:00:00Z", "2026-12-31", "2027-01-01T06:00:00Z"},
		{"different input zone", "2026-11-06T14:00:00+08:00", "2026-11-06", "2026-11-07T06:00:00Z"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			instant, err := time.Parse(time.RFC3339, tt.instant)
			if err != nil {
				t.Fatal(err)
			}
			wantEnd, err := time.Parse(time.RFC3339, tt.end)
			if err != nil {
				t.Fatal(err)
			}
			day, end := NicaraguaDayWindow(instant)
			if day != tt.day || !end.Equal(wantEnd) || end.Location() != time.UTC {
				t.Fatalf("got day=%s end=%s, want day=%s end=%s UTC", day, end, tt.day, wantEnd)
			}
			if !instant.Before(end) {
				t.Fatalf("expiration must be after the evaluated instant")
			}
		})
	}
}
