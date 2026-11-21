package db

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestRetrySerializableRetriesOn40001(t *testing.T) {
	calls := 0
	err := RetrySerializable(context.Background(), func(context.Context) error {
		calls++
		if calls < 3 {
			return &pgconn.PgError{Code: "40001"}
		}
		return nil
	})
	if err != nil || calls != 3 {
		t.Fatalf("err=%v calls=%d; want nil err after retries", err, calls)
	}
}

func TestRetrySerializableDoesNotRetryDomainErrors(t *testing.T) {
	calls := 0
	sentinel := errors.New("domain conflict")
	err := RetrySerializable(context.Background(), func(context.Context) error {
		calls++
		return sentinel
	})
	if !errors.Is(err, sentinel) || calls != 1 {
		t.Fatalf("err=%v calls=%d; want sentinel after 1 call", err, calls)
	}
}

func TestRetrySerializableExhausts(t *testing.T) {
	calls := 0
	err := RetrySerializable(context.Background(), func(context.Context) error {
		calls++
		return &pgconn.PgError{Code: "40P01"}
	})
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || calls != 4 {
		t.Fatalf("err=%v calls=%d; want last pgErr after 4 attempts", err, calls)
	}
}
