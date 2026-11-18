package projections

import (
	"testing"
	"time"
)

func TestFreshArrivalPhoto(t *testing.T) {
	now := time.Now()
	path := "rides-documents/rides-inspection/designated-arrival/driver/photo.jpg"
	for _, tc := range []struct {
		name string
		data map[string]any
		want string
	}{
		{"fresh", map[string]any{"path": path, "takenAt": now.Add(-time.Hour)}, path},
		{"expired", map[string]any{"path": path, "takenAt": now.Add(-13 * time.Hour)}, ""},
		{"future", map[string]any{"path": path, "takenAt": now.Add(time.Hour)}, ""},
		{"other driver", map[string]any{"path": "rides-documents/rides-inspection/designated-arrival/other/photo.jpg", "takenAt": now}, ""},
		{"missing time", map[string]any{"path": path}, ""},
		{"nested path", map[string]any{"path": "rides-documents/rides-inspection/designated-arrival/driver/../other/photo.jpg", "takenAt": now}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := freshArrivalPhoto(tc.data, "driver", now); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestOfferCrewFollower(t *testing.T) {
	crew := map[string]any{
		"status": "active", "captainId": "captain", "followerId": "follower",
		"follower": map[string]any{"driverId": "follower", "name": "Alex", "photoURL": "photo", "rating": 4.5, "licenseNumber": "private"},
	}
	follower := offerCrewFollower(crew, "captain")
	if follower["name"] != "Alex" || follower["rating"] != 4.5 {
		t.Fatalf("missing public follower data: %#v", follower)
	}
	if _, ok := follower["licenseNumber"]; ok {
		t.Fatal("license must not be exposed")
	}
	if offerCrewFollower(crew, "other") != nil {
		t.Fatal("crew for another captain must not be exposed")
	}
	crew["status"] = "inactive"
	if offerCrewFollower(crew, "captain") != nil {
		t.Fatal("inactive crew must not be exposed")
	}
}

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
