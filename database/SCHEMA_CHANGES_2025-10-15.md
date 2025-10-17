# 📋 CAMBIOS EN SCHEMA DE SUPABASE

## Fecha: 2025-10-15
## Archivo: `supabase-only.sql`

---

## 🎯 RESUMEN DE CAMBIOS

### ✅ Tablas Eliminadas:
1. **cash_recharges** - Sistema de recargas removido (comisión se cobra quincenal/mensual)

### ✅ Columnas Agregadas:

**ratings:**
- `driving` INTEGER (1-5) - Calificación de conducción (solo para conductores)
- `safety` INTEGER (1-5) - Calificación de seguridad
- `friendliness` INTEGER (1-5) - Calificación de amabilidad

**payments:**
- `notes` TEXT - Notas adicionales sobre el pago
- `cancel_reason` TEXT - Razón de cancelación del pago (si aplica)

### ✅ Índices Optimizados:
- `idx_ratings_user_rating` - Índice compuesto para queries de promedio por usuario
- `idx_payments_cancel_reason` - Índice para búsquedas por razón de cancelación
- `idx_ride_locations_timestamp` - Índice DESC para queries de historial

### ✅ Limpieza Realizada:
- Eliminadas definiciones duplicadas de tablas
- Consolidadas todas las migraciones en un solo archivo
- Comentarios actualizados y mejorados
- Estructura más limpia y mantenible

---

## 📊 ESTRUCTURA FINAL

### Tablas (9 total):

1. **drivers** (11 columnas)
   - Datos sensibles de conductores
   - Sincronizado con Firebase Auth

2. **vehicles** (18 columnas)
   - Vehículos de conductores
   - Documentación completa (matrícula, seguro)

3. **rides** (28 columnas)
   - Historial completo de viajes
   - Viajes activos en Firebase Realtime DB

4. **payments** (18 columnas)
   - Historial de pagos
   - Soporte para Stripe y bancos locales

5. **driver_penalties** (10 columnas)
   - Penalizaciones para conductores
   - Se descuentan en pago quincenal/mensual

6. **ratings** (13 columnas)
   - Calificaciones bidireccionales
   - 6 categorías detalladas + rating general

7. **ride_locations** (9 columnas)
   - Historial COMPRIMIDO de tracking
   - Solo cambios significativos (cada 30s o 50+ metros)

8. **analytics_events** (8 columnas)
   - Logs y métricas del sistema
   - Eventos de analytics

9. **emergency_calls** (13 columnas)
   - Registro de llamadas de emergencia
   - Policía (118) y Ambulancia (102)

### Vistas (2 total):

1. **rides_complete**
   - Vista completa de viajes con conductor, vehículo y pago

2. **emergency_calls_complete**
   - Vista completa de emergencias con información del viaje

---

## 🔄 MIGRACIÓN DESDE VERSIÓN ANTERIOR

### Si ya tienes la base de datos creada:

```sql
-- 1. Eliminar tabla obsoleta
DROP TABLE IF EXISTS public.cash_recharges CASCADE;

-- 2. Agregar nuevas columnas a ratings
ALTER TABLE public.ratings 
ADD COLUMN IF NOT EXISTS driving INTEGER CHECK (driving >= 1 AND driving <= 5),
ADD COLUMN IF NOT EXISTS safety INTEGER CHECK (safety >= 1 AND safety <= 5),
ADD COLUMN IF NOT EXISTS friendliness INTEGER CHECK (friendliness >= 1 AND friendliness <= 5);

-- 3. Agregar nuevas columnas a payments
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 4. Crear índices nuevos
CREATE INDEX IF NOT EXISTS idx_ratings_user_rating ON public.ratings USING btree (to_user_id, rating);
CREATE INDEX IF NOT EXISTS idx_payments_cancel_reason ON public.payments USING btree (cancel_reason) WHERE cancel_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ride_locations_timestamp ON public.ride_locations USING btree (timestamp DESC);

-- 5. Agregar comentarios
COMMENT ON COLUMN public.ratings.driving IS 'Conducción (1-5) - OPCIONAL - Solo para conductores';
COMMENT ON COLUMN public.ratings.safety IS 'Seguridad (1-5) - OPCIONAL';
COMMENT ON COLUMN public.ratings.friendliness IS 'Amabilidad (1-5) - OPCIONAL';
COMMENT ON COLUMN public.payments.notes IS 'Notas adicionales sobre el pago';
COMMENT ON COLUMN public.payments.cancel_reason IS 'Razón de cancelación del pago (si aplica)';
COMMENT ON TABLE public.ride_locations IS 'Historial COMPRIMIDO de ubicaciones (cada 30s o 50+ metros) - Tracking en vivo está en Firebase Realtime DB';
```

### Si es una instalación nueva:

```bash
# Ejecutar el schema completo
psql -h ceytngpresytjhafcadu.supabase.co -U postgres -d postgres < database/supabase-only.sql
```

---

## 📝 NOTAS IMPORTANTES

### Sistema de Recargas Eliminado:
- ❌ **Antes**: Conductores recargaban saldo para cubrir comisiones de viajes en efectivo
- ✅ **Ahora**: Comisiones se cobran quincenal/mensual directamente
- ✅ **Beneficio**: Flujo más simple, menos fricción para conductores

### Ratings Mejorados:
- ✅ **Antes**: Solo rating general (1-5)
- ✅ **Ahora**: Rating general + 6 categorías detalladas
- ✅ **Beneficio**: Feedback más específico y útil

### Tracking Optimizado:
- ✅ **Antes**: Guardaba cada ubicación (cada 5s)
- ✅ **Ahora**: Solo cambios significativos (cada 30s o 50+ metros)
- ✅ **Beneficio**: 83% menos datos, costos reducidos

---

## 🔍 VERIFICACIÓN

### Verificar que todo está correcto:

```sql
-- 1. Verificar que cash_recharges NO existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'cash_recharges';
-- Debe retornar: 0 filas

-- 2. Verificar nuevas columnas en ratings
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'ratings' 
AND column_name IN ('driving', 'safety', 'friendliness');
-- Debe retornar: 3 filas

-- 3. Verificar nuevas columnas en payments
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'payments' 
AND column_name IN ('notes', 'cancel_reason');
-- Debe retornar: 2 filas

-- 4. Contar tablas totales
SELECT COUNT(*) as total_tables
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE';
-- Debe retornar: 9 tablas

-- 5. Verificar índices nuevos
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('ratings', 'payments', 'ride_locations')
AND indexname IN ('idx_ratings_user_rating', 'idx_payments_cancel_reason', 'idx_ride_locations_timestamp');
-- Debe retornar: 3 índices
```

---

## 📚 ARCHIVOS RELACIONADOS

### Migraciones Consolidadas:
- `migrations/001_add_passengers_and_destinations.sql` ✅ Consolidada
- `migrations/002_add_vehicle_type_and_photo.sql` ✅ Consolidada
- `migrations/003_add_canceled_by.sql` ✅ Consolidada
- `migrations/2025-10-13_payment_systems.sql` ✅ Consolidada
- `migrations/add_cancel_reason.sql` ✅ Consolidada
- `migrations/add_emergency_calls.sql` ✅ Consolidada
- `ratings-update.sql` ✅ Consolidada

### Schema Actualizado:
- `supabase-only.sql` ✅ Versión 2025-10-15

### Documentación:
- `SCHEMA_CHANGES_2025-10-15.md` ✅ Este archivo

---

## ✅ CHECKLIST DE DEPLOYMENT

- [ ] Backup de base de datos actual
- [ ] Ejecutar script de migración o schema completo
- [ ] Verificar que todas las tablas existen (9 total)
- [ ] Verificar que cash_recharges NO existe
- [ ] Verificar nuevas columnas en ratings (3 nuevas)
- [ ] Verificar nuevas columnas en payments (2 nuevas)
- [ ] Verificar índices nuevos (3 nuevos)
- [ ] Probar queries de las vistas
- [ ] Verificar que Firebase Functions pueden conectarse
- [ ] Actualizar documentación del proyecto

---

**Estado:** ✅ SCHEMA ACTUALIZADO Y LISTO PARA DEPLOYMENT  
**Versión:** 2025-10-15  
**Tablas:** 9 (cash_recharges eliminada)  
**Compatibilidad:** Backward compatible con Firebase Functions actuales

---

*Actualizado por Cascade AI* 🚀
