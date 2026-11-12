package ratelimit

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDistributedLimit(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires isolated TEST_DATABASE_URL with rate limit migration")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	stores := []*Store{NewStore(pool), NewStore(pool)}
	subject := fmt.Sprintf("test-%d", time.Now().UnixNano())
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ok, _, err := stores[i%2].Allow(ctx, "test", subject, 10, time.Minute)
			if err != nil {
				t.Error(err)
			} else if ok {
				accepted.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if got := accepted.Load(); got != 10 {
		t.Fatalf("accepted %d requests, want 10", got)
	}
	ok, retry, err := stores[0].Allow(ctx, "test", subject, 10, time.Minute)
	if err != nil || ok || retry <= 0 {
		t.Fatalf("allowed=%v retry=%v err=%v", ok, retry, err)
	}
	ok, _, err = stores[1].Allow(ctx, "test", subject+"-other", 10, time.Minute)
	if err != nil || !ok {
		t.Fatalf("separate subject allowed=%v err=%v", ok, err)
	}
}
