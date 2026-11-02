package pricing

import (
	"context"
	"fmt"
	"math"
	"sync"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/api/iterator"

	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/geo"
)

// ServicePricingConfig — fila de public.services proyectada.
type ServicePricingConfig struct {
	ID             string
	Code           string
	BasePrice      float64
	PricePerKm     float64
	PricePerMinute float64
	MinimumFare    float64
	CommissionRate float64
}

type Options struct {
	OriginLat            *float64
	OriginLng            *float64
	DriverID             *string // Firebase UID → comisión vía RPC
	ServiceCodeOverride  string
	ExtraStops           int
	CalculationAt        time.Time
	SkipSurge            bool
	SelectedFeatureCodes []string // nil = default-selected
}

type Snapshot struct {
	ServiceCode        string           `json:"serviceCode"`
	FeatureCodes       []string         `json:"featureCodes"`
	FeatureAdjustments []AppliedFeature `json:"featureAdjustments"`
	BaseFare           float64          `json:"baseFare"`
	FareBeforeSurge    float64          `json:"fareBeforeSurge"`
	SurgeMultiplier    float64          `json:"surgeMultiplier"`
	DemandSupplyRatio  *float64         `json:"demandSupplyRatio"`
	CommissionRate     float64          `json:"commissionRate"`
	CommissionAmount   float64          `json:"commissionAmount"`
	FinalFare          float64          `json:"finalFare"`
	DynamicMinimumFare float64          `json:"dynamicMinimumFare"`
}

type Result struct {
	DistanceKm      float64  `json:"distanceKm"`
	DurationMinutes int      `json:"durationMinutes"`
	Multiplier      float64  `json:"multiplier"`
	FinalPrice      float64  `json:"finalPrice"`
	CommissionRate  float64  `json:"commissionRate"`
	Commission      float64  `json:"commission"`
	ServiceCode     string   `json:"serviceCode"`
	ServiceID       string   `json:"serviceId,omitempty"`
	ExtraStops      float64  `json:"extraStopsCharge"`
	BaseFare        float64  `json:"baseFare"`
	FeatureCodes    []string `json:"featureCodes"`
	SurgeMultiplier float64  `json:"surgeMultiplier"`
	IsFallback      bool     `json:"isFallback"`
	Snapshot        Snapshot `json:"pricingSnapshot"`
}

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client

	mu         sync.Mutex
	svcCache   map[string]*svcEntry
	featCache  map[string]*featEntry
	surgeCache []SurgeRule
	surgeAt    time.Time
	areaCache  []serviceArea
	areasAt    time.Time
}

type svcEntry struct {
	cfg *ServicePricingConfig
	at  time.Time
}
type featEntry struct {
	feats []PricingFeature
	at    time.Time
}

const (
	cacheTTL      = 60 * time.Second
	areasCacheTTL = 5 * time.Minute
	maxDriverAge  = 90 * time.Second
	maxRideAge    = 5 * time.Minute
)

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{
		pool:      pool,
		fs:        fsClient,
		svcCache:  map[string]*svcEntry{},
		featCache: map[string]*featEntry{},
	}
}

// Calculate — port fiel de calculateRidePrice (priceCalculator.ts:742+).
func (s *Service) Calculate(ctx context.Context, distanceMeters, durationSeconds float64, vehicleType, rideType string, opts Options) (*Result, error) {
	if math.IsNaN(distanceMeters) || distanceMeters < 0 || distanceMeters > 500_000 ||
		math.IsNaN(durationSeconds) || durationSeconds < 0 || durationSeconds > 86_400 {
		return nil, fmt.Errorf("distance or duration out of range")
	}
	if opts.ExtraStops < 0 || opts.ExtraStops > 10 {
		return nil, fmt.Errorf("extraStops must be 0-10")
	}

	at := opts.CalculationAt
	if at.IsZero() {
		at = time.Now()
	}
	distanceKm := distanceMeters / 1000
	durationMin := int(math.Ceil(durationSeconds / 60))
	serviceCode := opts.ServiceCodeOverride
	if serviceCode == "" {
		serviceCode = MapRideTypeToServiceCode(vehicleType, rideType)
	}
	if !PricingServiceCodes[serviceCode] {
		return nil, fmt.Errorf("unsupported serviceCode: %s", serviceCode)
	}

	svc, err := s.serviceConfig(ctx, serviceCode)
	if err != nil {
		return nil, err
	}

	// Fallback legacy cuando el servicio no existe en BD (v1 hace lo mismo).
	if svc == nil {
		return s.legacy(distanceKm, durationMin, vehicleType, rideType, serviceCode, opts.ExtraStops), nil
	}

	multiplier := svc.PricePerKm
	if multiplier <= 0 {
		multiplier = LegacyMultiplier(distanceKm, vehicleType, rideType)
	}
	distanceComponent := math.Max(distanceKm, 0) * multiplier
	timePrice := math.Max(float64(durationMin), 0) * math.Max(svc.PricePerMinute, 0)
	stops := float64(opts.ExtraStops) * StopFee
	minFare := math.Max(svc.MinimumFare, svc.BasePrice)
	baseFare := math.Max(svc.BasePrice+distanceComponent+timePrice+stops, minFare)

	if rideType == "designated_driver" {
		if normal, err := s.serviceConfig(ctx, "normal"); err == nil && normal != nil {
			nm := normal.PricePerKm
			if nm <= 0 {
				nm = LegacyMultiplier(distanceKm, vehicleType, "normal")
			}
			nf := math.Max(
				normal.BasePrice+math.Max(distanceKm, 0)*nm+
					math.Max(float64(durationMin), 0)*math.Max(normal.PricePerMinute, 0)+stops,
				math.Max(normal.MinimumFare, normal.BasePrice),
			)
			baseFare = math.Max(baseFare, nf*2)
		}
	}

	feats, err := s.serviceFeatures(ctx, svc.ID)
	if err != nil {
		return nil, err
	}
	var selected []string
	if opts.SelectedFeatureCodes == nil {
		selected = DefaultSelectedFeatureCodes(feats, at)
	} else {
		selected, err = ValidateSelectedFeatureCodes(opts.SelectedFeatureCodes, feats, at)
		if err != nil {
			return nil, err
		}
	}
	featureFare, applied := ApplyPricingFeatures(baseFare, feats, at, selected)
	fareBeforeSurge := math.Max(featureFare, minFare)

	var ratio *float64
	surge := 1.0
	if !opts.SkipSurge && opts.OriginLat != nil && opts.OriginLng != nil {
		if areaID := s.serviceAreaID(ctx, *opts.OriginLat, *opts.OriginLng); areaID != "" {
			if r, err := s.demandSupplyRatio(ctx, areaID); err == nil {
				ratio = r
			}
		}
	}
	if !opts.SkipSurge {
		rules, err := s.surgeRules(ctx)
		if err == nil && len(rules) > 0 {
			surge = ResolveSurgeMultiplier(ratio, rules)
		} else {
			surge = ResolveSurgeMultiplier(ratio, DefaultSurgeRules)
		}
	}
	finalFare := RoundFareToNearestFive(fareBeforeSurge * surge)

	rate := svc.CommissionRate
	if opts.DriverID != nil && *opts.DriverID != "" {
		if r, err := s.commissionRate(ctx, *opts.DriverID, serviceCode); err == nil {
			rate = r
		} else {
			rate = FallbackCommissionRate(serviceCode)
		}
	}
	commission := CommissionAmount(finalFare, rate)

	return &Result{
		DistanceKm:      math.Round(distanceKm*100) / 100,
		DurationMinutes: durationMin,
		Multiplier:      multiplier,
		FinalPrice:      finalFare,
		CommissionRate:  rate,
		Commission:      commission,
		ServiceCode:     serviceCode,
		ServiceID:       svc.ID,
		ExtraStops:      stops,
		BaseFare:        math.Round(baseFare*100) / 100,
		FeatureCodes:    selected,
		SurgeMultiplier: surge,
		Snapshot: Snapshot{
			ServiceCode:        serviceCode,
			FeatureCodes:       selected,
			FeatureAdjustments: applied,
			BaseFare:           math.Round(baseFare*100) / 100,
			FareBeforeSurge:    math.Round(fareBeforeSurge*100) / 100,
			SurgeMultiplier:    surge,
			DemandSupplyRatio:  ratio,
			CommissionRate:     rate,
			CommissionAmount:   commission,
			FinalFare:          finalFare,
			DynamicMinimumFare: DynamicMinimumFare(fareBeforeSurge, finalFare, surge),
		},
	}, nil
}

// legacy — multiplicador de tramos + base 40/50 cuando el servicio no existe.
func (s *Service) legacy(distanceKm float64, durationMin int, vehicleType, rideType, serviceCode string, extraStops int) *Result {
	mult := LegacyMultiplier(distanceKm, vehicleType, rideType)
	base := 50.0
	if (vehicleType == "motorcycle" || vehicleType == "moto") && rideType != "designated_driver" {
		base = 40
	}
	dist := math.Max(distanceKm, 0) * mult
	bf := math.Max(dist+StopFee*float64(extraStops)+base, 50)
	final := RoundFareToNearestFive(bf)
	rate := FallbackCommissionRate(serviceCode)
	comm := CommissionAmount(final, rate)
	return &Result{
		DistanceKm:      math.Round(distanceKm*100) / 100,
		DurationMinutes: durationMin,
		Multiplier:      mult,
		FinalPrice:      final,
		CommissionRate:  rate,
		Commission:      comm,
		ServiceCode:     serviceCode,
		ExtraStops:      StopFee * float64(extraStops),
		BaseFare:        bf,
		IsFallback:      true,
		SurgeMultiplier: 1,
		Snapshot: Snapshot{
			ServiceCode: serviceCode, BaseFare: bf, FareBeforeSurge: bf,
			SurgeMultiplier: 1, CommissionRate: rate, CommissionAmount: comm,
			FinalFare: final, DynamicMinimumFare: DynamicMinimumFare(bf, final, 1),
		},
	}
}

// ---- loaders con cache (60s, igual que v1) ----

func (s *Service) serviceConfig(ctx context.Context, code string) (*ServicePricingConfig, error) {
	s.mu.Lock()
	if e, ok := s.svcCache[code]; ok && time.Since(e.at) < cacheTTL {
		s.mu.Unlock()
		return e.cfg, nil
	}
	s.mu.Unlock()

	var c ServicePricingConfig
	err := s.pool.QueryRow(ctx, `
		SELECT id, code, base_price, COALESCE(price_per_km, 0),
		       COALESCE(price_per_minute, 0), minimum_fare, commission_rate
		FROM public.services WHERE code = $1 AND is_active = TRUE`, code,
	).Scan(&c.ID, &c.Code, &c.BasePrice, &c.PricePerKm, &c.PricePerMinute,
		&c.MinimumFare, &c.CommissionRate)
	if err != nil {
		c := (*ServicePricingConfig)(nil)
		s.mu.Lock()
		s.svcCache[code] = &svcEntry{cfg: c, at: time.Now()}
		s.mu.Unlock()
		return nil, nil // no encontrado → fallback legacy (v1 hace warn, no error)
	}
	s.mu.Lock()
	s.svcCache[code] = &svcEntry{cfg: &c, at: time.Now()}
	s.mu.Unlock()
	return &c, nil
}

func (s *Service) serviceFeatures(ctx context.Context, serviceID string) ([]PricingFeature, error) {
	s.mu.Lock()
	if e, ok := s.featCache[serviceID]; ok && time.Since(e.at) < cacheTTL {
		s.mu.Unlock()
		return e.feats, nil
	}
	s.mu.Unlock()

	rows, err := s.pool.Query(ctx, `
		SELECT f.code, f.name, f.pricing_type, f.pricing_value,
		       COALESCE((a.configuration->>'priority')::int, f.priority),
		       COALESCE((a.configuration->>'stackable')::boolean, f.stackable),
		       COALESCE((a.configuration->>'defaultSelected')::boolean,
		                (f.metadata->>'defaultSelected')::boolean),
		       f.enabled, f.start_time::text, f.end_time::text, f.timezone,
		       f.starts_at, f.ends_at
		FROM public.service_feature_assignments a
		JOIN public.features f ON f.id = a.feature_id
		WHERE a.service_id = $1 AND a.enabled = TRUE`, serviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var feats []PricingFeature
	for rows.Next() {
		var feat PricingFeature
		var st, et *string
		var sa, ea *time.Time
		if err := rows.Scan(&feat.Code, &feat.Name, &feat.PricingType,
			&feat.PricingValue, &feat.Priority, &feat.Stackable,
			&feat.DefaultSelected, &feat.Enabled, &st, &et, &feat.Timezone,
			&sa, &ea); err != nil {
			return nil, err
		}
		if st != nil {
			feat.StartTime = *st
		}
		if et != nil {
			feat.EndTime = *et
		}
		feat.StartsAt, feat.EndsAt = sa, ea
		feats = append(feats, feat)
	}
	s.mu.Lock()
	s.featCache[serviceID] = &featEntry{feats: feats, at: time.Now()}
	s.mu.Unlock()
	return feats, rows.Err()
}

func (s *Service) surgeRules(ctx context.Context) ([]SurgeRule, error) {
	s.mu.Lock()
	if s.surgeCache != nil && time.Since(s.surgeAt) < cacheTTL {
		s.mu.Unlock()
		return s.surgeCache, nil
	}
	s.mu.Unlock()

	rows, err := s.pool.Query(ctx, `
		SELECT min_demand_supply_ratio, max_demand_supply_ratio, multiplier, priority
		FROM public.pricing_surge_rules WHERE enabled = TRUE ORDER BY priority`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SurgeRule
	for rows.Next() {
		var r SurgeRule
		if err := rows.Scan(&r.MinRatio, &r.MaxRatio, &r.Mult, &r.Priority); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	s.mu.Lock()
	s.surgeCache, s.surgeAt = out, time.Now()
	s.mu.Unlock()
	return out, rows.Err()
}

func (s *Service) commissionRate(ctx context.Context, driverUID, serviceCode string) (float64, error) {
	var rate float64
	err := s.pool.QueryRow(ctx,
		`SELECT public.get_driver_commission_rate($1, $2)`, driverUID, serviceCode).Scan(&rate)
	return rate, err
}

// ---- demanda/oferta + áreas de servicio (Firestore, equivalencia RTDB v1) ----

type serviceArea struct {
	ID        string
	CenterLat float64
	CenterLng float64
	RadiusKm  float64
	Points    [][2]float64 // [lat,lng]
}

func (s *Service) loadServiceAreas(ctx context.Context) ([]serviceArea, error) {
	s.mu.Lock()
	if s.areaCache != nil && time.Since(s.areasAt) < areasCacheTTL {
		s.mu.Unlock()
		return s.areaCache, nil
	}
	s.mu.Unlock()

	snaps, err := s.fs.Collection(fs.ColServiceAreas).Where("active", "==", true).Documents(ctx).GetAll()
	if err != nil {
		return nil, err
	}
	var out []serviceArea
	for _, snap := range snaps {
		d := snap.Data()
		a := serviceArea{ID: snap.Ref.ID}
		// Tolerante a GeoPoint `center` o numéricos centerLat/centerLng.
		if cLat, cLng, ok := geo.ExtractLatLng(d["center"]); ok {
			a.CenterLat, a.CenterLng = cLat, cLng
		} else {
			a.CenterLat, _ = d["centerLat"].(float64)
			a.CenterLng, _ = d["centerLng"].(float64)
		}
		a.RadiusKm, _ = d["radiusKm"].(float64)
		a.Points = geo.ExtractPolygon(d["points"])
		out = append(out, a)
	}
	if len(out) == 0 {
		// Fallback Managua (v1 DEFAULT_SERVICE_AREA)
		out = []serviceArea{{
			ID: "default", Points: [][2]float64{
				{12.2, -86.35}, {12.2, -86.15}, {12.05, -86.15}, {12.05, -86.35},
			},
		}}
	}
	s.mu.Lock()
	s.areaCache, s.areasAt = out, time.Now()
	s.mu.Unlock()
	return out, nil
}

func (s *Service) serviceAreaID(ctx context.Context, lat, lng float64) string {
	areas, err := s.loadServiceAreas(ctx)
	if err != nil {
		return ""
	}
	for _, a := range areas {
		if len(a.Points) >= 3 {
			if geo.PointInPolygon(lat, lng, a.Points) {
				return a.ID
			}
		} else if a.RadiusKm > 0 {
			d := geo.HaversineKm(lat, lng, a.CenterLat, a.CenterLng)
			if d <= a.RadiusKm {
				return a.ID
			}
		}
	}
	return ""
}

// demandSupplyRatio — equivalencia v2 del RTDB de v1:
// demanda = trips_live 'requested' del área (<5min); oferta = drivers_live
// 'online' del área con lastSeen <90s.
func (s *Service) demandSupplyRatio(ctx context.Context, areaID string) (*float64, error) {
	now := time.Now()

	dIter := s.fs.Collection(fs.ColDriversLive).
		Where("serviceAreaId", "==", areaID).
		Where("status", "==", "online").
		Where("lastSeen", ">", now.Add(-maxDriverAge)).
		Documents(ctx)
	drivers := 0
	for {
		_, err := dIter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		drivers++
	}

	tIter := s.fs.Collection(fs.ColTripsLive).
		Where("serviceAreaId", "==", areaID).
		Where("status", "==", "requested").
		Where("requestedAt", ">", now.Add(-maxRideAge)).
		Documents(ctx)
	demand := 0
	for {
		_, err := tIter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		demand++
	}
	return CalculateSurgeRatio(demand, drivers), nil
}
