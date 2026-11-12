package platform

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestBiometricRegistrationAudit(t *testing.T) {
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
	uid := fmt.Sprintf("biometric-test-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'driver')`, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id) VALUES ($1)`, uid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.biometric_authentications WHERE user_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.outbox_events WHERE aggregate_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id = $1`, uid)
	})
	svc := NewService(pool, nil, "")
	if err := svc.LogBiometric(ctx, uid, "driver", "device_credential", "preflight", true, 1, "", "invalid"); err == nil {
		t.Fatal("invalid ride ID should fail")
	}
	var registrationID *string
	if err := pool.QueryRow(ctx, `SELECT biometric_registration_id::text FROM public.drivers WHERE user_id = $1`, uid).Scan(&registrationID); err != nil || registrationID != nil {
		t.Fatalf("failed attempt must roll back registration ID: %v, %v", registrationID, err)
	}

	const attempts = 8
	var wg sync.WaitGroup
	errs := make(chan error, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- svc.LogBiometric(ctx, uid, "driver", "device_credential", "preflight", true, 1, "", "")
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	var count, distinctIDs, events int
	if err := pool.QueryRow(ctx, `
		SELECT count(*), count(DISTINCT biometric_registration_id)
		FROM public.biometric_authentications WHERE user_id = $1`, uid).Scan(&count, &distinctIDs); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM public.outbox_events
		WHERE aggregate_id = $1 AND event_type = 'driver.biometric_registered'`, uid).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if count != attempts || distinctIDs != 1 || events != 1 {
		t.Fatalf("attempts=%d distinctIDs=%d events=%d", count, distinctIDs, events)
	}
}
