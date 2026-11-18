package rides

import (
	"context"
	"os"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/projections"
)

func TestConfirmDriverPersistsArrivalPhoto(t *testing.T) {
	if os.Getenv("TEST_DATABASE_URL") == "" || os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires TEST_DATABASE_URL and FIRESTORE_EMULATOR_HOST")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	client, err := firestore.NewClient(ctx, "demo-rundi")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })

	clientUID, driverUID, otherUID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	liveID := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client'), ($2, 'driver'), ($3, 'driver')`, clientUID, driverUID, otherUID); err != nil {
		t.Fatal(err)
	}
	var driverID, rideID string
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.outbox_events WHERE aggregate_id=$1`, rideID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.rides WHERE id=$1::uuid`, rideID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id=$1`, driverUID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id=ANY($1)`, []string{clientUID, driverUID, otherUID})
		_, _ = client.Collection(fs.ColArrivalPhotos).Doc(driverUID).Delete(ctx)
		_, _ = client.Collection(fs.ColArrivalPhotos).Doc(otherUID).Delete(ctx)
		_, _ = client.Collection(fs.ColTripsLive).Doc(liveID).Delete(ctx)
		_, _ = client.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driverUID).Delete(ctx)
	})
	if err := pool.QueryRow(ctx, `INSERT INTO public.drivers (user_id, account_status) VALUES ($1, 'active') RETURNING id::text`, driverUID).Scan(&driverID); err != nil {
		t.Fatal(err)
	}
	openTestDriverSession(t, ctx, pool, driverID)
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.rides (firebase_ride_id, client_id, ride_type, status, estimated_price)
		VALUES ($1, $2, 'designated_driver', 'driver_offered', 100) RETURNING id::text`,
		liveID, clientUID).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.ride_offers (ride_id, driver_id, kind, status, offered_price)
		VALUES ($1::uuid, $2, 'counter_offer', 'sent', 100)`, rideID, driverUID); err != nil {
		t.Fatal(err)
	}
	photoPath := "rides-documents/rides-inspection/designated-arrival/" + driverUID + "/photo.jpg"
	for uid, path := range map[string]string{
		driverUID: photoPath,
		otherUID:  "rides-documents/rides-inspection/designated-arrival/" + otherUID + "/other.jpg",
	} {
		if _, err := client.Collection(fs.ColArrivalPhotos).Doc(uid).Set(ctx, map[string]any{"path": path, "takenAt": time.Now()}); err != nil {
			t.Fatal(err)
		}
	}

	svc := NewService(pool, client)
	if _, err := svc.ConfirmDriver(ctx, rideID, clientUID, driverUID, t.Name()); err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := pool.QueryRow(ctx, `SELECT arrival_vehicle_photo FROM public.rides WHERE id=$1::uuid`, rideID).Scan(&stored); err != nil || stored != photoPath {
		t.Fatalf("stored photo=%q, err=%v", stored, err)
	}
	var event projections.Event
	event.AggregateID, event.AggregateType, event.EventType = rideID, "ride", "ride.accepted"
	if err := pool.QueryRow(ctx, `SELECT event_id::text, payload FROM public.outbox_events
		WHERE aggregate_id=$1 AND event_type='ride.accepted' ORDER BY created_at DESC LIMIT 1`, rideID).
		Scan(&event.EventID, &event.Payload); err != nil {
		t.Fatal(err)
	}
	if _, err := projections.Publish(ctx, pool, client, event); err != nil {
		t.Fatal(err)
	}
	snap, err := client.Collection(fs.ColTripsLive).Doc(liveID).Get(ctx)
	if err != nil || snap.Data()["arrivalVehiclePhoto"] != photoPath {
		t.Fatalf("projected photo: %v, err=%v", snap, err)
	}
}
