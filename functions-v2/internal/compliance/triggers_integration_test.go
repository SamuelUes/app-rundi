package compliance

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestComplianceTriggerSignalsIntegration(t *testing.T) {
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
	migration, err := os.ReadFile("../../../database-v2/cloudsql/0016_compliance_signals.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatal(err)
	}

	s := pgx.Identifier{"sigtest_" + strings.ReplaceAll(uuid.NewString(), "-", "")}.Sanitize()
	driverID, vehicleID := uuid.NewString(), uuid.NewString()
	if _, err := pool.Exec(ctx, "DELETE FROM public.compliance_signals"); err != nil {
		t.Fatal(err)
	}
	stmts := []string{
		"CREATE SCHEMA " + s,
		"CREATE TABLE " + s + `.drivers (id uuid PRIMARY KEY, account_status text, documents_status text, deleted_at timestamptz, balance numeric)`,
		"CREATE TABLE " + s + `.driver_licenses (id uuid PRIMARY KEY, driver_id uuid, license_number text, status text)`,
		"CREATE TABLE " + s + `.vehicles (id uuid PRIMARY KEY, driver_id uuid, plate text, vin text, chasis text, motor text, deleted_at timestamptz)`,
		"CREATE TABLE " + s + `.vehicle_insurance_policies (id uuid PRIMARY KEY, vehicle_id uuid, policy_number text)`,
		"CREATE TABLE " + s + `.compliance_rules (code text PRIMARY KEY)`,
		"CREATE TRIGGER trg_drivers_ins AFTER INSERT OR DELETE ON " + s + `.drivers FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('driver:id')`,
		"CREATE TRIGGER trg_drivers_upd AFTER UPDATE ON " + s + `.drivers FOR EACH ROW
			WHEN (OLD.account_status IS DISTINCT FROM NEW.account_status
			  OR OLD.documents_status IS DISTINCT FROM NEW.documents_status
			  OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
			EXECUTE FUNCTION public.compliance_bump('driver:id')`,
		"CREATE TRIGGER trg_licenses AFTER INSERT OR UPDATE OR DELETE ON " + s + `.driver_licenses
			FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('driver:driver_id','license:license_number')`,
		"CREATE TRIGGER trg_vehicles AFTER INSERT OR UPDATE OR DELETE ON " + s + `.vehicles
			FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('driver:driver_id','vehicle:id','plate:plate','vin:vin','chasis:chasis','motor:motor')`,
		"CREATE TRIGGER trg_insurance AFTER INSERT OR UPDATE OR DELETE ON " + s + `.vehicle_insurance_policies
			FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('vehicle:vehicle_id','policy:policy_number')`,
		"CREATE TRIGGER trg_rules AFTER INSERT OR UPDATE OR DELETE ON " + s + `.compliance_rules
			FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('rules:=global')`,
	}
	for _, sql := range stmts {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	gen := func(kind, key string) int64 {
		t.Helper()
		var v int64
		err := pool.QueryRow(ctx, `SELECT generation FROM public.compliance_signals
			WHERE kind=$1 AND signal_key=$2`, kind, key).Scan(&v)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0
		}
		if err != nil {
			t.Fatalf("signal %s:%s: %v", kind, key, err)
		}
		return v
	}

	// INSERT conductor → driver signal creada; UPDATE irrelevante no la toca;
	// UPDATE relevante sí.
	if _, err := pool.Exec(ctx, "INSERT INTO "+s+`.drivers (id, account_status) VALUES ($1,'active')`, driverID); err != nil {
		t.Fatal(err)
	}
	if got := gen("driver", driverID); got != 1 {
		t.Fatalf("driver gen=%d want 1", got)
	}
	if _, err := pool.Exec(ctx, "UPDATE "+s+`.drivers SET balance=10 WHERE id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	if got := gen("driver", driverID); got != 1 {
		t.Fatalf("irrelevant update bumped driver gen=%d", got)
	}
	if _, err := pool.Exec(ctx, "UPDATE "+s+`.drivers SET account_status='suspended' WHERE id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	if got := gen("driver", driverID); got != 2 {
		t.Fatalf("relevant update driver gen=%d want 2", got)
	}

	// Licencia nueva → driver + license key. Cambio de número toca ambas claves.
	if _, err := pool.Exec(ctx, "INSERT INTO "+s+`.driver_licenses (id,driver_id,license_number)
		VALUES ($1,$2,'L-1')`, uuid.NewString(), driverID); err != nil {
		t.Fatal(err)
	}
	if got := gen("license", "L-1"); got != 1 {
		t.Fatalf("license gen=%d want 1", got)
	}
	if got := gen("driver", driverID); got != 3 {
		t.Fatalf("license insert driver gen=%d want 3", got)
	}
	if _, err := pool.Exec(ctx, "UPDATE "+s+`.driver_licenses SET license_number='L-2' WHERE driver_id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	if got := gen("license", "L-1"); got != 2 {
		t.Fatalf("old license key gen=%d want 2", got)
	}
	if got := gen("license", "L-2"); got != 1 {
		t.Fatalf("new license key gen=%d want 1", got)
	}

	// Vehículo → driver + vehicle + plate normalizada; UPDATE de placa toca vieja y nueva.
	if _, err := pool.Exec(ctx, "INSERT INTO "+s+`.vehicles (id,driver_id,plate,vin)
		VALUES ($1,$2,'AbC','VIN-9')`, vehicleID, driverID); err != nil {
		t.Fatal(err)
	}
	if got := gen("plate", "abc"); got != 1 {
		t.Fatalf("normalized plate gen=%d want 1", got)
	}
	if got := gen("vin", "VIN-9"); got != 1 {
		t.Fatalf("vin gen=%d want 1", got)
	}
	if got := gen("vehicle", vehicleID); got != 1 {
		t.Fatalf("vehicle gen=%d want 1", got)
	}
	if _, err := pool.Exec(ctx, "UPDATE "+s+`.vehicles SET plate='XYZ' WHERE id=$1`, vehicleID); err != nil {
		t.Fatal(err)
	}
	if got := gen("plate", "abc"); got != 2 {
		t.Fatalf("old plate key gen=%d want 2", got)
	}
	if got := gen("plate", "xyz"); got != 1 {
		t.Fatalf("new plate key gen=%d want 1", got)
	}

	// Documento de vehículo → vehicle + policy keys.
	if _, err := pool.Exec(ctx, "INSERT INTO "+s+`.vehicle_insurance_policies (id,vehicle_id,policy_number)
		VALUES ($1,$2,'P-1')`, uuid.NewString(), vehicleID); err != nil {
		t.Fatal(err)
	}
	if got := gen("vehicle", vehicleID); got != 3 {
		t.Fatalf("vehicle doc vehicle gen=%d want 3", got)
	}
	if got := gen("policy", "P-1"); got != 1 {
		t.Fatalf("policy gen=%d want 1", got)
	}

	// Reglas → global.
	before := gen("rules", "global")
	if _, err := pool.Exec(ctx, "INSERT INTO "+s+`.compliance_rules (code) VALUES ('TEST_RULE')`); err != nil {
		t.Fatal(err)
	}
	if got := gen("rules", "global"); got != before+1 {
		t.Fatalf("rules gen=%d want %d", got, before+1)
	}

	// DELETE → claves del registro borrado.
	if _, err := pool.Exec(ctx, "DELETE FROM "+s+`.driver_licenses WHERE driver_id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	if got := gen("license", "L-2"); got != 2 {
		t.Fatalf("deleted license key gen=%d want 2", got)
	}
}
