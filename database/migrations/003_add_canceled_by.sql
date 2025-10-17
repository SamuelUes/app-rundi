-- ============================================
-- Migración: Agregar campo canceled_by
-- Fecha: 10 de Octubre 2025
-- Descripción: Agregar campo para identificar quién canceló el viaje
-- ============================================

-- Agregar columna canceled_by a la tabla rides
ALTER TABLE rides 
ADD COLUMN IF NOT EXISTS canceled_by VARCHAR(10) CHECK (canceled_by IN ('client', 'driver'));

-- Crear índice para consultas de cancelaciones
CREATE INDEX IF NOT EXISTS idx_rides_canceled_by ON rides(canceled_by) WHERE canceled_by IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN rides.canceled_by IS 'Indica quién canceló el viaje: client o driver';

-- Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'rides' 
AND column_name = 'canceled_by';
