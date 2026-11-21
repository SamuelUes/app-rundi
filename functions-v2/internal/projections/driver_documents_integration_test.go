package projections

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestDriverDocumentsOutboxIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" || !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires local PostgreSQL and Firestore emulator")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "localhost" && cfg.ConnConfig.Host != "127.0.0.1") ||
		cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	client, err := firestore.NewClient(ctx, "demo-rundi")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	uid := "documents-test-" + uuid.NewString()
	driverID, vehicleID := uuid.NewString(), uuid.NewString()
	ref := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("documents")
	defer func() {
		_, _ = ref.Delete(ctx)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE id = $1::uuid`, driverID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.outbox_events WHERE aggregate_type = 'driver_documents' AND aggregate_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_document_projection_versions WHERE user_id = $1`, uid)
	}()
	for _, stmt := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO public.users (id, role) VALUES ($1, 'driver')`, []any{uid}},
		{`INSERT INTO public.drivers (id, user_id) VALUES ($1::uuid, $2)`, []any{driverID, uid}},
		{`INSERT INTO public.vehicles (id, driver_id, plate, is_active) VALUES ($1::uuid, $2::uuid, $3, true)`, []any{vehicleID, driverID, "T" + uuid.NewString()[:8]}},
		{`INSERT INTO public.driver_licenses (driver_id, expiry_date) VALUES ($1::uuid, '2030-01-01')`, []any{driverID}},
		{`INSERT INTO public.vehicle_insurance_policies (vehicle_id, coverage_type, effective_until)
		  VALUES ($1::uuid, 'rc_obligatorio', '2030-02-01')`, []any{vehicleID}},
	} {
		if _, err := pool.Exec(ctx, stmt.query, stmt.args...); err != nil {
			t.Fatal(err)
		}
	}
	var eventCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.outbox_events
		WHERE aggregate_type='driver_documents' AND aggregate_id=$1`, uid).Scan(&eventCount); err != nil || eventCount != 4 {
		t.Fatalf("expected four transactional document events, got %d: %v", eventCount, err)
	}
	revision, err := projectDriverDocuments(ctx, pool, client, uid)
	if err != nil || revision != 4 {
		t.Fatalf("projection revision %d: %v", revision, err)
	}
	snapshot, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	license, ok := snapshot.Data()["license"].(map[string]any)
	if !ok || license["expiryDate"] != "2030-01-01" {
		t.Fatalf("missing projected license: %v", snapshot.Data())
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE public.driver_licenses SET expiry_date='2032-01-01' WHERE driver_id=$1::uuid`, driverID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.outbox_events
		WHERE aggregate_type='driver_documents' AND aggregate_id=$1`, uid).Scan(&eventCount); err != nil || eventCount != 4 {
		t.Fatalf("rolled-back change enqueued an event: %d %v", eventCount, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.driver_licenses SET expiry_date='2031-01-01' WHERE driver_id=$1::uuid`, driverID); err != nil {
		t.Fatal(err)
	}
	revision, err = projectDriverDocuments(ctx, pool, client, uid)
	if err != nil || revision != 5 {
		t.Fatalf("updated license revision %d: %v", revision, err)
	}
	snapshot, err = ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	license, ok = snapshot.Data()["license"].(map[string]any)
	if !ok || license["expiryDate"] != "2031-01-01" {
		t.Fatalf("updated license not projected: %v", snapshot.Data())
	}

	if _, err := pool.Exec(ctx, `UPDATE public.drivers SET deleted_at=NOW() WHERE id=$1::uuid`, driverID); err != nil {
		t.Fatal(err)
	}
	revision, err = projectDriverDocuments(ctx, pool, client, uid)
	if err != nil || revision != 6 {
		t.Fatalf("deletion revision %d: %v", revision, err)
	}
	snapshot, err = ref.Get(ctx)
	if err != nil || snapshot.Data()["deleted"] != true || snapshot.Data()["license"] != nil {
		t.Fatalf("deleted driver's snapshot retained data: %v %v", snapshot, err)
	}
}
