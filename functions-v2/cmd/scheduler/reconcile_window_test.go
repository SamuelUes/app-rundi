package main

import (
	"testing"
	"time"
)

func TestReconcileWindow(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  time.Duration
	}{
		{"", 7 * time.Hour},
		{"120", 2 * time.Hour},
		{"abc", 7 * time.Hour},
		{"0", 7 * time.Hour},
		{"-5", 7 * time.Hour},
		{"9223372036854775807", 7 * time.Hour},
	} {
		t.Run(tc.value, func(t *testing.T) {
			t.Setenv("RECONCILE_WINDOW_MINUTES", tc.value)
			if got := reconcileWindow(); got != tc.want {
				t.Fatalf("reconcileWindow(%q) = %v, want %v", tc.value, got, tc.want)
			}
		})
	}
}
