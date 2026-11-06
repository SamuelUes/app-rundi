package compliance

import (
	"context"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDuplicatePlateLiteralIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_COMPLIANCE_INTEGRATION") != "1" {
		t.Skip("requires local PostgreSQL")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") ||
		cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	query := `WITH vehicles(id, plate, deleted_at) AS (VALUES
		('00000000-0000-0000-0000-000000000001'::uuid, 'M12%', NULL::timestamptz),
		('00000000-0000-0000-0000-000000000002'::uuid, 'm12%', NULL::timestamptz),
		('00000000-0000-0000-0000-000000000003'::uuid, 'M123', NULL::timestamptz),
		('00000000-0000-0000-0000-000000000004'::uuid, 'M12_', NULL::timestamptz),
		('00000000-0000-0000-0000-000000000005'::uuid, 'm12_', NULL::timestamptz),
		('00000000-0000-0000-0000-000000000006'::uuid, 'm123', NOW())
	) SELECT id::text FROM vehicles WHERE ` + duplicatePlatePredicate + ` ORDER BY id`
	for _, tt := range []struct {
		name, plate, ownID string
		want               []string
	}{
		{"percent literal", "M12%", "00000000-0000-0000-0000-000000000001", []string{"00000000-0000-0000-0000-000000000002"}},
		{"underscore literal", "M12_", "00000000-0000-0000-0000-000000000004", []string{"00000000-0000-0000-0000-000000000005"}},
		{"case and soft delete", "m123", "00000000-0000-0000-0000-000000000001", []string{"00000000-0000-0000-0000-000000000003"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rows, err := pool.Query(ctx, query, tt.plate, tt.ownID)
			if err != nil {
				t.Fatal(err)
			}
			got, err := collectDuplicateIDs(rows)
			if err != nil || !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("ids=%v err=%v want=%v", got, err, tt.want)
			}
		})
	}
}
