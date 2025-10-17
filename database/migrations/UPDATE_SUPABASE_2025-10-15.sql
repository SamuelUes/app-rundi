-- ============================================
-- SCRIPT DE ACTUALIZACIÓN SUPABASE
-- Fecha: 2025-10-15
-- Ejecutar en: https://supabase.com/dashboard/project/ceytngpresytjhafcadu/editor
-- ============================================
-- 
-- IMPORTANTE: Este script actualiza la base de datos existente
-- Si prefieres crear desde cero, usa supabase-only.sql
-- ============================================

-- ============================================
-- PASO 1: ELIMINAR TABLA OBSOLETA
-- ============================================

-- Eliminar tabla cash_recharges (sistema de recargas removido)
DROP TABLE IF EXISTS public.cash_recharges CASCADE;

COMMENT ON DATABASE postgres IS 'Tabla cash_recharges eliminada - Sistema de recargas removido';

-- ============================================
-- PASO 2: AGREGAR NUEVAS COLUMNAS A RATINGS
-- ============================================

-- Agregar columnas de categorías detalladas
ALTER TABLE public.ratings 
ADD COLUMN IF NOT EXISTS driving INTEGER,
ADD COLUMN IF NOT EXISTS safety INTEGER,
ADD COLUMN IF NOT EXISTS friendliness INTEGER;

-- Agregar constraints de validación
ALTER TABLE public.ratings 
DROP CONSTRAINT IF EXISTS ratings_driving_check,
DROP CONSTRAINT IF EXISTS ratings_safety_check,
DROP CONSTRAINT IF EXISTS ratings_friendliness_check;

ALTER TABLE public.ratings 
ADD CONSTRAINT ratings_driving_check CHECK ((driving >= 1) AND (driving <= 5)),
ADD CONSTRAINT ratings_safety_check CHECK ((safety >= 1) AND (safety <= 5)),
ADD CONSTRAINT ratings_friendliness_check CHECK ((friendliness >= 1) AND (friendliness <= 5));

-- Agregar comentarios
COMMENT ON COLUMN public.ratings.driving IS 'Conducción (1-5) - OPCIONAL - Solo para conductores';
COMMENT ON COLUMN public.ratings.safety IS 'Seguridad (1-5) - OPCIONAL';
COMMENT ON COLUMN public.ratings.friendliness IS 'Amabilidad (1-5) - OPCIONAL';

-- ============================================
-- PASO 3: AGREGAR NUEVAS COLUMNAS A PAYMENTS
-- ============================================

-- Agregar columnas de notas y razón de cancelación
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Agregar comentarios
COMMENT ON COLUMN public.payments.notes IS 'Notas adicionales sobre el pago';
COMMENT ON COLUMN public.payments.cancel_reason IS 'Razón de cancelación del pago (si aplica)';

-- ============================================
-- PASO 4: CREAR ÍNDICES OPTIMIZADOS
-- ============================================

-- Índice compuesto para ratings (optimiza getUserRating)
CREATE INDEX IF NOT EXISTS idx_ratings_user_rating 
ON public.ratings USING btree (to_user_id, rating);

-- Índice para búsquedas por razón de cancelación
CREATE INDEX IF NOT EXISTS idx_payments_cancel_reason 
ON public.payments USING btree (cancel_reason) 
WHERE cancel_reason IS NOT NULL;

-- Índice para historial de tracking (orden descendente)
DROP INDEX IF EXISTS idx_ride_locations_timestamp;
CREATE INDEX idx_ride_locations_timestamp 
ON public.ride_locations USING btree (timestamp DESC);

-- Índice para from_user_id en ratings
CREATE INDEX IF NOT EXISTS idx_ratings_from_user_id 
ON public.ratings USING btree (from_user_id);

-- ============================================
-- PASO 5: ACTUALIZAR COMENTARIOS DE TABLAS
-- ============================================

-- Actualizar comentario de ride_locations para reflejar compresión
COMMENT ON TABLE public.ride_locations IS 'Historial COMPRIMIDO de ubicaciones (cada 30s o 50+ metros) - Tracking en vivo está en Firebase Realtime DB';

-- ============================================
-- PASO 6: VERIFICACIÓN
-- ============================================

-- Verificar que cash_recharges NO existe
SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'cash_recharges'
    ) THEN '✅ cash_recharges eliminada correctamente'
    ELSE '❌ ERROR: cash_recharges todavía existe'
  END as status_cash_recharges;

-- Verificar nuevas columnas en ratings
SELECT 
  CASE 
    WHEN COUNT(*) = 3 THEN '✅ Columnas de ratings agregadas correctamente'
    ELSE '❌ ERROR: Faltan columnas en ratings'
  END as status_ratings
FROM information_schema.columns 
WHERE table_name = 'ratings' 
AND column_name IN ('driving', 'safety', 'friendliness');

-- Verificar nuevas columnas en payments
SELECT 
  CASE 
    WHEN COUNT(*) = 2 THEN '✅ Columnas de payments agregadas correctamente'
    ELSE '❌ ERROR: Faltan columnas en payments'
  END as status_payments
FROM information_schema.columns 
WHERE table_name = 'payments' 
AND column_name IN ('notes', 'cancel_reason');

-- Verificar índices nuevos
SELECT 
  CASE 
    WHEN COUNT(*) >= 3 THEN '✅ Índices creados correctamente'
    ELSE '❌ ERROR: Faltan índices'
  END as status_indexes
FROM pg_indexes 
WHERE indexname IN ('idx_ratings_user_rating', 'idx_payments_cancel_reason', 'idx_ratings_from_user_id');

-- Contar tablas totales (debe ser 9)
SELECT 
  COUNT(*) as total_tables,
  CASE 
    WHEN COUNT(*) = 9 THEN '✅ Total de tablas correcto'
    ELSE '⚠️ WARNING: Se esperaban 9 tablas'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE';

-- Mostrar resumen de todas las tablas
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
-- ✅ cash_recharges eliminada correctamente
-- ✅ Columnas de ratings agregadas correctamente
-- ✅ Columnas de payments agregadas correctamente
-- ✅ Índices creados correctamente
-- ✅ Total de tablas correcto (9)
--
-- Tablas finales:
-- - analytics_events (8 columnas)
-- - driver_penalties (10 columnas)
-- - drivers (11 columnas)
-- - emergency_calls (13 columnas)
-- - payments (18 columnas)
-- - ratings (13 columnas)
-- - ride_locations (9 columnas)
-- - rides (28 columnas)
-- - vehicles (18 columnas)
-- ============================================

-- ============================================
-- SCRIPT COMPLETADO
-- ============================================
SELECT '🎉 ACTUALIZACIÓN COMPLETADA - Revisa los resultados arriba' as mensaje;
