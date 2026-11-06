package main

import (
	"errors"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestIsMissingTrip(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"found", nil, false},
		{"missing", status.Error(codes.NotFound, "missing"), true},
		{"permission denied", status.Error(codes.PermissionDenied, "denied"), false},
		{"unavailable", status.Error(codes.Unavailable, "unavailable"), false},
		{"unknown", errors.New("unknown"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isMissingTrip(tt.err); got != tt.want {
				t.Fatalf("isMissingTrip(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}
