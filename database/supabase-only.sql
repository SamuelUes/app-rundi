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
-- STORAGE BUCKETS (drivers-documents, rides-documents, support-chats)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('drivers-documents', 'drivers-documents', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('rides-documents', 'rides-documents', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('support-chats', 'support-chats', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('support-calls', 'support-calls', TRUE)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE storage.buckets IS 'Buckets utilizados por la aplicación móvil';
COMMENT ON COLUMN storage.buckets.public IS 'TRUE = archivos accesibles con URL pública';

-- Eliminar políticas previas para evitar duplicados al aplicar el script
DROP POLICY IF EXISTS "drivers_docs_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "drivers_docs_read_own" ON storage.objects;
DROP POLICY IF EXISTS "drivers_docs_update_own" ON storage.objects;
DROP POLICY IF EXISTS "drivers_docs_delete_own" ON storage.objects;

DROP POLICY IF EXISTS "rides_docs_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "rides_docs_read_own" ON storage.objects;
DROP POLICY IF EXISTS "rides_docs_update_own" ON storage.objects;
DROP POLICY IF EXISTS "rides_docs_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "rides_docs_insert_public_paths" ON storage.objects;

DROP POLICY IF EXISTS "support_chats_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "support_chats_read_own" ON storage.objects;
DROP POLICY IF EXISTS "support_chats_update_own" ON storage.objects;
DROP POLICY IF EXISTS "support_chats_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "support_calls_read_public" ON storage.objects;
DROP POLICY IF EXISTS "support_calls_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "support_calls_update_auth" ON storage.objects;
DROP POLICY IF EXISTS "support_calls_delete_auth" ON storage.objects;

-- Políticas drivers-documents (rol anon porque los uploads usan anon key)
CREATE POLICY "drivers_docs_insert_own"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'drivers-documents'
  AND name LIKE '%' || public.current_firebase_uid() || '/%'
);

CREATE POLICY "drivers_docs_read_own"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'drivers-documents'
  AND name LIKE '%' || public.current_firebase_uid() || '/%'
);

CREATE POLICY "drivers_docs_update_own"
ON storage.objects
FOR UPDATE
TO anon
USING (
  bucket_id = 'drivers-documents'
  AND name LIKE '%' || public.current_firebase_uid() || '/%'
);

CREATE POLICY "drivers_docs_delete_own"
ON storage.objects
FOR DELETE
TO anon
USING (
  bucket_id = 'drivers-documents'
  AND name LIKE '%' || public.current_firebase_uid() || '/%'
);

-- Políticas rides-documents
CREATE POLICY "rides_docs_insert_own"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'rides-documents'
  AND name LIKE '%' || public.current_firebase_uid() || '%'
);

CREATE POLICY "rides_docs_read_own"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'rides-documents'
  AND name LIKE '%' || public.current_firebase_uid() || '%'
);

CREATE POLICY "rides_docs_update_own"
ON storage.objects
FOR UPDATE
TO anon
USING (
  bucket_id = 'rides-documents'
  AND name LIKE '%' || public.current_firebase_uid() || '%'
);

CREATE POLICY "rides_docs_delete_own"
ON storage.objects
FOR DELETE
TO anon
USING (
  bucket_id = 'rides-documents'
  AND name LIKE '%' || public.current_firebase_uid() || '%'
);

--Politica de support_chats Lectura pública (URLs públicas)
create policy "support_chats_read_public"
on storage.objects for select
using (bucket_id = 'support_chats');

-- Escritura/actualización/borrado para usuarios autenticados
create policy "support_chats_insert_auth"
on storage.objects for insert
with check (bucket_id = 'support_chats' and auth.role() = 'authenticated');
 
create policy "support_chats_update_auth"
on storage.objects for update
using (bucket_id = 'support_chats' and auth.role() = 'authenticated');
 
create policy "support_chats_delete_auth"
on storage.objects for delete
using (bucket_id = 'support_chats' and auth.role() = 'authenticated');

CREATE POLICY "support_calls_read_public"
ON storage.objects
FOR SELECT
USING (bucket_id = 'support-calls');

CREATE POLICY "support_calls_insert_auth"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'support-calls' AND auth.role() = 'authenticated');

CREATE POLICY "support_calls_update_auth"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'support-calls' AND auth.role() = 'authenticated');

CREATE POLICY "support_calls_delete_auth"
ON storage.objects
FOR DELETE
USING (bucket_id = 'support-calls' AND auth.role() = 'authenticated');

-- Fallback para clientes móviles (anon key) limitado a prefijos permitidos
CREATE POLICY "rides_docs_insert_public_paths"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'rides-documents'
  AND (
    name LIKE 'client-vehicles/%'
    OR name LIKE 'rides-inspection/%'
  )
);

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
  account_status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  documents_status VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
  designated_rol_requested VARCHAR(20) NULL DEFAULT 'pending'::VARCHAR,
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
COMMENT ON COLUMN public.drivers.account_status IS 'Estado: pending, active, suspended, rejected';
COMMENT ON COLUMN public.drivers.documents_status IS 'Estado de documentos: pending, verified, suspended, rejected';
COMMENT ON COLUMN public.drivers.designated_rol_requested IS 'Flujo para conductor designado: pending, verified, rejected, revoked';
COMMENT ON COLUMN public.drivers.average_rating IS 'Promedio de calificaciones recibidas (1-5)';
COMMENT ON COLUMN public.drivers.license_photo_front IS 'URL de foto frontal de licencia (Supabase Storage)';
COMMENT ON COLUMN public.drivers.license_photo_back IS 'URL de foto trasera de licencia (Supabase Storage)';
COMMENT ON COLUMN public.drivers.department IS 'Departamento de residencia del conductor (ej: Managua, León, Granada)';
COMMENT ON COLUMN public.drivers.municipality IS 'Municipio de residencia del conductor (ej: Managua, Masaya, Tipitapa)';

CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_account_status ON public.drivers USING btree (account_status);
CREATE INDEX IF NOT EXISTS idx_drivers_documents_status ON public.drivers USING btree (documents_status);
CREATE INDEX IF NOT EXISTS idx_drivers_department ON public.drivers USING btree (department);
CREATE INDEX IF NOT EXISTS idx_drivers_municipality ON public.drivers USING btree (municipality);
CREATE INDEX IF NOT EXISTS idx_drivers_designated_rol_requested ON public.drivers USING btree (designated_rol_requested);
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
  designated_driver_vehicle VARCHAR(10) NULL,
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
  CONSTRAINT rides_canceled_by_check CHECK (canceled_by IN ('client', 'driver'))
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
COMMENT ON COLUMN public.rides.designated_driver_vehicle IS "Para conductor designado: 'auto' o 'moto'";
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
  CONSTRAINT payments_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE
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

-- Trigger para actualizar updated_at
CREATE TRIGGER update_ride_locations_updated_at 
BEFORE UPDATE ON public.ride_locations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7.1 FUNCIONES Y VISTAS PARA RUTAS DE VIAJES
-- ============================================

-- Función helper para actualizar resumen de ruta (waypoints_count, has_multiple_stops)
CREATE OR REPLACE FUNCTION update_ride_route_summary(p_ride_id UUID)
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

-- Trigger wrapper: actualizar resumen en INSERT de waypoints
CREATE OR REPLACE FUNCTION trigger_update_ride_summary_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location_type = 'waypoint' THEN
    PERFORM update_ride_route_summary(NEW.ride_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger wrapper: actualizar resumen en DELETE de waypoints
CREATE OR REPLACE FUNCTION trigger_update_ride_summary_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.location_type = 'waypoint' THEN
    PERFORM update_ride_route_summary(OLD.ride_id);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Triggers para mantener waypoints_count / has_multiple_stops
CREATE TRIGGER update_ride_summary_on_waypoint_insert
AFTER INSERT ON public.ride_locations
FOR EACH ROW
EXECUTE FUNCTION trigger_update_ride_summary_on_insert();

CREATE TRIGGER update_ride_summary_on_waypoint_delete
AFTER DELETE ON public.ride_locations
FOR EACH ROW
EXECUTE FUNCTION trigger_update_ride_summary_on_delete();

-- Vista con ruta completa y waypoints en JSON
CREATE OR REPLACE VIEW rides_with_complete_route AS
SELECT 
  r.*,
  -- Origen
  rl_origin.id          AS origin_location_id_detail,
  rl_origin.latitude    AS origin_latitude,
  rl_origin.longitude   AS origin_longitude,
  rl_origin.address     AS origin_address,
  -- Destino
  rl_dest.id            AS destination_location_id_detail,
  rl_dest.latitude      AS destination_latitude,
  rl_dest.longitude     AS destination_longitude,
  rl_dest.address       AS destination_address,
  -- Paradas intermedias
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', w.id,
        'lat', w.latitude,
        'lng', w.longitude,
        'address', w.address,
        'location_order', w.location_order
      )
      ORDER BY w.location_order
    )
    FROM public.ride_locations w
    WHERE w.ride_id = r.id
      AND w.location_type = 'waypoint'
  ), '[]'::json) AS waypoints
FROM public.rides r
LEFT JOIN public.ride_locations rl_origin
  ON rl_origin.ride_id = r.id AND rl_origin.location_type = 'origin'
LEFT JOIN public.ride_locations rl_dest
  ON rl_dest.ride_id = r.id AND rl_dest.location_type = 'destination';

COMMENT ON VIEW rides_with_complete_route IS 'Vista de viajes con origen, destino y paradas intermedias normalizadas en ride_locations';

-- Función RPC: obtener ruta completa en orden (origen → waypoints → destino)
CREATE OR REPLACE FUNCTION get_ride_route(p_ride_id UUID)
RETURNS TABLE (
  id UUID,
  ride_id UUID,
  lat NUMERIC,
  lng NUMERIC,
  location_type VARCHAR,
  address TEXT,
  place_name TEXT,
  waypoint_order INTEGER,
  point_timestamp TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rl.id,
    rl.ride_id,
    rl.latitude AS lat,
    rl.longitude AS lng,
    rl.location_type,
    rl.address,
    NULL::TEXT AS place_name,
    CASE WHEN rl.location_type = 'waypoint' THEN rl.location_order ELSE NULL::INTEGER END AS waypoint_order,
    rl.created_at AS point_timestamp
  FROM public.ride_locations rl
  WHERE rl.ride_id = p_ride_id
    AND rl.location_type IN ('origin', 'waypoint', 'destination')
  ORDER BY rl.location_order ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_ride_route IS 'Obtiene la ruta completa de un viaje ordenada (origen → waypoints → destino)';

-- Función RPC: obtener puntos de tracking (si se guardan como location_type = 'tracking')
CREATE OR REPLACE FUNCTION get_ride_tracking(p_ride_id UUID, p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id UUID,
  lat NUMERIC,
  lng NUMERIC,
  speed NUMERIC,
  heading NUMERIC,
  accuracy NUMERIC,
  point_timestamp TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rl.id,
    rl.latitude AS lat,
    rl.longitude AS lng,
    NULL::NUMERIC AS speed,
    NULL::NUMERIC AS heading,
    NULL::NUMERIC AS accuracy,
    rl.created_at AS point_timestamp
  FROM public.ride_locations rl
  WHERE rl.ride_id = p_ride_id
    AND rl.location_type = 'tracking'
  ORDER BY rl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_ride_tracking IS 'Obtiene los puntos de tracking en tiempo real de un viaje (ordenados por created_at DESC)';

-- Función helper: calcular distancia total de la ruta usando fórmula Haversine
CREATE OR REPLACE FUNCTION calculate_ride_distance(p_ride_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_distance NUMERIC := 0;
  prev_lat NUMERIC;
  prev_lng NUMERIC;
  curr_lat NUMERIC;
  curr_lng NUMERIC;
BEGIN
  FOR prev_lat, prev_lng, curr_lat, curr_lng IN
    SELECT
      LAG(latitude) OVER (ORDER BY location_order) AS prev_lat,
      LAG(longitude) OVER (ORDER BY location_order) AS prev_lng,
      latitude AS curr_lat,
      longitude AS curr_lng
    FROM public.ride_locations
    WHERE ride_id = p_ride_id
      AND location_type IN ('origin', 'waypoint', 'destination')
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

COMMENT ON FUNCTION calculate_ride_distance IS 'Calcula la distancia total del viaje en metros usando fórmula Haversine sobre ride_locations';

-- Función RPC: obtener solo las paradas intermedias (waypoints)
CREATE OR REPLACE FUNCTION get_ride_waypoints(p_ride_id UUID)
RETURNS TABLE (
  id UUID,
  waypoint_order INTEGER,
  lat NUMERIC,
  lng NUMERIC,
  address TEXT,
  place_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rl.id,
    rl.location_order AS waypoint_order,
    rl.latitude AS lat,
    rl.longitude AS lng,
    rl.address,
    NULL::TEXT AS place_name
  FROM public.ride_locations rl
  WHERE rl.ride_id = p_ride_id
    AND rl.location_type = 'waypoint'
  ORDER BY rl.location_order;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_ride_waypoints IS 'Obtiene todas las paradas intermedias de un viaje ordenadas por location_order';

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
-- 11. SERVICES TABLE
-- Catálogo de servicios disponibles
-- ============================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  commission_rate DECIMAL(5, 4) NOT NULL,
  base_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  minimum_fare DECIMAL(10, 2) NOT NULL DEFAULT 0,
  vehicle_types JSONB NULL,
  requires_special_license BOOLEAN DEFAULT FALSE,
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

ALTER TABLE public.rides
  ADD CONSTRAINT rides_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

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
-- 12. DRIVER_SERVICES TABLE
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
-- 13. BIOMETRIC_AUTHENTICATIONS TABLE
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
-- 14. SMS_VERIFICATION_CODES TABLE
-- Códigos SMS para verificación (2025-10-25)
-- ============================================
CREATE TABLE IF NOT EXISTS public.sms_verification_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  user_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NULL,
  mail VARCHAR(255) NULL,
  code VARCHAR(6) NULL,
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

ALTER TABLE public.payments
  ADD CONSTRAINT payments_sms_verification_fkey
  FOREIGN KEY (sms_verification_id) REFERENCES public.sms_verification_codes(id) ON DELETE SET NULL;

COMMENT ON TABLE public.sms_verification_codes IS 'Códigos SMS para verificación de pagos y otras acciones';
COMMENT ON COLUMN public.sms_verification_codes.user_id IS 'Firebase Auth UID del usuario';
COMMENT ON COLUMN public.sms_verification_codes.phone_number IS 'Número de teléfono del usuario (nullable para códigos por correo)';
COMMENT ON COLUMN public.sms_verification_codes.mail IS 'Correo electrónico del usuario (nullable para códigos SMS)';
COMMENT ON COLUMN public.sms_verification_codes.code_hash IS 'Hash SHA-256 del código (NUNCA almacenar en texto plano)';
COMMENT ON COLUMN public.sms_verification_codes.context IS 'Contexto: payment_confirmation, ride_acceptance, etc';
COMMENT ON COLUMN public.sms_verification_codes.verified IS 'Indica si el código fue verificado correctamente';
COMMENT ON COLUMN public.sms_verification_codes.attempt_count IS 'Número de intentos fallidos (máximo 3)';
COMMENT ON COLUMN public.sms_verification_codes.expires_at IS 'Timestamp de expiración (10 minutos después de sent_at)';

CREATE INDEX IF NOT EXISTS idx_sms_user ON public.sms_verification_codes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_sms_ride ON public.sms_verification_codes USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_sms_mail ON public.sms_verification_codes USING btree (mail);
CREATE INDEX IF NOT EXISTS idx_sms_context ON public.sms_verification_codes USING btree (context);
CREATE INDEX IF NOT EXISTS idx_sms_verified ON public.sms_verification_codes USING btree (verified);
CREATE INDEX IF NOT EXISTS idx_sms_expires ON public.sms_verification_codes USING btree (expires_at) WHERE verified = FALSE;
CREATE INDEX IF NOT EXISTS idx_sms_created ON public.sms_verification_codes USING btree (created_at DESC);

-- ============================================
-- 15. CARDS TABLE
-- Tarjetas guardadas de usuarios (2025-10-25)
-- NUEVO: Solo se guardan últimos 4 dígitos, fecha de expiración y banco
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
-- SUPPORT_CALL_SESSIONS TABLE (WebRTC/llamadas)
-- ============================================
CREATE TABLE IF NOT EXISTS public.support_call_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  call_id VARCHAR(64) NOT NULL,
  complaint_id VARCHAR(255) NULL,
  ride_id VARCHAR(255) NULL,
  operator_uid VARCHAR(255) NOT NULL,
  client_uid VARCHAR(255) NOT NULL,
  direction VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'initiated',
  recording_url TEXT NULL,
  signaling_notes JSONB NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  connected_at TIMESTAMP WITHOUT TIME ZONE NULL,
  ended_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT support_call_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT support_call_sessions_call_id_key UNIQUE (call_id),
  CONSTRAINT support_call_sessions_direction_check CHECK (direction IN ('operator_to_client','client_to_operator')),
  CONSTRAINT support_call_sessions_status_check CHECK (status IN ('initiated','ringing_client','ringing_operator','accepted','rejected','missed','connected','ended'))
) TABLESPACE pg_default;

COMMENT ON TABLE public.support_call_sessions IS 'Sesiones de llamadas WebRTC entre operador y cliente asociadas a quejas';
COMMENT ON COLUMN public.support_call_sessions.call_id IS 'Identificador lógico usado también en Realtime DB (calls/{callId})';
COMMENT ON COLUMN public.support_call_sessions.complaint_id IS 'ID de la queja en cms_complaints';
COMMENT ON COLUMN public.support_call_sessions.direction IS 'operator_to_client o client_to_operator';
COMMENT ON COLUMN public.support_call_sessions.status IS 'Estado actual de la llamada';
COMMENT ON COLUMN public.support_call_sessions.recording_url IS 'URL de grabación si se almacenó';

CREATE INDEX IF NOT EXISTS idx_support_call_sessions_call_id ON public.support_call_sessions USING btree (call_id);
CREATE INDEX IF NOT EXISTS idx_support_call_sessions_complaint ON public.support_call_sessions USING btree (complaint_id);
CREATE INDEX IF NOT EXISTS idx_support_call_sessions_operator ON public.support_call_sessions USING btree (operator_uid);
CREATE INDEX IF NOT EXISTS idx_support_call_sessions_client ON public.support_call_sessions USING btree (client_uid);

CREATE TRIGGER update_support_call_sessions_updated_at BEFORE UPDATE ON public.support_call_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Campos de llamada en cms_complaints (enlazar ticket con sesión de llamada)
ALTER TABLE public.cms_complaints
  ADD COLUMN IF NOT EXISTS call_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS call_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS call_direction VARCHAR(32),
  ADD COLUMN IF NOT EXISTS call_recording_url TEXT,
  ADD COLUMN IF NOT EXISTS call_started_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS call_ended_at TIMESTAMP WITHOUT TIME ZONE;

COMMENT ON COLUMN public.cms_complaints.call_id IS 'Referencia a support_call_sessions.call_id y RTDB calls/{callId}';
COMMENT ON COLUMN public.cms_complaints.call_status IS 'Estado de la llamada WebRTC asociado a la queja';
COMMENT ON COLUMN public.cms_complaints.call_direction IS 'operator_to_client o client_to_operator';
COMMENT ON COLUMN public.cms_complaints.call_recording_url IS 'Grabación si existe';
COMMENT ON COLUMN public.cms_complaints.call_started_at IS 'Marca de conexión';
COMMENT ON COLUMN public.cms_complaints.call_ended_at IS 'Marca de término/rechazo';

-- ============================================
-- 16. SERVICE_COMMISSION_HISTORY TABLE
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
-- 17. FUNCIONES Y VISTAS DE SERVICIOS / COMISIONES
-- ============================================

-- Función helper: obtener tasa de comisión efectiva para un conductor y servicio
CREATE OR REPLACE FUNCTION get_driver_commission_rate(p_driver_uid TEXT, p_service_code TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_driver_id UUID;
  v_service_id UUID;
  v_commission NUMERIC(5, 4);
BEGIN
  SELECT id INTO v_driver_id
  FROM public.drivers
  WHERE user_id = p_driver_uid;

  SELECT id, commission_rate INTO v_service_id, v_commission
  FROM public.services
  WHERE code = p_service_code;

  IF v_service_id IS NULL THEN
    -- Servicio no encontrado, usar valores por defecto
    IF p_service_code = 'designated_driver' THEN
      RETURN 0.25;
    ELSIF p_service_code = 'motorcycle' THEN
      RETURN 0.075;
    ELSE
      RETURN 0.11;
    END IF;
  END IF;

  IF v_driver_id IS NOT NULL THEN
    SELECT COALESCE(ds.custom_commission_rate, s.commission_rate)
    INTO v_commission
    FROM public.services s
    LEFT JOIN public.driver_services ds
      ON ds.service_id = s.id
     AND ds.driver_id = v_driver_id
     AND ds.is_active = TRUE
     AND ds.is_approved = TRUE
    WHERE s.id = v_service_id;
  END IF;

  IF v_commission IS NULL THEN
    RETURN (
      CASE p_service_code
        WHEN 'designated_driver' THEN 0.25
        WHEN 'motorcycle' THEN 0.075
        ELSE 0.11
      END
    );
  END IF;

  RETURN v_commission;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_driver_commission_rate IS 'Obtiene la tasa de comisión aplicable para un conductor y servicio (driver_services.override → services.commission_rate → defaults)';

-- Vista de servicios activos con información de conductores
CREATE OR REPLACE VIEW driver_active_services AS
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
WHERE ds.is_active = TRUE
  AND ds.is_approved = TRUE;

COMMENT ON VIEW driver_active_services IS 'Servicios activos asignados a cada conductor con comisión efectiva';

-- Vista de estadísticas por servicio
CREATE OR REPLACE VIEW services_stats AS
SELECT
  s.id                                 AS service_id,
  s.code                               AS service_code,
  s.name                               AS service_name,
  COUNT(DISTINCT r.id)                 AS total_rides,
  COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) AS completed_rides,
  COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) AS total_revenue,
  COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.commission ELSE 0 END), 0) AS total_commission,
  COALESCE(AVG(CASE WHEN p.status = 'completed' THEN p.amount END), 0) AS average_fare
FROM public.services s
LEFT JOIN public.rides r
  ON r.service_id = s.id
LEFT JOIN public.payments p
  ON p.ride_id = r.id
GROUP BY s.id, s.code, s.name;

COMMENT ON VIEW services_stats IS 'Estadísticas agregadas por servicio: viajes, ingresos y comisiones';

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

-- Driver services
DROP POLICY IF EXISTS driver_services_read_own ON public.driver_services;
CREATE POLICY driver_services_read_own ON public.driver_services
  FOR SELECT USING (
    driver_id = (
      SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid()
    )
  );

DROP POLICY IF EXISTS "Only admins can assign services" ON public.driver_services;
CREATE POLICY "Only admins can assign services" ON public.driver_services
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND users.raw_user_meta_data ->> 'role' = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND users.raw_user_meta_data ->> 'role' = 'admin'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.driver_services FROM anon;
GRANT  INSERT, UPDATE, DELETE ON public.driver_services TO authenticated;

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

-- Services lectura pública / administración por admins
DROP POLICY IF EXISTS "Services are viewable by everyone" ON public.services;
DROP POLICY IF EXISTS "Services are modifiable by admins only" ON public.services;
DROP POLICY IF EXISTS services_public_read ON public.services;

CREATE POLICY "Services are viewable by everyone" ON public.services
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Services are modifiable by admins only" ON public.services
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND users.raw_user_meta_data ->> 'role' = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND users.raw_user_meta_data ->> 'role' = 'admin'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.services FROM anon;
GRANT  INSERT, UPDATE, DELETE ON public.services TO authenticated;

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'auth'
      AND table_name = 'config'
  ) THEN
    UPDATE auth.config
    SET
      external_firebase_enabled = true,
      external_firebase_issuer = 'https://securetoken.google.com/rundi-prod',
      external_firebase_client_id = 'rundi-prod';
  END IF;
END;
$$;

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

-- ============================================
-- 31. CMS TABLES: QUEJAS Y ACCIONES DE OPERADOR
-- ============================================

CREATE TABLE IF NOT EXISTS public.cms_complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  client_id VARCHAR(255) NULL,
  driver_id VARCHAR(255) NULL,
  created_by_user_id VARCHAR(255) NOT NULL,
  created_by_role VARCHAR(20) NOT NULL,
  assigned_to_user_id VARCHAR(255) NULL,
  category VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'::VARCHAR,
  priority VARCHAR(20) NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  resolution_notes TEXT NULL,
  chat_log_url TEXT NULL,
  show VARCHAR(32) NOT NULL DEFAULT 'All'::VARCHAR,
  resolved_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT cms_complaints_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

ALTER TABLE public.cms_complaints
  ADD COLUMN IF NOT EXISTS show VARCHAR(32) NOT NULL DEFAULT 'All'::VARCHAR;

COMMENT ON TABLE public.cms_complaints IS 'Quejas registradas desde el CMS (clientes, conductores, operadores)';
COMMENT ON COLUMN public.cms_complaints.ride_id IS 'Referencia opcional al viaje relacionado (public.rides.id)';
COMMENT ON COLUMN public.cms_complaints.client_id IS 'Firebase UID del cliente relacionado con la queja (si aplica)';
COMMENT ON COLUMN public.cms_complaints.driver_id IS 'Firebase UID del conductor relacionado con la queja (si aplica)';
COMMENT ON COLUMN public.cms_complaints.created_by_user_id IS 'Firebase UID de quien creó la queja (cliente, conductor, operador o admin)';
COMMENT ON COLUMN public.cms_complaints.created_by_role IS 'Rol de quien creó la queja: client, driver, operator, admin';
COMMENT ON COLUMN public.cms_complaints.assigned_to_user_id IS 'Firebase UID del operador/admin asignado a la queja';
COMMENT ON COLUMN public.cms_complaints.category IS 'Categoría de la queja: service, driver, payment, app, other';
COMMENT ON COLUMN public.cms_complaints.status IS 'Estado: open, in_progress, resolved, rejected';
COMMENT ON COLUMN public.cms_complaints.priority IS 'Prioridad: low, normal, high, urgent';
COMMENT ON COLUMN public.cms_complaints.chat_log_url IS 'URL en Supabase Storage del JSON con el historial de chat de esta queja';

CREATE INDEX IF NOT EXISTS idx_cms_complaints_ride_id ON public.cms_complaints USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_cms_complaints_client_id ON public.cms_complaints USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_cms_complaints_driver_id ON public.cms_complaints USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_cms_complaints_status ON public.cms_complaints USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cms_complaints_created_at ON public.cms_complaints USING btree (created_at DESC);

CREATE TRIGGER update_cms_complaints_updated_at
BEFORE UPDATE ON public.cms_complaints
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cms_operator_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  user_role VARCHAR(20) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NULL,
  target_id VARCHAR(255) NULL,
  metadata JSONB NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT cms_operator_actions_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

COMMENT ON TABLE public.cms_operator_actions IS 'Bitácora de acciones realizadas por usuarios del CMS (admin y operadores)';
COMMENT ON COLUMN public.cms_operator_actions.user_id IS 'Firebase UID del usuario del CMS que ejecutó la acción';
COMMENT ON COLUMN public.cms_operator_actions.user_role IS 'Rol del usuario del CMS: admin u operator';
COMMENT ON COLUMN public.cms_operator_actions.action_type IS 'Tipo de acción: update_driver_status, complete_ride, register_cash_payment, etc.';
COMMENT ON COLUMN public.cms_operator_actions.target_type IS 'Tipo de entidad afectada: ride, driver, client, payment, service, complaint, other';
COMMENT ON COLUMN public.cms_operator_actions.target_id IS 'Identificador de la entidad afectada (UUID o Firebase UID)';

CREATE INDEX IF NOT EXISTS idx_cms_operator_actions_user_id ON public.cms_operator_actions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_cms_operator_actions_action_type ON public.cms_operator_actions USING btree (action_type);
CREATE INDEX IF NOT EXISTS idx_cms_operator_actions_target_type ON public.cms_operator_actions USING btree (target_type);
CREATE INDEX IF NOT EXISTS idx_cms_operator_actions_created_at ON public.cms_operator_actions USING btree (created_at DESC);

ALTER TABLE public.cms_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_operator_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cms_complaints_own_read ON public.cms_complaints;
CREATE POLICY cms_complaints_own_read ON public.cms_complaints
  FOR SELECT USING (
    created_by_user_id = public.current_firebase_uid()
  );

DROP POLICY IF EXISTS cms_complaints_own_insert ON public.cms_complaints;
CREATE POLICY cms_complaints_own_insert ON public.cms_complaints
  FOR INSERT
  WITH CHECK (
    created_by_user_id = public.current_firebase_uid()
  );

DROP POLICY IF EXISTS cms_complaints_admin_all ON public.cms_complaints;
CREATE POLICY cms_complaints_admin_all ON public.cms_complaints
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND users.raw_user_meta_data ->> 'role' = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND users.raw_user_meta_data ->> 'role' = 'admin'
    )
  );

DROP POLICY IF EXISTS cms_operator_actions_admin_only ON public.cms_operator_actions;
CREATE POLICY cms_operator_actions_admin_only ON public.cms_operator_actions
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND users.raw_user_meta_data ->> 'role' = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND users.raw_user_meta_data ->> 'role' = 'admin'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.cms_complaints FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cms_operator_actions FROM anon;
