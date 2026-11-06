package projections

import (
	"context"
	"encoding/json"
	"fmt"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/fs"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func counterOfferStatus(rideStatus string, assignedDriver *string, driverID, offerStatus string) string {
	if rideStatus == "requested" || rideStatus == "driver_offered" {
		if offerStatus == "sent" {
			return "pending"
		}
		return offerStatus
	}
	if rideStatus != "canceled" && assignedDriver != nil && *assignedDriver == driverID {
		return "accepted"
	}
	return "canceled"
}

// Read current SQL state rather than replaying stale offer event payloads.
// The offer doc carries the ride context the driver needs while negotiating:
// trips_live stays unreadable to them until the client assigns the ride.
func projectCounterOffers(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, rideID string) error {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT ON (o.driver_id)
		       o.driver_id, r.client_id, o.offered_price, o.status::text,
		       r.status::text, r.driver_id, r.version,
		       r.firebase_ride_id, uc.name,
		       r.estimated_price, r.client_suggested_price,
		       r.origin_latitude, r.origin_longitude, r.origin_address,
		       r.destination_latitude, r.destination_longitude, r.destination_address,
		       r.waypoints, r.pricing_snapshot
		FROM public.ride_offers o
		JOIN public.rides_with_complete_route r ON r.id = o.ride_id
		LEFT JOIN public.users uc ON uc.id = r.client_id
		WHERE o.ride_id = $1::uuid AND o.kind = 'counter_offer'
		ORDER BY o.driver_id, o.created_at DESC, o.id DESC`, rideID)
	if err != nil {
		return fmt.Errorf("query counter offers: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var driverID, clientID, offerStatus, rideStatus string
		var assignedDriver, firebaseID, clientName *string
		var estPrice, clientSug, oLat, oLng, dLat, dLng *float64
		var oAddr, dAddr *string
		var waypoints, pricingSnap []byte
		var price float64
		var version int64
		if err := rows.Scan(&driverID, &clientID, &price, &offerStatus, &rideStatus,
			&assignedDriver, &version, &firebaseID, &clientName,
			&estPrice, &clientSug, &oLat, &oLng, &oAddr, &dLat, &dLng, &dAddr,
			&waypoints, &pricingSnap); err != nil {
			return err
		}
		ref := c.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driverID)
		data := map[string]any{
			"rideId": rideID, "clientId": clientID, "driverId": driverID,
			"kind":         "counter_offer",
			"offeredPrice": price, "status": counterOfferStatus(rideStatus, assignedDriver, driverID, offerStatus),
			"offerProjectionVersion": version, "updatedAt": firestore.ServerTimestamp,
		}
		if firebaseID != nil {
			data["firebaseRideId"] = *firebaseID
		}
		if clientName != nil {
			data["clientName"] = *clientName
		}
		if estPrice != nil {
			data["estimatedPrice"] = *estPrice
		}
		if clientSug != nil {
			data["clientSuggestedPrice"] = *clientSug
		}
		if oLat != nil && oLng != nil {
			origin := map[string]any{"latitude": *oLat, "longitude": *oLng}
			if oAddr != nil {
				origin["address"] = *oAddr
			}
			data["origin"] = origin
		}
		if dLat != nil && dLng != nil {
			dest := map[string]any{"latitude": *dLat, "longitude": *dLng}
			if dAddr != nil {
				dest["address"] = *dAddr
			}
			data["destination"] = dest
		}
		var wps []map[string]any
		if json.Unmarshal(waypoints, &wps) == nil && len(wps) > 0 {
			extra := make([]map[string]any, 0, len(wps))
			for _, w := range wps {
				e := map[string]any{"lat": w["lat"], "lng": w["lng"]}
				if a, ok := w["address"].(string); ok {
					e["address"] = a
				}
				extra = append(extra, e)
			}
			data["extraDestinations"] = extra
		}
		var snap map[string]any
		if json.Unmarshal(pricingSnap, &snap) == nil {
			if fc, ok := snap["featureCodes"]; ok {
				data["featureCodes"] = fc
			}
		}
		if err := c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			snap, err := tx.Get(ref)
			if err != nil && status.Code(err) != codes.NotFound {
				return err
			}
			if err == nil {
				switch previous := snap.Data()["offerProjectionVersion"].(type) {
				case int64:
					if previous >= version {
						return nil
					}
				case float64:
					if previous >= float64(version) {
						return nil
					}
				}
			}
			return tx.Set(ref, data, firestore.MergeAll)
		}); err != nil {
			return fmt.Errorf("project counter offer: %w", err)
		}
	}
	return rows.Err()
}
