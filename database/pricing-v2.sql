-- Pricing 2.0: reusable service features, configurable surge, and ride snapshots.
-- Apply after reviewing against the target Supabase schema.

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
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

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
  CHECK (
    max_demand_supply_ratio IS NULL
    OR max_demand_supply_ratio > min_demand_supply_ratio
  )
);

CREATE INDEX IF NOT EXISTS idx_pricing_surge_rules_enabled
  ON public.pricing_surge_rules(enabled, priority);

DROP TRIGGER IF EXISTS update_features_updated_at ON public.features;
CREATE TRIGGER update_features_updated_at
  BEFORE UPDATE ON public.features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_service_feature_assignments_updated_at ON public.service_feature_assignments;
CREATE TRIGGER update_service_feature_assignments_updated_at
  BEFORE UPDATE ON public.service_feature_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_pricing_surge_rules_updated_at ON public.pricing_surge_rules;
CREATE TRIGGER update_pricing_surge_rules_updated_at
  BEFORE UPDATE ON public.pricing_surge_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

INSERT INTO public.features (
  code, name, description, enabled, start_time, end_time, timezone,
  pricing_type, pricing_value, priority, stackable
)
VALUES (
  'night', 'Night', 'Tarifa nocturna aplicable sobre el Service seleccionado',
  TRUE, '22:00', '04:00', 'America/Managua', 'multiplier', 1.10, 10, TRUE
)
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
  updated_at = NOW();

INSERT INTO public.features (
  code, name, description, enabled, timezone,
  pricing_type, pricing_value, priority, stackable
)
VALUES (
  'designated_driver_moto_discount',
  'Ajuste conductor designado moto',
  'Descuento comercial fijo para el Service designated_driver_moto',
  TRUE, 'America/Managua', 'discount', 70, 20, TRUE
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  pricing_type = EXCLUDED.pricing_type,
  pricing_value = EXCLUDED.pricing_value,
  priority = EXCLUDED.priority,
  stackable = EXCLUDED.stackable,
  updated_at = NOW();

INSERT INTO public.service_feature_assignments (service_id, feature_id, enabled)
SELECT services.id, features.id, TRUE
FROM public.services AS services
CROSS JOIN public.features AS features
WHERE services.code IN (
  'normal',
  'motorcycle',
  'designated_driver_auto',
  'designated_driver_moto'
)
  AND features.code = 'night'
ON CONFLICT (service_id, feature_id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

INSERT INTO public.service_feature_assignments (service_id, feature_id, enabled)
SELECT services.id, features.id, TRUE
FROM public.services AS services
CROSS JOIN public.features AS features
WHERE services.code = 'designated_driver_moto'
  AND features.code = 'designated_driver_moto_discount'
ON CONFLICT (service_id, feature_id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

-- Stop offering the legacy fifth Service while retaining its row for historical references.
UPDATE public.services
SET is_active = FALSE,
    updated_at = NOW()
WHERE code = 'night';

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB NULL,
  ADD COLUMN IF NOT EXISTS feature_codes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS commission_rate_applied NUMERIC(5, 4) NULL;

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_feature_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_surge_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS features_enabled_read ON public.features;
CREATE POLICY features_enabled_read ON public.features
  FOR SELECT TO authenticated USING (enabled = TRUE);

DROP POLICY IF EXISTS features_admin_manage ON public.features;
CREATE POLICY features_admin_manage ON public.features
  FOR ALL TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS service_feature_assignments_enabled_read ON public.service_feature_assignments;
CREATE POLICY service_feature_assignments_enabled_read ON public.service_feature_assignments
  FOR SELECT TO authenticated USING (enabled = TRUE);

DROP POLICY IF EXISTS service_feature_assignments_admin_manage ON public.service_feature_assignments;
CREATE POLICY service_feature_assignments_admin_manage ON public.service_feature_assignments
  FOR ALL TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS pricing_surge_rules_enabled_read ON public.pricing_surge_rules;
CREATE POLICY pricing_surge_rules_enabled_read ON public.pricing_surge_rules
  FOR SELECT TO authenticated USING (enabled = TRUE);

DROP POLICY IF EXISTS pricing_surge_rules_admin_manage ON public.pricing_surge_rules;
CREATE POLICY pricing_surge_rules_admin_manage ON public.pricing_surge_rules
  FOR ALL TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

REVOKE INSERT, UPDATE, DELETE ON public.features FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.service_feature_assignments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pricing_surge_rules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.features TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_feature_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_surge_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.features TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_feature_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_surge_rules TO service_role;
