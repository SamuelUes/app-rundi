package clientevents

import "testing"

func TestValidDocumentID(t *testing.T) {
	for _, tc := range []struct {
		id   string
		want bool
	}{
		{"chat-123", true},
		{"", false},
		{"../other", false},
		{"a/b", false},
		{"has space", false},
	} {
		if got := validID(tc.id); got != tc.want {
			t.Errorf("validID(%q)=%v, want %v", tc.id, got, tc.want)
		}
	}
}

func TestPhotoPath(t *testing.T) {
	for _, tc := range []struct {
		path string
		want bool
	}{
		{"rides-documents/rides-inspection/designated-arrival/driver/123.jpg", true},
		{"rides-documents/rides-inspection/designated-arrival/other/123.jpg", false},
		{"rides-documents/rides-inspection/designated-arrival/driver/../other.jpg", false},
	} {
		if got := validPhotoPath("driver", tc.path); got != tc.want {
			t.Errorf("validPhotoPath(%q)=%v, want %v", tc.path, got, tc.want)
		}
	}
}
