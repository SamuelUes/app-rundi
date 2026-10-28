ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS eligibility_subject VARCHAR(24) NOT NULL DEFAULT 'none'
    CHECK (eligibility_subject IN ('none', 'driver', 'vehicle')),
  ADD COLUMN IF NOT EXISTS eligibility_mode VARCHAR(24) NOT NULL DEFAULT 'none'
    CHECK (eligibility_mode IN ('none', 'manual', 'automatic', 'hybrid')),
  ADD COLUMN IF NOT EXISTS eligibility_rules JSONB NOT NULL DEFAULT '{}'::jsonb;

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

CREATE INDEX IF NOT EXISTS idx_driver_feature_assignments_active
  ON public.driver_feature_assignments(driver_id, feature_id, expires_at)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_driver_feature_assignments_feature
  ON public.driver_feature_assignments(feature_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vehicle_feature_assignments_active
  ON public.vehicle_feature_assignments(vehicle_id, feature_id, expires_at)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_vehicle_feature_assignments_feature
  ON public.vehicle_feature_assignments(feature_id, is_active);

DROP TRIGGER IF EXISTS update_driver_feature_assignments_updated_at ON public.driver_feature_assignments;
CREATE TRIGGER update_driver_feature_assignments_updated_at
  BEFORE UPDATE ON public.driver_feature_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_vehicle_feature_assignments_updated_at ON public.vehicle_feature_assignments;
CREATE TRIGGER update_vehicle_feature_assignments_updated_at
  BEFORE UPDATE ON public.vehicle_feature_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.driver_feature_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_feature_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.driver_feature_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vehicle_feature_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_feature_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_feature_assignments TO service_role;

INSERT INTO public.features (
  code, name, description, enabled, pricing_type, pricing_value, priority, stackable,
  eligibility_subject, eligibility_mode, eligibility_rules, metadata
)
VALUES
  (
    'senior',
    'Tercera edad',
    'Servicio de auto para personas de tercera edad, incluido conductor designado en auto.',
    TRUE, 'none', 0, 30, TRUE, 'none', 'none', '{}'::jsonb, '{"defaultSelected":false}'::jsonb
  ),
  (
    'premium',
    'Premium',
    'Viaje premium en auto; requiere que el vehículo cumpla una regla o insignia aprobada.',
    TRUE, 'none', 0, 40, TRUE, 'vehicle', 'hybrid', '{}'::jsonb, '{"defaultSelected":false}'::jsonb
  ),
  (
    'pet_friendly',
    'Mascotas',
    'Viaje en auto con un conductor habilitado para transportar mascotas.',
    TRUE, 'none', 0, 50, TRUE, 'driver', 'manual', '{}'::jsonb, '{"defaultSelected":false}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.service_feature_assignments (service_id, feature_id, enabled)
SELECT services.id, features.id, TRUE
FROM public.services AS services
CROSS JOIN public.features AS features
WHERE
  (features.code = 'senior' AND services.code IN ('normal', 'designated_driver_auto'))
  OR (features.code = 'premium' AND services.code = 'normal')
  OR (features.code = 'pet_friendly' AND services.code IN ('normal', 'designated_driver_auto'))
ON CONFLICT (service_id, feature_id) DO NOTHING;
