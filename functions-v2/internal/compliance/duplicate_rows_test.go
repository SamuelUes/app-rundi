package compliance

import (
	"errors"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5"
)

type duplicateRowsStub struct {
	pgx.Rows
	values  []string
	index   int
	err     error
	scanErr error
	closed  bool
}

func (r *duplicateRowsStub) Next() bool { return r.index < len(r.values) }
func (r *duplicateRowsStub) Err() error { return r.err }
func (r *duplicateRowsStub) Close()     { r.closed = true }
func (r *duplicateRowsStub) Scan(dest ...any) error {
	if r.scanErr != nil {
		return r.scanErr
	}
	*dest[0].(*string) = r.values[r.index]
	r.index++
	return nil
}

func TestCollectDuplicateIDs(t *testing.T) {
	wantErr := errors.New("duplicate query interrupted")
	for _, tt := range []struct {
		name    string
		rows    *duplicateRowsStub
		want    []string
		wantErr error
	}{
		{"complete", &duplicateRowsStub{values: []string{"a", "b"}}, []string{"a", "b"}, nil},
		{"iteration failure", &duplicateRowsStub{values: []string{"a"}, err: wantErr}, nil, wantErr},
		{"scan failure", &duplicateRowsStub{values: []string{"a"}, scanErr: wantErr}, nil, wantErr},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := collectDuplicateIDs(tt.rows)
			if !errors.Is(err, tt.wantErr) || !reflect.DeepEqual(got, tt.want) || !tt.rows.closed {
				t.Fatalf("ids=%v err=%v closed=%v", got, err, tt.rows.closed)
			}
		})
	}
}
