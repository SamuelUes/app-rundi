package reconcile

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCheckpointRecoveryIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_RECONCILE_INTEGRATION") != "1" {
		t.Skip("requires a disposable local PostgreSQL database")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") ||
		cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("integration test requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	key := "test-" + uuid.NewString()
	start := time.Now().UTC().Add(-24 * time.Hour).Truncate(time.Microsecond)
	var wg sync.WaitGroup
	claims := make(chan *checkpoint, 2)
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c, err := claimCheckpoint(ctx, pool, key, start, time.Second)
			claims <- c
			errs <- err
		}()
	}
	wg.Wait()
	close(claims)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	var first *checkpoint
	n := 0
	for c := range claims {
		if c != nil {
			first = c
			n++
		}
	}
	if n != 1 {
		t.Fatalf("got %d concurrent claims, want 1", n)
	}
	if !first.completedThrough.Equal(start) {
		t.Fatalf("initial checkpoint %v, want %v", first.completedThrough, start)
	}

	cursor := start.Add(2 * time.Hour)
	if err := saveCheckpoint(ctx, pool, first, cursor, "a"); err != nil {
		t.Fatal(err)
	}
	if err := saveCheckpoint(ctx, pool, first, cursor, "a"); err == nil {
		t.Fatal("cursor must not move backwards or repeat")
	}
	if err := saveCheckpoint(ctx, pool, first, first.windowEnd.Add(time.Second), "future"); err == nil {
		t.Fatal("cursor must not advance beyond the window")
	}
	time.Sleep(1200 * time.Millisecond)
	resumed, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || resumed == nil {
		t.Fatalf("reclaim: claim=%v err=%v", resumed, err)
	}
	if !resumed.windowEnd.Equal(first.windowEnd) || !resumed.completedThrough.Equal(start) ||
		resumed.cursorUpdatedAt == nil || !resumed.cursorUpdatedAt.Equal(cursor) ||
		resumed.cursorID == nil || *resumed.cursorID != "a" {
		t.Fatalf("reclaim did not preserve window and cursor: %+v", resumed)
	}
	if err := finishCheckpoint(ctx, pool, first); !errors.Is(err, errCheckpointLeaseLost) {
		t.Fatalf("expired owner finished checkpoint: %v", err)
	}
	if err := saveCheckpoint(ctx, pool, resumed, cursor, "b"); err != nil {
		t.Fatal(err)
	}
	if err := renewCheckpoint(ctx, pool, resumed, 5*time.Second); err != nil {
		t.Fatal(err)
	}
	if err := finishCheckpoint(ctx, pool, resumed); err != nil {
		t.Fatal(err)
	}
	notDue, err := claimScheduledCheckpoint(ctx, pool, key, start, 5*time.Second, time.Hour)
	if err != nil || notDue != nil {
		t.Fatalf("completed window must respect cadence: checkpoint=%v err=%v", notDue, err)
	}
	next, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || next == nil {
		t.Fatalf("next window: claim=%v err=%v", next, err)
	}
	if !next.completedThrough.Equal(resumed.windowEnd) || next.cursorUpdatedAt != nil || next.cursorID != nil {
		t.Fatalf("completed checkpoint was not advanced: %+v", next)
	}
	if err := releaseCheckpoint(ctx, pool, next); err != nil {
		t.Fatal(err)
	}
	again, err := claimScheduledCheckpoint(ctx, pool, key, start, 5*time.Second, time.Hour)
	if err != nil || again == nil || !again.windowEnd.Equal(next.windowEnd) {
		t.Fatalf("released window was not immediately resumable: claim=%v err=%v", again, err)
	}
}

func TestCheckpointPageRecoveryIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_RECONCILE_INTEGRATION") != "1" {
		t.Skip("requires a disposable local PostgreSQL database")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") ||
		cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("integration test requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	start := time.Now().UTC().Add(-24 * time.Hour).Truncate(time.Microsecond)
	key := "page-test-" + uuid.NewString()
	items := []checkpointItem{
		{id: "a", sortTime: start.Add(time.Hour)},
		{id: "b", sortTime: start.Add(time.Hour)},
		{id: "c", sortTime: start.Add(2 * time.Hour)},
	}
	load := func(_ context.Context, c *checkpoint, limit int) ([]checkpointItem, error) {
		var page []checkpointItem
		for _, item := range items {
			if c.cursorUpdatedAt != nil && (item.sortTime.Before(*c.cursorUpdatedAt) ||
				(item.sortTime.Equal(*c.cursorUpdatedAt) && item.id <= *c.cursorID)) {
				continue
			}
			if len(page) == limit {
				break
			}
			page = append(page, item)
		}
		return page, nil
	}
	failure := errors.New("temporary failure")
	seen := []string{}
	fail := true
	apply := func(_ context.Context, item checkpointItem) error {
		if item.id == "b" && fail {
			return failure
		}
		seen = append(seen, item.id)
		return nil
	}
	first, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || first == nil {
		t.Fatalf("claim: checkpoint=%v err=%v", first, err)
	}
	processed, more, err := runCheckpointPage(ctx, pool, first, 2, load, apply)
	if processed != 1 || more || !errors.Is(err, failure) {
		t.Fatalf("first batch: processed=%d more=%v err=%v", processed, more, err)
	}
	second, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || second == nil || second.cursorID == nil || *second.cursorID != "a" ||
		!second.windowEnd.Equal(first.windowEnd) {
		t.Fatalf("batch did not resume after last success: checkpoint=%v err=%v", second, err)
	}
	fail = false
	processed, more, err = runCheckpointPage(ctx, pool, second, 2, load, apply)
	if processed != 2 || !more || err != nil {
		t.Fatalf("second batch: processed=%d more=%v err=%v", processed, more, err)
	}
	third, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || third == nil {
		t.Fatalf("third claim: checkpoint=%v err=%v", third, err)
	}
	processed, more, err = runCheckpointPage(ctx, pool, third, 2, load, apply)
	if processed != 0 || more || err != nil {
		t.Fatalf("final batch: processed=%d more=%v err=%v", processed, more, err)
	}
	if len(seen) != 3 || seen[0] != "a" || seen[1] != "b" || seen[2] != "c" {
		t.Fatalf("unexpected applied IDs: %v", seen)
	}
	next, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || next == nil || !next.completedThrough.Equal(first.windowEnd) {
		t.Fatalf("completed window not advanced: checkpoint=%v err=%v", next, err)
	}
}
