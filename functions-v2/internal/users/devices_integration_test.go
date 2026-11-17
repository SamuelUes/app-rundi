package users

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDeviceBindingAndRecognition(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	suffix := fmt.Sprint(time.Now().UnixNano())
	a, b := "device-test-a-"+suffix, "device-test-b-"+suffix
	d1, d2 := "device-test-1-"+suffix, "device-test-2-"+suffix
	secret1, secret2, secret3 := "secret-one-123456789", "secret-two-123456789", "secret-three-123456789"
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, name, role) VALUES ($1, 'A', 'client'), ($2, 'B', 'client')`, a, b); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.user_devices WHERE user_id IN ($1, $2)`, a, b)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id IN ($1, $2)`, a, b)
	}()
	svc := NewService(pool, nil, nil)
	register := func(uid, device, secret string) {
		t.Helper()
		if err := svc.RegisterDevice(ctx, uid, deviceRegisterRequest{DeviceID: device, Secret: secret}); err != nil {
			t.Fatal(err)
		}
	}
	check := func(device, secret, name string) {
		t.Helper()
		got, err := svc.RecognizeDevice(ctx, device, secret)
		if err != nil {
			t.Fatal(err)
		}
		if name == "" {
			if got.Recognized || got.Name != nil || got.ProfilePhoto != nil {
				t.Fatalf("unexpected recognition: %+v", got)
			}
		} else if !got.Recognized || got.Name == nil || *got.Name != name {
			t.Fatalf("recognition = %+v, want %s", got, name)
		}
	}
	register(a, d1, secret1)
	check(d1, secret1, "A")
	check(d1, "incorrect-secret-12345", "")
	register(b, d1, secret2)
	check(d1, secret1, "")
	check(d1, secret2, "B")
	register(a, d2, secret3)
	check(d2, secret3, "A")
	check(d1, secret2, "B")
	register(a, d1, secret1)
	check(d2, secret3, "")
	check(d1, secret2, "")
	check(d1, secret1, "A")

	var wg sync.WaitGroup
	errors := make(chan error, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			uid, device := a, d1
			if i%2 == 0 {
				uid, device = b, d2
			}
			errors <- svc.RegisterDevice(ctx, uid, deviceRegisterRequest{DeviceID: device, Secret: secret1})
		}(i)
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	var duplicates int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM (
		  SELECT device_id FROM public.user_devices WHERE revoked_at IS NULL AND user_id IN ($1,$2)
		  GROUP BY device_id HAVING COUNT(*) > 1
		  UNION ALL
		  SELECT user_id FROM public.user_devices WHERE revoked_at IS NULL AND user_id IN ($1,$2)
		  GROUP BY user_id HAVING COUNT(*) > 1
		) duplicates`, a, b).Scan(&duplicates)
	if err != nil || duplicates != 0 {
		t.Fatalf("duplicate active bindings: %d, err: %v", duplicates, err)
	}
}
