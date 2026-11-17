package projections

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/payments"
)

func TestWalletCommissionProjection(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" || os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires isolated PostgreSQL and Firestore emulator")
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
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'client'), ($2, 'driver')`, client, driver); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id, current_recharge_balance) VALUES ($1, 100)`, driver); err != nil {
		t.Fatal(err)
	}
	var rideID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(firebase_ride_id, client_id, driver_id, status)
		VALUES (gen_random_uuid()::text, $1, $2, 'completed') RETURNING id::text`, client, driver).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.payments(ride_id, amount, commission, payment_method, payment_provider)
		VALUES ($1, 100, 15, 'cash', 'cash')`, rideID); err != nil {
		t.Fatal(err)
	}
	if _, err := payments.NewService(pool, nil).ConfirmCash(ctx, rideID, driver, "", t.Name()); err != nil {
		t.Fatal(err)
	}
	var ev Event
	if err := pool.QueryRow(ctx, `SELECT event_id::text, event_type, aggregate_type, aggregate_id, payload
		FROM public.outbox_events WHERE event_type='driver.wallet_debited' AND aggregate_id=$1`, driver).
		Scan(&ev.EventID, &ev.EventType, &ev.AggregateType, &ev.AggregateID, &ev.Payload); err != nil {
		t.Fatal(err)
	}
	if _, err := Publish(ctx, pool, db, ev); err != nil {
		t.Fatal(err)
	}
	ref := db.Collection(fs.ColDriverWallet).Doc(driver)
	snap, err := ref.Get(ctx)
	if err != nil || snap.Data()["balance"] != float64(85) {
		t.Fatalf("wallet projection=%v err=%v", snap, err)
	}
	var payload map[string]any
	if err := json.Unmarshal(ev.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	movement, err := ref.Collection("movements").Doc(payload["rechargeId"].(string)).Get(ctx)
	if err != nil || movement.Data()["amount"] != float64(-15) || movement.Data()["type"] != "commission_deduction" {
		t.Fatalf("movement projection=%v err=%v", movement, err)
	}
	if _, err := ref.Set(ctx, map[string]any{"balance": 50, "walletRevision": int64(999999)}, firestore.MergeAll); err != nil {
		t.Fatal(err)
	}
	if _, err := Publish(ctx, pool, db, ev); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["balance"] != int64(50) {
		t.Fatalf("older projection overwrote balance: %v err=%v", snap, err)
	}
}
