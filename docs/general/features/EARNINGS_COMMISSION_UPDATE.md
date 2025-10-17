# 💰 ACTUALIZACIÓN: SISTEMA DE COMISIONES

**Fecha:** 2025-10-13  
**Estado:** ✅ **ACTUALIZADO**

---

## 🎯 **CAMBIOS REALIZADOS**

### **Lógica de Comisiones:**

**ANTES:**
- Comisión fija del 15% para todos los viajes

**DESPUÉS:**
- **10%** para viajes normales (moto o automóvil)
- **15%** para conductor designado (solo automóvil)

---

## 📊 **TABLA PAYMENTS ACTUALIZADA**

### **Estructura:**
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  amount NUMERIC(10, 2) NOT NULL,        -- final_fare del viaje
  tip NUMERIC(10, 2) DEFAULT 0,
  commission NUMERIC(10, 2),              -- 10% o 15% según tipo
  total NUMERIC(10, 2) GENERATED ALWAYS AS 
    (amount - (COALESCE(commission, 0) + COALESCE(tip, 0))) STORED,
  payment_method VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  ...
);
```

### **Cálculo del Total:**
```
total = amount - (commission + tip)
```

**Ejemplo 1 (Viaje Normal):**
- amount: C$100.00
- commission: C$10.00 (10%)
- tip: C$5.00
- **total: C$85.00**

**Ejemplo 2 (Conductor Designado):**
- amount: C$100.00
- commission: C$15.00 (15%)
- tip: C$5.00
- **total: C$80.00**

---

## 🔧 **FUNCIONES ACTUALIZADAS**

### **1. `getDriverEarnings()`**

**Query actualizada:**
```sql
SELECT 
  r.id,
  r.origin_address,
  r.destination_address,
  r.actual_distance,
  r.actual_duration,
  r.final_fare,
  r.completed_at,
  r.ride_type,  -- ✅ NUEVO
  p.commission,
  p.status as payment_status
FROM rides r
LEFT JOIN payments p ON r.id = p.ride_id
WHERE r.driver_id = $1 
AND r.status = 'completed'
ORDER BY r.completed_at DESC
```

**Lógica de cálculo:**
```typescript
// Si ya existe comisión en payments, usar ese valor
if (row.commission) {
  commission = parseFloat(row.commission);
} else {
  // Si no, calcular según el tipo de viaje
  const commissionRate = rideType === 'designated_driver' 
    ? 0.15  // 15% conductor designado
    : 0.10; // 10% viajes normales
  commission = fare * commissionRate;
}

netEarning = fare - commission;
```

---

### **2. `getDriverStats()`**

**Query actualizada con CASE:**
```sql
SELECT 
  COUNT(*) as total_rides,
  SUM(final_fare) as total_earnings,
  SUM(
    CASE 
      WHEN COALESCE(p.commission, 0) > 0 THEN p.commission
      WHEN ride_type = 'designated_driver' THEN final_fare * 0.15
      ELSE final_fare * 0.10
    END
  ) as total_commission
FROM rides r
LEFT JOIN payments p ON r.id = p.ride_id
WHERE r.driver_id = $1 
AND r.status = 'completed'
```

**Lógica:**
1. Si existe `p.commission` → Usar ese valor
2. Si `ride_type = 'designated_driver'` → 15%
3. Si no → 10%

---

### **3. `getEarningsByDay()`**

**Query actualizada:**
```sql
SELECT 
  DATE(r.completed_at) as date,
  COUNT(*) as rides,
  COALESCE(SUM(r.final_fare), 0) as earnings,
  COALESCE(SUM(
    CASE 
      WHEN COALESCE(p.commission, 0) > 0 THEN p.commission
      WHEN r.ride_type = 'designated_driver' THEN r.final_fare * 0.15
      ELSE r.final_fare * 0.10
    END
  ), 0) as commission
FROM rides r
LEFT JOIN payments p ON r.id = p.ride_id
WHERE r.driver_id = $1 
AND r.status = 'completed'
GROUP BY DATE(r.completed_at)
ORDER BY date ASC
```

---

## 📱 **FRONTEND ACTUALIZADO**

### **EarningsScreen.tsx:**
- Removido texto "(15%)" del label de comisión
- Ahora muestra "Comisión:" sin porcentaje fijo
- El porcentaje se calcula dinámicamente según el tipo de viaje

**Antes:**
```tsx
<Text>Comisión (15%):</Text>
```

**Después:**
```tsx
<Text>Comisión:</Text>
```

---

## 📋 **TIPOS DE VIAJE**

### **ride_type en tabla rides:**
- `'normal'` → 10% comisión
- `'premium'` → 10% comisión
- `'shared'` → 10% comisión
- `'designated_driver'` → 15% comisión

---

## ✅ **VALIDACIÓN**

### **Escenario 1: Viaje Normal (Moto)**
```
Tarifa: C$50.00
Tipo: normal
Comisión: C$5.00 (10%)
Ganancia Neta: C$45.00
```

### **Escenario 2: Viaje Normal (Auto)**
```
Tarifa: C$100.00
Tipo: normal
Comisión: C$10.00 (10%)
Ganancia Neta: C$90.00
```

### **Escenario 3: Conductor Designado**
```
Tarifa: C$150.00
Tipo: designated_driver
Comisión: C$22.50 (15%)
Ganancia Neta: C$127.50
```

---

## 🚀 **DEPLOYMENT**

### **1. Actualizar schema en Supabase:**
```sql
-- Ejecutar en Supabase SQL Editor
ALTER TABLE payments 
DROP COLUMN total;

ALTER TABLE payments 
ADD COLUMN total NUMERIC(10, 2) GENERATED ALWAYS AS 
  (amount - (COALESCE(commission, 0) + COALESCE(tip, 0))) STORED;

COMMENT ON COLUMN payments.amount IS 'Tarifa final del viaje (final_fare)';
COMMENT ON COLUMN payments.commission IS 'Comisión: 10% viajes normales, 15% conductor designado';
COMMENT ON COLUMN payments.total IS 'Total para el conductor: amount - (commission + tip)';
```

### **2. Desplegar funciones actualizadas:**
```bash
cd functions
npm run build
firebase deploy --only functions:getDriverEarnings,getDriverEarningsStats,getEarningsByDay
```

### **3. Verificar:**
- Completar un viaje normal
- Completar un viaje de conductor designado
- Verificar que las comisiones se calculan correctamente

---

## 📝 **ARCHIVOS MODIFICADOS**

1. ✅ `database/supabase-only.sql` - Schema actualizado
2. ✅ `functions/src/api/earnings.ts` - Lógica de comisiones actualizada
3. ✅ `Frontend/src/services/earningsService.ts` - Interface actualizada
4. ✅ `Frontend/src/screens/Driver/EarningsScreen.tsx` - UI actualizada

---

## 💡 **NOTAS IMPORTANTES**

1. **Prioridad de comisión:**
   - Si existe `payments.commission` → Usar ese valor
   - Si no existe → Calcular según `ride_type`

2. **Compatibilidad:**
   - Funciona con viajes antiguos sin comisión guardada
   - Funciona con viajes nuevos con comisión guardada

3. **Flexibilidad:**
   - Se puede cambiar el porcentaje de comisión en el futuro
   - Se puede agregar nuevos tipos de viaje con diferentes comisiones

---

**Actualizado por:** Cascade AI  
**Fecha:** 2025-10-13  
**Estado:** ✅ **LISTO PARA DEPLOYMENT**
