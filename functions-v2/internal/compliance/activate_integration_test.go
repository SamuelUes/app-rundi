package compliance

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestActivateAvailabilityIntegration — activación completa en PostgreSQL
// local: autoriza, crea sesión + evento outbox, el gate la acepta; una señal
// cambiada cierra el gate y una nueva activación re-evalúa con generaciones
// frescas.
func TestActivateAvailabilityIntegration(t *testing.T) {
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
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	for _, sql := range activationTestDDL {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	for _, file := range []string{
		"../../../database-v2/cloudsql/0016_compliance_signals.sql",
		"../../../database-v2/cloudsql/0017_driver_sessions.sql",
	} {
		migration, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(migration)); err != nil {
			t.Fatalf("%s: %v", file, err)
		}
	}

	driverID, vehicleID := uuid.NewString(), uuid.NewString()
	serviceID, uid := uuid.NewString(), "act-"+uuid.NewString()
	suffix := uuid.NewString()[:8]
	plate, vin := "T-"+suffix, "VIN-"+suffix
	today := TodayNicaragua()
	taxYear := yearOf(today)
	seed := []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO public.drivers (id,user_id,account_status) VALUES ($1,$2,'active')`, []any{driverID, uid}},
		{`INSERT INTO public.vehicles (id,driver_id,plate,type,vin,is_active)
			VALUES ($1,$2,$3,'auto',$4,true)`, []any{vehicleID, driverID, plate, vin}},
		{`INSERT INTO public.driver_licenses (id,driver_id,status,license_number,license_type,categories,expiry_date,is_current)
			VALUES ($1,$2,'verified',$3,'profesional','{b}','2100-01-01',true)`, []any{uuid.NewString(), driverID, "L-" + suffix}},
		{`INSERT INTO public.vehicle_circulation_cards (id,vehicle_id,status,card_number,issued_at,declared_valid_until,declared_plate,declared_vin,is_current)
			VALUES ($1,$2,'verified','C-1','2020-01-01','2100-01-01',$3,$4,true)`, []any{uuid.NewString(), vehicleID, plate, vin}},
		{`INSERT INTO public.vehicle_insurance_policies (id,vehicle_id,status,policy_number,insurer_code,coverage_type,effective_from,effective_until,insured_plate,insured_vin,is_current)
			VALUES ($1,$2,'verified',$3,'INS','rc_obligatorio','2020-01-01','2100-01-01',$4,$5,true)`, []any{uuid.NewString(), vehicleID, "P-" + suffix, plate, vin}},
		{`INSERT INTO public.vehicle_inspections (id,vehicle_id,status,inspected_at,result,valid_until,is_current)
			VALUES ($1,$2,'verified','2026-01-01','approved','2100-01-01',true)`, []any{uuid.NewString(), vehicleID}},
		{`INSERT INTO public.vehicle_emission_certificates (id,vehicle_id,status,tested_at,result,valid_until,is_current)
			VALUES ($1,$2,'verified','2026-01-01','approved','2100-01-01',true)`, []any{uuid.NewString(), vehicleID}},
		{`INSERT INTO public.vehicle_revisado_stickers (id,vehicle_id,status,sticker_year,issued_at,valid_until,is_current)
			VALUES ($1,$2,'verified',$3,'2026-01-01','2100-01-01',true)`, []any{uuid.NewString(), vehicleID, taxYear}},
		{`INSERT INTO public.vehicle_road_taxes (id,vehicle_id,status,tax_year,paid_at,exempt,is_current)
			VALUES ($1,$2,'verified',$3,'2026-01-01',false,true)`, []any{uuid.NewString(), vehicleID, taxYear}},
		{`INSERT INTO public.services (id,code,is_active) VALUES ($1,'rides',true)`, []any{serviceID}},
		{`INSERT INTO public.driver_services (id,driver_id,service_id,is_active,is_approved)
			VALUES ($1,$2,$3,true,true)`, []any{uuid.NewString(), driverID, serviceID}},
		{`INSERT INTO public.license_category_rules (vehicle_type,service_code,required_categories,severity,confirmed_by_source,is_active)
			VALUES ('auto','*','{b}','BLOCKING',true,true)`, nil},
	}
	for _, stmt := range seed {
		if _, err := pool.Exec(ctx, stmt.sql, stmt.args...); err != nil {
			t.Fatalf("%s: %v", stmt.sql, err)
		}
	}

	svc := NewService(pool, nil, nil)
	res, err := svc.ActivateAvailability(ctx, uid, nil)
	if err != nil || !res.Allowed || res.SessionSeq != 1 || res.SessionID == "" {
		t.Fatalf("activation=%+v err=%v", res, err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := CheckDriverSession(ctx, tx, driverID); err != nil || got != res.SessionID {
		t.Fatalf("gate after activation=%v err=%v", got, err)
	}
	tx.Rollback(ctx)

	var eventType string
	if err := pool.QueryRow(ctx, `SELECT event_type FROM public.outbox_events
		WHERE aggregate_id=$1 ORDER BY event_id DESC LIMIT 1`, driverID).Scan(&eventType); err != nil || eventType != "driver.activated" {
		t.Fatalf("outbox event=%q err=%v", eventType, err)
	}

	// Señal cambiada → gate cierra; nueva activación re-evalúa y reabre.
	if _, err := pool.Exec(ctx, `UPDATE public.compliance_signals
		SET generation=generation+1 WHERE kind='driver' AND signal_key=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CheckDriverSession(ctx, tx, driverID); !errors.Is(err, ErrSessionSignalsStale) {
		t.Fatalf("stale gate err=%v", err)
	}
	tx.Rollback(ctx)

	res, err = svc.ActivateAvailability(ctx, uid, nil)
	if err != nil || !res.Allowed || res.SessionSeq != 2 {
		t.Fatalf("re-activation=%+v err=%v", res, err)
	}
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := CheckDriverSession(ctx, tx, driverID); err != nil || got != res.SessionID {
		t.Fatalf("gate after re-activation=%v err=%v", got, err)
	}
	tx.Rollback(ctx)

	// Conductor inexistente → error, nunca autorización.
	if _, err := svc.ActivateAvailability(ctx, "missing-"+uuid.NewString(), nil); !errors.Is(err, ErrDriverNotFound) {
		t.Fatalf("missing driver err=%v", err)
	}
}

var activationTestDDL = []string{
	`CREATE TABLE IF NOT EXISTS public.drivers (
		id uuid PRIMARY KEY, user_id text, account_status text,
		documents_status text, compliance_status text, deleted_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.vehicles (
		id uuid PRIMARY KEY, driver_id uuid, plate text, type text,
		service_type text, vehicle_class text, vin text, chasis text, motor text,
		year int, emission_date date, is_active boolean, compliance_status text,
		created_at timestamptz, deleted_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.services (id uuid PRIMARY KEY, code text, is_active boolean)`,
	`CREATE TABLE IF NOT EXISTS public.driver_services (
		id uuid PRIMARY KEY, driver_id uuid, service_id uuid, is_active boolean,
		is_approved boolean, expires_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.compliance_rules (
		code text PRIMARY KEY, severity text, blocking boolean, enabled boolean,
		warning_days int, legal_basis text, params jsonb)`,
	`CREATE TABLE IF NOT EXISTS public.license_category_rules (
		vehicle_type text, service_code text, required_categories text[],
		severity text, confirmed_by_source boolean, is_active boolean)`,
	`CREATE TABLE IF NOT EXISTS public.driver_licenses (
		id uuid, driver_id uuid, status text, license_number text, license_type text,
		categories text[], issue_date date, expiry_date date, reported_status text,
		is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.vehicle_circulation_cards (
		id uuid, vehicle_id uuid, status text, card_number text, issued_at date,
		declared_valid_until date, declared_plate text, declared_vin text,
		declared_chasis text, declared_motor text, declared_service_type text,
		is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.vehicle_insurance_policies (
		id uuid, vehicle_id uuid, status text, policy_number text, insurer_code text,
		coverage_type text, effective_from date, effective_until date,
		insured_plate text, insured_vin text, insured_motor text, insured_chasis text,
		is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.vehicle_inspections (
		id uuid, vehicle_id uuid, status text, inspected_at date, result text,
		valid_until date, is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.vehicle_emission_certificates (
		id uuid, vehicle_id uuid, status text, tested_at date, result text,
		valid_until date, is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.vehicle_revisado_stickers (
		id uuid, vehicle_id uuid, status text, sticker_year int, issued_at date,
		valid_until date, is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.vehicle_road_taxes (
		id uuid, vehicle_id uuid, status text, tax_year int, paid_at date,
		exempt boolean, exempt_reason text, is_current boolean,
		deleted_at timestamptz, created_at timestamptz)`,
	`CREATE TABLE IF NOT EXISTS public.outbox_events (
		event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text,
		aggregate_type text, aggregate_id text, payload jsonb, request_id text)`,
	`ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS request_id text`,
	`ALTER TABLE public.outbox_events ALTER COLUMN event_id SET DEFAULT gen_random_uuid()`,
	`ALTER TABLE public.outbox_events ALTER COLUMN next_attempt_at SET DEFAULT now()`,
}
