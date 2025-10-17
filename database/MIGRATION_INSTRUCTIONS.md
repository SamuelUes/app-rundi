# 🚀 INSTRUCCIONES DE MIGRACIÓN - SISTEMAS DE PAGO

**Fecha:** 2025-10-13  
**Archivo:** `migrations/2025-10-13_payment_systems.sql`

---

## 📋 **CAMBIOS QUE SE APLICARÁN**

### **1. Tabla `rides`**
- ✅ Agregar columna `payment_type` (VARCHAR(20), default: 'cash')
- ✅ Agregar índice para `payment_type`

### **2. Tabla `payments`**
- ✅ Agregar columna `payment_provider` (VARCHAR(20))
- ✅ Agregar columna `local_transaction_id` (VARCHAR(255), UNIQUE)
- ✅ Agregar columna `local_authorization_code` (VARCHAR(255))
- ✅ Agregar columna `local_bank` (VARCHAR(20))
- ✅ Actualizar columna `total` (amount + tip)
- ✅ Agregar índice para `local_transaction_id`

### **3. Nueva Tabla `driver_penalties`**
- ✅ Crear tabla completa con 11 columnas
- ✅ Agregar 3 índices (driver_id, status, created_at)
- ✅ Agregar trigger para updated_at

### **4. Nueva Tabla `cash_recharges`**
- ✅ Crear tabla completa con 14 columnas
- ✅ Agregar 3 índices (driver_id, status, created_at)
- ✅ Agregar trigger para updated_at

---

## 🔧 **PASOS PARA APLICAR LA MIGRACIÓN**

### **Opción 1: Supabase Dashboard (Recomendado)**

1. **Ir a Supabase Dashboard:**
   ```
   https://app.supabase.com/project/ceytngpresytjhafcadu
   ```

2. **Abrir SQL Editor:**
   - Click en "SQL Editor" en el menú lateral
   - Click en "New query"

3. **Copiar y Pegar:**
   - Abrir archivo: `database/migrations/2025-10-13_payment_systems.sql`
   - Copiar TODO el contenido
   - Pegar en el editor SQL

4. **Ejecutar:**
   - Click en "Run" o presionar `Ctrl + Enter`
   - Esperar confirmación: "Migration completed successfully!"

5. **Verificar:**
   - Revisar que las queries de verificación muestren los resultados esperados
   - Verificar que no haya errores

---

### **Opción 2: Supabase CLI**

```bash
# 1. Conectar a Supabase
supabase link --project-ref ceytngpresytjhafcadu

# 2. Aplicar migración
supabase db push --file database/migrations/2025-10-13_payment_systems.sql

# 3. Verificar
supabase db diff
```

---

### **Opción 3: psql (Línea de Comandos)**

```bash
# Conectar a PostgreSQL
psql "postgresql://postgres:appdriveangel2025@db.ceytngpresytjhafcadu.supabase.co:5432/postgres"

# Ejecutar migración
\i database/migrations/2025-10-13_payment_systems.sql

# Salir
\q
```

---

## ✅ **VERIFICACIÓN POST-MIGRACIÓN**

### **1. Verificar Columnas Nuevas:**

```sql
-- Verificar rides.payment_type
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'rides' AND column_name = 'payment_type';

-- Resultado esperado:
-- payment_type | character varying | 'cash'::character varying
```

### **2. Verificar Tablas Nuevas:**

```sql
-- Verificar que existan las tablas
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('driver_penalties', 'cash_recharges');

-- Resultado esperado: 2 filas
```

### **3. Verificar Índices:**

```sql
-- Ver índices de driver_penalties
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'driver_penalties';

-- Resultado esperado: 4 índices
-- - driver_penalties_pkey
-- - idx_driver_penalties_driver_id
-- - idx_driver_penalties_status
-- - idx_driver_penalties_created_at
```

### **4. Verificar Triggers:**

```sql
-- Ver triggers
SELECT trigger_name, event_manipulation 
FROM information_schema.triggers 
WHERE event_object_table IN ('driver_penalties', 'cash_recharges');

-- Resultado esperado: 2 triggers (UPDATE)
```

---

## 🔄 **ROLLBACK (Si algo sale mal)**

Si necesitas revertir los cambios, ejecuta:

```sql
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
```

---

## 📊 **DATOS DE PRUEBA (Opcional)**

Después de la migración, puedes insertar datos de prueba:

```sql
-- Insertar penalización de prueba
INSERT INTO driver_penalties (
  driver_id, ride_id, penalty_type, amount, reason, 
  progress_percentage, status
) VALUES (
  'test_driver_123', 
  NULL, 
  'cancellation', 
  10.00, 
  'Prueba de penalización', 
  40.00, 
  'pending'
);

-- Insertar recarga de prueba
INSERT INTO cash_recharges (
  driver_id, amount, commission_total, rides_count, 
  payment_method, status
) VALUES (
  'test_driver_123', 
  100.00, 
  100.00, 
  10, 
  'bank_transfer', 
  'pending'
);

-- Verificar
SELECT * FROM driver_penalties;
SELECT * FROM cash_recharges;
```

---

## ⚠️ **NOTAS IMPORTANTES**

1. **Backup:** Supabase hace backups automáticos, pero es buena práctica hacer uno manual antes
2. **Downtime:** La migración es rápida (~5 segundos), no debería afectar la app
3. **Datos Existentes:** No se pierden datos, solo se agregan columnas y tablas
4. **Compatibilidad:** Las funciones antiguas seguirán funcionando
5. **Testing:** Después de la migración, prueba las funciones nuevas

---

## 🎯 **CHECKLIST**

Antes de ejecutar:
- [ ] Hacer backup manual (opcional)
- [ ] Revisar el archivo SQL
- [ ] Tener acceso a Supabase Dashboard

Durante la ejecución:
- [ ] Copiar SQL completo
- [ ] Ejecutar en SQL Editor
- [ ] Esperar confirmación

Después de ejecutar:
- [ ] Verificar columnas nuevas
- [ ] Verificar tablas nuevas
- [ ] Verificar índices
- [ ] Probar una query simple
- [ ] Desplegar funciones de Firebase

---

## 🚀 **SIGUIENTE PASO: DEPLOY DE FUNCIONES**

Una vez completada la migración:

```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## 📞 **SOPORTE**

Si encuentras algún error:
1. Copia el mensaje de error completo
2. Verifica que tengas permisos de admin en Supabase
3. Revisa los logs de Supabase
4. Si es necesario, ejecuta el ROLLBACK

---

**¡Listo para ejecutar!** 🎉
