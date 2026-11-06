package compliance

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestComplianceSignalCaptureIntegration — dentro de una tx RepeatableRead se
// siembran las señales faltantes y se registran las generaciones del mismo
// snapshot que los hechos. Un segundo intento no duplica ni incrementa; un
// cambio posterior se detecta al releer.
func TestComplianceSignalCaptureIntegration(t *testing.T) {
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
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	s := pgx.Identifier{"sigcap_" + strings.ReplaceAll(uuid.NewString(), "-", "")}.Sanitize()
	driverID, vehicleID := uuid.NewString(), uuid.NewString()
	for _, sql := range []string{
		"CREATE SCHEMA " + s,
		"CREATE TABLE " + s + `.compliance_signals (kind text, signal_key text,
			generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
			PRIMARY KEY (kind, signal_key))`,
		"CREATE TABLE " + s + `.drivers (id uuid PRIMARY KEY, user_id text,
			account_status text, documents_status text, deleted_at timestamptz)`,
		"CREATE TABLE " + s + `.driver_licenses (id uuid, driver_id uuid, status text,
			license_number text, license_type text, categories text[], issue_date date,
			expiry_date date, reported_status text, is_current boolean,
			deleted_at timestamptz, created_at timestamptz)`,
		"CREATE TABLE " + s + `.vehicles (id uuid PRIMARY KEY, driver_id uuid,
			plate text, type text, service_type text, vehicle_class text, vin text,
			chasis text, motor text, year int, emission_date date, is_active boolean,
			created_at timestamptz, deleted_at timestamptz)`,
		"CREATE TABLE " + s + `.vehicle_circulation_cards (id uuid, vehicle_id uuid,
			status text, card_number text, issued_at date, declared_valid_until date,
			declared_plate text, declared_vin text, declared_chasis text,
			declared_motor text, declared_service_type text, is_current boolean,
			deleted_at timestamptz, created_at timestamptz)`,
		"CREATE TABLE " + s + `.vehicle_insurance_policies (id uuid, vehicle_id uuid,
			status text, policy_number text, insurer_code text, coverage_type text,
			effective_from date, effective_until date, insured_plate text,
			insured_vin text, insured_motor text, insured_chasis text,
			is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
		"CREATE TABLE " + s + `.vehicle_inspections (id uuid, vehicle_id uuid,
			status text, inspected_at date, result text, valid_until date,
			is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
		"CREATE TABLE " + s + `.vehicle_emission_certificates (id uuid, vehicle_id uuid,
			status text, tested_at date, result text, valid_until date,
			is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
		"CREATE TABLE " + s + `.vehicle_revisado_stickers (id uuid, vehicle_id uuid,
			status text, sticker_year int, issued_at date, valid_until date,
			is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
		"CREATE TABLE " + s + `.vehicle_road_taxes (id uuid, vehicle_id uuid,
			status text, tax_year int, paid_at date, exempt boolean, exempt_reason text,
			is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
		"INSERT INTO " + s + `.drivers (id,user_id,account_status) VALUES ('` + driverID + `','u-1','active')`,
		"INSERT INTO " + s + `.driver_licenses (id,driver_id,status,license_number,license_type,is_current)
			VALUES ('` + uuid.NewString() + `','` + driverID + `','approved','L-9','b',true)`,
		"INSERT INTO " + s + `.vehicles (id,driver_id,plate,vin,is_active)
			VALUES ('` + vehicleID + `','` + driverID + `','M123','VIN-1',true)`,
	} {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}

	// Primera captura: siembra + lectura dentro del snapshot de hechos.
	capture := func() map[string]int64 {
		t.Helper()
		tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		q := scopedFactsTx{Tx: tx, schema: s}
		facts, err := loadFactsWithQuerier(ctx, q, "u-1", vehicleID, "", "2026-11-05")
		if err != nil || facts.Driver == nil {
			t.Fatalf("facts=%v err=%v", facts, err)
		}
		keys := signalKeysForFacts(facts.Driver.ID, facts)
		if err := seedComplianceSignals(ctx, q, keys); err != nil {
			t.Fatal(err)
		}
		gens, err := loadSignalGenerations(ctx, q, keys)
		if err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		return gens
	}

	first := capture()
	wantKeys := []string{
		"rules:global", "driver:" + driverID, "license:L-9",
		"vehicle:" + vehicleID, "plate:m123", "vin:VIN-1",
	}
	if len(first) != len(wantKeys) {
		t.Fatalf("generations=%v want keys %v", first, wantKeys)
	}
	for _, k := range wantKeys {
		if first[k] != 1 {
			t.Fatalf("first[%s]=%d want 1 (map=%v)", k, first[k], first)
		}
	}

	// Segunda captura: ON CONFLICT no incrementa, generaciones estables.
	second := capture()
	for _, k := range wantKeys {
		if second[k] != 1 {
			t.Fatalf("second[%s]=%d want 1", k, second[k])
		}
	}

	// Un cambio posterior a la captura se detecta al releer las generaciones.
	if _, err := pool.Exec(ctx, "UPDATE "+s+`.compliance_signals SET generation=generation+1
		WHERE kind='driver' AND signal_key=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	third := capture()
	if third["driver:"+driverID] != 2 {
		t.Fatalf("driver generation=%d want 2", third["driver:"+driverID])
	}
	if third["license:L-9"] != 1 {
		t.Fatalf("untouched license generation=%d want 1", third["license:L-9"])
	}
}
