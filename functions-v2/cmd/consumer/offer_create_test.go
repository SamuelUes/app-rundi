package main

import (
	"encoding/json"
	"errors"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestCreateOfferOnce(t *testing.T) {
	unavailable := status.Error(codes.Unavailable, "firestore unavailable")
	tests := []struct {
		name    string
		err     error
		created bool
		wantErr error
	}{
		{name: "new offer", created: true},
		{name: "existing offer remains untouched", err: status.Error(codes.AlreadyExists, "exists")},
		{name: "transient failure propagates", err: unavailable, wantErr: unavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			created, err := createOfferOnce(func() error { return tt.err })
			if created != tt.created || !errors.Is(err, tt.wantErr) {
				t.Fatalf("created=%v err=%v; want %v, %v", created, err, tt.created, tt.wantErr)
			}
		})
	}
}

func TestPublishAndDispatch(t *testing.T) {
	failure := errors.New("temporary failure")
	for _, tc := range []struct {
		name         string
		eventType    string
		payload      json.RawMessage
		publishErr   error
		dispatchErr  error
		wantDispatch bool
		wantClose    bool
		wantErr      bool
	}{
		{name: "requested", eventType: "ride.requested", payload: json.RawMessage(`{"rideId":"r"}`), wantDispatch: true},
		{name: "accepted closes offers", eventType: "ride.accepted", payload: json.RawMessage(`{}`), wantClose: true},
		{name: "canceled closes offers", eventType: "ride.canceled", payload: json.RawMessage(`{}`), wantClose: true},
		{name: "other event", eventType: "ride.completed", payload: json.RawMessage(`{}`)},
		{name: "projection fails", eventType: "ride.requested", payload: json.RawMessage(`{}`), publishErr: failure, wantErr: true},
		{name: "dispatch fails", eventType: "ride.requested", payload: json.RawMessage(`{}`), dispatchErr: failure, wantDispatch: true, wantErr: true},
		{name: "invalid payload", eventType: "ride.requested", payload: json.RawMessage(`{`), wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dispatched := false
			closed := false
			err := publishAndDispatch(pendingEvent{EventType: tc.eventType, Payload: tc.payload},
				func() error { return tc.publishErr },
				func(map[string]any) error { dispatched = true; return tc.dispatchErr },
				func() error { closed = true; return nil },
			)
			if dispatched != tc.wantDispatch || closed != tc.wantClose || (err != nil) != tc.wantErr {
				t.Fatalf("dispatched=%v closed=%v err=%v", dispatched, closed, err)
			}
		})
	}
}

func TestDispatchableRide(t *testing.T) {
	driver := "driver"
	for _, tt := range []struct {
		status string
		driver *string
		want   bool
	}{
		{"requested", nil, true},
		{"driver_offered", nil, true},
		{"requested", &driver, false},
		{"accepted", nil, false},
		{"canceled_by_client", nil, false},
	} {
		if got := dispatchableRide(tt.status, tt.driver); got != tt.want {
			t.Errorf("dispatchableRide(%q, %v) = %v; want %v", tt.status, tt.driver, got, tt.want)
		}
	}
}
