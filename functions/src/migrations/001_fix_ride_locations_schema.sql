/**
 * MIGRACIÓN: Corregir esquema de ride_locations
 * 
 * Cambios:
 * 1. Crear tabla ride_locations CORRECTA (sin redundancia)
 * 2. Migrar datos existentes si los hay
 * 3. Eliminar campos redundantes de rides
 * 4. Agregar foreign keys correctas
 */

-- ============================================
-- PASO 1: Crear tabla ride_locations CORRECTA
-- ============================================

DROP TABLE IF EXISTS public.ride_locations CASCADE;

CREATE TABLE public.ride_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL,
  location_type character varying(20) NOT NULL,  -- 'origin', 'waypoint', 'destination'
  location_order integer NOT NULL,                -- 1, 2, 3, ...
  latitude numeric(10, 8) NOT NULL,
  longitude numeric(11, 8) NOT NULL,
  address text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  
  CONSTRAINT ride_locations_pkey PRIMARY KEY (id),
  CONSTRAINT fk_ride_locations_ride FOREIGN KEY (ride_id) 
    REFERENCES public.rides(id) ON DELETE CASCADE,
  CONSTRAINT unique_ride_location_order UNIQUE(ride_id, location_order)
);

-- Índices para optimizar queries
CREATE INDEX idx_ride_locations_ride_id ON public.ride_locations USING btree (ride_id);
CREATE INDEX idx_ride_locations_type ON public.ride_locations USING btree (location_type);
CREATE INDEX idx_ride_locations_order ON public.ride_locations USING btree (ride_id, location_order);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_ride_locations_updated_at 
BEFORE UPDATE ON public.ride_locations 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PASO 2: Eliminar campos redundantes de rides
-- ============================================

-- Eliminar foreign keys que apuntan a ride_locations
ALTER TABLE public.rides 
DROP CONSTRAINT IF EXISTS rides_destination_location_fkey,
DROP CONSTRAINT IF EXISTS rides_origin_location_fkey;

-- Eliminar columnas redundantes
ALTER TABLE public.rides
DROP COLUMN IF EXISTS origin_lat,
DROP COLUMN IF EXISTS origin_lng,
DROP COLUMN IF EXISTS origin_address,
DROP COLUMN IF EXISTS destination_lat,
DROP COLUMN IF EXISTS destination_lng,
DROP COLUMN IF EXISTS destination_address,
DROP COLUMN IF EXISTS extra_destinations,
DROP COLUMN IF EXISTS origin_location_id,
DROP COLUMN IF EXISTS destination_location_id;

-- ============================================
-- PASO 3: Agregar índices optimizados en rides
-- ============================================

-- Índices ya existentes (verificar)
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides USING btree (status);
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON public.rides USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_rides_client_id ON public.rides USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_rides_vehicle_type ON public.rides USING btree (vehicle_type);
CREATE INDEX IF NOT EXISTS idx_rides_payment_type ON public.rides USING btree (payment_type);
CREATE INDEX IF NOT EXISTS idx_rides_firebase_ride_id ON public.rides USING btree (firebase_ride_id);
CREATE INDEX IF NOT EXISTS idx_rides_waypoints_count ON public.rides USING btree (waypoints_count) 
  WHERE (waypoints_count > 0);
CREATE INDEX IF NOT EXISTS idx_rides_multiple_stops ON public.rides USING btree (has_multiple_stops) 
  WHERE (has_multiple_stops = true);

-- ============================================
-- PASO 4: Verificar integridad
-- ============================================

-- Contar registros en ambas tablas
SELECT 
  (SELECT COUNT(*) FROM public.rides) as total_rides,
  (SELECT COUNT(*) FROM public.ride_locations) as total_locations;
