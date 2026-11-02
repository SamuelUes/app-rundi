-- ============================================================================
-- 0003_rides.sql — rides (+version), ride_locations (ruta contratada),
-- ride_track_points (telemetría GPS), ride_offers (auditoría de ofertas),
-- emergency_calls, designated_driver_inspections + helpers de ruta +
-- audit trigger.
-- Fuente: supabase-only.sql §3,§6-§9 + migration-designated-driver-crew.sql.
-- Cambios vs baseline:
--   + rides.version INTEGER (optimistic concurrency, doc §FASE 1)
--   + rides.service_area_id (contexto de matching persistido; antes solo
--     viajaba en el payload del outbox y la reconciliación no podía re-derivarlo)
--   + UNIQUE parcial: un cliente no puede tener dos viajes activos
--     (restaurado del baseline — cierra la carrera de doble createRide)
--   + firebase_ride_id UNIQUE (clave puente a REALTIME_trips_live)
--   + ride_track_points NUEVA: telemetría separada de la ruta contratada
--     (con recorded_at del cliente; antes se descartaba el timestamp)
--   + ride_offers NUEVA: historial/auditoría de ofertas y contraofertas
--     (doc §7.1: "ofertas y expiración deben mantener historial")
--   - 'searching'/'pending_rating' son estados live de REALTIME_trips_live,
--     no terminales SQL (ver comentario en 0001_enums).
-- Convención v2: TODOS los timestamps son TIMESTAMPTZ.
-- ============================================================================

BEGIN;

-- ============================================
-- RIDES — fuente de verdad transaccional de viajes
-- ============================================
CREATE TABLE IF NOT EXISTS public.rides (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Puente al doc vivo en Firestore (REALTIME_trips_live/{firebase_ride_id})
  firebase_ride_id VARCHAR(255) NULL,

  -- Participantes (Firebase UIDs → users.id)
  client_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255) NULL,

  -- Contexto de matching (área lógica; catálogo vive en DATA-MAIN_service_areas)
  service_area_id VARCHAR(100) NULL,

  -- Métricas estimadas / reales
  estimated_distance INTEGER NULL,
  estimated_duration INTEGER NULL,
  actual_distance INTEGER NULL,
  actual_duration INTEGER NULL,

  -- Precios
  estimated_price DECIMAL(10, 2) NULL,
  final_fare DECIMAL(10, 2) NULL,
  client_suggested_price DECIMAL(10, 2) NULL,
  driver_offered_price DECIMAL(10, 2) NULL,

  -- Snapshot de pricing aplicado (Pricing v2) — ver services/features en 0005
  pricing_snapshot JSONB NULL,

  -- Información adicional
  passengers INTEGER NULL DEFAULT 1,
  notes TEXT NULL,
  ride_type public.ride_type NULL DEFAULT 'normal',
  vehicle_type VARCHAR(50) NULL DEFAULT 'auto'::VARCHAR,
  designated_driver_vehicle public.designated_driver_vehicle NULL,
  client_vehicle_photo TEXT NULL,               -- objectPath Storage

  -- Conductor designado con colega (capitán = driver_id)
  follower_driver_id VARCHAR(255) NULL,
  follower_status public.ride_follower_status NULL,
  follower_joined_at TIMESTAMPTZ NULL,
  follower_left_at TIMESTAMPTZ NULL,
  follower_last_latitude NUMERIC(10, 8) NULL,   -- última posición conocida (histórico)
  follower_last_longitude NUMERIC(11, 8) NULL,
  arrival_vehicle_photo TEXT NULL,              -- objectPath Storage

  -- Paradas
  waypoints_count INTEGER NULL DEFAULT 0,
  has_multiple_stops BOOLEAN NULL DEFAULT FALSE,
  origin_location_id UUID NULL,                 -- → ride_locations.id (FK abajo)
  destination_location_id UUID NULL,            -- → ride_locations.id (FK abajo)

  -- Servicio aplicado (pricing) — FK agregada en 0005 (services se crea allí)
  service_id UUID NULL,

  -- Pago
  payment_type public.ride_payment_type NULL DEFAULT 'cash',

  -- Aceptación biométrica
  biometric_acceptance_required BOOLEAN NULL DEFAULT FALSE,
  biometric_acceptance_type public.biometric_type NULL,
  biometric_acceptance_verified BOOLEAN NULL DEFAULT FALSE,
  biometric_acceptance_at TIMESTAMPTZ NULL,

  -- Estado y concurrencia
  status public.ride_status NOT NULL DEFAULT 'requested',
  version INTEGER NOT NULL DEFAULT 1,           -- optimistic concurrency
  cancel_reason TEXT NULL,
  canceled_by public.ride_canceled_by NULL,

  -- Timestamps
  requested_at TIMESTAMPTZ NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  canceled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT rides_pkey PRIMARY KEY (id),
  CONSTRAINT rides_follower_not_captain_check CHECK (follower_driver_id IS NULL OR follower_driver_id <> driver_id),
  CONSTRAINT rides_estimated_price_nonneg CHECK (estimated_price IS NULL OR estimated_price >= 0),
  CONSTRAINT rides_final_fare_nonneg CHECK (final_fare IS NULL OR final_fare >= 0),
  CONSTRAINT rides_client_suggested_nonneg CHECK (client_suggested_price IS NULL OR client_suggested_price >= 0),
  CONSTRAINT rides_driver_offered_nonneg CHECK (driver_offered_price IS NULL OR driver_offered_price >= 0),
  CONSTRAINT rides_passengers_positive CHECK (passengers IS NULL OR passengers > 0),
  CONSTRAINT rides_distances_nonneg CHECK (
    (estimated_distance IS NULL OR estimated_distance >= 0) AND
    (actual_distance IS NULL OR actual_distance >= 0)),
  CONSTRAINT rides_durations_nonneg CHECK (
    (estimated_duration IS NULL OR estimated_duration >= 0) AND
    (actual_duration IS NULL OR actual_duration >= 0)),
  CONSTRAINT rides_coords_valid CHECK (
    (follower_last_latitude IS NULL OR follower_last_latitude BETWEEN -90 AND 90) AND
    (follower_last_longitude IS NULL OR follower_last_longitude BETWEEN -180 AND 180))
);

-- UPGRADE: columnas que el CREATE saltó si rides ya existía (deploy viejo).
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS service_area_id VARCHAR(100);
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS origin_location_id UUID;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS destination_location_id UUID;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS service_id UUID;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS follower_driver_id VARCHAR(255);
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS canceled_by public.ride_canceled_by;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS biometric_acceptance_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS biometric_acceptance_verified BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON TABLE public.rides IS 'Fuente de verdad transaccional de viajes. Estado en vivo se proyecta a Firestore REALTIME_trips_live via Outbox. Ruta en ride_locations; telemetría en ride_track_points.';
COMMENT ON COLUMN public.rides.firebase_ride_id IS 'ID del documento vivo (RTDB hoy, Firestore REALTIME_trips_live en v2). UNIQUE: un doc vivo ↔ una fila SQL.';
COMMENT ON COLUMN public.rides.service_area_id IS 'Área de servicio lógica (DATA-MAIN_service_areas/{id}). Persistida para matching y reconciliación.';
COMMENT ON COLUMN public.rides.client_id IS 'Firebase UID del cliente → users.id';
COMMENT ON COLUMN public.rides.driver_id IS 'Firebase UID del capitán → drivers.user_id. El seguidor es follower_driver_id.';
COMMENT ON COLUMN public.rides.version IS 'Optimistic concurrency; todo UPDATE de transición exige version = esperada (ver rides commands en functions-v2).';
COMMENT ON COLUMN public.rides.payment_type IS 'cash | card_local. ''stripe'' solo legacy histórico.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_driver_id_fkey') THEN
    ALTER TABLE public.rides ADD CONSTRAINT rides_driver_id_fkey
      FOREIGN KEY (driver_id) REFERENCES public.drivers(user_id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_follower_driver_id_fkey') THEN
    ALTER TABLE public.rides ADD CONSTRAINT rides_follower_driver_id_fkey
      FOREIGN KEY (follower_driver_id) REFERENCES public.drivers(user_id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_client_id_fkey') THEN
    ALTER TABLE public.rides ADD CONSTRAINT rides_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.users(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

-- Clave puente al doc vivo: un firebase_ride_id no puede pertenecer a dos rides.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rides_firebase_ride_id
  ON public.rides (firebase_ride_id) WHERE firebase_ride_id IS NOT NULL;

-- Idempotencia a nivel DB: un cliente no puede tener dos viajes activos.
-- El partial unique index cierra la carrera entre dos createRide simultáneos
-- (el check en código solo protege lecturas secuenciales).
-- 'completed'/'canceled'/'rating_completed'/'rating_skipped' liberan al cliente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rides_one_active_per_client
  ON public.rides (client_id)
  WHERE deleted_at IS NULL
    AND status IN (
      'requested', 'driver_offered', 'accepted', 'driver_on_route',
      'driver_arrived', 'in_progress', 'pending_payment'
    );

CREATE INDEX IF NOT EXISTS idx_rides_service_area_id ON public.rides USING btree (service_area_id) WHERE service_area_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rides_service_id ON public.rides USING btree (service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides USING btree (status);
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON public.rides USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_vehicle_type ON public.rides USING btree (vehicle_type);
CREATE INDEX IF NOT EXISTS idx_rides_canceled_by ON public.rides USING btree (canceled_by) WHERE canceled_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rides_biometric_required ON public.rides USING btree (biometric_acceptance_required) WHERE biometric_acceptance_required = TRUE;
CREATE INDEX IF NOT EXISTS idx_rides_biometric_verified ON public.rides USING btree (biometric_acceptance_verified) WHERE biometric_acceptance_verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_rides_origin_location_id ON public.rides USING btree (origin_location_id);
CREATE INDEX IF NOT EXISTS idx_rides_destination_location_id ON public.rides USING btree (destination_location_id);
CREATE INDEX IF NOT EXISTS idx_rides_follower_driver_id_created_at ON public.rides USING btree (follower_driver_id, created_at DESC) WHERE follower_driver_id IS NOT NULL;
-- Compuestos cubren las consultas por actor (+estado, +historial); los índices
-- simples client_id/driver_id quedaron redundantes y se eliminaron.
CREATE INDEX IF NOT EXISTS idx_rides_client_id_status ON public.rides USING btree (client_id, status);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id_status ON public.rides USING btree (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_rides_client_id_created_at ON public.rides USING btree (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id_created_at ON public.rides USING btree (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_deleted_at ON public.rides USING btree (deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_rides_updated_at ON public.rides;
CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RIDE_LOCATIONS — SOLO ruta contratada (origin → waypoints → destination).
-- La telemetría GPS vive en ride_track_points (dominio y volumen distintos).
-- ============================================
CREATE TABLE IF NOT EXISTS public.ride_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL,
  location_type public.ride_location_type NOT NULL,
  location_order INTEGER NOT NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT ride_locations_pkey PRIMARY KEY (id),
  CONSTRAINT ride_locations_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE RESTRICT,
  CONSTRAINT unique_ride_location_order UNIQUE(ride_id, location_order),
  CONSTRAINT ride_locations_coords_valid CHECK (
    latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);
COMMENT ON TABLE public.ride_locations IS 'Ruta contratada del viaje (origin/waypoint/destination). Telemetría GPS → ride_track_points.';
COMMENT ON COLUMN public.ride_locations.location_order IS 'origin=0, waypoints=1..n, destination=n+1. UNIQUE por ride.';

CREATE INDEX IF NOT EXISTS idx_ride_locations_ride_id ON public.ride_locations USING btree (ride_id);
-- unique_ride_location_order ya cubre (ride_id, location_order).

DROP TRIGGER IF EXISTS update_ride_locations_updated_at ON public.ride_locations;
CREATE TRIGGER update_ride_locations_updated_at BEFORE UPDATE ON public.ride_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FKs diferidas: rides.origin/destination_location_id → ride_locations.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_origin_location_id_fkey') THEN
    ALTER TABLE public.rides ADD CONSTRAINT rides_origin_location_id_fkey
      FOREIGN KEY (origin_location_id) REFERENCES public.ride_locations(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rides_destination_location_id_fkey') THEN
    ALTER TABLE public.rides ADD CONSTRAINT rides_destination_location_id_fkey
      FOREIGN KEY (destination_location_id) REFERENCES public.ride_locations(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- ============================================
-- RIDE_TRACK_POINTS (NUEVA) — telemetría GPS batched del viaje.
-- Separada de ride_locations: dominio append-only de alto volumen con su
-- propio timestamp de muestreo (recorded_at = hora del cliente, created_at =
-- hora de persistencia). Sin UNIQUE artificial: el orden es cronológico.
-- Candidata a partición mensual si el volumen lo justifica (doc §7.2).
-- ============================================
CREATE TABLE IF NOT EXISTS public.ride_track_points (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,             -- hora real de la muestra (cliente)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ride_track_points_pkey PRIMARY KEY (id),
  CONSTRAINT ride_track_points_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE,
  CONSTRAINT ride_track_points_coords_valid CHECK (
    latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);
COMMENT ON TABLE public.ride_track_points IS 'Muestras GPS del viaje (antes ride_locations type=''tracking''). Append-only; el batch del API envía recorded_at.';

CREATE INDEX IF NOT EXISTS idx_ride_track_points_ride_recorded
  ON public.ride_track_points USING btree (ride_id, recorded_at DESC);

-- ============================================
-- RIDE_OFFERS (NUEVA) — historial/auditoría de ofertas y contraofertas.
-- Doc §7.1: "Negociación de tarifa, ofertas y expiración deben mantener
-- historial/auditoría". La oferta viva es REALTIME_driver_offers; esta tabla
-- es el registro durable escrito por el consumer/API.
-- ============================================
CREATE TABLE IF NOT EXISTS public.ride_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL,
  driver_id VARCHAR(255) NOT NULL,              -- Firebase UID → drivers.user_id
  kind public.ride_offer_kind NOT NULL DEFAULT 'offer',
  status public.ride_offer_status NOT NULL DEFAULT 'sent',
  offered_price DECIMAL(10, 2) NULL,            -- precio en counter_offer
  distance_km NUMERIC(8, 3) NULL,               -- distancia driver↔origen al despachar
  expires_at TIMESTAMPTZ NULL,
  responded_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ride_offers_pkey PRIMARY KEY (id),
  CONSTRAINT ride_offers_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE,
  CONSTRAINT ride_offers_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(user_id) ON DELETE RESTRICT,
  CONSTRAINT ride_offers_price_nonneg CHECK (offered_price IS NULL OR offered_price > 0),
  CONSTRAINT ride_offers_counter_price CHECK (kind <> 'counter_offer' OR offered_price IS NOT NULL)
);
COMMENT ON TABLE public.ride_offers IS 'Auditoría durable de ofertas despachadas (kind=offer) y contraofertas (kind=counter_offer). El estado vivo es REALTIME_driver_offers.';

CREATE INDEX IF NOT EXISTS idx_ride_offers_ride ON public.ride_offers USING btree (ride_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ride_offers_driver ON public.ride_offers USING btree (driver_id, status);
-- Una oferta despachada por driver/ride (upsert del consumer); las
-- counter_offers del driver son append libre (historial de negociación).
CREATE UNIQUE INDEX IF NOT EXISTS ride_offers_one_dispatch
  ON public.ride_offers (ride_id, driver_id) WHERE kind = 'offer';

DROP TRIGGER IF EXISTS update_ride_offers_updated_at ON public.ride_offers;
CREATE TRIGGER update_ride_offers_updated_at BEFORE UPDATE ON public.ride_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --- Resumen de ruta (waypoints_count / has_multiple_stops) ---
CREATE OR REPLACE FUNCTION public.update_ride_route_summary(p_ride_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.rides
  SET
    waypoints_count = COALESCE((
      SELECT COUNT(*) FROM public.ride_locations
      WHERE ride_id = p_ride_id AND location_type = 'waypoint'
    ), 0),
    has_multiple_stops = COALESCE((
      SELECT COUNT(*) FROM public.ride_locations
      WHERE ride_id = p_ride_id AND location_type = 'waypoint'
    ), 0) > 0,
    updated_at = NOW()
  WHERE id = p_ride_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trigger_update_ride_summary_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location_type = 'waypoint' THEN
    PERFORM public.update_ride_route_summary(NEW.ride_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trigger_update_ride_summary_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.location_type = 'waypoint' THEN
    PERFORM public.update_ride_route_summary(OLD.ride_id);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ride_summary_on_waypoint_insert ON public.ride_locations;
CREATE TRIGGER update_ride_summary_on_waypoint_insert
AFTER INSERT ON public.ride_locations
FOR EACH ROW EXECUTE FUNCTION public.trigger_update_ride_summary_on_insert();

DROP TRIGGER IF EXISTS update_ride_summary_on_waypoint_delete ON public.ride_locations;
CREATE TRIGGER update_ride_summary_on_waypoint_delete
AFTER DELETE ON public.ride_locations
FOR EACH ROW EXECUTE FUNCTION public.trigger_update_ride_summary_on_delete();

-- --- Vistas y helpers de ruta (portados) ---
-- DROP+CREATE (no OR REPLACE): el deploy viejo puede traer la vista con otras
-- columnas y OR REPLACE no puede renombrar/quitar columnas de vista.
DROP VIEW IF EXISTS public.rides_with_complete_route CASCADE;
CREATE VIEW public.rides_with_complete_route AS
SELECT
  r.*,
  rl_origin.id          AS origin_location_id_detail,
  rl_origin.latitude    AS origin_latitude,
  rl_origin.longitude   AS origin_longitude,
  rl_origin.address     AS origin_address,
  rl_dest.id            AS destination_location_id_detail,
  rl_dest.latitude      AS destination_latitude,
  rl_dest.longitude     AS destination_longitude,
  rl_dest.address       AS destination_address,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', w.id,
        'lat', w.latitude,
        'lng', w.longitude,
        'address', w.address,
        'location_order', w.location_order
      ) ORDER BY w.location_order
    )
    FROM public.ride_locations w
    WHERE w.ride_id = r.id AND w.location_type = 'waypoint'
  ), '[]'::json) AS waypoints
FROM public.rides r
LEFT JOIN public.ride_locations rl_origin
  ON rl_origin.ride_id = r.id AND rl_origin.location_type = 'origin'
LEFT JOIN public.ride_locations rl_dest
  ON rl_dest.ride_id = r.id AND rl_dest.location_type = 'destination';

-- upgrade: la firma (OUT params) cambió vs legacy — OR REPLACE no puede cambiar
-- el return type; drop primero (sin deps: es RPC, no la usa ninguna vista).
DROP FUNCTION IF EXISTS public.get_ride_route(uuid);
CREATE OR REPLACE FUNCTION public.get_ride_route(p_ride_id UUID)
RETURNS TABLE (
  id UUID, ride_id UUID, lat NUMERIC, lng NUMERIC,
  location_type VARCHAR, address TEXT, place_name TEXT,
  waypoint_order INTEGER, point_timestamp TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rl.id, rl.ride_id, rl.latitude, rl.longitude, rl.location_type::VARCHAR,
    rl.address, NULL::TEXT,
    CASE WHEN rl.location_type = 'waypoint' THEN rl.location_order ELSE NULL::INTEGER END,
    rl.created_at
  FROM public.ride_locations rl
  WHERE rl.ride_id = p_ride_id
  ORDER BY rl.location_order ASC;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.get_ride_tracking(uuid, integer);
CREATE OR REPLACE FUNCTION public.get_ride_tracking(p_ride_id UUID, p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id UUID, lat NUMERIC, lng NUMERIC, speed NUMERIC,
  heading NUMERIC, accuracy NUMERIC, point_timestamp TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT tp.id, tp.latitude, tp.longitude, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, tp.recorded_at
  FROM public.ride_track_points tp
  WHERE tp.ride_id = p_ride_id
  ORDER BY tp.recorded_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.calculate_ride_distance(p_ride_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_distance NUMERIC := 0;
  prev_lat NUMERIC; prev_lng NUMERIC;
  curr_lat NUMERIC; curr_lng NUMERIC;
BEGIN
  FOR prev_lat, prev_lng, curr_lat, curr_lng IN
    SELECT
      LAG(latitude) OVER (ORDER BY location_order),
      LAG(longitude) OVER (ORDER BY location_order),
      latitude, longitude
    FROM public.ride_locations
    WHERE ride_id = p_ride_id
  LOOP
    IF prev_lat IS NOT NULL AND prev_lng IS NOT NULL THEN
      total_distance := total_distance + (
        6371000 * acos(
          cos(radians(prev_lat)) * cos(radians(curr_lat)) *
          cos(radians(curr_lng) - radians(prev_lng)) +
          sin(radians(prev_lat)) * sin(radians(curr_lat))
        )
      );
    END IF;
  END LOOP;
  RETURN total_distance;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.get_ride_waypoints(uuid);
CREATE OR REPLACE FUNCTION public.get_ride_waypoints(p_ride_id UUID)
RETURNS TABLE (
  id UUID, waypoint_order INTEGER, lat NUMERIC, lng NUMERIC,
  address TEXT, place_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT rl.id, rl.location_order, rl.latitude, rl.longitude, rl.address, NULL::TEXT
  FROM public.ride_locations rl
  WHERE rl.ride_id = p_ride_id AND rl.location_type = 'waypoint'
  ORDER BY rl.location_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- EMERGENCY_CALLS
-- ============================================
CREATE TABLE IF NOT EXISTS public.emergency_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  user_role public.app_role NOT NULL,
  emergency_type public.emergency_type NOT NULL,
  emergency_number VARCHAR(10) NOT NULL,
  lat NUMERIC(10, 8) NULL,
  lng NUMERIC(11, 8) NULL,
  address TEXT NULL,
  ride_id UUID NULL,
  notes TEXT NULL,
  call_status public.emergency_call_status NULL DEFAULT 'initiated',
  called_at TIMESTAMPTZ NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT emergency_calls_pkey PRIMARY KEY (id),
  CONSTRAINT emergency_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT emergency_calls_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL,
  CONSTRAINT emergency_calls_coords_valid CHECK (
    (lat IS NULL OR lat BETWEEN -90 AND 90) AND
    (lng IS NULL OR lng BETWEEN -180 AND 180))
);

CREATE INDEX IF NOT EXISTS idx_emergency_calls_user ON public.emergency_calls USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_ride ON public.emergency_calls USING btree (ride_id) WHERE ride_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_emergency_calls_updated_at ON public.emergency_calls;
CREATE TRIGGER update_emergency_calls_updated_at BEFORE UPDATE ON public.emergency_calls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- DESIGNATED_DRIVER_INSPECTIONS — evidencia fotográfica conductor designado
-- ============================================
CREATE TABLE IF NOT EXISTS public.designated_driver_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL,
  driver_id VARCHAR(255) NOT NULL,              -- Firebase UID → drivers.user_id
  vehicle_front_photo VARCHAR(500) NULL,
  vehicle_rear_photo VARCHAR(500) NULL,
  interior_front_photo VARCHAR(500) NULL,
  interior_rear_photo VARCHAR(500) NULL,
  status public.inspection_status NULL DEFAULT 'completed',
  inspected_at TIMESTAMPTZ NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT designated_driver_inspections_pkey PRIMARY KEY (id),
  CONSTRAINT designated_driver_inspections_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE RESTRICT,
  CONSTRAINT designated_driver_inspections_driver_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ddi_ride_id ON public.designated_driver_inspections USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_ddi_driver_id ON public.designated_driver_inspections USING btree (driver_id);

DROP TRIGGER IF EXISTS update_ddi_updated_at ON public.designated_driver_inspections;
CREATE TRIGGER update_ddi_updated_at BEFORE UPDATE ON public.designated_driver_inspections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- --- Auditoría de cambios de estado de rides (portado; sin SECURITY DEFINER/REVOKE) ---
CREATE OR REPLACE FUNCTION public.audit_ride_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_log (actor_uid, actor_role, action, entity_type, entity_id, changes, source)
    VALUES (
      COALESCE(NEW.driver_id::text, NEW.client_id::text, 'system'),
      COALESCE(
        CASE WHEN NEW.driver_id IS NOT NULL THEN 'driver' END,
        CASE WHEN NEW.client_id IS NOT NULL THEN 'client' END,
        'system'
      )::public.app_role,
      'update', 'ride', NEW.id::text,
      jsonb_build_object(
        'before', jsonb_build_object('status', OLD.status),
        'after', jsonb_build_object('status', NEW.status)
      ),
      'trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.audit_ride_status_change() IS 'Registra cambios de status de rides en audit_log. Requiere audit_log (0007_platform.sql).';

COMMIT;
