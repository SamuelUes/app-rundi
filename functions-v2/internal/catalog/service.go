// Package catalog — administración del catálogo de pricing (services,
// features, surge rules, asignaciones). Autoridad SQL; cada mutación emite
// evento Outbox y el consumer re-lee la fila y la proyecta a
// DATA-MAIN_services / DATA-MAIN_features / DATA-MAIN_pricing para que la
// app solicite viajes leyendo Firestore directo (decisión del usuario).
package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/outbox"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func versionNow() float64 { return float64(time.Now().UnixMilli()) }

type ServiceInput struct {
	Code                   string          `json:"code"`
	Name                   string          `json:"name"`
	Description            *string         `json:"description,omitempty"`
	CommissionRate         *float64        `json:"commissionRate,omitempty"`
	BasePrice              *float64        `json:"basePrice,omitempty"`
	PricePerKm             *float64        `json:"pricePerKm,omitempty"`
	PricePerMinute         *float64        `json:"pricePerMinute,omitempty"`
	MinimumFare            *float64        `json:"minimumFare,omitempty"`
	MaxDistanceKm          *float64        `json:"maxDistanceKm,omitempty"`
	VehicleTypes           []string        `json:"vehicleTypes,omitempty"`
	RequiresSpecialLicense *bool           `json:"requiresSpecialLicense,omitempty"`
	AvailableHours         json.RawMessage `json:"availableHours,omitempty"`
	Icon                   *string         `json:"icon,omitempty"`
	Color                  *string         `json:"color,omitempty"`
	DisplayOrder           *int            `json:"displayOrder,omitempty"`
	IsActive               *bool           `json:"isActive,omitempty"`
	IsFeatured             *bool           `json:"isFeatured,omitempty"`
}

type FeatureInput struct {
	Code               string          `json:"code"`
	Name               string          `json:"name"`
	Description        *string         `json:"description,omitempty"`
	Enabled            *bool           `json:"enabled,omitempty"`
	StartsAt           *time.Time      `json:"startsAt,omitempty"`
	EndsAt             *time.Time      `json:"endsAt,omitempty"`
	StartTime          *string         `json:"startTime,omitempty"` // HH:MM
	EndTime            *string         `json:"endTime,omitempty"`
	Timezone           *string         `json:"timezone,omitempty"`
	PricingType        *string         `json:"pricingType,omitempty"` // none|surcharge|discount|multiplier
	PricingValue       *float64        `json:"pricingValue,omitempty"`
	Priority           *int            `json:"priority,omitempty"`
	Stackable          *bool           `json:"stackable,omitempty"`
	EligibilitySubject *string         `json:"eligibilitySubject,omitempty"` // none|driver|vehicle
	EligibilityMode    *string         `json:"eligibilityMode,omitempty"`    // none|manual|automatic|hybrid
	Metadata           json.RawMessage `json:"metadata,omitempty"`
}

type SurgeRuleInput struct {
	MinRatio   float64  `json:"minRatio"`
	MaxRatio   *float64 `json:"maxRatio,omitempty"` // nil = abierto
	Multiplier float64  `json:"multiplier"`
	Priority   *int     `json:"priority,omitempty"`
	Enabled    *bool    `json:"enabled,omitempty"`
}

type AssignmentInput struct {
	ServiceCode   string          `json:"serviceCode"`
	FeatureCode   string          `json:"featureCode"`
	Enabled       *bool           `json:"enabled,omitempty"`
	Configuration json.RawMessage `json:"configuration,omitempty"`
}

// UpsertService — INSERT/UPDATE por code (UNIQUE). Registra actor en
// app.current_user_id para el trigger log_commission_change.
func (s *Service) UpsertService(ctx context.Context, adminUID string, in ServiceInput, requestID string) error {
	if in.Code == "" || in.Name == "" {
		return apperr.New(400, "code and name are required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := setActor(ctx, tx, adminUID); err != nil {
		return err
	}

	var vt, ah any
	if in.VehicleTypes != nil {
		b, _ := json.Marshal(in.VehicleTypes)
		vt = string(b)
	}
	if in.AvailableHours != nil {
		ah = string(in.AvailableHours)
	}

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO public.services (
			code, name, description, commission_rate, base_price, price_per_km,
			price_per_minute, minimum_fare, max_distance_km, vehicle_types,
			requires_special_license, available_hours, icon, color, display_order,
			is_active, is_featured
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		ON CONFLICT (code) DO UPDATE SET
			name = EXCLUDED.name,
			description = COALESCE(EXCLUDED.description, services.description),
			commission_rate = COALESCE(EXCLUDED.commission_rate, services.commission_rate),
			base_price = COALESCE(EXCLUDED.base_price, services.base_price),
			price_per_km = COALESCE(EXCLUDED.price_per_km, services.price_per_km),
			price_per_minute = COALESCE(EXCLUDED.price_per_minute, services.price_per_minute),
			minimum_fare = COALESCE(EXCLUDED.minimum_fare, services.minimum_fare),
			max_distance_km = COALESCE(EXCLUDED.max_distance_km, services.max_distance_km),
			vehicle_types = COALESCE(EXCLUDED.vehicle_types, services.vehicle_types),
			requires_special_license = COALESCE(EXCLUDED.requires_special_license, services.requires_special_license),
			available_hours = COALESCE(EXCLUDED.available_hours, services.available_hours),
			icon = COALESCE(EXCLUDED.icon, services.icon),
			color = COALESCE(EXCLUDED.color, services.color),
			display_order = COALESCE(EXCLUDED.display_order, services.display_order),
			is_active = COALESCE(EXCLUDED.is_active, services.is_active),
			is_featured = COALESCE(EXCLUDED.is_featured, services.is_featured)
		RETURNING id::text`,
		in.Code, in.Name, in.Description, orFloat(in.CommissionRate, 0.15),
		orFloat(in.BasePrice, 0), in.PricePerKm, in.PricePerMinute,
		orFloat(in.MinimumFare, 0), in.MaxDistanceKm, vt,
		orBool(in.RequiresSpecialLicense, false), ah, in.Icon, in.Color,
		orInt(in.DisplayOrder, 0), orBool(in.IsActive, true),
		orBool(in.IsFeatured, false),
	).Scan(&id)
	if err != nil {
		return fmt.Errorf("services upsert: %w", err)
	}

	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "service.upserted",
		AggregateType: "service",
		AggregateID:   in.Code,
		Payload:       map[string]any{"code": in.Code, "version": versionNow()},
		RequestID:     requestID,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// UpsertFeature — INSERT/UPDATE por code. 'night' es feature, no servicio.
func (s *Service) UpsertFeature(ctx context.Context, adminUID string, in FeatureInput, requestID string) error {
	if in.Code == "" || in.Name == "" {
		return apperr.New(400, "code and name are required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := setActor(ctx, tx, adminUID); err != nil {
		return err
	}

	var meta any
	if in.Metadata != nil {
		meta = string(in.Metadata)
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO public.features (
			code, name, description, enabled, starts_at, ends_at, start_time,
			end_time, timezone, pricing_type, pricing_value, priority, stackable,
			eligibility_subject, eligibility_mode, metadata
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		ON CONFLICT (code) DO UPDATE SET
			name = EXCLUDED.name,
			description = COALESCE(EXCLUDED.description, features.description),
			enabled = COALESCE(EXCLUDED.enabled, features.enabled),
			starts_at = COALESCE(EXCLUDED.starts_at, features.starts_at),
			ends_at = COALESCE(EXCLUDED.ends_at, features.ends_at),
			start_time = COALESCE(EXCLUDED.start_time, features.start_time),
			end_time = COALESCE(EXCLUDED.end_time, features.end_time),
			timezone = COALESCE(EXCLUDED.timezone, features.timezone),
			pricing_type = COALESCE(EXCLUDED.pricing_type, features.pricing_type),
			pricing_value = COALESCE(EXCLUDED.pricing_value, features.pricing_value),
			priority = COALESCE(EXCLUDED.priority, features.priority),
			stackable = COALESCE(EXCLUDED.stackable, features.stackable),
			eligibility_subject = COALESCE(EXCLUDED.eligibility_subject, features.eligibility_subject),
			eligibility_mode = COALESCE(EXCLUDED.eligibility_mode, features.eligibility_mode),
			metadata = COALESCE(EXCLUDED.metadata, features.metadata)
		RETURNING id::text`,
		in.Code, in.Name, in.Description, orBool(in.Enabled, false),
		in.StartsAt, in.EndsAt, in.StartTime, in.EndTime,
		orStr(in.Timezone, "America/Managua"), orStr(in.PricingType, "none"),
		orFloat(in.PricingValue, 0), orInt(in.Priority, 100),
		orBool(in.Stackable, true), orStr(in.EligibilitySubject, "none"),
		orStr(in.EligibilityMode, "none"), meta,
	).Scan(new(string))
	if err != nil {
		return fmt.Errorf("features upsert: %w", err)
	}

	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "feature.upserted",
		AggregateType: "feature",
		AggregateID:   in.Code,
		Payload:       map[string]any{"code": in.Code, "version": versionNow()},
		RequestID:     requestID,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// UpsertSurgeRule — regla por min_demand_supply_ratio (UNIQUE). El consumer
// re-proyecta la lista completa a DATA-MAIN_pricing/surge.
func (s *Service) UpsertSurgeRule(ctx context.Context, adminUID string, in SurgeRuleInput, requestID string) error {
	if in.Multiplier < 1.0 || in.Multiplier > 1.6 {
		return apperr.New(400, "multiplier must be between 1.0 and 1.6")
	}
	if in.MaxRatio != nil && *in.MaxRatio <= in.MinRatio {
		return apperr.New(400, "maxRatio must be > minRatio")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := setActor(ctx, tx, adminUID); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO public.pricing_surge_rules
			(min_demand_supply_ratio, max_demand_supply_ratio, multiplier, priority, enabled)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (min_demand_supply_ratio) DO UPDATE SET
			max_demand_supply_ratio = EXCLUDED.max_demand_supply_ratio,
			multiplier = EXCLUDED.multiplier,
			priority = EXCLUDED.priority,
			enabled = EXCLUDED.enabled`,
		in.MinRatio, in.MaxRatio, in.Multiplier,
		orInt(in.Priority, 100), orBool(in.Enabled, true),
	); err != nil {
		return fmt.Errorf("surge upsert: %w", err)
	}

	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "surge_rules.changed",
		AggregateType: "pricing",
		AggregateID:   "surge",
		Payload:       map[string]any{"version": versionNow()},
		RequestID:     requestID,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// AssignFeature — enlaza feature a servicio; re-proyecta el service doc
// (featureCodes) vía evento service.upserted.
func (s *Service) AssignFeature(ctx context.Context, adminUID string, in AssignmentInput, requestID string) error {
	if in.ServiceCode == "" || in.FeatureCode == "" {
		return apperr.New(400, "serviceCode and featureCode are required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := setActor(ctx, tx, adminUID); err != nil {
		return err
	}

	var cfg any
	if in.Configuration != nil {
		cfg = string(in.Configuration)
	}
	res, err := tx.Exec(ctx, `
		INSERT INTO public.service_feature_assignments (service_id, feature_id, enabled, configuration)
		SELECT s.id, f.id, $3, COALESCE($4::jsonb, '{}'::jsonb)
		FROM public.services s, public.features f
		WHERE s.code = $1 AND f.code = $2
		ON CONFLICT (service_id, feature_id) DO UPDATE SET
			enabled = EXCLUDED.enabled,
			configuration = EXCLUDED.configuration`,
		in.ServiceCode, in.FeatureCode, orBool(in.Enabled, true), cfg,
	)
	if err != nil {
		return fmt.Errorf("assign feature: %w", err)
	}
	if res.RowsAffected() == 0 {
		return apperr.New(404, "service or feature code not found")
	}

	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "service.upserted",
		AggregateType: "service",
		AggregateID:   in.ServiceCode,
		Payload:       map[string]any{"code": in.ServiceCode, "version": versionNow()},
		RequestID:     requestID,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func setActor(ctx context.Context, tx pgx.Tx, uid string) error {
	if uid == "" {
		uid = "system"
	}
	_, err := tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, uid)
	return err
}

func orFloat(p *float64, d float64) float64 {
	if p == nil {
		return d
	}
	return *p
}
func orInt(p *int, d int) int {
	if p == nil {
		return d
	}
	return *p
}
func orBool(p *bool, d bool) bool {
	if p == nil {
		return d
	}
	return *p
}
func orStr(p *string, d string) string {
	if p == nil || *p == "" {
		return d
	}
	return *p
}
