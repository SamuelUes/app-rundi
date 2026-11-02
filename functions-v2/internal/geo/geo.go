// Package geo — helpers geográficos compartidos (áreas de servicio, matching).
//
// ExtractLatLng replica la tolerancia del extractPoint v1
// (functions/src/api/region_availability.ts): los dashboards escribían
// GeoPoints de Firestore y las apps mapas {lat,lng}; el SDK de Go
// deserializa GeoPoint como *latlng.LatLng.
package geo

import (
	"math"
	"strconv"
	"strings"

	"google.golang.org/genproto/googleapis/type/latlng"
)

// ExtractLatLng extrae (lat, lng) de formas admitidas:
//   - *latlng.LatLng / latlng.LatLng (GeoPoint nativo)
//   - map[string]any con lat|latitude (+ variants capitalizadas y _lat/_latitude)
//   - []any / []float64 / [2]float64 — [lat, lng]
//   - string "lat,lng" | "lat lng" | "lat;lng"
func ExtractLatLng(v any) (float64, float64, bool) {
	switch p := v.(type) {
	case *latlng.LatLng:
		if p != nil {
			return p.Latitude, p.Longitude, true
		}
	case latlng.LatLng:
		return p.Latitude, p.Longitude, true
	case map[string]any:
		lat, ok1 := numFromKeys(p, "lat", "Lat", "latitude", "Latitude", "_lat", "_latitude")
		lng, ok2 := numFromKeys(p, "lng", "Lng", "lon", "Lon", "long", "Long",
			"longitude", "Longitude", "_lng", "_lon", "_long", "_longitude")
		if !ok1 || !ok2 {
			for _, wrap := range []string{"coords", "location", "point"} {
				if inner, ok := p[wrap].(map[string]any); ok {
					if la, ln, ok := ExtractLatLng(inner); ok {
						return la, ln, true
					}
				}
			}
		}
		return lat, lng, ok1 && ok2
	case []any:
		if len(p) >= 2 {
			lat, ok1 := toNum(p[0])
			lng, ok2 := toNum(p[1])
			return lat, lng, ok1 && ok2
		}
	case []float64:
		if len(p) >= 2 {
			return p[0], p[1], true
		}
	case [2]float64:
		return p[0], p[1], true
	case string:
		parts := strings.FieldsFunc(p, func(r rune) bool {
			return r == ',' || r == ' ' || r == ';'
		})
		if len(parts) >= 2 {
			lat, err1 := strconv.ParseFloat(parts[0], 64)
			lng, err2 := strconv.ParseFloat(parts[1], 64)
			if err1 == nil && err2 == nil {
				return lat, lng, true
			}
		}
	}
	return 0, 0, false
}

// ExtractPolygon normaliza un array de puntos en cualquier forma admitida.
// Devuelve nil si quedan menos de 3 vértices válidos (polígono inválido).
func ExtractPolygon(v any) [][2]float64 {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	var poly [][2]float64
	for _, raw := range arr {
		if lat, lng, ok := ExtractLatLng(raw); ok {
			poly = append(poly, [2]float64{lat, lng})
		}
	}
	if len(poly) < 3 {
		return nil
	}
	return poly
}

// PointInPolygon — ray-casting sobre [lat,lng]; paridad con isPointInPolygon v1.
func PointInPolygon(lat, lng float64, poly [][2]float64) bool {
	inside := false
	for i, j := 0, len(poly)-1; i < len(poly); j, i = i, i+1 {
		yi, xi := poly[i][0], poly[i][1]
		yj, xj := poly[j][0], poly[j][1]
		if (yi > lat) != (yj > lat) &&
			lng < (xj-xi)*(lat-yi)/(yj-yi)+xi {
			inside = !inside
		}
	}
	return inside
}

// HaversineKm — distancia gran-círculo en km.
func HaversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * 6371 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func numFromKeys(m map[string]any, keys ...string) (float64, bool) {
	for _, k := range keys {
		if n, ok := toNum(m[k]); ok {
			return n, true
		}
	}
	return 0, false
}

func toNum(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int64:
		return float64(n), true
	case string:
		if f, err := strconv.ParseFloat(n, 64); err == nil {
			return f, true
		}
	}
	return 0, false
}
