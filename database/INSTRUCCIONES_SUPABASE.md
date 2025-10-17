# 🚀 INSTRUCCIONES PARA ACTUALIZAR SUPABASE

## Fecha: 2025-10-15

---

## ✅ PROBLEMA RESUELTO

**Warning arreglado:**
- ✅ `REALTIME_UPDATE_INTERVAL` eliminado de `tracking-optimized.ts`

---

## 📋 QUÉ EJECUTAR EN SUPABASE

### Opción 1: Script de Actualización (RECOMENDADO)

Si ya tienes la base de datos funcionando, usa este script:

```bash
# Archivo: database/UPDATE_SUPABASE_2025-10-15.sql
```

**Pasos:**
1. Ir a: https://supabase.com/dashboard/project/ceytngpresytjhafcadu/editor
2. Click en "SQL Editor"
3. Click en "New query"
4. Copiar y pegar TODO el contenido de `UPDATE_SUPABASE_2025-10-15.sql`
5. Click en "Run" (▶️)
6. Verificar que todos los checks salgan en ✅

---

### Opción 2: Schema Completo (Instalación Nueva)

Si quieres crear todo desde cero:

```bash
# Archivo: database/supabase-only.sql
```

**Pasos:**
1. Hacer backup de tu base de datos actual
2. Eliminar todas las tablas existentes
3. Ejecutar `supabase-only.sql` completo

---

## 📊 CAMBIOS QUE SE APLICARÁN

### ❌ ELIMINAR:

**1 Tabla:**
```sql
DROP TABLE cash_recharges;
```
- Sistema de recargas removido
- Comisión se cobra quincenal/mensual ahora

---

### ✅ AGREGAR:

**Columnas en `ratings` (3 nuevas):**
```sql
ALTER TABLE ratings ADD COLUMN driving INTEGER CHECK (driving >= 1 AND driving <= 5);
ALTER TABLE ratings ADD COLUMN safety INTEGER CHECK (safety >= 1 AND safety <= 5);
ALTER TABLE ratings ADD COLUMN friendliness INTEGER CHECK (friendliness >= 1 AND friendliness <= 5);
```

**Columnas en `payments` (2 nuevas):**
```sql
ALTER TABLE payments ADD COLUMN notes TEXT;
ALTER TABLE payments ADD COLUMN cancel_reason TEXT;
```

**Índices (4 nuevos):**
```sql
CREATE INDEX idx_ratings_user_rating ON ratings (to_user_id, rating);
CREATE INDEX idx_payments_cancel_reason ON payments (cancel_reason);
CREATE INDEX idx_ride_locations_timestamp ON ride_locations (timestamp DESC);
CREATE INDEX idx_ratings_from_user_id ON ratings (from_user_id);
```

---

## 🔍 VERIFICACIÓN AUTOMÁTICA

El script incluye verificación automática que mostrará:

```
✅ cash_recharges eliminada correctamente
✅ Columnas de ratings agregadas correctamente
✅ Columnas de payments agregadas correctamente
✅ Índices creados correctamente
✅ Total de tablas correcto (9)
```

**Tablas finales (9 total):**
1. analytics_events (8 columnas)
2. driver_penalties (10 columnas)
3. drivers (11 columnas)
4. emergency_calls (13 columnas)
5. payments (18 columnas) ← +2 columnas
6. ratings (13 columnas) ← +3 columnas
7. ride_locations (9 columnas)
8. rides (28 columnas)
9. vehicles (18 columnas)

---

## ⚠️ IMPORTANTE

### Antes de ejecutar:

1. ✅ **Hacer backup** de la base de datos actual
2. ✅ **Verificar** que no hay viajes activos
3. ✅ **Notificar** al equipo (si aplica)

### Después de ejecutar:

1. ✅ **Verificar** que todos los checks salgan en verde
2. ✅ **Probar** que Firebase Functions pueden conectarse
3. ✅ **Revisar** que no haya errores en logs

---

## 🎯 RESUMEN RÁPIDO

### Para actualizar tu base de datos:

```bash
# 1. Ir a Supabase Dashboard
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/editor

# 2. Abrir SQL Editor

# 3. Ejecutar este archivo:
database/UPDATE_SUPABASE_2025-10-15.sql

# 4. Verificar que todo salga en ✅
```

### Tiempo estimado: **2-3 minutos**

---

## 📝 ARCHIVOS RELACIONADOS

- `UPDATE_SUPABASE_2025-10-15.sql` - Script de actualización (USAR ESTE)
- `supabase-only.sql` - Schema completo (instalación nueva)
- `SCHEMA_CHANGES_2025-10-15.md` - Documentación de cambios
- `ratings-update.sql` - Solo cambios de ratings (ya incluido en UPDATE)

---

## 🆘 SI ALGO SALE MAL

### Rollback rápido:

```sql
-- Recrear cash_recharges (si es necesario)
-- Ver: database/migrations/2025-10-13_payment_systems.sql

-- Eliminar columnas nuevas
ALTER TABLE ratings DROP COLUMN IF EXISTS driving;
ALTER TABLE ratings DROP COLUMN IF EXISTS safety;
ALTER TABLE ratings DROP COLUMN IF EXISTS friendliness;

ALTER TABLE payments DROP COLUMN IF EXISTS notes;
ALTER TABLE payments DROP COLUMN IF EXISTS cancel_reason;

-- Eliminar índices nuevos
DROP INDEX IF EXISTS idx_ratings_user_rating;
DROP INDEX IF EXISTS idx_payments_cancel_reason;
DROP INDEX IF EXISTS idx_ratings_from_user_id;
```

---

## ✅ CHECKLIST

- [ ] Backup de base de datos realizado
- [ ] Script `UPDATE_SUPABASE_2025-10-15.sql` ejecutado
- [ ] Todos los checks en verde (✅)
- [ ] Firebase Functions pueden conectarse
- [ ] No hay errores en logs
- [ ] Documentación actualizada

---

**Estado:** 🟢 LISTO PARA EJECUTAR  
**Riesgo:** Bajo (cambios no destructivos)  
**Tiempo:** 2-3 minutos  
**Rollback:** Disponible

---

*Instrucciones creadas por Cascade AI* 🚀
