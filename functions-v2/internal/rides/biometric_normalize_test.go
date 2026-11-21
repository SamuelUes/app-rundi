package rides

import (
	"testing"
	"time"
)

func TestNormalizeBiometricType(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"fingerprint", "fingerprint"},
		{"face_id", "face_id"},
		{"biometric", "biometric"},
		{"device_credential", "device_credential"},
		{"NOT_SUPPORTED", "NOT_SUPPORTED"},
		{"device_biometric_not_found", "NOT_SUPPORTED"},
		{"", ""},
		{"apple_signin", "biometric"},
		{"unknown", "biometric"},
	}
	for _, tt := range tests {
		if got := NormalizeBiometricType(tt.in); got != tt.want {
			t.Errorf("NormalizeBiometricType(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestParseBiometricAt(t *testing.T) {
	if got := ParseBiometricAt(""); got != nil {
		t.Errorf("ParseBiometricAt(\"\") = %v, want nil", got)
	}
	if got := ParseBiometricAt("not-a-date"); got != nil {
		t.Errorf("ParseBiometricAt(invalid) = %v, want nil", got)
	}
	got := ParseBiometricAt("2026-11-19T10:30:00.000Z")
	if got == nil || !got.Equal(time.Date(2026, 11, 19, 10, 30, 0, 0, time.UTC)) {
		t.Errorf("ParseBiometricAt(ISO) = %v, want 2026-11-19T10:30:00Z", got)
	}
}
