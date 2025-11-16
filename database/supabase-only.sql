-- ============================================
-- SUPABASE POSTGRESQL - SCHEMA COMPLETO
-- DriveAngel.ni
-- Actualizado: 2025-10-25
-- ============================================
-- 
-- IMPORTANTE: Este schema es SOLO para Supabase PostgreSQL
-- Los datos en tiempo real están en Firebase Realtime DB
-- 
-- CAMBIOS EN ESTA VERSIÓN (2025-10-25):
-- - ✅ REFACTORIZADO: Esquema de ride_locations
--   * Eliminados campos de ubicación de rides (origin_lat, origin_lng, etc)
--   * Actualizado ride_locations con nueva estructura:
--     - location_type: 'origin', 'waypoint', 'destination'
--     - location_order: 1, 2, 3, ... (orden de paradas)
--     - address: Dirección de la ubicación
--   * Agregados campos a rides:
--     - waypoints_count: Cantidad de paradas
--     - has_multiple_stops: Boolean si hay múltiples paradas
-- - ✅ Agregadas tablas de biometría:
--   * biometric_authentications: Registro de autenticaciones biométricas
--   * sms_verification_codes: Códigos SMS para verificación
-- - ✅ Agregadas columnas de biometría a payments:
--   * biometric_authenticated: Indica si se usó biometría
--   * biometric_type: Tipo de biometría (fingerprint, face_id)
--   * authentication_method: Método usado (biometric, sms, manual)
--   * sms_code_verified: Indica si se verificó con SMS
--   * sms_verification_id: Referencia a sms_verification_codes
-- - ✅ Agregadas columnas de biometría a rides:
--   * biometric_acceptance_required: Si requiere biometría para aceptar
--   * biometric_acceptance_type: Tipo de biometría requerida
--   * biometric_acceptance_verified: Si se verificó la biometría
--   * biometric_acceptance_at: Timestamp de verificación
-- 
-- CAMBIOS ANTERIORES:
-- - ✅ Eliminada tabla cash_recharges (sistema de recargas removido)
-- - ✅ Agregadas columnas de ratings: driving, safety, friendliness
-- - ✅ Agregada columna notes a payments
-- - ✅ Agregadas columnas department y municipality a drivers (2025-10-16)
-- - ✅ Actualizada tabla vehicles con campos oficiales de Nicaragua (2025-10-17)
-- - ✅ Agregadas columnas para Conductor Designado (2025-10-20)
-- - ✅ Agregadas columnas para sincronización con Firebase (2025-10-21)
-- - ✅ Sistema de Servicios y Comisiones (2025-10-21)
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
  profile_photo VARCHAR(500) NULL,
  license_number VARCHAR(50) NULL,
  license_expiry DATE NULL,
  license_photo_front VARCHAR(500) NULL,
  license_photo_back VARCHAR(500) NULL,
  department VARCHAR(100) NULL,
  municipality VARCHAR(100) NULL,
  status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  total_rides INTEGER NULL DEFAULT 0,
  average_rating NUMERIC(3, 2) NULL DEFAULT 0,
  total_earnings NUMERIC(10, 2) NULL DEFAULT 0,
  -- ✅ ELIMINADOS: designated_driver_request_status, designated_driver_role
  -- Ahora se usan driver_services para esto
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT drivers_pkey PRIMARY KEY (id),
  CONSTRAINT drivers_user_id_key UNIQUE (user_id)
) TABLESPACE pg_default;

COMMENT ON TABLE public.drivers IS 'Datos sensibles de conductores - sincronizado con Firebase Auth';
COMMENT ON COLUMN public.drivers.user_id IS 'Firebase Auth UID';
COMMENT ON COLUMN public.drivers.profile_photo IS 'URL de foto de perfil del conductor - OBLIGATORIA para verificación de identidad (Supabase Storage)';
COMMENT ON COLUMN public.drivers.status IS 'Estado: pending, active, suspended, rejected';
COMMENT ON COLUMN public.drivers.average_rating IS 'Promedio de calificaciones recibidas (1-5)';
COMMENT ON COLUMN public.drivers.license_photo_front IS 'URL de foto frontal de licencia (Supabase Storage)';
COMMENT ON COLUMN public.drivers.license_photo_back IS 'URL de foto trasera de licencia (Supabase Storage)';
COMMENT ON COLUMN public.drivers.department IS 'Departamento de residencia del conductor (ej: Managua, León, Granada)';
COMMENT ON COLUMN public.drivers.municipality IS 'Municipio de residencia del conductor (ej: Managua, Masaya, Tipitapa)';

CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers USING btree (status);
CREATE INDEX IF NOT EXISTS idx_drivers_department ON public.drivers USING btree (department);
CREATE INDEX IF NOT EXISTS idx_drivers_municipality ON public.drivers USING btree (municipality);
-- ✅ ELIMINADOS índices para designated_driver_request_status y designated_driver_role

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
  
  -- Datos de Circulación (Tarjeta de Circulación de Nicaragua)
  motor VARCHAR(50) NULL,
  chasis VARCHAR(50) NULL,
  vin VARCHAR(50) NULL,
  cylinders INTEGER NULL,
  passengers INTEGER NULL,
  fuel_type VARCHAR(20) NULL,
  tonnage NUMERIC(5, 2) NULL DEFAULT 0,
  vehicle_class VARCHAR(30) NULL,
  service_type VARCHAR(20) NULL,
  lien VARCHAR(100) NULL DEFAULT 'NINGUNO',
  emission_date DATE NULL,
  registration_number VARCHAR(50) NULL,
  registration_expiry DATE NULL,
  registration_photo_front VARCHAR(500) NULL,
  registration_photo_back VARCHAR(500) NULL,
  
  -- Datos de Seguro
  insurance_number VARCHAR(50) NULL,
  insurance_company VARCHAR(100) NULL,
  insurance_start_date DATE NULL,
  insurance_expiry DATE NULL,
  insurance_photo VARCHAR(500) NULL,
  
  -- Otros
  is_4x4 BOOLEAN NULL DEFAULT FALSE,
  vehicle_photo TEXT NULL,
  is_active BOOLEAN NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE,
  CONSTRAINT vehicles_plate_key UNIQUE (plate)
) TABLESPACE pg_default;

COMMENT ON TABLE public.vehicles IS 'Vehículos de conductores con documentación completa según formato nicaragüense';
COMMENT ON COLUMN public.vehicles.type IS 'Tipo: auto, moto, suv, pickup';
COMMENT ON COLUMN public.vehicles.motor IS 'Número de motor (de tarjeta de circulación)';
COMMENT ON COLUMN public.vehicles.chasis IS 'Número de chasis (de tarjeta de circulación)';
COMMENT ON COLUMN public.vehicles.vin IS 'VIN - Vehicle Identification Number';
COMMENT ON COLUMN public.vehicles.cylinders IS 'Número de cilindros del motor';
COMMENT ON COLUMN public.vehicles.passengers IS 'Capacidad de pasajeros';
COMMENT ON COLUMN public.vehicles.fuel_type IS 'Tipo de combustible: Gasolina, Diesel, Eléctrico, Híbrido';
COMMENT ON COLUMN public.vehicles.tonnage IS 'Tonelaje del vehículo';
COMMENT ON COLUMN public.vehicles.vehicle_class IS 'Clase: PARTICULAR, PÚBLICO, OFICIAL';
COMMENT ON COLUMN public.vehicles.service_type IS 'Servicio: PRIVADO, PÚBLICO, TAXI, ALQUILER';
COMMENT ON COLUMN public.vehicles.lien IS 'Gravamen del vehículo (NINGUNO, BANCO, etc.)';
COMMENT ON COLUMN public.vehicles.emission_date IS 'Fecha de emisión de la tarjeta de circulación';
COMMENT ON COLUMN public.vehicles.registration_photo_front IS 'URL de foto frontal de circulación (Supabase Storage)';
COMMENT ON COLUMN public.vehicles.registration_photo_back IS 'URL de foto trasera de circulación (Supabase Storage)';
COMMENT ON COLUMN public.vehicles.insurance_number IS 'Número de póliza de seguro';
COMMENT ON COLUMN public.vehicles.insurance_start_date IS 'Fecha de inicio de la póliza de seguro';
COMMENT ON COLUMN public.vehicles.insurance_photo IS 'URL de foto de póliza de seguro (Supabase Storage)';
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
  
  -- ✅ Firebase Ride ID (para sincronización)
  firebase_ride_id VARCHAR(255) NULL,
  
  -- Participantes (Firebase UIDs)
  client_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255) NULL,
  
  -- ✅ ACTUALIZADO (2025-10-25): Ubicaciones ahora en ride_locations
  -- Eliminados: origin_lat, origin_lng, origin_address, destination_lat, destination_lng, destination_address
  -- Agregados: waypoints_count, has_multiple_stops
  
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
  notes TEXT NULL,
  ride_type VARCHAR(20) NULL DEFAULT 'normal'::VARCHAR,
  vehicle_type VARCHAR(50) NULL DEFAULT 'auto'::VARCHAR,
  client_vehicle_photo TEXT NULL,
  
  -- ✅ NUEVO (2025-10-25): Contadores de paradas
  waypoints_count INTEGER NULL DEFAULT 0,
  has_multiple_stops BOOLEAN NULL DEFAULT FALSE,
  
  -- ✅ NUEVO (2025-10-25): Referencias a ubicaciones principales
  origin_location_id UUID NULL,
  destination_location_id UUID NULL,
  
  -- ✅ Servicio ofrecido (referencia a services table)
  service_id UUID NULL,
  
  -- Método de pago
  payment_type VARCHAR(20) NULL DEFAULT 'cash'::VARCHAR,
  
  -- ✅ Aceptación Biométrica (2025-10-25)
  biometric_acceptance_required BOOLEAN NULL DEFAULT FALSE,
  biometric_acceptance_type VARCHAR(20) NULL,
  biometric_acceptance_verified BOOLEAN NULL DEFAULT FALSE,
  biometric_acceptance_at TIMESTAMP WITHOUT TIME ZONE NULL,
  
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
  CONSTRAINT rides_canceled_by_check CHECK (canceled_by IN ('client', 'driver')),
  CONSTRAINT rides_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL,
  -- ✅ NUEVO (2025-10-25): Foreign keys para ubicaciones
  CONSTRAINT fk_rides_origin_location FOREIGN KEY (origin_location_id) REFERENCES public.ride_locations(id) ON DELETE SET NULL,
  CONSTRAINT fk_rides_destination_location FOREIGN KEY (destination_location_id) REFERENCES public.ride_locations(id) ON DELETE SET NULL
) TABLESPACE pg_default;

COMMENT ON TABLE public.rides IS 'Historial completo de viajes - Viajes activos están en Firebase Realtime DB - Ubicaciones en ride_locations';
COMMENT ON COLUMN public.rides.client_id IS 'Firebase Auth UID del cliente';
COMMENT ON COLUMN public.rides.driver_id IS 'Firebase Auth UID del conductor';
COMMENT ON COLUMN public.rides.passengers IS 'Cantidad de pasajeros (1-6)';
COMMENT ON COLUMN public.rides.waypoints_count IS 'Cantidad de paradas intermedias (sin contar origen ni destino)';
COMMENT ON COLUMN public.rides.has_multiple_stops IS 'Indica si hay múltiples paradas (waypoints_count > 0)';
COMMENT ON COLUMN public.rides.origin_location_id IS 'Referencia a la ubicación de origen en ride_locations';
COMMENT ON COLUMN public.rides.destination_location_id IS 'Referencia a la ubicación de destino en ride_locations';
COMMENT ON COLUMN public.rides.driver_offered_price IS 'Precio ofrecido por el conductor (si es diferente al estimado)';
COMMENT ON COLUMN public.rides.vehicle_type IS 'Tipo de vehículo solicitado: moto, auto, designated_driver';
COMMENT ON COLUMN public.rides.client_vehicle_photo IS 'URL de la foto del vehículo del cliente (solo para conductor designado)';
COMMENT ON COLUMN public.rides.service_id IS 'Referencia al servicio ofrecido (normal, designated_driver, night, motorcycle, etc)';
COMMENT ON COLUMN public.rides.payment_type IS 'Método de pago: cash (efectivo), card_local (bancos locales), stripe';
COMMENT ON COLUMN public.rides.biometric_acceptance_required IS 'Indica si se requiere biometría para aceptar el viaje (conductor designado)';
COMMENT ON COLUMN public.rides.biometric_acceptance_type IS 'Tipo de biometría requerida: fingerprint (huella) o face_id (reconocimiento facial)';
COMMENT ON COLUMN public.rides.biometric_acceptance_verified IS 'Indica si la biometría fue verificada correctamente';
COMMENT ON COLUMN public.rides.biometric_acceptance_at IS 'Timestamp de cuando se verificó la biometría';
COMMENT ON COLUMN public.rides.canceled_by IS 'Indica quién canceló el viaje: client o driver';

CREATE INDEX IF NOT EXISTS idx_rides_firebase_ride_id ON public.rides USING btree (firebase_ride_id);
CREATE INDEX IF NOT EXISTS idx_rides_client_id ON public.rides USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_service_id ON public.rides USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides USING btree (status);
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON public.rides USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_vehicle_type ON public.rides USING btree (vehicle_type);
CREATE INDEX IF NOT EXISTS idx_rides_passengers ON public.rides USING btree (passengers);
CREATE INDEX IF NOT EXISTS idx_rides_payment_type ON public.rides USING btree (payment_type);
CREATE INDEX IF NOT EXISTS idx_rides_canceled_by ON public.rides USING btree (canceled_by) WHERE canceled_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rides_biometric_required ON public.rides USING btree (biometric_acceptance_required) WHERE biometric_acceptance_required = TRUE;
CREATE INDEX IF NOT EXISTS idx_rides_biometric_verified ON public.rides USING btree (biometric_acceptance_verified) WHERE biometric_acceptance_verified = TRUE;
-- ✅ NUEVO (2025-10-25): Índices para paradas
CREATE INDEX IF NOT EXISTS idx_rides_waypoints_count ON public.rides USING btree (waypoints_count) WHERE waypoints_count > 0;
CREATE INDEX IF NOT EXISTS idx_rides_multiple_stops ON public.rides USING btree (has_multiple_stops) WHERE has_multiple_stops = TRUE;
-- ✅ NUEVO (2025-10-25): Índices para referencias de ubicaciones
CREATE INDEX IF NOT EXISTS idx_rides_origin_location_id ON public.rides USING btree (origin_location_id);
CREATE INDEX IF NOT EXISTS idx_rides_destination_location_id ON public.rides USING btree (destination_location_id);

CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON public.rides
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. PAYMENTS TABLE
-- Historial de pagos: Cash (Efectivo) y Card (Bancos Locales)
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  
  -- Montos
  amount NUMERIC(10, 2) NOT NULL,
  tip NUMERIC(10, 2) NULL DEFAULT 0,
  commission NUMERIC(10, 2) NULL,
  commission_rate_applied NUMERIC(5, 4) NULL,
  total NUMERIC(10, 2) GENERATED ALWAYS AS (amount + tip) STORED,
  
  -- Método de pago: cash (efectivo) o card (bancos locales)
  payment_method VARCHAR(20) NULL,
  payment_provider VARCHAR(20) NULL,
  
  -- Estado
  status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  commission_status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  
  -- Bancos Locales (para card payments)
  local_transaction_id VARCHAR(255) NULL,
  local_authorization_code VARCHAR(255) NULL,
  local_bank VARCHAR(20) NULL,
  
  -- Información adicional
  notes TEXT NULL,
  cancel_reason TEXT NULL,
  
  -- Sincronización con Firebase
  synced_to_firebase BOOLEAN NULL DEFAULT FALSE,
  firebase_synced_at TIMESTAMP WITHOUT TIME ZONE NULL,
  
  -- ✅ Autenticación Biométrica (2025-10-25)
  biometric_authenticated BOOLEAN NULL DEFAULT FALSE,
  biometric_type VARCHAR(20) NULL,
  authentication_method VARCHAR(20) NULL DEFAULT 'manual',
  sms_code_verified BOOLEAN NULL DEFAULT FALSE,
  sms_verification_id UUID NULL,
  
  -- Timestamps
  paid_at TIMESTAMP WITHOUT TIME ZONE NULL,
  commission_paid_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_local_transaction_id_key UNIQUE (local_transaction_id),
  CONSTRAINT payments_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE,
  CONSTRAINT payments_sms_verification_fkey FOREIGN KEY (sms_verification_id) REFERENCES public.sms_verification_codes(id) ON DELETE SET NULL
) TABLESPACE pg_default;

COMMENT ON TABLE public.payments IS 'Historial de pagos: Cash (Efectivo) y Card (Bancos Locales)';
COMMENT ON COLUMN public.payments.amount IS 'Tarifa final del viaje (final_fare)';
COMMENT ON COLUMN public.payments.commission IS 'Comisión calculada a partir del servicio asociado (service_id)';
COMMENT ON COLUMN public.payments.commission_rate_applied IS 'Tasa exacta aplicada en este pago (snapshot)';
COMMENT ON COLUMN public.payments.total IS 'Total que paga el cliente: amount + tip';
COMMENT ON COLUMN public.payments.payment_method IS 'Método: cash (efectivo) o card (bancos locales)';
COMMENT ON COLUMN public.payments.payment_provider IS 'Proveedor: cash o local';
COMMENT ON COLUMN public.payments.local_transaction_id IS 'ID de transacción del banco local';
COMMENT ON COLUMN public.payments.local_authorization_code IS 'Código de autorización del banco local';
COMMENT ON COLUMN public.payments.local_bank IS 'Banco: bac, banpro, lafise, ficohsa, avanz';
COMMENT ON COLUMN public.payments.notes IS 'Notas adicionales sobre el pago';
COMMENT ON COLUMN public.payments.cancel_reason IS 'Razón de cancelación del pago (si aplica)';
COMMENT ON COLUMN public.payments.synced_to_firebase IS 'Indica si el pago fue sincronizado a Firebase Realtime Database';
COMMENT ON COLUMN public.payments.firebase_synced_at IS 'Timestamp de cuando se sincronizó a Firebase';
COMMENT ON COLUMN public.payments.biometric_authenticated IS 'Indica si se usó biometría para confirmar el pago';
COMMENT ON COLUMN public.payments.biometric_type IS 'Tipo de biometría: fingerprint (huella) o face_id (reconocimiento facial)';
COMMENT ON COLUMN public.payments.authentication_method IS 'Método de autenticación: biometric, sms, manual';
COMMENT ON COLUMN public.payments.sms_code_verified IS 'Indica si se verificó con código SMS';
COMMENT ON COLUMN public.payments.sms_verification_id IS 'Referencia al código SMS verificado';
COMMENT ON COLUMN public.payments.commission_status IS 'Estado de la comisión: pending (pendiente de liquidar) o paid (liquidada)';
COMMENT ON COLUMN public.payments.commission_paid_at IS 'Fecha en la que el conductor liquidó la comisión (NULL = pendiente)';

CREATE INDEX IF NOT EXISTS idx_payments_ride_id ON public.payments USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments USING btree (status);
-- REMOVED: idx_payments_stripe_id (no existe columna stripe_payment_intent_id)
CREATE INDEX IF NOT EXISTS idx_payments_local_transaction_id ON public.payments USING btree (local_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_sync_status ON public.payments USING btree (synced_to_firebase, updated_at) WHERE (synced_to_firebase = FALSE);
CREATE INDEX IF NOT EXISTS idx_payments_cancel_reason ON public.payments USING btree (cancel_reason) WHERE cancel_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_biometric ON public.payments USING btree (biometric_authenticated) WHERE biometric_authenticated = TRUE;
CREATE INDEX IF NOT EXISTS idx_payments_authentication_method ON public.payments USING btree (authentication_method);

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
-- ✅ ACTUALIZADO (2025-10-25): Ubicaciones de origen, paradas y destino
-- Estructura: origin → waypoint 1 → waypoint 2 → ... → destination
-- ============================================
CREATE TABLE IF NOT EXISTS public.ride_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL,
  
  -- ✅ NUEVO (2025-10-25): Tipo y orden de ubicación
  location_type VARCHAR(20) NOT NULL,  -- 'origin', 'waypoint', 'destination'
  location_order INTEGER NOT NULL,      -- 1, 2, 3, ... (orden secuencial)
  
  -- Ubicación
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  address TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT ride_locations_pkey PRIMARY KEY (id),
  CONSTRAINT ride_locations_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE,
  CONSTRAINT unique_ride_location_order UNIQUE(ride_id, location_order)
) TABLESPACE pg_default;

COMMENT ON TABLE public.ride_locations IS 'Ubicaciones de viajes: origen, paradas intermedias y destino - Ordenadas por location_order';
COMMENT ON COLUMN public.ride_locations.location_type IS 'Tipo de ubicación: origin (origen), waypoint (parada intermedia), destination (destino final)';
COMMENT ON COLUMN public.ride_locations.location_order IS 'Orden secuencial de la ubicación (1=origen, 2=parada1, 3=parada2, N=destino)';
COMMENT ON COLUMN public.ride_locations.latitude IS 'Latitud de la ubicación';
COMMENT ON COLUMN public.ride_locations.longitude IS 'Longitud de la ubicación';
COMMENT ON COLUMN public.ride_locations.address IS 'Dirección legible de la ubicación';

CREATE INDEX IF NOT EXISTS idx_ride_locations_ride_id ON public.ride_locations USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_locations_type ON public.ride_locations USING btree (location_type);
CREATE INDEX IF NOT EXISTS idx_ride_locations_order ON public.ride_locations USING btree (ride_id, location_order);

-- ✅ NUEVO (2025-10-25): Trigger para actualizar updated_at
CREATE TRIGGER update_ride_locations_updated_at 
BEFORE UPDATE ON public.ride_locations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
-- 10. DESIGNATED_DRIVER_INSPECTIONS TABLE
-- Inspecciones de vehículos del cliente para viajes de conductor designado
-- ============================================
CREATE TABLE IF NOT EXISTS public.designated_driver_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL,
  driver_id VARCHAR(255) NOT NULL,
  
  -- Fotos del vehículo del cliente
  vehicle_front_photo VARCHAR(500) NULL,
  vehicle_rear_photo VARCHAR(500) NULL,
  interior_front_photo VARCHAR(500) NULL,
  interior_rear_photo VARCHAR(500) NULL,
  
  -- Estado de la inspección
  status VARCHAR(20) NULL DEFAULT 'completed'::VARCHAR,
  
  -- Timestamps
  inspected_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  
  CONSTRAINT designated_driver_inspections_pkey PRIMARY KEY (id),
  CONSTRAINT designated_driver_inspections_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE
) TABLESPACE pg_default;

COMMENT ON TABLE public.designated_driver_inspections IS 'Inspecciones de vehículos del cliente para viajes de conductor designado - Fotos en Supabase Storage';
COMMENT ON COLUMN public.designated_driver_inspections.ride_id IS 'ID del viaje (FK a rides)';
COMMENT ON COLUMN public.designated_driver_inspections.driver_id IS 'Firebase Auth UID del conductor que realizó la inspección';
COMMENT ON COLUMN public.designated_driver_inspections.vehicle_front_photo IS 'URL de foto frontal del vehículo (Supabase Storage)';
COMMENT ON COLUMN public.designated_driver_inspections.vehicle_rear_photo IS 'URL de foto trasera del vehículo (Supabase Storage)';
COMMENT ON COLUMN public.designated_driver_inspections.interior_front_photo IS 'URL de foto interior delantero (Supabase Storage)';
COMMENT ON COLUMN public.designated_driver_inspections.interior_rear_photo IS 'URL de foto interior trasero (Supabase Storage)';
COMMENT ON COLUMN public.designated_driver_inspections.status IS 'Estado: pending, completed, failed';

CREATE INDEX IF NOT EXISTS idx_designated_driver_inspections_ride_id ON public.designated_driver_inspections USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_designated_driver_inspections_driver_id ON public.designated_driver_inspections USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_designated_driver_inspections_status ON public.designated_driver_inspections USING btree (status);
CREATE INDEX IF NOT EXISTS idx_designated_driver_inspections_created_at ON public.designated_driver_inspections USING btree (created_at DESC);

CREATE TRIGGER update_designated_driver_inspections_updated_at BEFORE UPDATE ON public.designated_driver_inspections
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
-- 10. SERVICES TABLE
-- Catálogo de servicios disponibles
-- ============================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  commission_rate DECIMAL(5, 4) NOT NULL,
  base_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  price_per_km DECIMAL(10, 2) NOT NULL,
  price_per_minute DECIMAL(10, 2) NOT NULL,
  minimum_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  vehicle_types JSONB NULL,
  requires_special_license BOOLEAN DEFAULT FALSE,
  max_distance_km INTEGER NULL,
  available_hours JSONB NULL,
  icon VARCHAR(50) NULL,
  color VARCHAR(7) NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT services_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

COMMENT ON TABLE public.services IS 'Catálogo de servicios disponibles (Viaje Normal, Conductor Designado, etc)';
COMMENT ON COLUMN public.services.commission_rate IS 'Tasa de comisión (0.1100 = 11%)';
COMMENT ON COLUMN public.services.code IS 'Código único del servicio para identificación en código';

CREATE INDEX IF NOT EXISTS idx_services_code ON public.services USING btree (code);
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_services_display_order ON public.services USING btree (display_order);

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed inicial de servicios (idempotente)
INSERT INTO public.services (id, name, description, code, commission_rate, base_price, price_per_km, price_per_minute, minimum_fare, vehicle_types, requires_special_license, max_distance_km, available_hours, icon, color, display_order, is_active, is_featured)
VALUES
  ('e1cdd47c-9f57-4ed4-93a0-59cdfdffff8a', 'Viaje Normal', 'Servicio estándar de transporte urbano', 'normal', 0.1100, 50.00, 10.00, 0.00, 50.00, '["auto"]'::jsonb, FALSE, NULL, NULL, 'car', '#0A84FF', 1, TRUE, TRUE),
  ('5e88177d-38f2-4864-addc-272dda26ef28', 'Viaje en Moto', 'Transporte rápido en motocicleta', 'motorcycle', 0.0750, 50.00, 8.00, 0.00, 50.00, '["motorcycle"]'::jsonb, FALSE, NULL, NULL, 'motorcycle', '#FFAA00', 2, TRUE, FALSE),
  ('b3c69940-2e43-459f-8c2e-459773c56f8e', 'Conductor Designado', 'Servicio de conductor designado para eventos', 'designated_driver', 0.2500, 50.00, 13.00, 0.00, 50.00, '["auto"]'::jsonb, TRUE, NULL, NULL, 'steering-wheel', '#8E44AD', 3, TRUE, TRUE),
  ('691f8f01-3faf-4e39-aeb7-1bc4dda3fc19', 'Viaje Nocturno', 'Servicio nocturno con tarifa especial (10pm-4am)', 'night', 0.1200, 40.00, 12.00, 0.00, 40.00, '["auto"]'::jsonb, FALSE, NULL, '{"start": "22:00", "end": "04:00"}'::jsonb, 'moon', '#2C3E50', 4, TRUE, FALSE)
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
  is_featured = EXCLUDED.is_featured;

-- ============================================
-- 11. DRIVER_SERVICES TABLE
-- Relación Many-to-Many entre conductores y servicios
-- ============================================
CREATE TABLE IF NOT EXISTS public.driver_services (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  service_id UUID NOT NULL,
  custom_commission_rate DECIMAL(5, 4) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by VARCHAR(255) NULL,
  approved_at TIMESTAMP WITHOUT TIME ZONE NULL,
  assigned_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITHOUT TIME ZONE NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT driver_services_pkey PRIMARY KEY (id),
  CONSTRAINT driver_services_driver_fkey FOREIGN KEY (driver_id) 
    REFERENCES public.drivers(id) ON DELETE CASCADE,
  CONSTRAINT driver_services_service_fkey FOREIGN KEY (service_id) 
    REFERENCES public.services(id) ON DELETE CASCADE,
  CONSTRAINT driver_services_unique UNIQUE (driver_id, service_id)
) TABLESPACE pg_default;

COMMENT ON TABLE public.driver_services IS 'Servicios asignados a conductores con comisiones personalizadas';
COMMENT ON COLUMN public.driver_services.custom_commission_rate IS 'Comisión personalizada para este conductor (override)';

CREATE INDEX IF NOT EXISTS idx_driver_services_driver ON public.driver_services USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_services_service ON public.driver_services USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_driver_services_active ON public.driver_services USING btree (is_active, is_approved);
CREATE INDEX IF NOT EXISTS idx_driver_services_expires ON public.driver_services USING btree (expires_at) 
  WHERE expires_at IS NOT NULL;

CREATE TRIGGER update_driver_services_updated_at BEFORE UPDATE ON public.driver_services
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 12. BIOMETRIC_AUTHENTICATIONS TABLE
-- Registro de autenticaciones biométricas (2025-10-25)
-- ============================================
CREATE TABLE IF NOT EXISTS public.biometric_authentications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  user_id VARCHAR(255) NOT NULL,
  user_type VARCHAR(20) NOT NULL,
  biometric_type VARCHAR(20) NOT NULL,
  context VARCHAR(50) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  error_message TEXT NULL,
  attempted_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT biometric_authentications_pkey PRIMARY KEY (id),
  CONSTRAINT biometric_authentications_ride_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL
) TABLESPACE pg_default;

COMMENT ON TABLE public.biometric_authentications IS 'Registro de intentos de autenticación biométrica';
COMMENT ON COLUMN public.biometric_authentications.user_id IS 'Firebase Auth UID del usuario';
COMMENT ON COLUMN public.biometric_authentications.user_type IS 'Tipo de usuario: driver o client';
COMMENT ON COLUMN public.biometric_authentications.biometric_type IS 'Tipo de biometría: fingerprint o face_id';
COMMENT ON COLUMN public.biometric_authentications.context IS 'Contexto: ride_acceptance, payment_confirmation, etc';
COMMENT ON COLUMN public.biometric_authentications.success IS 'Indica si la autenticación fue exitosa';
COMMENT ON COLUMN public.biometric_authentications.attempt_number IS 'Número de intento (1-3)';

CREATE INDEX IF NOT EXISTS idx_biometric_auth_user ON public.biometric_authentications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_auth_ride ON public.biometric_authentications USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_biometric_auth_context ON public.biometric_authentications USING btree (context);
CREATE INDEX IF NOT EXISTS idx_biometric_auth_success ON public.biometric_authentications USING btree (success);
CREATE INDEX IF NOT EXISTS idx_biometric_auth_created ON public.biometric_authentications USING btree (created_at DESC);

-- ============================================
-- 13. SMS_VERIFICATION_CODES TABLE
-- Códigos SMS para verificación (2025-10-25)
-- ============================================
CREATE TABLE IF NOT EXISTS public.sms_verification_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  user_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  context VARCHAR(50) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  sent_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT sms_verification_codes_pkey PRIMARY KEY (id),
  CONSTRAINT sms_verification_codes_ride_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL
) TABLESPACE pg_default;

COMMENT ON TABLE public.sms_verification_codes IS 'Códigos SMS para verificación de pagos y otras acciones';
COMMENT ON COLUMN public.sms_verification_codes.user_id IS 'Firebase Auth UID del usuario';
COMMENT ON COLUMN public.sms_verification_codes.phone_number IS 'Número de teléfono del usuario';
COMMENT ON COLUMN public.sms_verification_codes.code_hash IS 'Hash SHA-256 del código (NUNCA almacenar en texto plano)';
COMMENT ON COLUMN public.sms_verification_codes.context IS 'Contexto: payment_confirmation, ride_acceptance, etc';
COMMENT ON COLUMN public.sms_verification_codes.verified IS 'Indica si el código fue verificado correctamente';
COMMENT ON COLUMN public.sms_verification_codes.attempt_count IS 'Número de intentos fallidos (máximo 3)';
COMMENT ON COLUMN public.sms_verification_codes.expires_at IS 'Timestamp de expiración (10 minutos después de sent_at)';

CREATE INDEX IF NOT EXISTS idx_sms_user ON public.sms_verification_codes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_sms_ride ON public.sms_verification_codes USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_sms_context ON public.sms_verification_codes USING btree (context);
CREATE INDEX IF NOT EXISTS idx_sms_verified ON public.sms_verification_codes USING btree (verified);
CREATE INDEX IF NOT EXISTS idx_sms_expires ON public.sms_verification_codes USING btree (expires_at) WHERE verified = FALSE;
CREATE INDEX IF NOT EXISTS idx_sms_created ON public.sms_verification_codes USING btree (created_at DESC);

-- ============================================
-- 14. CARDS TABLE
-- Tarjetas guardadas de usuarios (2025-10-25)
-- ✅ NUEVO: Solo se guardan últimos 4 dígitos, fecha de expiración y banco
-- ============================================
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  local_card_id VARCHAR(255) NOT NULL,
  last_four_digits VARCHAR(4) NOT NULL,
  expiration_month INTEGER NOT NULL,
  expiration_year INTEGER NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  card_brand VARCHAR(50) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT cards_pkey PRIMARY KEY (id),
  CONSTRAINT cards_local_id_key UNIQUE (local_card_id),
  CONSTRAINT cards_user_id_check CHECK (user_id != '')
) TABLESPACE pg_default;

COMMENT ON TABLE public.cards IS 'Tarjetas guardadas de usuarios - Bancos locales de Nicaragua (sin Stripe)';
COMMENT ON COLUMN public.cards.user_id IS 'Firebase Auth UID del usuario';
COMMENT ON COLUMN public.cards.local_card_id IS 'ID local de la tarjeta (formato: local_banco_timestamp)';
COMMENT ON COLUMN public.cards.last_four_digits IS 'Últimos 4 dígitos de la tarjeta (para mostrar en UI)';
COMMENT ON COLUMN public.cards.expiration_month IS 'Mes de expiración (1-12)';
COMMENT ON COLUMN public.cards.expiration_year IS 'Año de expiración (YYYY)';
COMMENT ON COLUMN public.cards.bank_name IS 'Nombre del banco (BAC, Banpro, Lafise, Ficohsa, Avanz)';
COMMENT ON COLUMN public.cards.card_brand IS 'Marca de la tarjeta (Visa, Mastercard, Amex)';
COMMENT ON COLUMN public.cards.is_default IS 'Indica si es la tarjeta predeterminada del usuario';
COMMENT ON COLUMN public.cards.is_active IS 'Indica si la tarjeta está activa (no eliminada)';

-- Crear trigger para actualizar updated_at
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimización
CREATE INDEX IF NOT EXISTS idx_cards_user ON public.cards USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_cards_default ON public.cards USING btree (user_id, is_default) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_cards_active ON public.cards USING btree (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cards_created ON public.cards USING btree (created_at DESC);

-- ============================================
-- 15. SERVICE_COMMISSION_HISTORY TABLE
-- Historial de cambios de comisiones
-- ============================================
CREATE TABLE IF NOT EXISTS public.service_commission_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL,
  old_commission_rate DECIMAL(5, 4) NOT NULL,
  new_commission_rate DECIMAL(5, 4) NOT NULL,
  changed_by VARCHAR(255) NOT NULL,
  change_reason TEXT NULL,
  changed_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT service_commission_history_pkey PRIMARY KEY (id),
  CONSTRAINT service_commission_history_service_fkey FOREIGN KEY (service_id) 
    REFERENCES public.services(id) ON DELETE CASCADE
) TABLESPACE pg_default;

COMMENT ON TABLE public.service_commission_history IS 'Historial de cambios de comisiones para auditoría';

CREATE INDEX IF NOT EXISTS idx_commission_history_service ON public.service_commission_history USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_commission_history_date ON public.service_commission_history USING btree (changed_at DESC);

-- ============================================
-- DESACTIVAR ROW LEVEL SECURITY (Temporal)
-- ============================================
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_commission_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_authentications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.designated_driver_inspections ENABLE ROW LEVEL SECURITY;

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
-- 30. CONFIGURACIÓN DE ROW LEVEL SECURITY (RLS) TESTING NECESARIO  
-- ============================================

-- Nota: todas las tablas críticas tienen RLS habilitado. A continuación
-- se definen políticas base para usuarios autenticados (Firebase UID).

CREATE OR REPLACE FUNCTION public.current_firebase_uid()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    current_setting('request.jwt.claim.sub', true),
    (current_setting('request.jwt.claims', true)::json ->> 'sub')
  );
$$;

REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

-- Drivers
DROP POLICY IF EXISTS drivers_read_own ON public.drivers;
CREATE POLICY drivers_read_own ON public.drivers
  FOR SELECT USING (user_id = public.current_firebase_uid());

DROP POLICY IF EXISTS drivers_update_own ON public.drivers;
CREATE POLICY drivers_update_own ON public.drivers
  FOR UPDATE
  USING (user_id = public.current_firebase_uid())
  WITH CHECK (user_id = public.current_firebase_uid());

REVOKE INSERT ON public.drivers FROM anon;

-- Vehicles
DROP POLICY IF EXISTS vehicles_owner_read ON public.vehicles;
CREATE POLICY vehicles_owner_read ON public.vehicles
  FOR SELECT USING (
    driver_id = (
      SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid()
    )
  );

DROP POLICY IF EXISTS vehicles_owner_write ON public.vehicles;
CREATE POLICY vehicles_owner_write ON public.vehicles
  FOR UPDATE
  USING (
    driver_id = (
      SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid()
    )
  )
  WITH CHECK (
    driver_id = (
      SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid()
    )
  );

REVOKE INSERT ON public.vehicles FROM anon;

-- Rides lectura propia
DROP POLICY IF EXISTS rides_read_client_driver ON public.rides;
CREATE POLICY rides_read_client_driver ON public.rides
  FOR SELECT USING (
    client_id = public.current_firebase_uid()
    OR driver_id = public.current_firebase_uid()
  );

REVOKE INSERT, UPDATE, DELETE ON public.rides FROM anon;

-- Payments lectura propia
DROP POLICY IF EXISTS payments_read_client_driver ON public.payments;
CREATE POLICY payments_read_client_driver ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = public.payments.ride_id
        AND (r.client_id = public.current_firebase_uid()
             OR r.driver_id = public.current_firebase_uid())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon;

-- Ride locations lectura propia
DROP POLICY IF EXISTS ride_locations_read_client_driver ON public.ride_locations;
CREATE POLICY ride_locations_read_client_driver ON public.ride_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = public.ride_locations.ride_id
        AND (r.client_id = public.current_firebase_uid()
             OR r.driver_id = public.current_firebase_uid())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.ride_locations FROM anon;

-- Services lectura pública
DROP POLICY IF EXISTS services_public_read ON public.services;
CREATE POLICY services_public_read ON public.services
  FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.services FROM anon;

-- Biometría, SMS, penalidades
DROP POLICY IF EXISTS biometric_auth_read ON public.biometric_authentications;
CREATE POLICY biometric_auth_read ON public.biometric_authentications
  FOR SELECT USING (user_id = public.current_firebase_uid());

DROP POLICY IF EXISTS sms_codes_read ON public.sms_verification_codes;
CREATE POLICY sms_codes_read ON public.sms_verification_codes
  FOR SELECT USING (user_id = public.current_firebase_uid());

DROP POLICY IF EXISTS penalties_read ON public.driver_penalties;
CREATE POLICY penalties_read ON public.driver_penalties
  FOR SELECT USING (driver_id = public.current_firebase_uid());

REVOKE INSERT, UPDATE, DELETE ON public.biometric_authentications FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.sms_verification_codes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.driver_penalties FROM anon;

-- Ratings
DROP POLICY IF EXISTS ratings_read_related ON public.ratings;
CREATE POLICY ratings_read_related ON public.ratings
  FOR SELECT USING (
    from_user_id = public.current_firebase_uid()
    OR to_user_id = public.current_firebase_uid()
  );

REVOKE INSERT, UPDATE, DELETE ON public.ratings FROM anon;

-- Emergency calls & analytics
DROP POLICY IF EXISTS emergency_calls_read ON public.emergency_calls;
CREATE POLICY emergency_calls_read ON public.emergency_calls
  FOR SELECT USING (user_id = public.current_firebase_uid());

DROP POLICY IF EXISTS analytics_read_own ON public.analytics_events;
CREATE POLICY analytics_read_own ON public.analytics_events
  FOR SELECT USING (user_id = public.current_firebase_uid());

REVOKE INSERT, UPDATE, DELETE ON public.emergency_calls FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.analytics_events FROM anon;

-- Cards
DROP POLICY IF EXISTS cards_read_own ON public.cards;
CREATE POLICY cards_read_own ON public.cards
  FOR SELECT USING (user_id = public.current_firebase_uid());

REVOKE INSERT, UPDATE, DELETE ON public.cards FROM anon;

-- Designated driver inspections
DROP POLICY IF EXISTS designated_driver_inspections_read ON public.designated_driver_inspections;
CREATE POLICY designated_driver_inspections_read ON public.designated_driver_inspections
  FOR SELECT USING (driver_id = public.current_firebase_uid());

REVOKE INSERT, UPDATE, DELETE ON public.designated_driver_inspections FROM anon;

-- Vistas con security definer: habilitar security barrier
ALTER VIEW public.services_stats SET (security_barrier = true);
ALTER VIEW public.driver_active_services SET (security_barrier = true);

update auth.config
set
  external_firebase_enabled = true,
  external_firebase_issuer = 'https://securetoken.google.com/driveangel-ni',
  external_firebase_client_id = 'driveangel-ni';

  
-- ============================================
-- RESULTADO ESPERADO (2025-10-25):
-- ============================================
-- table_name                      | columns_count
-- --------------------------------|---------------
-- analytics_events                | 8
-- biometric_authentications       | 10
-- cards                           | 12 (NUEVO - Tarjetas guardadas)
-- driver_penalties                | 10
-- driver_services                 | 10
-- drivers                         | 11
-- emergency_calls                 | 13
-- payments                        | 23 (actualizado con biometría)
-- ratings                         | 13
-- ride_locations                  | 9
-- rides                           | 32 (actualizado con biometría)
-- service_commission_history      | 7
-- services                        | 14
-- sms_verification_codes          | 11
-- vehicles                        | 18
-- ============================================
-- TOTAL: 15 TABLAS (+ 1 nueva de tarjetas)
-- ============================================
