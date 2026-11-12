package compliance

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestSubmitVehicleDocumentOcrYear — el año OCR llega con el documento
// circulation_card y actualiza vehicles.registration_ocr_year (el PATCH de
// vehículos no puede tocarlo). COALESCE preserva el valor si el documento
// nuevo no trae lectura.
// RUN_LOCAL_COMPLIANCE_INTEGRATION=1 TEST_DATABASE_URL=postgres://...
func TestSubmitVehicleDocumentOcrYear(t *testing.T) {
	if os.Getenv("RUN_LOCAL_COMPLIANCE_INTEGRATION") != "1" {
		t.Skip("requires local PostgreSQL")
	}
	dsn := os.Getenv("TEST_DATABASE_URL")
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	uid := "ocrveh-" + fmt.Sprint(time.Now().UnixNano()%1_000_000_000)
	var driverID, vehicleID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.users(id, role) VALUES ($1,'driver') RETURNING id`, uid).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1) RETURNING id::text`, uid).Scan(&driverID); err != nil {
		t.Fatal(err)
	}
	plate := fmt.Sprintf("O%09d", time.Now().UnixNano()%1_000_000_000)
	if err := pool.QueryRow(ctx, `INSERT INTO public.vehicles(driver_id, plate, type, is_active)
		VALUES ($1::uuid, $2, 'sedan', TRUE) RETURNING id::text`, driverID, plate).Scan(&vehicleID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM public.compliance_events WHERE entity_id IN
			(SELECT id::text FROM public.vehicle_circulation_cards WHERE vehicle_id=$1::uuid)`, vehicleID)
		pool.Exec(ctx, `DELETE FROM public.vehicle_circulation_cards WHERE vehicle_id=$1::uuid`, vehicleID)
		pool.Exec(ctx, `DELETE FROM public.vehicles WHERE id=$1::uuid`, vehicleID)
		pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id=$1`, uid)
		pool.Exec(ctx, `DELETE FROM public.users WHERE id=$1`, uid)
	})

	svc := NewService(pool, nil, nil)
	readOcrYear := func() *int {
		var y *int
		if err := pool.QueryRow(ctx, `SELECT registration_ocr_year FROM public.vehicles WHERE id=$1::uuid`, vehicleID).Scan(&y); err != nil {
			t.Fatal(err)
		}
		return y
	}

	// Primera tarjeta con año OCR → queda persistido.
	year2023 := 2023
	if _, err := svc.SubmitVehicleDocument(ctx, uid, VehicleDocInput{
		VehicleID: vehicleID, DocumentType: "circulation_card",
		CardNumber: "B12345", OcrYear: &year2023,
	}); err != nil {
		t.Fatalf("submit con ocrYear: %v", err)
	}
	if got := readOcrYear(); got == nil || *got != 2023 {
		t.Fatalf("registration_ocr_year=%v (esperado 2023)", got)
	}

	// Segunda versión sin lectura OCR → el valor previo se conserva (COALESCE).
	if _, err := svc.SubmitVehicleDocument(ctx, uid, VehicleDocInput{
		VehicleID: vehicleID, DocumentType: "circulation_card", CardNumber: "B12346",
	}); err != nil {
		t.Fatalf("resubmit sin ocrYear: %v", err)
	}
	if got := readOcrYear(); got == nil || *got != 2023 {
		t.Fatalf("resubmit sin ocrYear borró el año: %v", got)
	}

	// Nueva lectura con otro año → se actualiza.
	year2024 := 2024
	if _, err := svc.SubmitVehicleDocument(ctx, uid, VehicleDocInput{
		VehicleID: vehicleID, DocumentType: "circulation_card",
		CardNumber: "B12347", OcrYear: &year2024,
	}); err != nil {
		t.Fatalf("resubmit con ocrYear: %v", err)
	}
	if got := readOcrYear(); got == nil || *got != 2024 {
		t.Fatalf("registration_ocr_year=%v (esperado 2024)", got)
	}

	// Fuera de rango → 400.
	bad := 1800
	if _, err := svc.SubmitVehicleDocument(ctx, uid, VehicleDocInput{
		VehicleID: vehicleID, DocumentType: "circulation_card", OcrYear: &bad,
	}); err == nil {
		t.Fatal("ocrYear=1800 debió rechazarse")
	}
}
