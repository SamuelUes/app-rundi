package platform

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
)

func TestCreateShareTokenAcceptsLiveDocID(t *testing.T) {
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
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	client := "share-client-" + suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client')`, client); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.rides WHERE client_id = $1`, client)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id = $1`, client)
	})
	var rideID string
	liveID := "share-live-" + suffix
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, firebase_ride_id, pricing_snapshot, estimated_price)
		VALUES ($1, $2, '{}', 100) RETURNING id::text`, client, liveID).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, nil, "test-share-secret")

	// El doc id vivo (firebase_ride_id) es el que llega del app — debe resolver.
	out, err := svc.CreateShareToken(ctx, client, liveID, 24)
	if err != nil {
		t.Fatalf("firebase_ride_id debe resolver al viaje: %v", err)
	}
	got, err := svc.verifyShareToken(out["token"].(string))
	if err != nil {
		t.Fatalf("token firmado inválido: %v", err)
	}
	if got != liveID {
		t.Fatalf("el token debe incrustar el doc id vivo que PublicTracking consulta: %q", got)
	}

	// El uuid SQL sigue autorizando (pantallas/driver que ya lo tienen).
	if _, err := svc.CreateShareToken(ctx, client, rideID, 24); err != nil {
		t.Fatalf("uuid SQL debe autorizar: %v", err)
	}

	// Un ajeno al viaje sigue recibiendo 403 aunque conozca ambos ids.
	if _, err := svc.CreateShareToken(ctx, "stranger", rideID, 24); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("no participante con uuid: %v", err)
	}
	if _, err := svc.CreateShareToken(ctx, "stranger", liveID, 24); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("no participante con live id: %v", err)
	}
}
