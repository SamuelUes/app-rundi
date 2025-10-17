-- Migración: Agregar columna cancel_reason a tablas payments y driver_penalties
-- Fecha: 2025-10-13
-- Descripción: Permite registrar la razón de cancelación de pagos y penalizaciones

-- 1. Agregar columna cancel_reason a tabla payments
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN payments.cancel_reason IS 'Razón de cancelación del pago (si aplica)';

-- 2. Agregar columna cancel_reason a tabla driver_penalties
ALTER TABLE driver_penalties 
ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN driver_penalties.cancel_reason IS 'Razón de la penalización o cancelación';

-- 3. Crear índice para búsquedas por razón de cancelación
CREATE INDEX IF NOT EXISTS idx_payments_cancel_reason 
ON payments(cancel_reason) 
WHERE cancel_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_penalties_cancel_reason 
ON driver_penalties(cancel_reason) 
WHERE cancel_reason IS NOT NULL;

-- Verificar cambios
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payments' AND column_name = 'cancel_reason';

SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'driver_penalties' AND column_name = 'cancel_reason';
