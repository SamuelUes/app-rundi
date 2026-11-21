package ratelimit

import (
	"context"
	"crypto/sha256"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) Allow(ctx context.Context, policy, subject string, capacity int, window time.Duration) (bool, time.Duration, error) {
	hash := sha256.Sum256([]byte(subject))
	step := window.Seconds() / float64(capacity)
	var allowed bool
	var retrySeconds float64
	err := s.pool.QueryRow(ctx, `
		WITH now_value AS (SELECT clock_timestamp() AS now)
		INSERT INTO public.api_rate_limits AS b
		    (policy, subject_hash, theoretical_arrival, last_seen, allowed)
		SELECT $1, $2, now + $3::float8 * interval '1 second', now, true FROM now_value
		ON CONFLICT (policy, subject_hash) DO UPDATE SET
		  allowed = b.theoretical_arrival <= EXCLUDED.last_seen + ($4::float8 - $3::float8) * interval '1 second',
		  theoretical_arrival = CASE
		    WHEN b.theoretical_arrival <= EXCLUDED.last_seen + ($4::float8 - $3::float8) * interval '1 second'
		    THEN GREATEST(b.theoretical_arrival, EXCLUDED.last_seen) + $3::float8 * interval '1 second'
		    ELSE b.theoretical_arrival END,
		  last_seen = EXCLUDED.last_seen
		RETURNING allowed, GREATEST(0, EXTRACT(EPOCH FROM (theoretical_arrival - last_seen)) - ($4::float8 - $3::float8))`,
		policy, hash[:], step, window.Seconds()).Scan(&allowed, &retrySeconds)
	return allowed, time.Duration(retrySeconds * float64(time.Second)), err
}
