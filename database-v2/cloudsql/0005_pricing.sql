-- ============================================================================
-- 0005_pricing.sql — Pricing v2: services, driver_services, features,
-- service_feature_assignments, pricing_surge_rules, driver/vehicle feature
-- assignments, service_commission_history + vistas + RPC unificada.
-- Fuente: supabase-only.sql §12-§13, §31 + pricing-v2.sql +
-- migration-ride-feature-eligibility.sql + fix-commisions-and-rpc.sql.
-- Cambios:
--   * get_driver_commission_rate UNIFICADA: resuelve user_id (Firebase UID)
--     → drivers.id y aplica filtro expires_at (merge de las 2 variantes).
--   * FK rides.service_id → services.id (el INSERT hacía lookup sin garantía).
-- Convención v2: TODOS los timestamps son TIMESTAMPTZ.
-- ============================================================================

BEGIN;

-- ============================================
-- SERVICES — catálogo (normal, motorcycle, designated_driver_*)
-- Autoridad SQL; se proyecta a DATA-MAIN_services para lectura app.
-- ============================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,             -- VARCHAR: agregar servicios no requiere migración
  commission_rate DECIMAL(5, 4) NOT NULL,
  base_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  price_per_km DECIMAL(10, 2) NULL DEFAULT 0,
  price_per_minute DECIMAL(10, 2) NULL DEFAULT 0,
  minimum_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  max_distance_km DECIMAL(10, 2) NULL,
  vehicle_types JSONB NULL,
  requires_special_license BOOLEAN DEFAULT FALSE,
  available_hours JSONB NULL,
  icon VARCHAR(50) NULL,
  color VARCHAR(7) NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT services_pkey PRIMARY KEY (id),
  CONSTRAINT services_commission_rate_range CHECK (commission_rate >= 0 AND commission_rate <= 1),
  CONSTRAINT services_prices_nonneg CHECK (
    base_price >= 0 AND COALESCE(price_per_km, 0) >= 0 AND
    COALESCE(price_per_minute, 0) >= 0 AND minimum_fare >= 0 AND
    (max_distance_km IS NULL OR max_distance_km >= 0))
);
COMMENT ON TABLE public.services IS 'Pricing v2: Service + Features + Surge. ''night'' es feature temporal, no servicio.';
COMMENT ON COLUMN public.services.commission_rate IS 'Tasa sobre total pagado (0.1500 = 15%)';

CREATE INDEX IF NOT EXISTS idx_services_active ON public.services USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_services_display_order ON public.services USING btree (display_order);
-- services.code UNIQUE ya cubre búsquedas por code.

DROP TRIGGER IF EXISTS update_services_updated_at ON public.services;
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FK diferida: rides.service_id → services.id (services se crea aquí, rides en 0003)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_service_id_fkey') THEN
    ALTER TABLE public.rides ADD CONSTRAINT rides_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- DRIVER_SERVICES — servicios habilitados por conductor
-- ============================================
CREATE TABLE IF NOT EXISTS public.driver_services (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,                      -- UUID interno → drivers.id
  service_id UUID NOT NULL,
  custom_commission_rate DECIMAL(5, 4) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(255) NULL,
  approved_at TIMESTAMPTZ NULL,
  assigned_at TIMESTAMPTZ NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT driver_services_pkey PRIMARY KEY (id),
  CONSTRAINT driver_services_driver_fkey FOREIGN KEY (driver_id)
    REFERENCES public.drivers(id) ON DELETE CASCADE,
  CONSTRAINT driver_services_service_fkey FOREIGN KEY (service_id)
    REFERENCES public.services(id) ON DELETE CASCADE,
  CONSTRAINT driver_services_unique UNIQUE (driver_id, service_id),
  CONSTRAINT driver_services_custom_rate_range CHECK (custom_commission_rate IS NULL OR (custom_commission_rate >= 0 AND custom_commission_rate <= 1))
);

DROP TRIGGER IF EXISTS update_driver_services_updated_at ON public.driver_services;
CREATE TRIGGER update_driver_services_updated_at BEFORE UPDATE ON public.driver_services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- FEATURES — features/promociones temporales (Pricing v2)
-- ============================================
CREATE TABLE IF NOT EXISTS public.features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Managua',
  pricing_type VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (pricing_type IN ('none', 'surcharge', 'discount', 'multiplier')),
  pricing_value NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (pricing_value >= 0),
  priority INTEGER NOT NULL DEFAULT 100,
  stackable BOOLEAN NOT NULL DEFAULT TRUE,
  -- Elegibilidad (migration-ride-feature-eligibility)
  eligibility_subject VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (eligibility_subject IN ('none', 'driver', 'vehicle')),
  eligibility_mode VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (eligibility_mode IN ('none', 'manual', 'automatic', 'hybrid')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);
COMMENT ON TABLE public.features IS 'Features/promos (ej. ''night'', 4x4, mascotas). Proyección a DATA-MAIN_features para que la app solicite viajes sin API.';

DROP TRIGGER IF EXISTS update_features_updated_at ON public.features;
CREATE TRIGGER update_features_updated_at BEFORE UPDATE ON public.features
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SERVICE_FEATURE_ASSIGNMENTS — features por servicio
-- ============================================
CREATE TABLE IF NOT EXISTS public.service_feature_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_id, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_assignments_service_enabled
  ON public.service_feature_assignments(service_id, enabled);
CREATE INDEX IF NOT EXISTS idx_feature_assignments_feature
  ON public.service_feature_assignments(feature_id);

DROP TRIGGER IF EXISTS update_service_feature_assignments_updated_at ON public.service_feature_assignments;
CREATE TRIGGER update_service_feature_assignments_updated_at BEFORE UPDATE ON public.service_feature_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PRICING_SURGE_RULES — multiplicador por ratio demanda/oferta
-- ============================================
CREATE TABLE IF NOT EXISTS public.pricing_surge_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_demand_supply_ratio NUMERIC(8, 4) NOT NULL CHECK (min_demand_supply_ratio >= 0),
  max_demand_supply_ratio NUMERIC(8, 4) NULL,
  multiplier NUMERIC(4, 2) NOT NULL CHECK (multiplier BETWEEN 1.00 AND 1.60),
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (min_demand_supply_ratio),
  CHECK (max_demand_supply_ratio IS NULL OR max_demand_supply_ratio > min_demand_supply_ratio)
);

CREATE INDEX IF NOT EXISTS idx_pricing_surge_rules_enabled
  ON public.pricing_surge_rules(enabled, priority);

DROP TRIGGER IF EXISTS update_pricing_surge_rules_updated_at ON public.pricing_surge_rules;
CREATE TRIGGER update_pricing_surge_rules_updated_at BEFORE UPDATE ON public.pricing_surge_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- DRIVER/VEHICLE FEATURE ASSIGNMENTS — elegibilidad manual
-- ============================================
CREATE TABLE IF NOT EXISTS public.driver_feature_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by VARCHAR(255) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  revoked_by VARCHAR(255) NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (driver_id, feature_id),
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);

CREATE INDEX IF NOT EXISTS idx_driver_feature_assignments_active
  ON public.driver_feature_assignments(driver_id, is_active);
CREATE INDEX IF NOT EXISTS idx_driver_feature_assignments_feature
  ON public.driver_feature_assignments(feature_id);

DROP TRIGGER IF EXISTS update_driver_feature_assignments_updated_at ON public.driver_feature_assignments;
CREATE TRIGGER update_driver_feature_assignments_updated_at BEFORE UPDATE ON public.driver_feature_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.vehicle_feature_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by VARCHAR(255) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  revoked_by VARCHAR(255) NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vehicle_id, feature_id),
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_feature_assignments_active
  ON public.vehicle_feature_assignments(vehicle_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vehicle_feature_assignments_feature
  ON public.vehicle_feature_assignments(feature_id);

DROP TRIGGER IF EXISTS update_vehicle_feature_assignments_updated_at ON public.vehicle_feature_assignments;
CREATE TRIGGER update_vehicle_feature_assignments_updated_at BEFORE UPDATE ON public.vehicle_feature_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SERVICE_COMMISSION_HISTORY — auditoría de tasas
-- ============================================
CREATE TABLE IF NOT EXISTS public.service_commission_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL,
  old_commission_rate DECIMAL(5, 4) NOT NULL,
  new_commission_rate DECIMAL(5, 4) NOT NULL,
  changed_by VARCHAR(255) NOT NULL,
  change_reason TEXT NULL,
  changed_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT service_commission_history_pkey PRIMARY KEY (id),
  CONSTRAINT service_commission_history_service_fkey FOREIGN KEY (service_id)
    REFERENCES public.services(id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS trigger_log_commission_change ON public.services;
CREATE OR REPLACE FUNCTION public.log_commission_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.commission_rate IS DISTINCT FROM NEW.commission_rate THEN
    INSERT INTO public.service_commission_history (
      service_id, old_commission_rate, new_commission_rate, changed_by, change_reason
    ) VALUES (
      NEW.id, OLD.commission_rate, NEW.commission_rate,
      COALESCE(current_setting('app.current_user_id', true), 'system'),
      'Commission rate updated'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_commission_change
AFTER UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.log_commission_change();

-- ============================================
-- RPC UNIFICADA: get_driver_commission_rate
-- Resuelve Firebase UID → drivers.id; driver_services.custom → services.rate → defaults.
-- Merge de las 2 variantes auditadas (añade filtro expires_at de la variante UUID).
-- ============================================
CREATE OR REPLACE FUNCTION public.get_driver_commission_rate(
  p_driver_user_id VARCHAR,                   -- Firebase UID (drivers.user_id)
  p_service_code VARCHAR
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_driver_id UUID;
  v_commission_rate NUMERIC(5, 4);
BEGIN
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = p_driver_user_id;

  SELECT COALESCE(ds.custom_commission_rate, s.commission_rate)
    INTO v_commission_rate
    FROM public.services s
    LEFT JOIN public.driver_services ds
      ON ds.service_id = s.id
     AND ds.driver_id = v_driver_id
     AND ds.is_active = TRUE
     AND ds.is_approved = TRUE
     AND (ds.expires_at IS NULL OR ds.expires_at > NOW())
   WHERE s.code = p_service_code
     AND s.is_active = TRUE;

  RETURN COALESCE(
    v_commission_rate,
    CASE p_service_code
      WHEN 'designated_driver_moto' THEN 0.125
      WHEN 'designated_driver_auto' THEN 0.25
      WHEN 'designated_driver' THEN 0.25
      WHEN 'motorcycle' THEN 0.075
      WHEN 'night' THEN 0.12
      ELSE 0.15
    END
  );
END;
$$;
COMMENT ON FUNCTION public.get_driver_commission_rate(VARCHAR, VARCHAR) IS 'UNIFICADA. Recibe Firebase UID (drivers.user_id). Override driver_services → services.commission_rate → defaults.';

-- ============================================
-- Vistas (DROP+CREATE: OR REPLACE no puede cambiar columnas de una vista vieja)
-- ============================================
DROP VIEW IF EXISTS public.driver_active_services CASCADE;
CREATE VIEW public.driver_active_services AS
SELECT
  d.id              AS driver_id,
  d.user_id         AS driver_uid,
  s.id              AS service_id,
  s.code            AS service_code,
  s.name            AS service_name,
  COALESCE(ds.custom_commission_rate, s.commission_rate) AS commission_rate,
  ds.is_active,
  ds.is_approved,
  ds.assigned_at,
  ds.expires_at
FROM public.driver_services ds
JOIN public.drivers d   ON ds.driver_id = d.id
JOIN public.services s  ON ds.service_id = s.id
WHERE ds.is_active = TRUE AND ds.is_approved = TRUE;

DROP VIEW IF EXISTS public.services_stats CASCADE;
CREATE VIEW public.services_stats AS
SELECT
  s.id AS service_id, s.code AS service_code, s.name AS service_name,
  COUNT(DISTINCT r.id) AS total_rides,
  COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) AS completed_rides,
  COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) AS total_revenue,
  COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.commission ELSE 0 END), 0) AS total_commission,
  COALESCE(AVG(CASE WHEN p.status = 'completed' THEN p.amount END), 0) AS average_fare
FROM public.services s
LEFT JOIN public.rides r    ON r.service_id = s.id
LEFT JOIN public.payments p ON p.ride_id = r.id
GROUP BY s.id, s.code, s.name;

-- ============================================
-- SEED — catálogo de servicios + pricing v2 (fuente: supabase-only.sql +
-- migration-ride-feature-eligibility). IDs fijos para estabilidad entre
-- recreaciones. Idempotente: ON CONFLICT actualiza a los valores canónicos.
-- ============================================
INSERT INTO public.services (id, name, description, code, commission_rate, base_price, price_per_km, price_per_minute, minimum_fare, vehicle_types, requires_special_license, max_distance_km, available_hours, icon, color, display_order, is_active, is_featured)
VALUES
  ('e1cdd47c-9f57-4ed4-93a0-59cdfdffff8a', 'Viaje Normal', 'Servicio estándar de transporte urbano', 'normal', 0.1500, 50.00, 10.00, 0.00, 50.00, '["auto"]'::jsonb, FALSE, NULL, NULL, 'car', '#0A84FF', 1, TRUE, TRUE),
  ('5e88177d-38f2-4864-addc-272dda26ef28', 'Viaje en Moto', 'Transporte rápido en motocicleta', 'motorcycle', 0.0750, 50.00, 8.00, 0.00, 50.00, '["motorcycle"]'::jsonb, FALSE, NULL, NULL, 'motorcycle', '#FFAA00', 2, TRUE, FALSE),
  ('b3c69940-2e43-459f-8c2e-459773c56f8e', 'Conductor Designado Auto', 'Servicio de conductor para auto designado para eventos', 'designated_driver_auto', 0.2500, 50.00, 13.00, 0.00, 50.00, '["auto"]'::jsonb, TRUE, NULL, NULL, 'bar', '#8E44AD', 3, TRUE, TRUE),
  ('f7a4b2c1-3d56-4e89-9f01-2c5b6e7d8a9f', 'Conductor Designado Moto', 'Servicio de conductor designado para moto para eventos', 'designated_driver_moto', 0.1250, 50.00, 13.00, 0.00, 50.00, '["motorcycle"]'::jsonb, TRUE, NULL, NULL, 'bar', '#ad7f44', 4, TRUE, TRUE),
  ('691f8f01-3faf-4e39-aeb7-1bc4dda3fc19', 'Viaje Nocturno (legacy)', 'Legacy reference retained for historical rides; use the night Feature for new rides.', 'night', 0.1200, 40.00, 12.00, 0.00, 40.00, '["auto"]'::jsonb, FALSE, NULL, '{"start": "22:00", "end": "04:00"}'::jsonb, 'moon', '#2C3E50', 5, FALSE, FALSE)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  commission_rate = EXCLUDED.commission_rate,
  base_price = EXCLUDED.base_price,
  price_per_km = EXCLUDED.price_per_km,
  price_per_minute = EXCLUDED.price_per_minute,
  minimum_fare = EXCLUDED.minimum_fare,
  vehicle_types = EXCLUDED.vehicle_types,
  requires_special_license = EXCLUDED.requires_special_license,
  max_distance_km = EXCLUDED.max_distance_km,
  available_hours = EXCLUDED.available_hours,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  is_featured = EXCLUDED.is_featured,
  updated_at = NOW();

-- Features/promos (proyección → DATA-MAIN_features)
INSERT INTO public.features (
  code, name, description, enabled, start_time, end_time, timezone,
  pricing_type, pricing_value, priority, stackable,
  eligibility_subject, eligibility_mode, metadata
) VALUES
  ('night', 'Night', 'Tarifa nocturna aplicable sobre el Service seleccionado',
   TRUE, '22:00', '04:00', 'America/Managua', 'multiplier', 1.10, 10, TRUE,
   'none', 'none', '{}'::jsonb),
  ('designated_driver_moto_discount', 'Ajuste conductor designado moto',
   'Descuento comercial fijo para el Service designated_driver_moto',
   TRUE, NULL, NULL, 'America/Managua', 'discount', 70, 20, TRUE,
   'none', 'none', '{}'::jsonb),
  ('senior', 'Tercera edad',
   'Servicio de auto para personas de tercera edad, incluido conductor designado en auto.',
   TRUE, NULL, NULL, 'America/Managua', 'none', 0, 30, TRUE,
   'none', 'none', '{"defaultSelected":false}'::jsonb),
  ('premium', 'Premium',
   'Viaje premium en auto; requiere que el vehículo cumpla una regla o insignia aprobada.',
   TRUE, NULL, NULL, 'America/Managua', 'none', 0, 40, TRUE,
   'vehicle', 'hybrid', '{"defaultSelected":false}'::jsonb),
  ('pet_friendly', 'Mascotas',
   'Viaje en auto con un conductor habilitado para transportar mascotas.',
   TRUE, NULL, NULL, 'America/Managua', 'none', 0, 50, TRUE,
   'driver', 'manual', '{"defaultSelected":false}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  timezone = EXCLUDED.timezone,
  pricing_type = EXCLUDED.pricing_type,
  pricing_value = EXCLUDED.pricing_value,
  priority = EXCLUDED.priority,
  stackable = EXCLUDED.stackable,
  eligibility_subject = EXCLUDED.eligibility_subject,
  eligibility_mode = EXCLUDED.eligibility_mode,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- Features habilitados por servicio
INSERT INTO public.service_feature_assignments (service_id, feature_id, enabled)
SELECT s.id, f.id, TRUE
FROM public.services s
JOIN public.features f ON f.code = 'night'
WHERE s.code IN ('normal','motorcycle','designated_driver_auto','designated_driver_moto')
ON CONFLICT (service_id, feature_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW();

INSERT INTO public.service_feature_assignments (service_id, feature_id, enabled)
SELECT s.id, f.id, TRUE
FROM public.services s
JOIN public.features f ON f.code = 'designated_driver_moto_discount'
WHERE s.code = 'designated_driver_moto'
ON CONFLICT (service_id, feature_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW();

INSERT INTO public.service_feature_assignments (service_id, feature_id, enabled)
SELECT s.id, f.id, TRUE
FROM public.services s
JOIN public.features f ON f.code IN ('senior','premium','pet_friendly')
WHERE
  (f.code = 'senior' AND s.code IN ('normal', 'designated_driver_auto'))
  OR (f.code = 'premium' AND s.code = 'normal')
  OR (f.code = 'pet_friendly' AND s.code IN ('normal', 'designated_driver_auto'))
ON CONFLICT (service_id, feature_id) DO NOTHING;

-- Reglas de surge (ratio demanda/oferta → multiplicador)
INSERT INTO public.pricing_surge_rules
  (min_demand_supply_ratio, max_demand_supply_ratio, multiplier, priority)
VALUES
  (0.0000, 0.8000, 1.00, 10),
  (0.8000, 1.2000, 1.05, 20),
  (1.2000, 1.5000, 1.15, 30),
  (1.5000, 2.0000, 1.30, 40),
  (2.0000, 3.0000, 1.45, 50),
  (3.0000, NULL,   1.60, 60)
ON CONFLICT (min_demand_supply_ratio) DO UPDATE SET
  max_demand_supply_ratio = EXCLUDED.max_demand_supply_ratio,
  multiplier = EXCLUDED.multiplier,
  priority = EXCLUDED.priority,
  enabled = TRUE,
  updated_at = NOW();

-- 'night' legacy queda inactivo (referencia histórica; el feature 'night' lo reemplaza)
UPDATE public.services
SET is_active = FALSE, updated_at = NOW()
WHERE code = 'night';

COMMIT;
