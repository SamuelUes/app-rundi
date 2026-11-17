package rides

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/rundi/functions-v2/internal/apperr"
)

func EnsureDriverUnoccupied(ctx context.Context, tx pgx.Tx, driverUID, rideID string) error {
	var busy bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS (
		  SELECT 1 FROM public.rides
		  WHERE id <> $2::uuid AND deleted_at IS NULL
		    AND status IN ('accepted','driver_on_route','driver_arrived','in_progress','pending_payment')
		    AND (driver_id = $1 OR (follower_driver_id = $1 AND follower_status = 'active'))
		)`, driverUID, rideID).Scan(&busy)
	if err != nil {
		return err
	}
	if busy {
		return apperr.New(409, "DRIVER_BUSY")
	}
	return nil
}
