-- ============================================================================
-- 0002_identity.sql — users (NUEVA), drivers, vehicles
-- Fuente: supabase-only.sql (drivers, vehicles) + decisión §10: users es
-- Firestore-first operativo; esta tabla SQL es el registro histórico/admin.
-- Cambios vs baseline:
--   + public.users (nueva — registro histórico; la app lee DATA-MAIN_users)
--   + deleted_at en drivers/vehicles (soft-delete, ya aplicado vía migrations)
--   - Eliminado RLS/auth.* (autorización en API, roles BD en 0008)
-- Convención v2: TODOS los timestamps son TIMESTAMPTZ.
-- ============================================================================

BEGIN;

-- Trigger genérico updated_at (portado de supabase-only.sql)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- USERS (NUEVA)
-- Registro histórico de usuarios. El perfil operativo vive en Firestore
-- DATA-MAIN_users/{uid} (firestore-first). Esta tabla la escribe el backend
-- para identidad, auditoría y joins históricos. PK = Firebase Auth UID.
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id VARCHAR(255) NOT NULL,                    -- Firebase Auth UID (join universal)
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  name VARCHAR(255) NULL,
  role public.app_role NOT NULL DEFAULT 'client',
  auth_provider VARCHAR(30) NULL,              -- phone | google | apple (según authService)
  birth_date DATE NULL,
  profile_photo VARCHAR(500) NULL,             -- objectPath en Cloud Storage
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- UPGRADE: si users ya existía con menos columnas (deploy viejo), las garantiza.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'client';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(500);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON TABLE public.users IS 'Registro histórico/admin de usuarios. NO es el perfil operativo (ese vive en Firestore DATA-MAIN_users). PK = Firebase UID.';
COMMENT ON COLUMN public.users.role IS 'Rol principal. Permisos granulares via custom claims; este campo es referencia histórica.';
COMMENT ON COLUMN public.users.last_seen_at IS 'Solo histórico (se actualiza en upserts de perfil). La presencia operativa vive en REALTIME_presence/drivers_live.';

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users USING btree (role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users USING btree (email) WHERE email IS NOT NULL;

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- DRIVERS
-- user_id = Firebase Auth UID → join a public.users.id
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
  account_status public.driver_account_status NOT NULL DEFAULT 'pending',
  documents_status public.driver_documents_status NOT NULL DEFAULT 'pending',
  designated_role_status public.designated_role_request_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL,
  compliance_status public.driver_compliance_status NOT NULL DEFAULT 'pending_documents',
  total_rides INTEGER NULL DEFAULT 0,
  average_rating NUMERIC(3, 2) NULL DEFAULT 0,
  total_earnings NUMERIC(10, 2) NULL DEFAULT 0,
  current_recharge_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT drivers_pkey PRIMARY KEY (id),
  CONSTRAINT drivers_user_id_key UNIQUE (user_id),
  CONSTRAINT drivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT drivers_average_rating_check CHECK (average_rating IS NULL OR (average_rating >= 0 AND average_rating <= 5))
);

-- UPGRADE: en el esquema viejo la columna se llamaba designated_rol_requested.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='drivers' AND column_name='designated_rol_requested')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='drivers' AND column_name='designated_role_status') THEN
    ALTER TABLE public.drivers RENAME COLUMN designated_rol_requested TO designated_role_status;
  END IF;
END $$;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS compliance_status public.driver_compliance_status NOT NULL DEFAULT 'pending_documents';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON TABLE public.drivers IS 'Datos de conductores. user_id = Firebase UID (join a users.id); id = UUID interno (referenciado por vehicles, driver_services, compliance).';
COMMENT ON COLUMN public.drivers.current_recharge_balance IS 'Saldo billetera PuntoExpress. Autoridad SQL; proyección a DATA-MAIN_drivers. Movimientos en driver_wallet_movements.';
COMMENT ON COLUMN public.drivers.compliance_status IS 'Estado derivado recalculado por el compliance engine (migration.sql §3). documents_status legacy se mantiene para compatibilidad.';
COMMENT ON COLUMN public.drivers.designated_role_status IS 'Antes designated_rol_requested. Estado del permiso para operar como conductor designado.';

-- drivers_user_id_key (UNIQUE) ya cubre búsquedas por user_id — sin índice extra.
CREATE INDEX IF NOT EXISTS idx_drivers_account_status ON public.drivers USING btree (account_status);
CREATE INDEX IF NOT EXISTS idx_drivers_documents_status ON public.drivers USING btree (documents_status);
CREATE INDEX IF NOT EXISTS idx_drivers_department ON public.drivers USING btree (department);
CREATE INDEX IF NOT EXISTS idx_drivers_municipality ON public.drivers USING btree (municipality);
CREATE INDEX IF NOT EXISTS idx_drivers_designated_role_status ON public.drivers USING btree (designated_role_status);
CREATE INDEX IF NOT EXISTS idx_drivers_deleted_at ON public.drivers USING btree (deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_drivers_updated_at ON public.drivers;
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- VEHICLES
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
  insurance_number VARCHAR(50) NULL,
  insurance_company VARCHAR(100) NULL,
  insurance_start_date DATE NULL,
  insurance_expiry DATE NULL,
  insurance_photo VARCHAR(500) NULL,
  is_4x4 BOOLEAN NULL DEFAULT FALSE,
  vehicle_photo TEXT NULL,
  is_active BOOLEAN NULL DEFAULT TRUE,
  compliance_status public.vehicle_compliance_status NOT NULL DEFAULT 'pending_verification',
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE,
  CONSTRAINT vehicles_plate_key UNIQUE (plate),
  CONSTRAINT vehicles_year_check CHECK (year IS NULL OR (year >= 1900 AND year <= 2100))
);

-- UPGRADE: columnas nuevas si la tabla ya existía.
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS compliance_status public.vehicle_compliance_status NOT NULL DEFAULT 'pending_verification';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON TABLE public.vehicles IS 'Vehículos con documentación formato NI. Columnas photo* = objectPath en Cloud Storage (no URLs).';
COMMENT ON COLUMN public.vehicles.driver_id IS 'UUID interno → drivers.id (NO Firebase UID)';
COMMENT ON COLUMN public.vehicles.compliance_status IS 'Estado derivado recalculado por el compliance engine a partir de sus documentos.';
COMMENT ON COLUMN public.vehicles.type IS 'Tipo declarado en tarjeta de circulación (auto/moto/suv/pickup/…): dominio abierto, VARCHAR deliberado.';

CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON public.vehicles USING btree (driver_id);
-- vehicles_plate_key (UNIQUE) ya cubre búsquedas por plate — sin índice extra.
CREATE INDEX IF NOT EXISTS idx_vehicles_is_4x4 ON public.vehicles USING btree (is_4x4) WHERE is_4x4 = TRUE;
CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON public.vehicles USING btree (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON public.vehicles USING btree (deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
