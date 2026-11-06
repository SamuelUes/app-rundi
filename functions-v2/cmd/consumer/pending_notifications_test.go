package main

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"

	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/notifications"
)

type failingPendingNotifier struct {
	err error
}

func (n failingPendingNotifier) Notify(context.Context, string, string, notifications.Type, notifications.NotifyOpts) error {
	return n.err
}

func TestPendingProximityNotificationFailureIsReturned(t *testing.T) {
	want := errors.New("notification unavailable")
	_, err := applyPendingEvent(context.Background(), nil, nil, failingPendingNotifier{want}, nil, "proximity_notify", map[string]any{
		"payload": map[string]any{"clientId": "client", "rideId": "ride"},
	})
	if !errors.Is(err, want) {
		t.Fatalf("got error %v, want %v", err, want)
	}
}

func TestPendingChatNotificationFailureIntegration(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := firestore.NewClient(ctx, "demo-rundi-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	chatID := "test-" + uuid.NewString()
	if _, err := client.Collection(fs.ColChats).Doc(chatID).Set(ctx, map[string]any{
		"participants": []string{"sender", "recipient"},
	}); err != nil {
		t.Fatal(err)
	}
	want := errors.New("notification unavailable")
	_, err = applyPendingEvent(ctx, nil, client, failingPendingNotifier{want}, nil, "chat_message", map[string]any{
		"payload": map[string]any{"chatId": chatID, "uid": "sender"},
	})
	if !errors.Is(err, want) {
		t.Fatalf("got error %v, want %v", err, want)
	}
}

func TestPendingProximityNotificationRetriesIntegration(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := firestore.NewClient(ctx, "demo-rundi-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	ref := client.Collection(fs.ColPendingEvents).Doc("test-" + uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{
		"status": "pending", "eventType": "proximity_notify", "aggregateId": "ride",
		"createdAt": time.Now(), "payload": map[string]any{"clientId": "client", "rideId": "ride"},
	}); err != nil {
		t.Fatal(err)
	}

	notifier := failingPendingNotifier{errors.New("notification unavailable")}
	handler := func(ctx context.Context, eventType string, data map[string]any) (string, error) {
		return applyPendingEvent(ctx, nil, client, notifier, nil, eventType, data)
	}
	if n, err := processPendingEventsWithHandler(ctx, client, handler); err != nil || n != 0 {
		t.Fatalf("failed attempt: processed=%d err=%v", n, err)
	}
	snap, err := ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "pending" {
		t.Fatalf("failed notification must remain pending: %v", err)
	}

	notifier.err = nil
	if n, err := processPendingEventsWithHandler(ctx, client, handler); err != nil || n != 1 {
		t.Fatalf("retry: processed=%d err=%v", n, err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "processed" {
		t.Fatalf("successful notification must be processed: %v", err)
	}
}
