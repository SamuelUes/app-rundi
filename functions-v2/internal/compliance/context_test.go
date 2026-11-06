package compliance

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

type emptyRuleRows struct {
	pgx.Rows
	err error
}

func (r *emptyRuleRows) Next() bool { return false }
func (r *emptyRuleRows) Err() error { return r.err }
func (r *emptyRuleRows) Close()     {}

type ruleQueryStub struct {
	results []pgx.Rows
}

func (q *ruleQueryStub) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	rows := q.results[0]
	q.results = q.results[1:]
	return rows, nil
}

type malformedRuleRow struct {
	pgx.Rows
	read bool
}

func (r *malformedRuleRow) Next() bool {
	if r.read {
		return false
	}
	r.read = true
	return true
}
func (r *malformedRuleRow) Err() error { return nil }
func (r *malformedRuleRow) Close()     {}
func (r *malformedRuleRow) Scan(dest ...any) error {
	*dest[0].(*string) = "DRIVER_ACCOUNT_NOT_ACTIVE"
	*dest[1].(*Severity) = SevBlocking
	*dest[2].(*bool) = true
	*dest[3].(*bool) = true
	*dest[4].(**int) = nil
	*dest[5].(**string) = nil
	*dest[6].(*[]byte) = []byte(`["not-an-object"]`)
	return nil
}

func TestLoadRuleContextRejectsIncompleteRows(t *testing.T) {
	want := errors.New("database read interrupted")
	tests := []struct {
		name  string
		first error
		last  error
	}{
		{"rules", want, nil},
		{"category rules", nil, want},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q := &ruleQueryStub{results: []pgx.Rows{
				&emptyRuleRows{err: tt.first}, &emptyRuleRows{err: tt.last},
			}}
			got, err := loadRuleContext(context.Background(), q, "2026-11-05")
			if got != nil || !errors.Is(err, want) {
				t.Fatalf("context=%v err=%v, want error %v", got, err, want)
			}
		})
	}
}

func TestLoadRuleContextEmptyRules(t *testing.T) {
	q := &ruleQueryStub{results: []pgx.Rows{&emptyRuleRows{}, &emptyRuleRows{}}}
	got, err := loadRuleContext(context.Background(), q, "2026-11-05")
	if err != nil || got == nil || got.Today != "2026-11-05" {
		t.Fatalf("context=%v err=%v", got, err)
	}
}

func TestLoadRuleContextRejectsMalformedParams(t *testing.T) {
	q := &ruleQueryStub{results: []pgx.Rows{&malformedRuleRow{}, &emptyRuleRows{}}}
	got, err := loadRuleContext(context.Background(), q, "2026-11-05")
	if err == nil || got != nil {
		t.Fatalf("malformed rule params accepted: context=%v err=%v", got, err)
	}
}
