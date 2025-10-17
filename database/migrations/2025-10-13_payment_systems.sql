-- ============================================
-- MIGRATION: Payment Systems Implementation
-- Date: 2025-10-13
-- Description: 
--   1. Add payment_type to rides table
--   2. Update payments table for local banks
--   3. Create driver_penalties table
--   4. Create cash_recharges table
-- ============================================

-- ============================================
-- 1. ADD PAYMENT_TYPE TO RIDES TABLE
-- ============================================

-- Add payment_type column to rides
ALTER TABLE public.rides 
ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'cash';

-- Add comment
COMMENT ON COLUMN public.rides.payment_type IS 'Método de pago: cash (efectivo), card_local (bancos locales), stripe';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_rides_payment_type 
ON public.rides USING btree (payment_type);

-- ============================================
-- 2. UPDATE PAYMENTS TABLE FOR LOCAL BANKS
-- ============================================

-- Add payment_provider column
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20);

-- Add local bank columns
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS local_transaction_id VARCHAR(255);

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS local_authorization_code VARCHAR(255);

ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS local_bank VARCHAR(20);

-- Update total calculation (amount + tip instead of amount - commission - tip)
ALTER TABLE public.payments 
DROP COLUMN IF EXISTS total;

ALTER TABLE public.payments 
ADD COLUMN total NUMERIC(10, 2) GENERATED ALWAYS AS (amount + tip) STORED;

-- Add unique constraint for local_transaction_id
ALTER TABLE public.payments 
ADD CONSTRAINT payments_local_transaction_id_key UNIQUE (local_transaction_id);

-- Add comments
COMMENT ON COLUMN public.payments.payment_provider IS 'Proveedor: stripe o local';
COMMENT ON COLUMN public.payments.local_transaction_id IS 'ID de transacción del banco local';
COMMENT ON COLUMN public.payments.local_authorization_code IS 'Código de autorización del banco local';
COMMENT ON COLUMN public.payments.local_bank IS 'Banco: bac, banpro, lafise, ficohsa, avanz';
COMMENT ON COLUMN public.payments.total IS 'Total que paga el cliente: amount + tip';

-- Create index for local_transaction_id
CREATE INDEX IF NOT EXISTS idx_payments_local_transaction_id 
ON public.payments USING btree (local_transaction_id);

-- ============================================
-- 3. CREATE DRIVER_PENALTIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.driver_penalties (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id VARCHAR(255) NOT NULL,
  ride_id UUID NULL,
  penalty_type VARCHAR(50) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  reason TEXT NULL,
  progress_percentage NUMERIC(5, 2) NULL,
  status VARCHAR(20) DEFAULT 'pending',
  deducted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT driver_penalties_pkey PRIMARY KEY (id),
  CONSTRAINT driver_penalties_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE SET NULL
) TABLESPACE pg_default;

-- Add comments
COMMENT ON TABLE public.driver_penalties IS 'Penalizaciones para conductores por cancelaciones u otras infracciones';
COMMENT ON COLUMN public.driver_penalties.penalty_type IS 'Tipo: cancellation, late_arrival, customer_complaint, etc.';
COMMENT ON COLUMN public.driver_penalties.amount IS 'Monto de la penalización (generalmente la comisión del viaje)';
COMMENT ON COLUMN public.driver_penalties.progress_percentage IS 'Porcentaje de progreso cuando ocurrió la infracción';
COMMENT ON COLUMN public.driver_penalties.status IS 'Estado: pending (pendiente), deducted (descontada), forgiven (perdonada)';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_driver_penalties_driver_id 
ON public.driver_penalties USING btree (driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_penalties_status 
ON public.driver_penalties USING btree (status);

CREATE INDEX IF NOT EXISTS idx_driver_penalties_created_at 
ON public.driver_penalties USING btree (created_at);

-- Create trigger for updated_at
CREATE TRIGGER update_driver_penalties_updated_at 
BEFORE UPDATE ON public.driver_penalties
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. CREATE CASH_RECHARGES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.cash_recharges (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id VARCHAR(255) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  commission_total NUMERIC(10, 2) NOT NULL,
  rides_count INTEGER NOT NULL,
  ride_ids UUID[] NULL,
  payment_method VARCHAR(50) NULL,
  payment_reference VARCHAR(255) NULL,
  payment_proof VARCHAR(500) NULL,
  status VARCHAR(20) DEFAULT 'pending',
  verified_by VARCHAR(255) NULL,
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  rejection_reason TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT cash_recharges_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- Add comments
COMMENT ON TABLE public.cash_recharges IS 'Recargas/depósitos de conductores para cubrir comisiones de viajes pagados en efectivo';
COMMENT ON COLUMN public.cash_recharges.amount IS 'Monto total depositado por el conductor';
COMMENT ON COLUMN public.cash_recharges.commission_total IS 'Total de comisiones que cubre este depósito';
COMMENT ON COLUMN public.cash_recharges.rides_count IS 'Cantidad de viajes en cash incluidos en esta recarga';
COMMENT ON COLUMN public.cash_recharges.ride_ids IS 'Array de UUIDs de los viajes cubiertos';
COMMENT ON COLUMN public.cash_recharges.status IS 'Estado: pending (pendiente verificación), verified (verificado), rejected (rechazado)';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cash_recharges_driver_id 
ON public.cash_recharges USING btree (driver_id);

CREATE INDEX IF NOT EXISTS idx_cash_recharges_status 
ON public.cash_recharges USING btree (status);

CREATE INDEX IF NOT EXISTS idx_cash_recharges_created_at 
ON public.cash_recharges USING btree (created_at);

-- Create trigger for updated_at
CREATE TRIGGER update_cash_recharges_updated_at 
BEFORE UPDATE ON public.cash_recharges
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify rides.payment_type was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'rides' AND column_name = 'payment_type';

-- Verify payments columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payments' 
AND column_name IN ('payment_provider', 'local_transaction_id', 'local_authorization_code', 'local_bank');

-- Verify driver_penalties table was created
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'driver_penalties';

-- Verify cash_recharges table was created
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'cash_recharges';

-- Count records in new tables (should be 0)
SELECT 
  (SELECT COUNT(*) FROM driver_penalties) as penalties_count,
  (SELECT COUNT(*) FROM cash_recharges) as recharges_count;

-- ============================================
-- ROLLBACK (if needed)
-- ============================================

-- Uncomment the following lines to rollback changes:

/*
-- Drop new tables
DROP TABLE IF EXISTS public.cash_recharges CASCADE;
DROP TABLE IF EXISTS public.driver_penalties CASCADE;

-- Remove columns from payments
ALTER TABLE public.payments DROP COLUMN IF EXISTS payment_provider;
ALTER TABLE public.payments DROP COLUMN IF EXISTS local_transaction_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS local_authorization_code;
ALTER TABLE public.payments DROP COLUMN IF EXISTS local_bank;

-- Remove column from rides
ALTER TABLE public.rides DROP COLUMN IF EXISTS payment_type;
*/

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

SELECT 'Migration completed successfully!' as status;
