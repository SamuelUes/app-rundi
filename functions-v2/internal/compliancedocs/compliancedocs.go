// Package compliancedocs — snapshot SQL de documentos privados de conductor.
// Paquete hoja: solo depende de pgx (ni projections ni compliance pueden
// importarlo sin crear ciclos).
package compliancedocs

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// LoadDriverDocumentData reads the private document snapshot for a driver
// from a consistent SQL snapshot (single query). Used both by the legacy
// projection path and by the Firestore-authoritative sync.
func LoadDriverDocumentData(ctx context.Context, pool *pgxpool.Pool, uid string) (map[string]any, error) {
	var raw []byte
	err := pool.QueryRow(ctx, `
		WITH d AS (
			SELECT id FROM public.drivers WHERE user_id = $1 AND deleted_at IS NULL
		), v AS (
			SELECT id, plate, type, year, brand, model, color FROM public.vehicles
			WHERE driver_id = (SELECT id FROM d) AND is_active AND deleted_at IS NULL
			ORDER BY created_at DESC, id DESC LIMIT 1
		)
		SELECT jsonb_build_object(
		  'deleted', NOT EXISTS (SELECT 1 FROM d),
		  'license', (SELECT jsonb_build_object(
		      'status', status, 'licenseNumber', license_number, 'licenseType', license_type, 'categories', categories,
		      'issueDate', issue_date, 'expiryDate', expiry_date)
		    FROM public.driver_licenses WHERE driver_id = (SELECT id FROM d)
		      AND is_current AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  'vehicle', (SELECT jsonb_build_object('id', id, 'plate', plate, 'type', type,
		      'year', year, 'brand', brand, 'model', model, 'color', color) FROM v),
		  'circulation', (SELECT jsonb_build_object('status', status, 'issuedAt', issued_at, 'validUntil', declared_valid_until)
		    FROM public.vehicle_circulation_cards WHERE vehicle_id = (SELECT id FROM v)
		      AND is_current AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  'insurance', (SELECT jsonb_build_object(
		      'status', status, 'policyNumber', policy_number, 'insurer', insurer_name, 'coverageType', coverage_type,
		      'insuredPlate', insured_plate, 'effectiveFrom', effective_from, 'effectiveUntil', effective_until)
		    FROM public.vehicle_insurance_policies WHERE vehicle_id = (SELECT id FROM v)
		      AND coverage_type = 'rc_obligatorio' AND is_current AND deleted_at IS NULL
		    ORDER BY created_at DESC LIMIT 1),
		  'inspection', (SELECT jsonb_build_object('status', status, 'result', result, 'validUntil', valid_until)
		    FROM public.vehicle_inspections WHERE vehicle_id = (SELECT id FROM v)
		      AND is_current AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  'emissions', (SELECT jsonb_build_object('status', status, 'result', result, 'validUntil', valid_until)
		    FROM public.vehicle_emission_certificates WHERE vehicle_id = (SELECT id FROM v)
		      AND is_current AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  'revisado', (SELECT jsonb_build_object('status', status, 'validUntil', valid_until, 'stickerYear', sticker_year)
		    FROM public.vehicle_revisado_stickers WHERE vehicle_id = (SELECT id FROM v)
		      AND is_current AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1),
		  'roadTax', (SELECT jsonb_build_object('status', status, 'taxYear', tax_year, 'exempt', exempt)
		    FROM public.vehicle_road_taxes WHERE vehicle_id = (SELECT id FROM v)
		      AND is_current AND deleted_at IS NULL ORDER BY tax_year DESC, created_at DESC LIMIT 1)
		)`, uid).Scan(&raw)
	if err != nil {
		return nil, fmt.Errorf("load private driver documents: %w", err)
	}
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	return data, nil
}
