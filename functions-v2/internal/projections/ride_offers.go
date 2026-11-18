package projections

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/fs"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func freshArrivalPhoto(data map[string]any, driverID string, now time.Time) string {
	return fs.FreshArrivalPhoto(data, driverID, now)
}

// Only share the follower's public presentation, never the crew's license or membership data.
func offerCrewFollower(data map[string]any, captainID string) map[string]any {
	crewStatus, _ := data["status"].(string)
	crewCaptain, _ := data["captainId"].(string)
	if crewStatus != "active" || crewCaptain != captainID {
		return nil
	}
	followerID, _ := data["followerId"].(string)
	follower, _ := data["follower"].(map[string]any)
	snapshotID, _ := follower["driverId"].(string)
	if followerID == "" || followerID == captainID || follower == nil || snapshotID != followerID {
		return nil
	}
	result := map[string]any{"driverId": followerID, "name": nil, "photoURL": nil, "rating": nil}
	for _, field := range []string{"name", "photoURL"} {
		if value, ok := follower[field].(string); ok && value != "" {
			result[field] = value
		}
	}
	if rating, ok := follower["rating"].(float64); ok && rating >= 0 && rating <= 5 {
		result["rating"] = rating
	}
	return result
}

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

// Update existing dispatch documents without creating offers or changing their status.
// eventType marca quién movió el precio por última vez (ride.price_suggested
// = cliente): el doc de despacho nunca registra oferta del conductor.
func projectDispatchOfferPrices(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, rideID, eventType string) error {
	rows, err := pool.Query(ctx, `
		SELECT o.driver_id, r.client_suggested_price, r.version
		FROM public.ride_offers o
		JOIN public.rides r ON r.id = o.ride_id
		WHERE o.ride_id = $1::uuid AND o.kind = 'offer' AND o.status = 'sent'
		  AND NOT EXISTS (
		    SELECT 1 FROM public.ride_offers counter
		    WHERE counter.ride_id = o.ride_id AND counter.driver_id = o.driver_id
		      AND counter.kind = 'counter_offer'
		  )`, rideID)
	if err != nil {
		return fmt.Errorf("query dispatch offers: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var driverID string
		var price *float64
		var version int64
		if err := rows.Scan(&driverID, &price, &version); err != nil {
			return err
		}
		if price == nil {
			continue
		}
		ref := c.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driverID)
		if err := c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			snap, err := tx.Get(ref)
			if status.Code(err) == codes.NotFound {
				return nil
			}
			if err != nil {
				return err
			}
			if previous, ok := snap.Data()["offerProjectionVersion"].(int64); ok && previous >= version {
				return nil
			}
			updates := []firestore.Update{
				{Path: "clientSuggestedPrice", Value: *price},
				{Path: "offerProjectionVersion", Value: version},
			}
			if eventType == "ride.price_suggested" {
				updates = append(updates, firestore.Update{Path: "lastOfferBy", Value: "client"})
			}
			return tx.Update(ref, updates)
		}); err != nil {
			return fmt.Errorf("project dispatch offer price: %w", err)
		}
	}
	return rows.Err()
}

// Read current SQL state rather than replaying stale offer event payloads.
// The offer doc carries the ride context the driver needs while negotiating:
// trips_live stays unreadable to them until the client assigns the ride.
func projectCounterOffers(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, rideID, eventType string) error {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT ON (o.driver_id)
		       o.driver_id, r.client_id, o.offered_price, o.status::text,
		       r.status::text, r.driver_id, r.version,
		       r.firebase_ride_id, uc.name, uc.profile_photo,
		       r.estimated_price, r.client_suggested_price,
		       r.origin_latitude, r.origin_longitude, r.origin_address,
		       r.destination_latitude, r.destination_longitude, r.destination_address,
		       r.waypoints, r.pricing_snapshot, r.ride_type
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
		var assignedDriver, firebaseID, clientName, clientPhoto, rideType *string
		var estPrice, clientSug, oLat, oLng, dLat, dLng *float64
		var oAddr, dAddr *string
		var waypoints, pricingSnap []byte
		var price float64
		var version int64
		if err := rows.Scan(&driverID, &clientID, &price, &offerStatus, &rideStatus,
			&assignedDriver, &version, &firebaseID, &clientName, &clientPhoto,
			&estPrice, &clientSug, &oLat, &oLng, &oAddr, &dLat, &dLng, &dAddr,
			&waypoints, &pricingSnap, &rideType); err != nil {
			return err
		}
		ref := c.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driverID)
		data := map[string]any{
			"rideId": rideID, "clientId": clientID, "driverId": driverID,
			"kind":         "counter_offer",
			"offeredPrice": price, "status": counterOfferStatus(rideStatus, assignedDriver, driverID, offerStatus),
			"offerProjectionVersion": version, "updatedAt": firestore.ServerTimestamp,
		}
		if rideType != nil && *rideType == "designated_driver" {
			photo, err := c.Collection(fs.ColArrivalPhotos).Doc(driverID).Get(ctx)
			if err != nil && status.Code(err) != codes.NotFound {
				return fmt.Errorf("read arrival photo: %w", err)
			}
			data["arrivalVehiclePhoto"] = nil
			if err == nil {
				if photoPath := freshArrivalPhoto(photo.Data(), driverID, time.Now()); photoPath != "" {
					data["arrivalVehiclePhoto"] = photoPath
				}
			}
			crew, err := c.Collection(fs.ColDriverCrews).Doc(driverID).Get(ctx)
			if err != nil && status.Code(err) != codes.NotFound {
				return fmt.Errorf("read offer crew: %w", err)
			}
			data["crewFollower"] = nil
			if err == nil {
				if follower := offerCrewFollower(crew.Data(), driverID); follower != nil {
					data["crewFollower"] = follower
				}
			}
		}
		if firebaseID != nil {
			data["firebaseRideId"] = *firebaseID
		}
		if clientName != nil {
			data["clientName"] = *clientName
		}
		if clientPhoto != nil {
			data["clientPhoto"] = *clientPhoto
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
		// Quién ofertó último: el banner del conductor distingue "tu oferta
		// esperando al cliente" de "el cliente propuso, espera tu respuesta".
		switch eventType {
		case "ride.price_offered":
			data["lastOfferBy"] = "driver"
		case "ride.price_suggested":
			data["lastOfferBy"] = "client"
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
