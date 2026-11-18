package inspections

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/apperr"
)

func TestSubmitAndRetrieveUsingLiveRideID(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires TEST_DATABASE_URL with migrations through 0029")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	client, driver, other, liveID := uuid.NewString(), uuid.NewString(), uuid.NewString(), "live-"+uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client'), ($2, 'driver'), ($3, 'driver')`, client, driver, other); err != nil {
		t.Fatal(err)
	}
	var rideID string
	t.Cleanup(func() {
		if rideID != "" {
			_, _ = pool.Exec(ctx, `DELETE FROM public.designated_driver_inspections WHERE ride_id=$1::uuid`, rideID)
			_, _ = pool.Exec(ctx, `DELETE FROM public.rides WHERE id=$1::uuid`, rideID)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id=$1`, driver)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id=ANY($1)`, []string{client, driver, other})
	})
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id) VALUES ($1)`, driver); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides (firebase_ride_id, client_id, driver_id, ride_type, status)
		VALUES ($1, $2, $3, 'designated_driver', 'driver_arrived') RETURNING id::text`,
		liveID, client, driver).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	confirmed := true
	input := SubmitRequest{
		RideID: liveID, VehicleFrontPhoto: "front-driver", VehicleRearPhoto: "rear-left",
		InteriorFrontPhoto: "front-passenger", InteriorRearPhoto: "rear-right",
		InsuranceDocumentPhoto: "insurance", RegistrationDocumentPhoto: "registration",
		DocumentsConfirmed: &confirmed,
	}
	svc := NewService(pool)
	if _, err := svc.Submit(ctx, other, input); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("unauthorized submission: %v", err)
	}
	saved, err := svc.Submit(ctx, driver, input)
	if err != nil {
		t.Fatal(err)
	}
	if saved.RideID != rideID || saved.InsuranceDocumentPhoto == nil || *saved.InsuranceDocumentPhoto != "insurance" ||
		saved.RegistrationDocumentPhoto == nil || *saved.RegistrationDocumentPhoto != "registration" || !saved.DocumentsConfirmed {
		t.Fatalf("inspection not persisted: %#v", saved)
	}
	for _, id := range []string{rideID, liveID} {
		got, err := svc.GetByRide(ctx, id, client, "client")
		if err != nil || got == nil || got.ID != saved.ID || !got.DocumentsConfirmed {
			t.Fatalf("get by %s: %#v, %v", id, got, err)
		}
	}
	if _, err := svc.GetByRide(ctx, liveID, other, "driver"); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("unauthorized read: %v", err)
	}
}
