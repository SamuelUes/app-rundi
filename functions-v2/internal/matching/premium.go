package matching

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PremiumEligibleDrivers uses the same active-vehicle rule as ride acceptance.
func PremiumEligibleDrivers(ctx context.Context, pool *pgxpool.Pool, ids []string) (map[string]bool, error) {
	result := make(map[string]bool)
	if len(ids) == 0 {
		return result, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT d.user_id
		FROM public.drivers d
		JOIN LATERAL (
			SELECT v.registration_ocr_year, v.type FROM public.vehicles v
			WHERE v.driver_id = d.id AND v.is_active = TRUE AND v.deleted_at IS NULL
			ORDER BY v.created_at DESC, v.id DESC LIMIT 1
		) v ON TRUE
		WHERE d.user_id = ANY($1) AND d.deleted_at IS NULL AND d.account_status = 'active'
		  AND public.vehicle_premium_eligible(v.registration_ocr_year, v.type, NOW())`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		result[uid] = true
	}
	return result, rows.Err()
}

// SeniorEligibleDrivers checks the driver's current opt-in in SQL.
func SeniorEligibleDrivers(ctx context.Context, pool *pgxpool.Pool, ids []string) (map[string]bool, error) {
	result := make(map[string]bool)
	if len(ids) == 0 {
		return result, nil
	}
	rows, err := pool.Query(ctx, `
		SELECT d.user_id FROM public.drivers d
		JOIN public.driver_feature_assignments a ON a.driver_id = d.id
		JOIN public.features f ON f.id = a.feature_id
		WHERE d.user_id = ANY($1) AND d.deleted_at IS NULL
		  AND a.is_active = TRUE AND f.code = 'senior'
		  AND (a.expires_at IS NULL OR a.expires_at > NOW())`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		result[uid] = true
	}
	return result, rows.Err()
}
