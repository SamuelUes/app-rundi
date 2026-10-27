-- Conductor designado con colega: capitán (rides.driver_id) + seguidor (rides.follower_driver_id)
-- Aplicada en rundi-dev el 2026-10-26 vía MCP apply_migration.

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS follower_driver_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS follower_status VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS follower_joined_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS follower_left_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS follower_last_latitude NUMERIC(10, 8) NULL,
  ADD COLUMN IF NOT EXISTS follower_last_longitude NUMERIC(11, 8) NULL,
  ADD COLUMN IF NOT EXISTS arrival_vehicle_photo TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_follower_driver_id_fkey') THEN
    ALTER TABLE public.rides
      ADD CONSTRAINT rides_follower_driver_id_fkey
      FOREIGN KEY (follower_driver_id) REFERENCES public.drivers(user_id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_follower_status_check') THEN
    ALTER TABLE public.rides
      ADD CONSTRAINT rides_follower_status_check
      CHECK (follower_status IS NULL OR follower_status IN ('active', 'completed', 'abandoned', 'canceled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_follower_not_captain_check') THEN
    ALTER TABLE public.rides
      ADD CONSTRAINT rides_follower_not_captain_check
      CHECK (follower_driver_id IS NULL OR follower_driver_id <> driver_id);
  END IF;
END $$;

COMMENT ON COLUMN public.rides.follower_driver_id IS 'Firebase UID del conductor designado seguidor (NULL si el viaje fue de un solo conductor). El capitán es driver_id.';
COMMENT ON COLUMN public.rides.follower_status IS 'Estado final del seguidor: active, completed, abandoned, canceled';
COMMENT ON COLUMN public.rides.follower_last_latitude IS 'Última latitud conocida del seguidor (no hay tracking vivo en Supabase)';
COMMENT ON COLUMN public.rides.follower_last_longitude IS 'Última longitud conocida del seguidor';
COMMENT ON COLUMN public.rides.arrival_vehicle_photo IS 'Path en rides-documents de la foto del vehículo en que llegaron los conductores designados';

CREATE INDEX IF NOT EXISTS idx_rides_follower_driver_id_created_at
  ON public.rides USING btree (follower_driver_id, created_at DESC)
  WHERE follower_driver_id IS NOT NULL;

ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS rated_role VARCHAR(20) NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ratings_rated_role_check') THEN
    ALTER TABLE public.ratings
      ADD CONSTRAINT ratings_rated_role_check
      CHECK (rated_role IS NULL OR rated_role IN ('driver', 'captain', 'follower', 'client'));
  END IF;
END $$;

COMMENT ON COLUMN public.ratings.rated_role IS 'Rol del calificado en el viaje: driver (solo), captain, follower, client';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_one_per_target_per_ride
  ON public.ratings (ride_id, from_user_id, to_user_id)
  WHERE deleted_at IS NULL AND ride_id IS NOT NULL;

DROP POLICY IF EXISTS rides_read_client_driver ON public.rides;
CREATE POLICY rides_read_client_driver ON public.rides
  FOR SELECT USING (
    client_id = public.current_firebase_uid()
    OR driver_id = public.current_firebase_uid()
    OR follower_driver_id = public.current_firebase_uid()
  );

DROP POLICY IF EXISTS payments_read_client_driver ON public.payments;
CREATE POLICY payments_read_client_driver ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = public.payments.ride_id
        AND (r.client_id = public.current_firebase_uid()
             OR r.driver_id = public.current_firebase_uid()
             OR r.follower_driver_id = public.current_firebase_uid())
    )
  );

DROP POLICY IF EXISTS ride_locations_read_client_driver ON public.ride_locations;
CREATE POLICY ride_locations_read_client_driver ON public.ride_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = public.ride_locations.ride_id
        AND (r.client_id = public.current_firebase_uid()
             OR r.driver_id = public.current_firebase_uid()
             OR r.follower_driver_id = public.current_firebase_uid())
    )
  );

CREATE OR REPLACE FUNCTION public.find_designated_drivers_by_license(p_license_normalized TEXT)
RETURNS TABLE (
  user_id VARCHAR,
  license_number VARCHAR,
  average_rating NUMERIC,
  designated_rol_requested VARCHAR,
  account_status VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    d.user_id,
    COALESCE(dl.license_number, d.license_number)::VARCHAR,
    d.average_rating,
    d.designated_rol_requested,
    d.account_status
  FROM public.drivers d
  LEFT JOIN public.driver_licenses dl
    ON dl.driver_id = d.id AND dl.is_current = TRUE AND dl.deleted_at IS NULL
  WHERE d.deleted_at IS NULL
    AND length(p_license_normalized) >= 4
    AND (
      regexp_replace(upper(COALESCE(d.license_number, '')), '[^A-Z0-9]', '', 'g') = p_license_normalized
      OR regexp_replace(upper(COALESCE(dl.license_number, '')), '[^A-Z0-9]', '', 'g') = p_license_normalized
    )
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.find_designated_drivers_by_license(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_designated_drivers_by_license(TEXT) TO service_role;
