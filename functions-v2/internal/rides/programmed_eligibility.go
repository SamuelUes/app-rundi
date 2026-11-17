package rides

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s *Service) ValidateProgrammedDriver(ctx context.Context, tx pgx.Tx, rideID, driverUID string) error {
	if err := requireDriverSession(ctx, tx, driverUID, "driver has no active availability session"); err != nil {
		return err
	}
	if err := EnsureDriverUnoccupied(ctx, tx, driverUID, rideID); err != nil {
		return err
	}
	var areaID, serviceCode *string
	if err := tx.QueryRow(ctx, `SELECT r.service_area_id, s.code
		FROM public.rides r LEFT JOIN public.services s ON s.id=r.service_id
		WHERE r.id=$1::uuid`, rideID).Scan(&areaID, &serviceCode); err != nil {
		return err
	}
	if s.fs != nil {
		snap, err := s.fs.Collection(fs.ColDriversLive).Doc(driverUID).Get(ctx)
		if status.Code(err) == codes.NotFound {
			return apperr.New(409, "DRIVER_UNAVAILABLE")
		}
		if err != nil {
			return err
		}
		if st, _ := snap.Data()["status"].(string); st != "online" {
			return apperr.New(409, "DRIVER_UNAVAILABLE")
		}
		if areaID != nil && *areaID != "" && snap.Data()["serviceAreaId"] != *areaID {
			return apperr.New(409, "DRIVER_OUTSIDE_SERVICE_AREA")
		}
	}
	if err := s.requireDesignatedMode(ctx, tx, rideID, driverUID); err != nil {
		return err
	}
	var eligible bool
	err := tx.QueryRow(ctx, `
		WITH active_vehicle AS (
		  SELECT v.id, v.type, v.registration_ocr_year, d.id AS driver_id
		  FROM public.drivers d JOIN public.vehicles v ON v.driver_id=d.id
		  WHERE d.user_id=$2 AND d.deleted_at IS NULL AND d.account_status='active'
		    AND v.is_active=TRUE AND v.deleted_at IS NULL
		  ORDER BY v.created_at DESC, v.id DESC LIMIT 1
		)
		SELECT COALESCE(COALESCE(r.client_suggested_price, r.estimated_price) > 0, FALSE)
		 AND EXISTS (
		  SELECT 1 FROM active_vehicle v WHERE
		    (lower(COALESCE(v.type, 'auto')) LIKE '%moto%') =
		    (lower(COALESCE(CASE WHEN r.ride_type='designated_driver'
		      THEN r.designated_driver_vehicle::text ELSE r.vehicle_type END, 'auto')) LIKE '%moto%')
		 )
		 AND ($3::text IS NULL OR EXISTS (
		  SELECT 1 FROM public.driver_sessions ds JOIN public.drivers d ON d.id=ds.driver_id
		  WHERE d.user_id=$2 AND $3=ANY(ds.service_codes)
		 ))
		 AND NOT EXISTS (
		  SELECT 1 FROM public.features f
		  WHERE f.eligibility_subject <> 'none'
		    AND COALESCE(r.pricing_snapshot->'featureCodes' ? f.code, FALSE)
		    AND NOT (
		      (f.code <> 'premium' AND EXISTS (
		        SELECT 1 FROM public.driver_feature_assignments a
		        JOIN public.drivers d ON d.id=a.driver_id
		        WHERE d.user_id=$2 AND a.feature_id=f.id AND a.is_active=TRUE
		          AND (a.expires_at IS NULL OR a.expires_at > NOW())
		      ))
		      OR (f.code <> 'premium' AND EXISTS (
		        SELECT 1 FROM public.vehicle_feature_assignments a JOIN active_vehicle v ON v.id=a.vehicle_id
		        WHERE a.feature_id=f.id AND a.is_active=TRUE
		          AND (a.expires_at IS NULL OR a.expires_at > NOW())
		      ))
		      OR (f.code = 'premium' AND EXISTS (
		        SELECT 1 FROM active_vehicle v WHERE public.vehicle_premium_eligible(v.registration_ocr_year, v.type, NOW())
		      ))
		    )
		 )
		FROM public.rides r WHERE r.id = $1::uuid`, rideID, driverUID, serviceCode).Scan(&eligible)
	if err != nil {
		return err
	}
	if !eligible {
		return apperr.New(409, "driver does not meet ride requirements")
	}
	return nil
}
