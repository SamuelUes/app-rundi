-- ============================================
-- SUPABASE POSTGRESQL - ESQUEMAS DE PRODUCCIÓN
-- DriveAngel.ni
-- Actualizado: 2025-10-13
-- ============================================
-- 
-- IMPORTANTE: Estos son los esquemas EXACTOS de producción
-- Sincronizados con la base de datos de Supabase
-- ============================================

-- ============================================
-- FUNCIÓN HELPER PARA TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- ANALYTICS_EVENTS TABLE
-- ============================================
CREATE TABLE public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  platform VARCHAR(20) NULL,
  app_version VARCHAR(20) NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON public.analytics_events USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_events USING btree (event_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_events USING btree (created_at) TABLESPACE pg_default;

-- ============================================
-- DRIVERS TABLE
-- ============================================
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  license_number VARCHAR(50) NULL,
  license_expiry DATE NULL,
  license_photo VARCHAR(500) NULL,
  status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  total_rides INTEGER NULL DEFAULT 0,
  average_rating NUMERIC(3, 2) NULL DEFAULT 0,
  total_earnings NUMERIC(10, 2) NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT drivers_pkey PRIMARY KEY (id),
  CONSTRAINT drivers_user_id_key UNIQUE (user_id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers USING btree (status) TABLESPACE pg_default;

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- EMERGENCY_CALLS TABLE
-- ============================================
CREATE TABLE public.emergency_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  user_role VARCHAR(20) NOT NULL,
  emergency_type VARCHAR(20) NOT NULL,
  emergency_number VARCHAR(10) NOT NULL,
  lat NUMERIC(10, 8) NULL,
  lng NUMERIC(11, 8) NULL,
  address TEXT NULL,
  ride_id UUID NULL,
  notes TEXT NULL,
  call_status VARCHAR(20) NULL DEFAULT 'initiated'::VARCHAR,
  called_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT emergency_calls_pkey PRIMARY KEY (id),
  CONSTRAINT emergency_calls_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE SET NULL
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_emergency_calls_user_id ON public.emergency_calls USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_emergency_calls_ride_id ON public.emergency_calls USING btree (ride_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_emergency_calls_type ON public.emergency_calls USING btree (emergency_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_emergency_calls_created_at ON public.emergency_calls USING btree (created_at) TABLESPACE pg_default;

CREATE TRIGGER update_emergency_calls_updated_at BEFORE UPDATE ON emergency_calls
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  amount NUMERIC(10, 2) NOT NULL,
  tip NUMERIC(10, 2) NULL DEFAULT 0,
  total NUMERIC(10, 2) GENERATED ALWAYS AS (amount + tip) STORED NULL,
  payment_method VARCHAR(20) NULL,
  status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  stripe_payment_intent_id VARCHAR(255) NULL,
  stripe_charge_id VARCHAR(255) NULL,
  paid_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  commission NUMERIC NULL,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id),
  CONSTRAINT payments_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_payments_ride_id ON public.payments USING btree (ride_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments USING btree (status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_payments_stripe_id ON public.payments USING btree (stripe_payment_intent_id) TABLESPACE pg_default;

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RATINGS TABLE
-- ============================================
CREATE TABLE public.ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  rating INTEGER NULL,
  comment TEXT NULL,
  punctuality INTEGER NULL,
  cleanliness INTEGER NULL,
  communication INTEGER NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT ratings_pkey PRIMARY KEY (id),
  CONSTRAINT ratings_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  CONSTRAINT ratings_cleanliness_check CHECK ((cleanliness >= 1) AND (cleanliness <= 5)),
  CONSTRAINT ratings_communication_check CHECK ((communication >= 1) AND (communication <= 5)),
  CONSTRAINT ratings_punctuality_check CHECK ((punctuality >= 1) AND (punctuality <= 5)),
  CONSTRAINT ratings_rating_check CHECK ((rating >= 1) AND (rating <= 5))
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_ratings_ride_id ON public.ratings USING btree (ride_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_ratings_to_user_id ON public.ratings USING btree (to_user_id) TABLESPACE pg_default;

-- ============================================
-- RIDE_LOCATIONS TABLE
-- ============================================
CREATE TABLE public.ride_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  lat NUMERIC(10, 8) NULL,
  lng NUMERIC(11, 8) NULL,
  speed NUMERIC(5, 2) NULL,
  heading NUMERIC(5, 2) NULL,
  accuracy NUMERIC(5, 2) NULL,
  timestamp TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT ride_locations_pkey PRIMARY KEY (id),
  CONSTRAINT ride_locations_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_ride_locations_ride_id ON public.ride_locations USING btree (ride_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_ride_locations_timestamp ON public.ride_locations USING btree ("timestamp") TABLESPACE pg_default;

-- ============================================
-- RIDES TABLE
-- ============================================
CREATE TABLE public.rides (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255) NULL,
  origin_lat NUMERIC(10, 8) NULL,
  origin_lng NUMERIC(11, 8) NULL,
  origin_address TEXT NULL,
  destination_lat NUMERIC(10, 8) NULL,
  destination_lng NUMERIC(11, 8) NULL,
  destination_address TEXT NULL,
  estimated_distance INTEGER NULL,
  estimated_duration INTEGER NULL,
  actual_distance INTEGER NULL,
  actual_duration INTEGER NULL,
  estimated_price NUMERIC(10, 2) NULL,
  final_fare NUMERIC(10, 2) NULL,
  client_suggested_price NUMERIC(10, 2) NULL,
  notes TEXT NULL,
  ride_type VARCHAR(20) NULL DEFAULT 'normal'::VARCHAR,
  status VARCHAR(20) NULL DEFAULT 'requested'::VARCHAR,
  cancel_reason VARCHAR(100) NULL,
  canceled_by VARCHAR(255) NULL,
  requested_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  accepted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  started_at TIMESTAMP WITHOUT TIME ZONE NULL,
  completed_at TIMESTAMP WITHOUT TIME ZONE NULL,
  canceled_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  passengers INTEGER NULL DEFAULT 1,
  extra_destinations JSONB NULL,
  driver_offered_price NUMERIC(10, 2) NULL,
  vehicle_type VARCHAR(50) NULL DEFAULT 'auto'::VARCHAR,
  client_vehicle_photo TEXT NULL,
  CONSTRAINT rides_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides USING btree (driver_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides USING btree (status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON public.rides USING btree (created_at) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_rides_client_id ON public.rides USING btree (client_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_rides_vehicle_type ON public.rides USING btree (vehicle_type) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_rides_canceled_by ON public.rides USING btree (canceled_by) TABLESPACE pg_default WHERE (canceled_by IS NOT NULL);

CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON rides
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VEHICLES TABLE
-- ============================================
CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id UUID NULL,
  plate VARCHAR(20) NOT NULL,
  brand VARCHAR(50) NULL,
  model VARCHAR(50) NULL,
  year INTEGER NULL,
  color VARCHAR(30) NULL,
  type VARCHAR(20) NULL,
  registration_number VARCHAR(50) NULL,
  registration_expiry DATE NULL,
  registration_photo VARCHAR(500) NULL,
  insurance_number VARCHAR(50) NULL,
  insurance_company VARCHAR(100) NULL,
  insurance_expiry DATE NULL,
  insurance_photo VARCHAR(500) NULL,
  is_active BOOLEAN NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  is_4x4 BOOLEAN NULL DEFAULT FALSE,
  vehicle_photo TEXT NULL,
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON public.vehicles USING btree (driver_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON public.vehicles USING btree (plate) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_vehicles_is_4x4 ON public.vehicles USING btree (is_4x4) TABLESPACE pg_default WHERE (is_4x4 = TRUE);

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DESHABILITAR ROW LEVEL SECURITY
-- (Para permitir acceso desde Firebase Functions)
-- ============================================
ALTER TABLE drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE rides DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ratings DISABLE ROW LEVEL SECURITY;
ALTER TABLE ride_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_calls DISABLE ROW LEVEL SECURITY;

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de viajes completos
CREATE OR REPLACE VIEW rides_complete AS
SELECT 
  r.*,
  d.license_number,
  d.average_rating as driver_rating,
  v.plate,
  v.brand,
  v.model,
  v.is_4x4,
  p.amount as payment_amount,
  p.status as payment_status
FROM rides r
LEFT JOIN drivers d ON r.driver_id = d.user_id
LEFT JOIN vehicles v ON d.id = v.driver_id
LEFT JOIN payments p ON r.id = p.ride_id;

-- Vista de emergencias con información del usuario
CREATE OR REPLACE VIEW emergency_calls_complete AS
SELECT 
  ec.*,
  r.status as ride_status,
  r.origin_address as ride_origin,
  r.destination_address as ride_destination
FROM emergency_calls ec
LEFT JOIN rides r ON ec.ride_id = r.id
ORDER BY ec.created_at DESC;

-- ============================================
-- VERIFICACIÓN
-- ============================================
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
