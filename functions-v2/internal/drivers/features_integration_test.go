package drivers

import (
	"context"
	"fmt"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestSeniorPreferenceAndPetDefault(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definido")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	uid := fmt.Sprintf("feature-test-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'driver')`, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1)`, uid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.outbox_events WHERE aggregate_type = 'driver' AND aggregate_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id = $1`, uid)
	})
	svc := NewService(pool, nil)
	check := func(wantSenior bool) {
		t.Helper()
		codes, err := svc.MyFeatureCapabilities(ctx, uid)
		if err != nil {
			t.Fatal(err)
		}
		if !slices.Contains(codes, "pet_friendly") || slices.Contains(codes, "senior") != wantSenior {
			t.Fatalf("unexpected capabilities: %v", codes)
		}
	}
	check(false)
	if err := svc.SetSeniorFeature(ctx, uid, true, t.Name()); err != nil {
		t.Fatal(err)
	}
	check(true)
	var grantedBy string
	var revokedBy *string
	if err := pool.QueryRow(ctx, `
		SELECT a.granted_by, a.revoked_by
		FROM public.driver_feature_assignments a
		JOIN public.drivers d ON d.id = a.driver_id
		JOIN public.features f ON f.id = a.feature_id
		WHERE d.user_id = $1 AND f.code = 'senior'`, uid).Scan(&grantedBy, &revokedBy); err != nil {
		t.Fatal(err)
	}
	if grantedBy != uid || revokedBy != nil {
		t.Fatalf("enabled grant: granted_by=%q revoked_by=%v", grantedBy, revokedBy)
	}
	if err := svc.SetSeniorFeature(ctx, uid, false, t.Name()); err != nil {
		t.Fatal(err)
	}
	check(false)
	if err := pool.QueryRow(ctx, `
		SELECT a.granted_by, a.revoked_by
		FROM public.driver_feature_assignments a
		JOIN public.drivers d ON d.id = a.driver_id
		JOIN public.features f ON f.id = a.feature_id
		WHERE d.user_id = $1 AND f.code = 'senior'`, uid).Scan(&grantedBy, &revokedBy); err != nil {
		t.Fatal(err)
	}
	if grantedBy != uid || revokedBy == nil || *revokedBy != uid {
		t.Fatalf("disabled grant: granted_by=%q revoked_by=%v", grantedBy, revokedBy)
	}
	var events int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.outbox_events WHERE aggregate_type = 'driver' AND aggregate_id = $1`, uid).Scan(&events); err != nil || events != 2 {
		t.Fatalf("events = %d, err = %v", events, err)
	}
}
