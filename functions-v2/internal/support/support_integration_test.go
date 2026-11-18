package support

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
)

func TestCreateComplaintWithLiveRideID(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires an isolated local PostgreSQL database")
	}
	parsed, err := url.Parse(dsn)
	if err != nil || (parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost") {
		t.Fatal("TEST_DATABASE_URL must point to an isolated local database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	var uid, rideID string
	t.Cleanup(func() {
		if uid != "" {
			pool.Exec(ctx, `DELETE FROM public.support_complaints WHERE created_by_user_id=$1`, uid)
			pool.Exec(ctx, `DELETE FROM public.rides WHERE client_id=$1`, uid)
			pool.Exec(ctx, `DELETE FROM public.users WHERE id=$1`, uid)
		}
	})
	if err := pool.QueryRow(ctx, `INSERT INTO public.users (id, role)
		VALUES (gen_random_uuid()::text, 'client') RETURNING id`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	liveID := "support-test-" + uid
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides (client_id, firebase_ride_id)
		VALUES ($1, $2) RETURNING id::text`, uid, liveID).Scan(&rideID); err != nil {
		t.Fatal(err)
	}

	svc := NewService(pool, nil)
	complaint, err := svc.CreateComplaint(ctx, uid, "client", CreateRequest{Title: "Payment", RideID: &liveID})
	if err != nil || complaint.RideID == nil || *complaint.RideID != rideID {
		t.Fatalf("live ID must resolve to SQL ride: complaint=%+v err=%v", complaint, err)
	}
	again, err := svc.CreateComplaint(ctx, uid, "client", CreateRequest{Title: "Payment", RideID: &rideID})
	if err != nil || again.ID != complaint.ID {
		t.Fatalf("both IDs must deduplicate the same complaint: complaint=%+v err=%v", again, err)
	}
	for _, missing := range []string{"missing-" + uid, uid} {
		_, err = svc.CreateComplaint(ctx, uid, "client", CreateRequest{Title: "Payment", RideID: &missing})
		var apiErr *apperr.Error
		if !errors.As(err, &apiErr) || apiErr.Code != http.StatusNotFound {
			t.Fatalf("unknown ride ID should return 404, got %v", err)
		}
	}
}
