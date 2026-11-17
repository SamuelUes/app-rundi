package programmed

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/rundi/functions-v2/internal/apperr"
)

type DriverCandidate struct {
	DriverID string  `json:"driverId"`
	Name     string  `json:"name"`
	Rating   float64 `json:"rating"`
}

func normalizeCandidateQuery(q string) (string, error) {
	q = strings.TrimSpace(q)
	if n := utf8.RuneCountInString(q); n < 3 || n > 100 {
		return "", apperr.New(400, "la búsqueda debe tener entre 3 y 100 caracteres")
	}
	return q, nil
}

func (s *Service) SearchCandidates(ctx context.Context, uid, rideID, q string) ([]DriverCandidate, error) {
	q, err := normalizeCandidateQuery(q)
	if err != nil {
		return nil, err
	}
	snap, err := s.fs.Collection(col).Doc(rideID).Get(ctx)
	if err != nil || !snap.Exists() {
		return nil, apperr.New(404, "programmed ride not found")
	}
	d := snap.Data()
	if str(d["clientId"]) != uid {
		return nil, apperr.ErrForbidden
	}
	if err := mutableRide(d); err != nil {
		return nil, err
	}
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q)
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT d.user_id, COALESCE(u.name, ''), COALESCE(d.average_rating, 0)
		FROM public.drivers d
		JOIN public.users u ON u.id = d.user_id
		LEFT JOIN public.driver_licenses dl
		  ON dl.driver_id = d.id AND dl.is_current = TRUE AND dl.deleted_at IS NULL
		WHERE d.deleted_at IS NULL AND d.account_status = 'active' AND d.user_id <> $1
		  AND (u.name ILIKE '%' || $2 || '%' ESCAPE '\'
		       OR d.user_id = $3 OR d.id::text = $3
		       OR (length(regexp_replace(upper($3), '[^A-Z0-9]', '', 'g')) >= 4
		           AND (regexp_replace(upper(COALESCE(dl.license_number, '')), '[^A-Z0-9]', '', 'g')
		                = regexp_replace(upper($3), '[^A-Z0-9]', '', 'g')
		                OR regexp_replace(upper(COALESCE(d.license_number, '')), '[^A-Z0-9]', '', 'g')
		                = regexp_replace(upper($3), '[^A-Z0-9]', '', 'g'))))
		ORDER BY COALESCE(d.average_rating, 0) DESC, d.user_id
		LIMIT 20`, uid, escaped, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DriverCandidate{}
	for rows.Next() {
		var c DriverCandidate
		if err := rows.Scan(&c.DriverID, &c.Name, &c.Rating); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
