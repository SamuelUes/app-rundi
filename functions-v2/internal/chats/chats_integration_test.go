package chats

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/fs"
)

// Requires a disposable local database with migrations and a Firestore emulator.
func TestRideChatOffersStayPrivateAndSurviveAssignment(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" || !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires TEST_DATABASE_URL and a local Firestore emulator")
	}
	parsed, err := url.Parse(dsn)
	if err != nil || (parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost") {
		t.Fatal("TEST_DATABASE_URL must point to a disposable local database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	client, err := firestore.NewClient(ctx, "demo-rundi-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	clientID, first, second, stranger := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	var rideID string
	t.Cleanup(func() {
		// The fixtures are unique to this test.
		if rideID != "" {
			pool.Exec(ctx, `DELETE FROM public.rides WHERE id=$1::uuid`, rideID)
		}
		pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id=ANY($1)`, []string{first, second})
		pool.Exec(ctx, `DELETE FROM public.users WHERE id=ANY($1)`, []string{clientID, first, second, stranger})
	})
	for _, id := range []string{clientID, first, second, stranger} {
		if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client')`, id); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{first, second} {
		if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id, account_status) VALUES ($1, 'active')`, id); err != nil {
			t.Fatal(err)
		}
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides (client_id, firebase_ride_id, status)
		VALUES ($1, $2, 'requested') RETURNING id::text`, clientID, uuid.NewString()).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{first, second} {
		if _, err := pool.Exec(ctx, `INSERT INTO public.ride_offers (ride_id, driver_id, kind, status, expires_at)
			VALUES ($1::uuid, $2, 'offer', 'sent', NOW() + INTERVAL '5 minutes')`, rideID, id); err != nil {
			t.Fatal(err)
		}
	}
	svc := NewService(pool, client)
	if _, err := svc.RideChat(ctx, stranger, rideID, clientID); err == nil {
		t.Fatal("unrelated user can access an offer chat")
	}
	firstChat, err := svc.RideChat(ctx, first, rideID, clientID)
	if err != nil {
		t.Fatal(err)
	}
	byClient, err := svc.RideChat(ctx, clientID, rideID, first)
	if err != nil || byClient != firstChat {
		t.Fatalf("client and driver must share a chat: %q, %v", byClient, err)
	}
	secondChat, err := svc.RideChat(ctx, clientID, rideID, second)
	if err != nil || secondChat == firstChat {
		t.Fatalf("offers must have separate chats: %q, %v", secondChat, err)
	}
	snap, err := client.Collection(fs.ColChats).Doc(firstChat).Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	parts := snap.Data()["participants"].([]any)
	if len(parts) != 2 || parts[0] != clientID || parts[1] != first {
		t.Fatalf("unexpected participants: %v", parts)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.rides SET driver_id=$2, status='accepted' WHERE id=$1::uuid`, rideID, first); err != nil {
		t.Fatal(err)
	}
	continued, err := svc.RideChat(ctx, first, rideID, clientID)
	if err != nil || continued != firstChat {
		t.Fatalf("assigned driver must retain conversation: %q, %v", continued, err)
	}
	if _, err := svc.RideChat(ctx, second, rideID, clientID); err == nil {
		t.Fatal("unselected driver can reopen the assigned ride")
	}
}
