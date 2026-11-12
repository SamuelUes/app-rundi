package projections

import (
	"context"
	"os"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestPendingRatingProjection(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" || os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires local PostgreSQL and Firestore emulator")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	db, err := firestore.NewClient(ctx, "demo-rundi")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	client, driver := uuid.NewString(), uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client'), ($2, 'driver')`, client, driver); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id) VALUES ($1)`, driver); err != nil {
		t.Fatal(err)
	}
	var ride string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides (client_id, driver_id, firebase_ride_id, status, completed_at)
		VALUES ($1, $2, $3, 'completed', now()) RETURNING id::text`, client, driver, uuid.NewString()).Scan(&ride); err != nil {
		t.Fatal(err)
	}
	ref := db.Collection(fs.ColUsers).Doc(client).Collection("pendingActions").Doc("rating")
	if err := projectPendingRating(ctx, pool, db, client); err != nil {
		t.Fatal(err)
	}
	snap, err := ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "pending" || snap.Data()["rideId"] != ride {
		t.Fatalf("initial projection=%v err=%v", snap, err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.ride_rating_decisions (ride_id, actor_id, decision) VALUES ($1, $2, 'skipped')`, ride, client); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.rides SET version=version+1 WHERE id=$1`, ride); err != nil {
		t.Fatal(err)
	}
	if err := projectPendingRating(ctx, pool, db, client); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "skipped" {
		t.Fatalf("skipped projection=%v err=%v", snap, err)
	}
	future := time.Now().Add(time.Hour)
	if _, err := ref.Set(ctx, map[string]any{
		"rideId": "newer-ride", "completedAt": future, "version": int64(1), "status": "completed",
	}); err != nil {
		t.Fatal(err)
	}
	if err := projectPendingRating(ctx, pool, db, client); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["rideId"] != "newer-ride" {
		t.Fatalf("older projection overwrote newer ride: %v err=%v", snap, err)
	}
}
