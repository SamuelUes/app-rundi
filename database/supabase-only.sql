-- ============================================
-- SUPABASE POSTGRESQL - SCHEMA COMPLETO
-- DriveAngel.ni
-- Actualizado: 2025-10-15
-- ============================================
-- 
-- IMPORTANTE: Este schema es SOLO para Supabase PostgreSQL
-- Los datos en tiempo real están en Firebase Realtime DB
-- 
-- CAMBIOS EN ESTA VERSIÓN:
-- - ✅ Eliminada tabla cash_recharges (sistema de recargas removido)
-- - ✅ Agregadas columnas de ratings: driving, safety, friendliness
-- - ✅ Agregada columna notes a payments
-- - ✅ Limpieza de duplicados y definiciones redundantes
-- - ✅ Índices optimizados para performance
-- - ✅ Todas las migraciones consolidadas
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
-- 1. DRIVERS TABLE
-- Datos sensibles de conductores
-- ============================================
CREATE TABLE IF NOT EXISTS public.drivers (
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

COMMENT ON TABLE public.drivers IS 'Datos sensibles de conductores - sincronizado con Firebase Auth';
COMMENT ON COLUMN public.drivers.user_id IS 'Firebase Auth UID';
COMMENT ON COLUMN public.drivers.status IS 'Estado: pending, active, suspended, rejected';
COMMENT ON COLUMN public.drivers.average_rating IS 'Promedio de calificaciones recibidas (1-5)';

CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers USING btree (status);

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. VEHICLES TABLE
-- Vehículos de conductores
-- ============================================
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  plate VARCHAR(20) NOT NULL,
  brand VARCHAR(50) NULL,
  model VARCHAR(50) NULL,
  year INTEGER NULL,
  color VARCHAR(30) NULL,
  type VARCHAR(20) NULL DEFAULT 'auto'::VARCHAR,
  is_4x4 BOOLEAN NULL DEFAULT FALSE,
  vehicle_photo TEXT NULL,
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
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE,
  CONSTRAINT vehicles_plate_key UNIQUE (plate)
) TABLESPACE pg_default;

COMMENT ON TABLE public.vehicles IS 'Vehículos de conductores con documentación completa';
COMMENT ON COLUMN public.vehicles.type IS 'Tipo: auto, moto, suv, pickup';
COMMENT ON COLUMN public.vehicles.is_4x4 IS 'Indica si es 4x4 (requerido para conductor designado)';
COMMENT ON COLUMN public.vehicles.is_active IS 'Indica si el vehículo está activo';

CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON public.vehicles USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON public.vehicles USING btree (plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_4x4 ON public.vehicles USING btree (is_4x4) WHERE is_4x4 = TRUE;
CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON public.vehicles USING btree (is_active) WHERE is_active = TRUE;

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. RIDES TABLE
-- Historial COMPLETO de viajes
-- ============================================
CREATE TABLE IF NOT EXISTS public.rides (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- Participantes (Firebase UIDs)
  client_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255) NULL,
  
  -- Ubicaciones - Origen
  origin_lat DECIMAL(10, 8) NULL,
  origin_lng DECIMAL(11, 8) NULL,
  origin_address TEXT NULL,
  
  -- Ubicaciones - Destino
  destination_lat DECIMAL(10, 8) NULL,
  destination_lng DECIMAL(11, 8) NULL,
  destination_address TEXT NULL,
  
  -- Métricas estimadas
  estimated_distance INTEGER NULL,
  estimated_duration INTEGER NULL,
  
  -- Métricas reales
  actual_distance INTEGER NULL,
  actual_duration INTEGER NULL,
  
  -- Precios
  estimated_price DECIMAL(10, 2) NULL,
  final_fare DECIMAL(10, 2) NULL,
  client_suggested_price DECIMAL(10, 2) NULL,
  driver_offered_price DECIMAL(10, 2) NULL,
  
  -- Información adicional
  passengers INTEGER NULL DEFAULT 1,
  extra_destinations JSONB NULL,
  notes TEXT NULL,
  ride_type VARCHAR(20) NULL DEFAULT 'normal'::VARCHAR,
  vehicle_type VARCHAR(50) NULL DEFAULT 'auto'::VARCHAR,
  client_vehicle_photo TEXT NULL,
  
  -- Método de pago
  payment_type VARCHAR(20) NULL DEFAULT 'cash'::VARCHAR,
  
  -- Estados
  status VARCHAR(20) NULL DEFAULT 'requested'::VARCHAR,
  cancel_reason TEXT NULL,
  canceled_by VARCHAR(10) NULL,
  
  -- Timestamps
  requested_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  accepted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  started_at TIMESTAMP WITHOUT TIME ZONE NULL,
  completed_at TIMESTAMP WITHOUT TIME ZONE NULL,
  canceled_at TIMESTAMP WITHOUT TIME ZONE NULL,
  
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT rides_pkey PRIMARY KEY (id),
  CONSTRAINT rides_canceled_by_check CHECK (canceled_by IN ('client', 'driver'))
) TABLESPACE pg_default;

COMMENT ON TABLE public.rides IS 'Historial completo de viajes - Viajes activos están en Firebase Realtime DB';
COMMENT ON COLUMN public.rides.client_id IS 'Firebase Auth UID del cliente';
COMMENT ON COLUMN public.rides.driver_id IS 'Firebase Auth UID del conductor';
COMMENT ON COLUMN public.rides.passengers IS 'Cantidad de pasajeros (1-6)';
COMMENT ON COLUMN public.rides.extra_destinations IS 'Array JSON de paradas adicionales [{address, lat, lng}]';
COMMENT ON COLUMN public.rides.driver_offered_price IS 'Precio ofrecido por el conductor (si es diferente al estimado)';
COMMENT ON COLUMN public.rides.vehicle_type IS 'Tipo de vehículo solicitado: moto, auto, designated_driver';
COMMENT ON COLUMN public.rides.client_vehicle_photo IS 'URL de la foto del vehículo del cliente (solo para conductor designado)';
COMMENT ON COLUMN public.rides.payment_type IS 'Método de pago: cash (efectivo), card_local (bancos locales), stripe';
COMMENT ON COLUMN public.rides.canceled_by IS 'Indica quién canceló el viaje: client o driver';

CREATE INDEX IF NOT EXISTS idx_rides_client_id ON public.rides USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides USING btree (status);
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON public.rides USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_vehicle_type ON public.rides USING btree (vehicle_type);
CREATE INDEX IF NOT EXISTS idx_rides_passengers ON public.rides USING btree (passengers);
CREATE INDEX IF NOT EXISTS idx_rides_payment_type ON public.rides USING btree (payment_type);
CREATE INDEX IF NOT EXISTS idx_rides_canceled_by ON public.rides USING btree (canceled_by) WHERE canceled_by IS NOT NULL;

CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. PAYMENTS TABLE
-- Historial de pagos con Stripe y Bancos Locales
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  
  -- Montos
  amount NUMERIC(10, 2) NOT NULL,
  tip NUMERIC(10, 2) NULL DEFAULT 0,
  commission NUMERIC(10, 2) NULL,
  total NUMERIC(10, 2) GENERATED ALWAYS AS (amount + tip) STORED,
  
  -- Método de pago
  payment_method VARCHAR(20) NULL,
  payment_provider VARCHAR(20) NULL,
  
  -- Estado
  status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255) NULL,
  stripe_charge_id VARCHAR(255) NULL,
  
  -- Bancos Locales
  local_transaction_id VARCHAR(255) NULL,
  local_authorization_code VARCHAR(255) NULL,
  local_bank VARCHAR(20) NULL,
  
  -- Información adicional
  notes TEXT NULL,
  cancel_reason TEXT NULL,
  
  -- Timestamps
  paid_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id),
  CONSTRAINT payments_local_transaction_id_key UNIQUE (local_transaction_id),
  CONSTRAINT payments_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE
) TABLESPACE pg_default;

COMMENT ON TABLE public.payments IS 'Historial de pagos procesados con Stripe o Bancos Locales';
COMMENT ON COLUMN public.payments.amount IS 'Tarifa final del viaje (final_fare)';
COMMENT ON COLUMN public.payments.commission IS 'Comisión: 10% viajes normales, 15% conductor designado';
COMMENT ON COLUMN public.payments.total IS 'Total que paga el cliente: amount + tip';
COMMENT ON COLUMN public.payments.payment_method IS 'Método: stripe, bac, banpro, lafise, ficohsa, avanz, cash';
COMMENT ON COLUMN public.payments.payment_provider IS 'Proveedor: stripe, local, cash';
COMMENT ON COLUMN public.payments.local_transaction_id IS 'ID de transacción del banco local';
COMMENT ON COLUMN public.payments.local_authorization_code IS 'Código de autorización del banco local';
COMMENT ON COLUMN public.payments.local_bank IS 'Banco: bac, banpro, lafise, ficohsa, avanz';
COMMENT ON COLUMN public.payments.notes IS 'Notas adicionales sobre el pago';
COMMENT ON COLUMN public.payments.cancel_reason IS 'Razón de cancelación del pago (si aplica)';

CREATE INDEX IF NOT EXISTS idx_payments_ride_id ON public.payments USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_id ON public.payments USING btree (stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_local_transaction_id ON public.payments USING btree (local_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_cancel_reason ON public.payments USING btree (cancel_reason) WHERE cancel_reason IS NOT NULL;

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. DRIVER_PENALTIES TABLE
-- Penalizaciones para conductores
-- ============================================
CREATE TABLE IF NOT EXISTS public.driver_penalties (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id VARCHAR(255) NOT NULL,
  ride_id UUID NULL,
  penalty_type VARCHAR(50) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  reason TEXT NULL,
  progress_percentage NUMERIC(5, 2) NULL,
  status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  deducted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT driver_penalties_pkey PRIMARY KEY (id),
  CONSTRAINT driver_penalties_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL
) TABLESPACE pg_default;

COMMENT ON TABLE public.driver_penalties IS 'Penalizaciones para conductores por cancelaciones u otras infracciones';
COMMENT ON COLUMN public.driver_penalties.penalty_type IS 'Tipo: cancellation, late_arrival, customer_complaint, etc.';
COMMENT ON COLUMN public.driver_penalties.amount IS 'Monto de la penalización (generalmente la comisión del viaje)';
COMMENT ON COLUMN public.driver_penalties.progress_percentage IS 'Porcentaje de progreso cuando ocurrió la infracción';
COMMENT ON COLUMN public.driver_penalties.status IS 'Estado: pending (pendiente), deducted (descontada), forgiven (perdonada)';

CREATE INDEX IF NOT EXISTS idx_driver_penalties_driver_id ON public.driver_penalties USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_penalties_status ON public.driver_penalties USING btree (status);
CREATE INDEX IF NOT EXISTS idx_driver_penalties_created_at ON public.driver_penalties USING btree (created_at DESC);

CREATE TRIGGER update_driver_penalties_updated_at BEFORE UPDATE ON public.driver_penalties
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. RATINGS TABLE
-- Calificaciones bidireccionales con categorías detalladas
-- ============================================
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  
  -- Calificación general (obligatorio)
  rating INTEGER NOT NULL,
  comment TEXT NULL,
  
  -- Categorías detalladas (opcionales)
  punctuality INTEGER NULL,
  cleanliness INTEGER NULL,
  communication INTEGER NULL,
  driving INTEGER NULL,
  safety INTEGER NULL,
  friendliness INTEGER NULL,
  
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT ratings_pkey PRIMARY KEY (id),
  CONSTRAINT ratings_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE,
  CONSTRAINT ratings_rating_check CHECK ((rating >= 1) AND (rating <= 5)),
  CONSTRAINT ratings_punctuality_check CHECK ((punctuality >= 1) AND (punctuality <= 5)),
  CONSTRAINT ratings_cleanliness_check CHECK ((cleanliness >= 1) AND (cleanliness <= 5)),
  CONSTRAINT ratings_communication_check CHECK ((communication >= 1) AND (communication <= 5)),
  CONSTRAINT ratings_driving_check CHECK ((driving >= 1) AND (driving <= 5)),
  CONSTRAINT ratings_safety_check CHECK ((safety >= 1) AND (safety <= 5)),
  CONSTRAINT ratings_friendliness_check CHECK ((friendliness >= 1) AND (friendliness <= 5))
) TABLESPACE pg_default;

COMMENT ON TABLE public.ratings IS 'Calificaciones bidireccionales con categorías detalladas';
COMMENT ON COLUMN public.ratings.rating IS 'Calificación general (1-5) - OBLIGATORIO';
COMMENT ON COLUMN public.ratings.punctuality IS 'Puntualidad (1-5) - OPCIONAL';
COMMENT ON COLUMN public.ratings.cleanliness IS 'Limpieza del vehículo (1-5) - OPCIONAL';
COMMENT ON COLUMN public.ratings.communication IS 'Comunicación (1-5) - OPCIONAL';
COMMENT ON COLUMN public.ratings.driving IS 'Conducción (1-5) - OPCIONAL - Solo para conductores';
COMMENT ON COLUMN public.ratings.safety IS 'Seguridad (1-5) - OPCIONAL';
COMMENT ON COLUMN public.ratings.friendliness IS 'Amabilidad (1-5) - OPCIONAL';

CREATE INDEX IF NOT EXISTS idx_ratings_ride_id ON public.ratings USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_ratings_to_user_id ON public.ratings USING btree (to_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_from_user_id ON public.ratings USING btree (from_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON public.ratings USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_user_rating ON public.ratings USING btree (to_user_id, rating);

-- ============================================
-- 7. RIDE_LOCATIONS TABLE
-- Historial de tracking (ruta completa) - COMPRIMIDO
-- ============================================
CREATE TABLE IF NOT EXISTS public.ride_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  
  -- Ubicación
  lat NUMERIC(10, 8) NULL,
  lng NUMERIC(11, 8) NULL,
  
  -- Métricas
  speed NUMERIC(5, 2) NULL,
  heading NUMERIC(5, 2) NULL,
  accuracy NUMERIC(5, 2) NULL,
  
  -- Timestamp
  timestamp TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT ride_locations_pkey PRIMARY KEY (id),
  CONSTRAINT ride_locations_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE
) TABLESPACE pg_default;

COMMENT ON TABLE public.ride_locations IS 'Historial COMPRIMIDO de ubicaciones (cada 30s o 50+ metros) - Tracking en vivo está en Firebase Realtime DB';
COMMENT ON COLUMN public.ride_locations.speed IS 'Velocidad en km/h';
COMMENT ON COLUMN public.ride_locations.heading IS 'Dirección en grados (0-360)';
COMMENT ON COLUMN public.ride_locations.accuracy IS 'Precisión en metros';

CREATE INDEX IF NOT EXISTS idx_ride_locations_ride_id ON public.ride_locations USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_locations_timestamp ON public.ride_locations USING btree (timestamp DESC);

-- ============================================
-- 8. ANALYTICS_EVENTS TABLE
-- Logs y métricas del sistema
-- ============================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- Usuario (Firebase UID)
  user_id VARCHAR(255) NULL,
  
  -- Evento
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NULL,
  
  -- Metadata
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  platform VARCHAR(20) NULL,
  app_version VARCHAR(20) NULL,
  
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

COMMENT ON TABLE public.analytics_events IS 'Eventos de analytics y logs del sistema';
COMMENT ON COLUMN public.analytics_events.event_type IS 'Tipo de evento: ride_requested, ride_completed, payment_completed, etc.';

CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON public.analytics_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_events USING btree (created_at DESC);

-- ============================================
-- 9. EMERGENCY_CALLS TABLE
-- Registro de llamadas de emergencia
-- ============================================
CREATE TABLE IF NOT EXISTS public.emergency_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- Usuario que llamó (Firebase UID)
  user_id VARCHAR(255) NOT NULL,
  user_role VARCHAR(20) NOT NULL,
  
  -- Tipo de emergencia
  emergency_type VARCHAR(20) NOT NULL,
  emergency_number VARCHAR(10) NOT NULL,
  
  -- Ubicación al momento de la llamada
  lat NUMERIC(10, 8) NULL,
  lng NUMERIC(11, 8) NULL,
  address TEXT NULL,
  
  -- Viaje relacionado (si aplica)
  ride_id UUID NULL,
  
  -- Información adicional
  notes TEXT NULL,
  call_status VARCHAR(20) NULL DEFAULT 'initiated'::VARCHAR,
  
  -- Timestamps
  called_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT emergency_calls_pkey PRIMARY KEY (id),
  CONSTRAINT emergency_calls_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL
) TABLESPACE pg_default;

COMMENT ON TABLE public.emergency_calls IS 'Registro de llamadas de emergencia realizadas por usuarios';
COMMENT ON COLUMN public.emergency_calls.user_id IS 'Firebase Auth UID del usuario que llamó';
COMMENT ON COLUMN public.emergency_calls.user_role IS 'Rol: driver o client';
COMMENT ON COLUMN public.emergency_calls.emergency_type IS 'Tipo: police (118) o ambulance (102)';
COMMENT ON COLUMN public.emergency_calls.ride_id IS 'ID del viaje si la emergencia ocurrió durante un viaje';
COMMENT ON COLUMN public.emergency_calls.call_status IS 'Estado: initiated, completed, canceled';

CREATE INDEX IF NOT EXISTS idx_emergency_calls_user_id ON public.emergency_calls USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_ride_id ON public.emergency_calls USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_type ON public.emergency_calls USING btree (emergency_type);
CREATE INDEX IF NOT EXISTS idx_emergency_calls_created_at ON public.emergency_calls USING btree (created_at DESC);

CREATE TRIGGER update_emergency_calls_updated_at BEFORE UPDATE ON public.emergency_calls
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de viajes completos con información del conductor y vehículo
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
  p.status as payment_status,
  p.payment_method
FROM public.rides r
LEFT JOIN public.drivers d ON r.driver_id = d.user_id
LEFT JOIN public.vehicles v ON d.id = v.driver_id AND v.is_active = TRUE
LEFT JOIN public.payments p ON r.id = p.ride_id;

COMMENT ON VIEW rides_complete IS 'Vista completa de viajes con información del conductor, vehículo y pago';

-- Vista de emergencias con información del viaje
CREATE OR REPLACE VIEW emergency_calls_complete AS
SELECT 
  ec.*,
  r.status as ride_status,
  r.origin_address as ride_origin,
  r.destination_address as ride_destination,
  r.driver_id,
  r.client_id
FROM public.emergency_calls ec
LEFT JOIN public.rides r ON ec.ride_id = r.id
ORDER BY ec.created_at DESC;

COMMENT ON VIEW emergency_calls_complete IS 'Vista completa de llamadas de emergencia con información del viaje';

-- ============================================
-- DESHABILITAR ROW LEVEL SECURITY
-- (Para permitir acceso desde Firebase Functions)
-- ============================================
ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_penalties DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_calls DISABLE ROW LEVEL SECURITY;

-- ============================================
-- VERIFICACIÓN FINAL
-- ============================================
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- table_name            | columns_count
-- ----------------------|---------------
-- analytics_events      | 8
-- driver_penalties      | 10
-- drivers               | 11
-- emergency_calls       | 13
-- payments              | 18
-- ratings               | 13
-- ride_locations        | 9
-- rides                 | 28
-- vehicles              | 18
-- ============================================
-- TOTAL: 9 TABLAS (cash_recharges eliminada)
-- ============================================
