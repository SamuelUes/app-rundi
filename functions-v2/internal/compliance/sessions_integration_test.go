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

// TestDriverSessionsIntegration — abrir/revocar sesión y el gate SQL con las
// señales: una autorización viva autoriza; día vencido, revocación, señal
// cambiada o sesión ausente cierran el paso.
func TestDriverSessionsIntegration(t *testing.T) {
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

	// Esquema mínimo desechable requerido por la FK y los triggers de 0016.
	for _, sql := range []string{
		`CREATE TABLE IF NOT EXISTS public.drivers (
			id uuid PRIMARY KEY, user_id text, account_status text,
			documents_status text, deleted_at timestamptz)`,
	} {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
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

	driverID := uuid.NewString()
	if _, err := pool.Exec(ctx, `DELETE FROM public.compliance_signals
		WHERE signal_key IN ($1,'global') AND kind IN ('driver','rules')`, driverID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (id,user_id,account_status)
		VALUES ($1,$2,'active')`, driverID, "sess-"+uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM public.driver_sessions WHERE driver_id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	gens := map[string]int64{"driver:" + driverID: 1, "rules:global": 1}
	seed := []signalKey{{"driver", driverID}, {"rules", "global"}}

	// Gate sin fila → debe reactivar.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CheckDriverSession(ctx, tx, driverID); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("missing session err=%v", err)
	}
	tx.Rollback(ctx)

	// Abrir sesión: seq=1, autoriza en el gate dentro de la misma tx.
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := seedComplianceSignals(ctx, tx, seed); err != nil {
		t.Fatal(err)
	}
	today, end := NicaraguaDayWindow(time.Now())
	sessionID, seq, err := OpenDriverSession(ctx, tx, driverID, today, nil,
		[]string{"rides"}, gens, end)
	if err != nil || seq != 1 || sessionID == "" {
		t.Fatalf("open session=%v seq=%d err=%v", sessionID, seq, err)
	}
	got, err := CheckDriverSession(ctx, tx, driverID)
	if err != nil || got != sessionID {
		t.Fatalf("gate session=%v err=%v", got, err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	// Segunda apertura: seq avanza y la sesión vieja queda reemplazada.
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	newID, seq, err := OpenDriverSession(ctx, tx, driverID, today, nil,
		[]string{"rides"}, gens, end)
	if err != nil || seq != 2 || newID == sessionID {
		t.Fatalf("reopen seq=%d err=%v", seq, err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	// Señal cambiada después de autorizar → el gate falla cerrado.
	if _, err := pool.Exec(ctx, `UPDATE public.compliance_signals SET generation=generation+1
		WHERE kind='driver' AND signal_key=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CheckDriverSession(ctx, tx, driverID); !errors.Is(err, ErrSessionSignalsStale) {
		t.Fatalf("stale signal err=%v", err)
	}
	tx.Rollback(ctx)
	if _, err := pool.Exec(ctx, `UPDATE public.compliance_signals SET generation=generation-1
		WHERE kind='driver' AND signal_key=$1`, driverID); err != nil {
		t.Fatal(err)
	}

	// Revocación: el gate exige reactivar y la seq avanza; re-revocar es no-op.
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	seq, err = RevokeDriverSession(ctx, tx, driverID)
	if err != nil || seq != 3 {
		t.Fatalf("revoke seq=%d err=%v", seq, err)
	}
	if _, err := CheckDriverSession(ctx, tx, driverID); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("revoked session err=%v", err)
	}
	seq, err = RevokeDriverSession(ctx, tx, driverID)
	if err != nil || seq != 3 {
		t.Fatalf("re-revoke seq=%d want 3 err=%v", seq, err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	// Sesión con vigencia pasada → cerrada aunque la fila diga lo contrario.
	past := time.Now().Add(-time.Minute)
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, seq, err = OpenDriverSession(ctx, tx, driverID, today, nil,
		[]string{"rides"}, gens, past); err != nil {
		t.Fatal(err)
	}
	if _, err := CheckDriverSession(ctx, tx, driverID); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("expired session err=%v", err)
	}
	tx.Rollback(ctx)

	// Migración idempotente.
	migration, err := os.ReadFile("../../../database-v2/cloudsql/0017_driver_sessions.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatalf("0017 is not idempotent: %v", err)
	}
}

// TestFirestoreMirrorFenceIntegration — el espejo _fs: una fila legacy marcada
// reactivation_required (producida por la arquitectura anterior en cada
// revoke) bloquea el espejo hasta que el resync la limpia; una revocación
// deliberada NO marca filas _fs, pero una mutación sí — aun estando offline.
func TestFirestoreMirrorFenceIntegration(t *testing.T) {
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

	for _, sql := range []string{
		`CREATE TABLE IF NOT EXISTS public.drivers (
			id uuid PRIMARY KEY, user_id text, account_status text,
			documents_status text, deleted_at timestamptz)`,
		`CREATE TABLE IF NOT EXISTS public.outbox_events (
			event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text,
			aggregate_type text, aggregate_id text, payload jsonb,
			status text DEFAULT 'pending')`,
	} {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	for _, file := range []string{
		"../../../database-v2/cloudsql/0016_compliance_signals.sql",
		"../../../database-v2/cloudsql/0017_driver_sessions.sql",
		"../../../database-v2/cloudsql/0033_firestore_session_fence.sql",
		"../../../database-v2/cloudsql/0034_fs_invalidate_offline_rows.sql",
	} {
		migration, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, string(migration)); err != nil {
			t.Fatalf("%s: %v", file, err)
		}
	}

	driverID := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (id,user_id,account_status)
		VALUES ($1,$2,'active')`, driverID, "mirror-"+uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM public.driver_sessions WHERE driver_id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	today, end := NicaraguaDayWindow(time.Now())
	services := []string{"rides"}

	open := func() (int64, error) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		seq, err := OpenFirestoreMirrorSession(ctx, tx, driverID, uuid.NewString(),
			today, nil, services, 1, 1, end)
		if err != nil {
			return 0, err
		}
		return seq, tx.Commit(ctx)
	}
	flag := func() bool {
		var marked bool
		if err := pool.QueryRow(ctx, `SELECT reactivation_required
			FROM public.driver_sessions WHERE driver_id=$1`, driverID).Scan(&marked); err != nil {
			t.Fatal(err)
		}
		return marked
	}
	clearFlag := func() {
		// Misma sentencia que SyncFirestoreInputs: tras reevaluar limpia la
		// marca de cualquier fila del conductor, legacy o _fs.
		if _, err := pool.Exec(ctx, `UPDATE public.driver_sessions
			SET reactivation_required = FALSE
			WHERE driver_id=$1 AND reactivation_required`, driverID); err != nil {
			t.Fatal(err)
		}
	}

	// Fila legacy marcada por la arquitectura anterior: el espejo rehúsa y el
	// resync la desbloquea (regresión del 500 en activación).
	if _, err := pool.Exec(ctx, `INSERT INTO public.driver_sessions
		(driver_id, session_seq, session_id, day, service_codes,
		 input_generations, reactivation_required, expires_at)
		VALUES ($1, 2, NULL, $2, '{rides}', '{"driver:x":1}', TRUE, $3)`,
		driverID, today, end); err != nil {
		t.Fatal(err)
	}
	if _, err := open(); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("marked legacy row opened the mirror: %v", err)
	}
	clearFlag()
	seq, err := open()
	if err != nil || seq != 3 {
		t.Fatalf("mirror after resync seq=%d err=%v", seq, err)
	}
	var isFS bool
	if err := pool.QueryRow(ctx, `SELECT COALESCE(input_generations->>'_fs','')='1'
		FROM public.driver_sessions WHERE driver_id=$1`, driverID).Scan(&isFS); err != nil || !isFS {
		t.Fatalf("mirror not marked _fs: %v", err)
	}

	// Revocación deliberada de una fila _fs: no es obsolescencia, la marca se
	// preserva (false) y el próximo espejo abre sin resync.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := RevokeDriverSession(ctx, tx, driverID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if flag() {
		t.Fatal("deliberate revoke marked an _fs row as stale")
	}
	if _, err := open(); err != nil {
		t.Fatalf("reactivation after clean offline must not resync: %v", err)
	}

	// Mutación con el conductor offline: el cerco marca la fila aunque no haya
	// sesión viva; el siguiente espejo exige resync.
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := RevokeDriverSession(ctx, tx, driverID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `SELECT public.fs_availability_invalidate($1::uuid)`,
		driverID); err != nil {
		t.Fatal(err)
	}
	if !flag() {
		t.Fatal("offline _fs row not marked by the mutation fence")
	}
	if _, err := open(); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("stale offline row opened the mirror: %v", err)
	}
	clearFlag()
	if _, err := open(); err != nil {
		t.Fatalf("reactivation after resync failed: %v", err)
	}

	// Una fila _fs marcada conserva la marca tras una revocación deliberada.
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := RevokeDriverSession(ctx, tx, driverID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `SELECT public.fs_availability_invalidate($1::uuid)`,
		driverID); err != nil {
		t.Fatal(err)
	}
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := RevokeDriverSession(ctx, tx, driverID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if !flag() {
		t.Fatal("deliberate revoke cleared a pending stale mark")
	}
	if _, err := open(); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("revoked stale row opened the mirror: %v", err)
	}
}
