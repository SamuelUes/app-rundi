package cashcode

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"

	"github.com/jackc/pgx/v5"
)

func generate() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(10000))
	if err != nil {
		return "", fmt.Errorf("generate cash code: %w", err)
	}
	return fmt.Sprintf("%04d", n.Int64()), nil
}

// Create inserta el código solo para pagos cash (self-guard: no crea fila en
// pagos card) y no reemplaza uno existente — Regenerate es explícito.
func Create(ctx context.Context, tx pgx.Tx, rideID string) error {
	code, err := generate()
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO public.payment_cash_codes (ride_id, code)
		SELECT $1::uuid, $2
		WHERE EXISTS (
			SELECT 1 FROM public.payments
			WHERE ride_id = $1::uuid AND payment_method = 'cash'
		)
		ON CONFLICT (ride_id) DO NOTHING`, rideID, code)
	if err != nil {
		return fmt.Errorf("create cash code: %w", err)
	}
	return nil
}

// Regenerate emite un código nuevo y resetea intentos/bloqueo (reenvío del
// conductor cuando el cliente no recibió el anterior).
func Regenerate(ctx context.Context, tx pgx.Tx, rideID string) error {
	code, err := generate()
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO public.payment_cash_codes (ride_id, code)
		VALUES ($1::uuid, $2)
		ON CONFLICT (ride_id) DO UPDATE
		SET code = EXCLUDED.code, failed_attempts = 0, locked_until = NULL`,
		rideID, code)
	if err != nil {
		return fmt.Errorf("regenerate cash code: %w", err)
	}
	return nil
}
