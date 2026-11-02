-- ============================================================================
-- 0004_payments.sql — payments, driver_wallet_movements (antes
-- drivers_recharges), ratings, biometric_authentications,
-- sms_verification_codes.
-- Fuente: supabase-only.sql §4-§7,§10-§11 + fix-commisions-and-rpc.sql.
-- Cambios vs baseline:
--   - payments.synced_to_firebase/firebase_synced_at eliminados (Outbox)
--   - payments.total → columna GENERADA (amount + tip): integridad garantizada
--   - driver_wallet_movements: renombrada (contiene deducciones, comisiones y
--     ajustes — no solo recargas) + enums wallet_movement_*
--   - driver_penalties ELIMINADA (su rol lo cubre wallet type='deduction';
--     el ETL pliega el histórico como movimientos)
--   - cards ELIMINADA (pagos con tarjeta no existen en v2; se recrea cuando
--     llegue el flujo card_local real)
--   + UNIQUE parcial payments(ride_id): un viaje activo = una obligación de
--     pago (evita pagos duplicados por reintentos concurrentes)
-- Convención v2: TODOS los timestamps son TIMESTAMPTZ.
-- ============================================================================

BEGIN;

-- ============================================
-- PAYMENTS — autoridad financiera
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,

  -- Montos (C$)
  amount NUMERIC(10, 2) NOT NULL,
  tip NUMERIC(10, 2) NOT NULL DEFAULT 0,
  commission NUMERIC(10, 2) NOT NULL,
  commission_rate_applied NUMERIC(5, 4) NULL,   -- snapshot de tasa aplicada
  -- total = amount + tip: columna GENERADA, no se inserta ni actualiza a mano.
  total NUMERIC(10, 2) GENERATED ALWAYS AS (amount + tip) STORED,

  payment_method public.payment_method NULL,
  payment_provider public.payment_provider NULL,

  status public.payment_status NOT NULL DEFAULT 'pending',
  commission_status public.commission_status NULL DEFAULT 'pending',

  -- Bancos locales (card_local)
  local_transaction_id VARCHAR(255) NULL,
  local_authorization_code VARCHAR(255) NULL,
  local_bank public.local_bank NULL,

  notes TEXT NULL,
  cancel_reason TEXT NULL,

  -- Autenticación de cobro
  biometric_authenticated BOOLEAN NULL DEFAULT FALSE,
  biometric_type public.biometric_type NULL,
  authentication_method public.payment_auth_method NULL DEFAULT 'manual',
  sms_code_verified BOOLEAN NULL DEFAULT FALSE,
  sms_verification_id UUID NULL,

  paid_at TIMESTAMPTZ NULL,
  commission_paid_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_local_transaction_id_key UNIQUE (local_transaction_id),
  CONSTRAINT payments_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE RESTRICT,
  CONSTRAINT payments_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT payments_tip_nonneg CHECK (tip >= 0),
  CONSTRAINT payments_commission_nonneg CHECK (commission >= 0),
  CONSTRAINT payments_commission_rate_range CHECK (commission_rate_applied IS NULL OR (commission_rate_applied >= 0 AND commission_rate_applied <= 1))
);

-- UPGRADE: columnas nuevas si payments ya existía (deploy viejo).
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS sms_verification_id UUID;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS commission_status public.commission_status;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS biometric_type public.biometric_type;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS authentication_method public.payment_auth_method NOT NULL DEFAULT 'manual';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS biometric_authenticated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS sms_code_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS commission_paid_at TIMESTAMPTZ;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON TABLE public.payments IS 'Autoridad financiera: cash y card_local. El estado live se proyecta a REALTIME_payments_live; NUNCA aceptar confirmación financiera directa del cliente.';
COMMENT ON COLUMN public.payments.commission_rate_applied IS 'Snapshot: el histórico no cambia si luego se modifica services.commission_rate.';
COMMENT ON COLUMN public.payments.total IS 'GENERADA = amount + tip. No insertar/actualizar: la consistencia la garantiza la BD.';

-- Una obligación de pago por viaje (los reintentos actualizan la misma fila).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_per_ride
  ON public.payments (ride_id) WHERE deleted_at IS NULL AND ride_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_ride_id ON public.payments USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments USING btree (status);
-- payments_local_transaction_id_key (UNIQUE) ya cubre búsquedas por local_transaction_id.
CREATE INDEX IF NOT EXISTS idx_payments_cancel_reason ON public.payments USING btree (cancel_reason) WHERE cancel_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_biometric ON public.payments USING btree (biometric_authenticated) WHERE biometric_authenticated = TRUE;
CREATE INDEX IF NOT EXISTS idx_payments_authentication_method ON public.payments USING btree (authentication_method);
CREATE INDEX IF NOT EXISTS idx_payments_commission_status ON public.payments USING btree (commission_status) WHERE commission_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON public.payments USING btree (deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- DRIVER_WALLET_MOVEMENTS — billetera PuntoExpress (recargas, deducciones,
-- comisiones, ajustes). Antes drivers_recharges.
-- ============================================
CREATE TABLE IF NOT EXISTS public.driver_wallet_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id VARCHAR(255) NOT NULL,              -- Firebase UID → drivers.user_id
  ride_id UUID NULL,
  movement_type public.wallet_movement_type NOT NULL DEFAULT 'recharge',
  source public.wallet_movement_source NOT NULL DEFAULT 'manual',
  amount NUMERIC(12, 2) NOT NULL,
  balance_before NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(12, 2) NOT NULL DEFAULT 0,
  external_reference VARCHAR(255) NULL,
  external_transaction_id VARCHAR(255) NULL,
  metadata JSONB NULL,
  status public.wallet_movement_status NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT driver_wallet_movements_pkey PRIMARY KEY (id),
  CONSTRAINT driver_wallet_movements_driver_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(user_id) ON DELETE RESTRICT,
  CONSTRAINT driver_wallet_movements_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL,
  CONSTRAINT driver_wallet_movements_external_txn_unique UNIQUE (external_transaction_id),
  CONSTRAINT driver_wallet_movements_amount_check CHECK (amount <> 0),
  CONSTRAINT driver_wallet_movements_balance_consistency CHECK (status <> 'confirmed' OR balance_after = balance_before + amount)
);
COMMENT ON TABLE public.driver_wallet_movements IS 'Ledger de billetera del conductor. Antes drivers_recharges. Penalidades históricas se pliegan como movement_type=''deduction'' con metadata.penalty_type.';
COMMENT ON COLUMN public.driver_wallet_movements.driver_id IS 'Firebase UID → drivers.user_id (consistente con rides.driver_id)';

CREATE INDEX IF NOT EXISTS idx_wallet_movements_driver_id ON public.driver_wallet_movements USING btree (driver_id);
CREATE INDEX IF NOT EXISTS idx_wallet_movements_ride_id ON public.driver_wallet_movements USING btree (ride_id) WHERE ride_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_movements_status ON public.driver_wallet_movements USING btree (status);
CREATE INDEX IF NOT EXISTS idx_wallet_movements_created_at ON public.driver_wallet_movements USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_movements_driver_created ON public.driver_wallet_movements USING btree (driver_id, created_at DESC);

DROP TRIGGER IF EXISTS update_wallet_movements_updated_at ON public.driver_wallet_movements;
CREATE TRIGGER update_wallet_movements_updated_at BEFORE UPDATE ON public.driver_wallet_movements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RATINGS — calificaciones por rol (captain/follower incluidos)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT NULL,
  punctuality INTEGER NULL,
  cleanliness INTEGER NULL,
  communication INTEGER NULL,
  driving INTEGER NULL,
  safety INTEGER NULL,
  friendliness INTEGER NULL,
  rated_role VARCHAR(20) NULL,                  -- driver|captain|follower|client
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT ratings_pkey PRIMARY KEY (id),
  CONSTRAINT ratings_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE RESTRICT,
  CONSTRAINT ratings_from_user_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT ratings_to_user_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT ratings_rated_role_check CHECK (rated_role IS NULL OR rated_role IN ('driver', 'captain', 'follower', 'client')),
  CONSTRAINT ratings_rating_check CHECK ((rating >= 1) AND (rating <= 5)),
  CONSTRAINT ratings_punctuality_check CHECK ((punctuality >= 1) AND (punctuality <= 5)),
  CONSTRAINT ratings_cleanliness_check CHECK ((cleanliness >= 1) AND (cleanliness <= 5)),
  CONSTRAINT ratings_communication_check CHECK ((communication >= 1) AND (communication <= 5)),
  CONSTRAINT ratings_driving_check CHECK ((driving >= 1) AND (driving <= 5)),
  CONSTRAINT ratings_safety_check CHECK ((safety >= 1) AND (safety <= 5)),
  CONSTRAINT ratings_friendliness_check CHECK ((friendliness >= 1) AND (friendliness <= 5))
);

-- UPGRADE: deleted_at si la tabla ya existía.
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Una sola calificación por (viaje, autor, destinatario); dedupe del API.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ratings_once
  ON public.ratings(ride_id, from_user_id, to_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_ride_id ON public.ratings USING btree (ride_id);
CREATE INDEX IF NOT EXISTS idx_ratings_to_user_id ON public.ratings USING btree (to_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON public.ratings USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_user_rating ON public.ratings USING btree (to_user_id, rating);
CREATE INDEX IF NOT EXISTS idx_ratings_deleted_at ON public.ratings USING btree (deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- BIOMETRIC_AUTHENTICATIONS — log de intentos
-- ============================================
CREATE TABLE IF NOT EXISTS public.biometric_authentications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  user_id VARCHAR(255) NOT NULL,
  user_type VARCHAR(20) NOT NULL,
  biometric_type public.biometric_type NOT NULL,
  context VARCHAR(50) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  error_message TEXT NULL,
  attempted_at TIMESTAMPTZ NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT biometric_authentications_pkey PRIMARY KEY (id),
  CONSTRAINT biometric_authentications_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT biometric_authentications_ride_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_biometric_auth_user_id ON public.biometric_authentications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_auth_ride_id ON public.biometric_authentications USING btree (ride_id) WHERE ride_id IS NOT NULL;

-- ============================================
-- SMS_VERIFICATION_CODES
-- ============================================
CREATE TABLE IF NOT EXISTS public.sms_verification_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  user_id VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NULL,
  email TEXT NULL,
  is_email BOOLEAN NULL DEFAULT FALSE,
  code VARCHAR(6) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  context VARCHAR(50) NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NULL DEFAULT 3,
  sent_at TIMESTAMPTZ NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL DEFAULT (NOW() + '00:10:00'::interval),
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT sms_verification_codes_pkey PRIMARY KEY (id),
  CONSTRAINT sms_verification_codes_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT sms_verification_codes_ride_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sms_codes_user_id ON public.sms_verification_codes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_sms_codes_expires_at ON public.sms_verification_codes USING btree (expires_at);

DROP TRIGGER IF EXISTS update_sms_codes_updated_at ON public.sms_verification_codes;
CREATE TRIGGER update_sms_codes_updated_at BEFORE UPDATE ON public.sms_verification_codes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FK diferida: payments.sms_verification_id → sms_verification_codes.id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_sms_verification_fkey') THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_sms_verification_fkey
      FOREIGN KEY (sms_verification_id) REFERENCES public.sms_verification_codes(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

COMMIT;
