// Package reconcile — reconciliación de proyecciones (doc §5.3).
// La autoridad es SQL: si SYSTEM_projection_status/{agg}_{id} está ausente o
// atrasado respecto a la entidad, se re-proyecta el estado completo desde SQL
// (nunca desde una copia no autoritativa). Job periódico en cmd/scheduler.
package reconcile

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/projections"
)

// Run — una pasada de reconciliación sobre todas las entidades SQL-
// authoritative actualizadas en `window`. Devuelve reparadas/errores.
func Run(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, window time.Duration) (repaired, errors int) {
	for _, spec := range []entitySpec{ridesSpec, paymentsSpec, driversSpec, vehiclesSpec} {
		r, e := reconcileKind(ctx, pool, c, spec, window)
		repaired += r
		errors += e
	}
	return repaired, errors
}

type entitySpec struct {
	aggType string
	// query devuelve (id, version) de entidades actualizadas en la ventana.
	query string
	// build carga la fila SQL y devuelve el payload equivalente al outbox.
	build func(ctx context.Context, pool *pgxpool.Pool, id string) (map[string]any, error)
}

func reconcileKind(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, spec entitySpec, window time.Duration) (repaired, errors int) {
	rows, err := pool.Query(ctx, spec.query, fmt.Sprintf("%f seconds", window.Seconds()))
	if err != nil {
		slog.Error("reconcile query", "agg", spec.aggType, "err", err)
		return 0, 1
	}
	defer rows.Close()
	type cand struct {
		id       string
		version  float64
		revision float64
	}
	var cands []cand
	for rows.Next() {
		var cd cand
		if err := rows.Scan(&cd.id, &cd.version, &cd.revision); err != nil {
			rows.Close()
			return repaired, errors + 1
		}
		cands = append(cands, cd)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		slog.Error("reconcile rows", "agg", spec.aggType, "err", err)
		return 0, 1
	}

	for _, cd := range cands {
		changed, err := reconcileCandidate(ctx, pool, c, spec, cd.id, cd.version, cd.revision)
		if err != nil {
			slog.Warn("reconcile candidate", "agg", spec.aggType, "id", cd.id, "err", err)
			errors++
			continue
		}
		if changed {
			repaired++
		}
	}
	return repaired, errors
}

func reconcileCandidate(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, spec entitySpec, id string, candidateVersion, candidateRevision float64) (bool, error) {
	applied, err := projections.ReadStatusRevision(ctx, c, spec.aggType, id)
	if err != nil {
		return false, fmt.Errorf("read status: %w", err)
	}
	if applied >= candidateRevision {
		return false, nil
	}
	payload, err := spec.build(ctx, pool, id)
	if err != nil {
		return false, fmt.Errorf("build projection: %w", err)
	}
	version := reconciledVersion(candidateVersion, payload)
	payload["version"] = version
	raw, err := json.Marshal(payload)
	if err != nil {
		return false, fmt.Errorf("encode projection: %w", err)
	}
	ev := projections.Event{
		EventID:       fmt.Sprintf("reconcile-%s-%s", id, time.Now().UTC().Format("20060102T150405")),
		AggregateType: spec.aggType,
		AggregateID:   id,
		Payload:       raw,
	}
	if _, err := projections.Publish(ctx, pool, c, ev); err != nil {
		if statusErr := projections.WriteStatus(ctx, c, spec.aggType, id, version, -1, "", "error", err.Error()); statusErr != nil {
			slog.Warn("reconcile status write", "agg", spec.aggType, "id", id, "err", statusErr)
		}
		return false, fmt.Errorf("publish projection: %w", err)
	}
	if err := projections.WriteStatus(ctx, c, spec.aggType, id, version, int64(candidateRevision), "", "reconciled", ""); err != nil {
		return false, fmt.Errorf("write status: %w", err)
	}
	slog.Info("reconciled", "agg", spec.aggType, "id", id, "revision", candidateRevision, "was", applied)
	return true, nil
}

func reconciledVersion(candidate float64, payload map[string]any) float64 {
	if version, ok := payload["version"].(float64); ok && version > candidate {
		return version
	}
	return candidate
}

// ---------- specs por agregado (payload = mismas claves que el outbox) ----------

var ridesSpec = entitySpec{
	aggType: "ride",
	query: `
		SELECT id::text, version, version FROM public.rides
		WHERE updated_at > NOW() - $1::interval`,
	build: func(ctx context.Context, pool *pgxpool.Pool, id string) (map[string]any, error) {
		var p = map[string]any{}
		var rideID, status string
		var fsID, clientID, driverID, followerID, followerStatus *string
		var version int
		err := pool.QueryRow(ctx, `
			SELECT id::text, firebase_ride_id, client_id, driver_id,
			       follower_driver_id, follower_status, status, version
			FROM public.rides WHERE id = $1::uuid`, id).
			Scan(&rideID, &fsID, &clientID, &driverID, &followerID, &followerStatus, &status, &version)
		if err != nil {
			return nil, err
		}
		p["rideId"] = rideID
		p["status"] = status
		p["version"] = float64(version)
		if fsID != nil {
			p["firebaseRideId"] = *fsID
		}
		if clientID != nil {
			p["clientId"] = *clientID
		}
		if driverID != nil {
			p["driverId"] = *driverID
		}
		if followerID != nil {
			p["followerDriverId"] = *followerID
		}
		if followerStatus != nil {
			p["followerStatus"] = *followerStatus
		}
		return p, nil
	},
}

var paymentsSpec = entitySpec{
	aggType: "payment",
	query: `
		SELECT id::text, extract(epoch from updated_at) * 1000, revision FROM public.payments
		WHERE updated_at > NOW() - $1::interval`,
	build: func(ctx context.Context, pool *pgxpool.Pool, id string) (map[string]any, error) {
		var p = map[string]any{}
		var pid, rideID, status string
		var fsID, clientID, driverID *string
		var amount, tip, commission, total *float64
		err := pool.QueryRow(ctx, `
			SELECT p.id::text, p.ride_id::text, r.firebase_ride_id, r.client_id,
			       p.driver_id, p.status, p.amount, p.tip, p.commission, p.total
			FROM public.payments p
			JOIN public.rides r ON r.id = p.ride_id
			WHERE p.id = $1::uuid`, id).
			Scan(&pid, &rideID, &fsID, &clientID, &driverID, &status,
				&amount, &tip, &commission, &total)
		if err != nil {
			return nil, err
		}
		p["paymentId"], p["rideId"], p["status"] = pid, rideID, status
		p["amount"], p["tip"], p["commission"], p["total"] = amount, tip, commission, total
		if fsID != nil {
			p["firebaseRideId"] = *fsID
		}
		if clientID != nil {
			p["clientId"] = *clientID
		}
		if driverID != nil {
			p["driverId"] = *driverID
		}
		return p, nil
	},
}

var driversSpec = entitySpec{
	aggType: "driver", // aggregateID = Firebase UID (igual que el outbox)
	query: `
		SELECT user_id, extract(epoch from updated_at) * 1000, revision FROM public.drivers
		WHERE updated_at > NOW() - $1::interval`,
	build: func(ctx context.Context, pool *pgxpool.Pool, driverUID string) (map[string]any, error) {
		var acct, designated *string
		var dept, muni, photo, displayName *string
		var totalRides *int
		var rating *float64
		err := pool.QueryRow(ctx, `
			SELECT d.account_status::text, d.designated_role_status::text,
			       d.department, d.municipality, d.profile_photo,
			       d.total_rides, d.average_rating, u.name
			FROM public.drivers d
			LEFT JOIN public.users u ON u.id = d.user_id
			WHERE d.user_id = $1`, driverUID).
			Scan(&acct, &designated, &dept, &muni, &photo, &totalRides, &rating, &displayName)
		if err != nil {
			return nil, err
		}
		p := map[string]any{"userId": driverUID}
		if acct != nil {
			p["accountStatus"] = *acct
		}
		if totalRides != nil {
			p["totalRides"] = *totalRides
		}
		if rating != nil {
			p["averageRating"] = *rating
		}
		if dept != nil {
			p["department"] = *dept
		}
		if muni != nil {
			p["municipality"] = *muni
		}
		if photo != nil {
			p["photoUrl"] = *photo
		}
		if displayName != nil {
			p["displayName"] = *displayName
		}
		return p, nil
	},
}

var vehiclesSpec = entitySpec{
	aggType: "vehicle",
	query: `
		SELECT id::text, extract(epoch from updated_at) * 1000000, revision FROM public.vehicles
		WHERE updated_at > NOW() - $1::interval`,
	build: func(ctx context.Context, pool *pgxpool.Pool, vehicleID string) (map[string]any, error) {
		var plate string
		var driverUID, brand, model, color, vtype, photo *string
		var year *int
		var is4x4, active *bool
		err := pool.QueryRow(ctx, `
			SELECT v.plate, d.user_id, v.brand, v.model, v.year, v.color, v.type,
			       v.is_4x4, v.is_active, v.vehicle_photo
			FROM public.vehicles v
			JOIN public.drivers d ON d.id = v.driver_id
			WHERE v.id = $1::uuid`, vehicleID).
			Scan(&plate, &driverUID, &brand, &model, &year, &color, &vtype,
				&is4x4, &active, &photo)
		if err != nil {
			return nil, err
		}
		p := map[string]any{"plate": plate}
		if driverUID != nil {
			p["driverUid"] = *driverUID
		}
		if brand != nil {
			p["brand"] = *brand
		}
		if model != nil {
			p["model"] = *model
		}
		if year != nil {
			p["year"] = *year
		}
		if color != nil {
			p["color"] = *color
		}
		if vtype != nil {
			p["type"] = *vtype
		}
		if is4x4 != nil {
			p["is4x4"] = *is4x4
		}
		if active != nil {
			p["isActive"] = *active
		}
		if photo != nil {
			p["vehiclePhoto"] = *photo
		}
		return p, nil
	},
}
