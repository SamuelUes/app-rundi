package ratings

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestRatingDecisionsArePerParticipant(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	client, driver := uuid.NewString(), uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client'), ($2, 'driver')`, client, driver); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id) VALUES ($1)`, driver); err != nil {
		t.Fatal(err)
	}
	var ride string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides (client_id, driver_id, firebase_ride_id, status, completed_at)
		VALUES ($1, $2, $3, 'completed', now()) RETURNING id::text`, client, driver, uuid.NewString()).Scan(&ride); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool)
	if err := svc.skip(ctx, ride, driver, ""); err != nil {
		t.Fatal(err)
	}
	var state string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM public.rides WHERE id=$1`, ride).Scan(&state); err != nil || state != "completed" {
		t.Fatalf("driver skip changed client state: %s, %v", state, err)
	}
	if err := svc.skip(ctx, ride, client, ""); err != nil {
		t.Fatal(err)
	}
	if err := svc.skip(ctx, ride, client, ""); err != nil {
		t.Fatalf("skip retry: %v", err)
	}
	if _, err := svc.Submit(ctx, client, "", SubmitRatingRequest{
		RideID: ride, ToUserID: driver, RatedRole: "driver", Rating: 5, Finalize: true,
	}); err == nil {
		t.Fatal("rating after skip must fail")
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.ride_rating_decisions WHERE ride_id=$1 AND decision='skipped'`, ride).Scan(&count); err != nil || count != 2 {
		t.Fatalf("decisions=%d err=%v", count, err)
	}
}

func TestConcurrentRatingAndSkip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	client, driver := uuid.NewString(), uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client'), ($2, 'driver')`, client, driver); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id) VALUES ($1)`, driver); err != nil {
		t.Fatal(err)
	}
	var ride string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides (client_id, driver_id, firebase_ride_id, status, completed_at)
		VALUES ($1, $2, $3, 'completed', now()) RETURNING id::text`, client, driver, uuid.NewString()).Scan(&ride); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool)
	start := make(chan struct{})
	errs := make([]error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		_, errs[0] = svc.Submit(ctx, client, "", SubmitRatingRequest{RideID: ride, ToUserID: driver, RatedRole: "driver", Rating: 5, Finalize: true})
	}()
	go func() {
		defer wg.Done()
		<-start
		errs[1] = svc.skip(ctx, ride, client, "")
	}()
	close(start)
	wg.Wait()
	if (errs[0] == nil) == (errs[1] == nil) {
		t.Fatalf("exactly one decision must win: %v", errs)
	}
	var decision string
	var count int
	if err := pool.QueryRow(ctx, `SELECT d.decision, (SELECT count(*) FROM public.ratings WHERE ride_id=d.ride_id)
		FROM public.ride_rating_decisions d WHERE d.ride_id=$1 AND d.actor_id=$2`, ride, client).Scan(&decision, &count); err != nil {
		t.Fatal(err)
	}
	if (decision == "completed" && count != 1) || (decision == "skipped" && count != 0) {
		t.Fatalf("inconsistent decision=%s ratings=%d", decision, count)
	}
}

func TestPendingRatingPaymentPriorityAndRetries(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	client, captain, follower := uuid.NewString(), uuid.NewString(), uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client'), ($2, 'driver'), ($3, 'driver')`, client, captain, follower); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id) VALUES ($1), ($2)`, captain, follower); err != nil {
		t.Fatal(err)
	}
	var ride string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides (client_id, driver_id, follower_driver_id, firebase_ride_id, status, completed_at)
		VALUES ($1, $2, $3, $4, 'completed', now()) RETURNING id::text`, client, captain, follower, uuid.NewString()).Scan(&ride); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.payments (ride_id, amount, commission, status) VALUES ($1, 100, 10, 'pending')`, ride); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool)
	input := SubmitRatingRequest{RideID: ride, ToUserID: captain, RatedRole: "captain", Rating: 5}
	if _, err := svc.Submit(ctx, client, "", input); err == nil {
		t.Fatal("rating with a pending payment must fail")
	}
	if err := svc.skip(ctx, ride, client, ""); err == nil {
		t.Fatal("skip with a pending payment must fail")
	}
	if _, err := pool.Exec(ctx, `UPDATE public.payments SET status='confirmed' WHERE ride_id=$1`, ride); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Submit(ctx, captain, "", input); err == nil {
		t.Fatal("driver cannot rate himself")
	}
	first, err := svc.Submit(ctx, client, "", input)
	if err != nil {
		t.Fatal(err)
	}
	retry, err := svc.Submit(ctx, client, "", input)
	if err != nil || retry.ID != first.ID {
		t.Fatalf("retry=%v err=%v", retry, err)
	}
	pending, err := LatestClientRating(ctx, pool, client)
	if err != nil || pending == nil || pending.Status != "pending" || !pending.CaptainRated || pending.FollowerRated {
		t.Fatalf("partial state=%+v err=%v", pending, err)
	}
	_, err = svc.Submit(ctx, client, "", SubmitRatingRequest{
		RideID: ride, ToUserID: follower, RatedRole: "follower", Rating: 4, Finalize: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	pending, err = LatestClientRating(ctx, pool, client)
	if err != nil || pending == nil || pending.Status != "completed" || !pending.CaptainRated || !pending.FollowerRated {
		t.Fatalf("completed state=%+v err=%v", pending, err)
	}
}
