-- ============================================
-- MIGRACIÓN: Agregar soporte para múltiples pasajeros y destinos
-- Fecha: 2025-10-10
-- Base de datos: Supabase PostgreSQL
-- Proyecto: driveangel-ni
-- URL: https://ceytngpresytjhafcadu.supabase.co
-- ============================================

-- INSTRUCCIONES:
-- 1. Ir a Supabase Dashboard: https://supabase.com/dashboard/project/ceytngpresytjhafcadu
-- 2. Ir a SQL Editor
-- 3. Copiar y pegar este script completo
-- 4. Ejecutar (Run)

-- ============================================
-- PASO 1: Agregar columnas a la tabla rides
-- ============================================
ALTER TABLE rides 
ADD COLUMN IF NOT EXISTS passengers INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS extra_destinations JSONB,
ADD COLUMN IF NOT EXISTS driver_offered_price DECIMAL(10, 2);

-- ============================================
-- PASO 2: Agregar comentarios descriptivos
-- ============================================
COMMENT ON COLUMN rides.passengers IS 'Cantidad de pasajeros (1-6)';
COMMENT ON COLUMN rides.extra_destinations IS 'Array JSON de paradas adicionales [{address, lat, lng}]';
COMMENT ON COLUMN rides.driver_offered_price IS 'Precio ofrecido por el conductor (si es diferente al estimado)';

-- ============================================
-- PASO 3: Crear índice para optimizar búsquedas
-- ============================================
CREATE INDEX IF NOT EXISTS idx_rides_passengers ON rides(passengers);

-- ============================================
-- PASO 4: Verificar que la migración fue exitosa
-- ============================================
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'rides' 
AND column_name IN ('passengers', 'extra_destinations', 'driver_offered_price')
ORDER BY column_name;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- column_name            | data_type | column_default | is_nullable
-- -----------------------|-----------|----------------|------------
-- driver_offered_price   | numeric   | NULL           | YES
-- extra_destinations     | jsonb     | NULL           | YES
-- passengers             | integer   | 1              | YES
-- ============================================
