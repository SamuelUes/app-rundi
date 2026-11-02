// Package matching — candidatos elegibles desde REALTIME_drivers_live
// (doc §7.2): filtro por área/servicio/estado + distancia Haversine en memoria.
// Sin PostGIS/geohash/Redis en esta fase.
package matching

import (
	"context"
	"math"
	"sort"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"

	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/geo"
)

const earthRadiusKm = 6371.0

type Query struct {
	ServiceAreaID string
	ServiceCode   string  // filtra activeServiceCodes si no vacío
	VehicleType   string  // filtra vehicleType si no vacío
	Latitude      float64 // origen del viaje
	Longitude     float64
	RadiusKm      float64 // 0 = sin filtro de distancia
	Limit         int     // 0 = todos los candidatos en radio
}

type Candidate struct {
	DriverUID  string
	Latitude   float64
	Longitude  float64
	DistanceKm float64
	Status     string
}

func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * earthRadiusKm * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// FindDrivers — conductores online del área (+servicio/vehículo) ordenados por
// distancia al origen. El estado 'on_ride' queda fuera (no despachable).
func FindDrivers(ctx context.Context, c *firestore.Client, q Query) ([]Candidate, error) {
	fsQuery := c.Collection(fs.ColDriversLive).
		Where("status", "==", "online")
	if q.ServiceAreaID != "" {
		fsQuery = fsQuery.Where("serviceAreaId", "==", q.ServiceAreaID)
	}
	if q.VehicleType != "" {
		fsQuery = fsQuery.Where("vehicleType", "==", q.VehicleType)
	}

	iter := fsQuery.Documents(ctx)
	defer iter.Stop()

	var out []Candidate
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		d := snap.Data()

		if q.ServiceCode != "" {
			codes, _ := d["activeServiceCodes"].([]any)
			found := false
			for _, c := range codes {
				if s, ok := c.(string); ok && s == q.ServiceCode {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}

		lat, lng := geoOf(d)
		cand := Candidate{
			DriverUID:  snap.Ref.ID,
			Latitude:   lat,
			Longitude:  lng,
			DistanceKm: haversineKm(q.Latitude, q.Longitude, lat, lng),
		}
		if s, ok := d["status"].(string); ok {
			cand.Status = s
		}
		if q.RadiusKm > 0 && cand.DistanceKm > q.RadiusKm {
			continue
		}
		out = append(out, cand)
	}

	sort.Slice(out, func(i, j int) bool { return out[i].DistanceKm < out[j].DistanceKm })
	if q.Limit > 0 && len(out) > q.Limit {
		out = out[:q.Limit]
	}
	return out, nil
}

// geoOf extrae lat/lng del campo location (GeoPoint latlng o mapa legado).
func geoOf(d map[string]any) (float64, float64) {
	lat, lng, _ := geo.ExtractLatLng(d["location"])
	return lat, lng
}
