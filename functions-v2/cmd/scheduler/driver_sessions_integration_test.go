package main

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/compliance"
)

// TestSweepExpiredDriverSessionsIntegration — transición de medianoche en
// PostgreSQL local: una sesión vencida sin viaje se revoca y emite
// driver.deactivated; una sesión vencida CON viaje activo se revoca pero no
// genera offline (el viaje no se interrumpe); una reactivación entre el
// escaneo y el candado queda intacta.
func TestSweepExpiredDriverSessionsIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_COMPLIANCE_INTEGRATION") != "1" {
		t.Skip("requires local PostgreSQL")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") ||
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

	for _, sql := range []string{
		`CREATE TABLE IF NOT EXISTS public.drivers (
			id uuid PRIMARY KEY, user_id text, deleted_at timestamptz)`,
		`CREATE TABLE IF NOT EXISTS public.rides (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), driver_id text, status text)`,
		`CREATE TABLE IF NOT EXISTS public.outbox_events (
			event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text,
			aggregate_type text, aggregate_id text, payload jsonb, request_id text)`,
		`ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS request_id text`,
		`ALTER TABLE public.outbox_events ALTER COLUMN event_id SET DEFAULT gen_random_uuid()`,
		`ALTER TABLE public.outbox_events ALTER COLUMN next_attempt_at SET DEFAULT now()`,
	} {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	migration, err := os.ReadFile("../../../database-v2/cloudsql/0017_driver_sessions.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatal(err)
	}

	openSession := func(driverID, uid string, expiresAt time.Time) {
		t.Helper()
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := compliance.OpenDriverSession(ctx, tx, driverID, "2026-01-01",
			nil, []string{"rides"}, map[string]int64{"driver:" + driverID: 1}, expiresAt); err != nil {
			tx.Rollback(ctx)
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	newDriver := func() (string, string) {
		driverID, uid := uuid.NewString(), "swp-"+uuid.NewString()
		if _, err := pool.Exec(ctx,
			`INSERT INTO public.drivers (id,user_id) VALUES ($1,$2)`, driverID, uid); err != nil {
			t.Fatal(err)
		}
		return driverID, uid
	}
	countDeactivated := func(driverID string) int {
		var n int
		if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM public.outbox_events
			WHERE aggregate_id=$1 AND event_type='driver.deactivated'`, driverID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	sessionClosed := func(driverID string) bool {
		var closed bool
		if err := pool.QueryRow(ctx, `SELECT session_id IS NULL AND reactivation_required
			FROM public.driver_sessions WHERE driver_id=$1::uuid`, driverID).Scan(&closed); err != nil {
			t.Fatal(err)
		}
		return closed
	}
	past := time.Now().Add(-time.Hour)

	// 1. Vencida sin viaje → revocada + offline durable.
	freeID, freeUID := newDriver()
	openSession(freeID, freeUID, past)
	if n, err := sweepExpiredDriverSessions(ctx, pool); err != nil || n < 1 {
		t.Fatalf("sweep n=%d err=%v", n, err)
	}
	if !sessionClosed(freeID) {
		t.Fatal("free driver session not revoked")
	}
	if got := countDeactivated(freeID); got != 1 {
		t.Fatalf("deactivated events=%d want 1", got)
	}

	// 2. Vencida con viaje activo → revocada pero SIN evento offline.
	ridingID, ridingUID := newDriver()
	openSession(ridingID, ridingUID, past)
	if _, err := pool.Exec(ctx, `INSERT INTO public.rides (driver_id,status)
		VALUES ($1,'in_progress')`, ridingUID); err != nil {
		t.Fatal(err)
	}
	if _, err := sweepExpiredDriverSessions(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if !sessionClosed(ridingID) {
		t.Fatal("on-ride session not revoked")
	}
	if got := countDeactivated(ridingID); got != 0 {
		t.Fatalf("on-ride deactivated events=%d want 0", got)
	}

	// 3. Vigente (expires_at futuro) → ni escaneada ni tocada.
	liveID, liveUID := newDriver()
	openSession(liveID, liveUID, time.Now().Add(time.Hour))
	before := countDeactivated(liveID)
	if _, err := sweepExpiredDriverSessions(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if sessionClosed(liveID) {
		t.Fatal("live session wrongly revoked")
	}
	if got := countDeactivated(liveID); got != before {
		t.Fatalf("live deactivated events=%d want %d", got, before)
	}

	// 4. Candidata escaneada pero reactivada antes del candado → intacta.
	//    Simulación: expireOneSession corre DESPUÉS de reabrir la sesión.
	raceID, raceUID := newDriver()
	openSession(raceID, raceUID, past)
	openSession(raceID, raceUID, time.Now().Add(2*time.Hour)) // reactivación gana el candado
	if err := expireOneSession(ctx, pool, raceID, raceUID); err != nil {
		t.Fatal(err)
	}
	if sessionClosed(raceID) {
		t.Fatal("reactivated session wrongly revoked")
	}
}
