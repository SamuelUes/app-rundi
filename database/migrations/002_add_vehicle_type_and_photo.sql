-- ============================================
-- MIGRACIÓN 002: Tipo de vehículo y foto del cliente
-- Fecha: 2025-10-10
-- Base de datos: Supabase PostgreSQL
-- Proyecto: driveangel-ni
-- URL: https://ceytngpresytjhafcadu.supabase.co
-- ============================================

-- DESCRIPCIÓN:
-- Agrega soporte para selección de tipo de vehículo (moto/auto/conductor designado)
-- y foto del vehículo del cliente para servicio de conductor designado

-- INSTRUCCIONES:
-- 1. Ir a Supabase Dashboard: https://supabase.com/dashboard/project/ceytngpresytjhafcadu
-- 2. Ir a SQL Editor
-- 3. Copiar y pegar este script completo
-- 4. Ejecutar (Run)

-- ============================================
-- PASO 1: Agregar columnas a la tabla rides
-- ============================================
ALTER TABLE rides
ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50) DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS client_vehicle_photo TEXT;

-- ============================================
-- PASO 2: Agregar columna a vehicles para identificar si es 4x4
-- ============================================
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS is_4x4 BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS vehicle_photo TEXT;

-- ============================================
-- PASO 3: Comentarios para documentación
-- ============================================
COMMENT ON COLUMN rides.vehicle_type IS 'Tipo de vehículo solicitado: moto, auto, designated_driver';
COMMENT ON COLUMN rides.client_vehicle_photo IS 'URL de la foto del vehículo del cliente (solo para conductor designado)';
COMMENT ON COLUMN vehicles.is_4x4 IS 'Indica si el vehículo es 4x4 (requerido para conductor designado)';
COMMENT ON COLUMN vehicles.vehicle_photo IS 'URL de la foto del vehículo del conductor';

-- ============================================
-- PASO 4: Crear índices para búsquedas optimizadas
-- ============================================
CREATE INDEX IF NOT EXISTS idx_rides_vehicle_type ON rides(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_4x4 ON vehicles(is_4x4) WHERE is_4x4 = TRUE;

-- ============================================
-- PASO 5: Actualizar vehículos existentes (opcional)
-- ============================================
-- Descomentar si quieres marcar automáticamente algunos tipos como 4x4
-- UPDATE vehicles SET is_4x4 = TRUE WHERE type IN ('suv', 'pickup', 'jeep', '4x4');

-- ============================================
-- PASO 6: Verificar que la migración fue exitosa
-- ============================================
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'rides' 
AND column_name IN ('vehicle_type', 'client_vehicle_photo')
UNION ALL
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'vehicles' 
AND column_name IN ('is_4x4', 'vehicle_photo')
ORDER BY column_name;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- column_name            | data_type        | column_default | is_nullable
-- -----------------------|------------------|----------------|------------
-- client_vehicle_photo   | text             | NULL           | YES
-- is_4x4                 | boolean          | false          | YES
-- vehicle_photo          | text             | NULL           | YES
-- vehicle_type           | character varying| 'auto'         | YES
-- ============================================
