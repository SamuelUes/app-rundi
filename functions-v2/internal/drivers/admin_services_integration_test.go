package drivers

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAdminDriverServiceLifecycleIsAuditedAndProjected(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definido")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	uid := fmt.Sprintf("admin-service-test-%d", time.Now().UnixNano())
	serviceCode := fmt.Sprintf("admin_service_%d", time.Now().UnixNano())
	featureCode := fmt.Sprintf("admin_driver_feature_%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'driver')`, uid); err != nil {
		t.Fatal(err)
	}
	var driverID, serviceID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1) RETURNING id::text`, uid).Scan(&driverID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.services(code, name, commission_rate, base_price, minimum_fare, vehicle_types)
		VALUES ($1, 'Test car service', 0.15, 0, 0, '["auto"]'::jsonb)
		RETURNING id::text`, serviceCode).Scan(&serviceID); err != nil {
		t.Fatal(err)
	}
	var featureID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.features(code, name, enabled, eligibility_subject, eligibility_mode)
		VALUES ($1, 'Test driver feature', TRUE, 'driver', 'manual')
		RETURNING id::text`, featureCode).Scan(&featureID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.outbox_events WHERE aggregate_type = 'driver' AND aggregate_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.audit_log WHERE entity_id = $1 OR entity_id IN (SELECT id::text FROM public.driver_services WHERE driver_id = $2::uuid)`, driverID, driverID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_services WHERE driver_id = $1::uuid`, driverID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_feature_assignments WHERE driver_id = $1::uuid`, driverID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.vehicles WHERE driver_id = $1::uuid`, driverID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.services WHERE id = $1::uuid`, serviceID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.features WHERE id = $1::uuid`, featureID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE id = $1::uuid`, driverID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id = $1`, uid)
	})

	svc := NewService(pool, nil, nil)
	before, err := svc.ListDriverServicesForAdmin(ctx, driverID)
	if err != nil {
		t.Fatal(err)
	}
	if len(before) != 0 {
		t.Fatalf("services without a compatible vehicle = %d, want 0", len(before))
	}

	if _, err := pool.Exec(ctx, `INSERT INTO public.vehicles(driver_id, plate, type, is_active) VALUES ($1::uuid, $2, 'auto', TRUE)`, driverID, "T"+uid[len(uid)-8:]); err != nil {
		t.Fatal(err)
	}
	driverServiceID, err := svc.AssignDriverService(ctx, "admin-test", driverID, serviceCode, t.Name())
	if err != nil {
		t.Fatal(err)
	}
	var active, approved bool
	if err := pool.QueryRow(ctx, `SELECT is_active, is_approved FROM public.driver_services WHERE id = $1::uuid`, driverServiceID).Scan(&active, &approved); err != nil {
		t.Fatal(err)
	}
	if !active || approved {
		t.Fatalf("assigned state active=%v approved=%v, want true,false", active, approved)
	}

	if err := svc.ApproveDriverService(ctx, "admin-test", driverServiceID, t.Name()); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT is_active, is_approved FROM public.driver_services WHERE id = $1::uuid`, driverServiceID).Scan(&active, &approved); err != nil {
		t.Fatal(err)
	}
	if !active || !approved {
		t.Fatalf("approved state active=%v approved=%v, want true,true", active, approved)
	}

	if err := svc.DeactivateDriverServiceForAdmin(ctx, "admin-test", driverServiceID, t.Name()); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT is_active, is_approved FROM public.driver_services WHERE id = $1::uuid`, driverServiceID).Scan(&active, &approved); err != nil {
		t.Fatal(err)
	}
	if active || !approved {
		t.Fatalf("deactivated state active=%v approved=%v, want false,true", active, approved)
	}

	if err := svc.GrantFeature(ctx, "admin-test", "driver", driverID, featureCode, t.Name()); err != nil {
		t.Fatal(err)
	}
	var featureActive bool
	if err := pool.QueryRow(ctx, `
		SELECT is_active FROM public.driver_feature_assignments
		WHERE driver_id = $1::uuid AND feature_id = $2::uuid`, driverID, featureID).Scan(&featureActive); err != nil {
		t.Fatal(err)
	}
	if !featureActive {
		t.Fatal("driver feature was not activated")
	}
	if err := svc.RevokeFeature(ctx, "admin-test", "driver", driverID, featureCode, t.Name()); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT is_active FROM public.driver_feature_assignments
		WHERE driver_id = $1::uuid AND feature_id = $2::uuid`, driverID, featureID).Scan(&featureActive); err != nil {
		t.Fatal(err)
	}
	if featureActive {
		t.Fatal("driver feature was not revoked")
	}

	var serviceAuditCount, featureAuditCount, outboxCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.audit_log WHERE entity_type = 'driver_service' AND entity_id = $1`, driverServiceID).Scan(&serviceAuditCount); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.audit_log WHERE entity_type = 'driver' AND entity_id = $1`, driverID).Scan(&featureAuditCount); err != nil {
		t.Fatal(err)
	}
	if serviceAuditCount != 3 || featureAuditCount != 2 {
		t.Fatalf("service audit=%d feature audit=%d, want 3 and 2", serviceAuditCount, featureAuditCount)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.outbox_events WHERE aggregate_type = 'driver' AND aggregate_id = $1`, uid).Scan(&outboxCount); err != nil {
		t.Fatal(err)
	}
	if outboxCount != 5 {
		t.Fatalf("outbox=%d, want 5", outboxCount)
	}
}

func TestAdminDriverServiceAssignmentReturnsNotFound(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definido")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	svc := NewService(pool, nil, nil)
	if _, err := svc.AssignDriverService(ctx, "admin-test", "00000000-0000-0000-0000-000000000001", "missing", t.Name()); err == nil {
		t.Fatal("expected missing driver error")
	}

	uid := fmt.Sprintf("admin-service-missing-%d", time.Now().UnixNano())
	code := fmt.Sprintf("admin_service_no_vehicle_%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'driver')`, uid); err != nil {
		t.Fatal(err)
	}
	var driverID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1) RETURNING id::text`, uid).Scan(&driverID); err != nil {
		t.Fatal(err)
	}
	var serviceID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.services(code, name, commission_rate, base_price, minimum_fare, vehicle_types)
		VALUES ($1, 'Unmatched service', 0.15, 0, 0, '["auto"]'::jsonb)
		RETURNING id::text`, code).Scan(&serviceID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.services WHERE id = $1::uuid`, serviceID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE id = $1::uuid`, driverID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id = $1`, uid)
	})
	if _, err := svc.AssignDriverService(ctx, "admin-test", driverID, "missing", t.Name()); err == nil {
		t.Fatal("expected missing service error")
	}
	if _, err := svc.AssignDriverService(ctx, "admin-test", driverID, code, t.Name()); err == nil {
		t.Fatal("expected incompatible service error")
	}
}
