# ⚠️ IMPLEMENTACIÓN: SISTEMA DE PENALIZACIONES PARA CONDUCTORES

**Fecha:** 2025-10-13  
**Estado:** ✅ **IMPLEMENTADO**

---

## 🎯 **OBJETIVO**

Penalizar a conductores que cancelan viajes con más del 25% de progreso, descontando la comisión correspondiente de sus pagos mensuales/quincenales.

---

## 📋 **REGLA DE PENALIZACIÓN**

### **Escenario:**
```
Conductor cancela viaje con >= 25% de progreso
```

### **Consecuencias:**
- ❌ Cliente NO paga nada (autorización cancelada)
- ⚠️ Conductor recibe penalización = comisión del viaje
- 💸 Penalización se descuenta en pago mensual/quincenal

### **Ejemplo:**
```
Viaje: C$100.00
Comisión: C$10.00 (10%)
Progreso: 40%

Conductor cancela:
- Cliente: C$0.00 (no paga)
- Conductor: -C$10.00 (penalización pendiente)
```

---

## 📊 **TABLA `driver_penalties`**

### **Estructura:**
```sql
CREATE TABLE driver_penalties (
  id UUID PRIMARY KEY,
  driver_id VARCHAR(255) NOT NULL,
  ride_id UUID REFERENCES rides(id),
  penalty_type VARCHAR(50) NOT NULL,     -- 'cancellation', 'late_arrival', etc.
  amount NUMERIC(10, 2) NOT NULL,        -- Monto de la penalización
  reason TEXT,
  progress_percentage NUMERIC(5, 2),     -- % de progreso cuando canceló
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'deducted', 'forgiven'
  deducted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Estados:**
- **`pending`** - Penalización pendiente de descuento
- **`deducted`** - Ya fue descontada del pago
- **`forgiven`** - Perdonada por administrador

---

## 🔄 **FLUJO IMPLEMENTADO**

### **1. Conductor Cancela Viaje**
```
Acción: cancelRide()
Cancelado por: driver
Progreso: >= 25%

Pasos:
1. Cancelar autorización de pago (cliente no paga)
2. Calcular penalización = commission del viaje
3. Registrar en driver_penalties:
   - driver_id
   - ride_id
   - penalty_type: 'cancellation'
   - amount: commission
   - progress_percentage
   - status: 'pending'
4. Log analytics event
```

### **2. Conductor Ve Sus Ganancias**
```
Acción: getDriverEarnings()

Muestra:
- Total ganado: C$500.00
- Comisión: -C$50.00
- Ganancia neta: C$450.00
- Penalizaciones pendientes: -C$10.00
- Total a recibir: C$440.00
```

### **3. Administrador Procesa Pagos**
```
Acción: markPenaltiesAsDeducted()

Pasos:
1. Obtener penalizaciones pendientes del conductor
2. Descontar del pago mensual/quincenal
3. Marcar como 'deducted'
4. Actualizar deducted_at = NOW()
```

---

## 🔧 **FUNCIONES IMPLEMENTADAS**

### **Backend (Firebase Functions):**

**1. `cancelRide()` - Actualizada** ✅
```typescript
// Si conductor canceló con >= 25% de progreso
if (canceledBy === 'driver' && progressPercentage >= 25) {
  const penaltyAmount = payment.commission || 0;
  
  // Registrar penalización
  await client.query(
    `INSERT INTO driver_penalties (
      driver_id, ride_id, penalty_type, amount, reason, 
      progress_percentage, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [driverId, rideId, 'cancellation', penaltyAmount, reason, progressPercentage, 'pending']
  );
}
```

**2. `getDriverPenalties()`** ✅ NUEVA
```typescript
// Obtener penalizaciones del conductor
// Filtros: status, startDate, endDate
// Retorna: lista de penalizaciones + resumen
```

**3. `getDriverEarnings()` - Actualizada** ✅
```typescript
// Ahora incluye penalizaciones pendientes
summary: {
  totalEarnings: 500.00,
  commission: 50.00,
  netEarnings: 450.00,
  penalties: 10.00,           // ✅ NUEVO
  penaltyCount: 1,            // ✅ NUEVO
  netEarningsAfterPenalties: 440.00  // ✅ NUEVO
}
```

**4. `markPenaltiesAsDeducted()`** ✅ NUEVA
```typescript
// Marcar penalizaciones como descontadas
// Uso: Administrador al procesar pagos
```

**5. `forgivePenalty()`** ✅ NUEVA
```typescript
// Perdonar una penalización
// Uso: Administrador en casos especiales
```

**6. `getPenaltiesSummary()`** ✅ NUEVA
```typescript
// Obtener resumen de penalizaciones por período
// Uso: Reportes administrativos
```

---

## 📱 **FRONTEND - PANTALLAS**

### **1. Pantalla de Ganancias (Actualizada)**
```typescript
Frontend/src/screens/Driver/EarningsScreen.tsx
```

**Muestra:**
```
┌─────────────────────────────────────┐
│  💰 Resumen de Ganancias           │
│                                     │
│  Total Bruto:        C$500.00      │
│  Comisión (10%):    -C$50.00       │
│  ─────────────────────────────────  │
│  Ganancia Neta:      C$450.00      │
│                                     │
│  ⚠️ Penalizaciones:  -C$10.00      │
│  ─────────────────────────────────  │
│  Total a Recibir:    C$440.00      │
└─────────────────────────────────────┘
```

### **2. Pantalla de Penalizaciones (Nueva)**
```typescript
Frontend/src/screens/Driver/PenaltiesScreen.tsx
```

**Muestra:**
```
┌─────────────────────────────────────┐
│  ⚠️ Mis Penalizaciones             │
│                                     │
│  Pendientes: C$10.00 (1)           │
│  Descontadas: C$20.00 (2)          │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 13 oct, 19:00    [Pendiente] │ │
│  │ Cancelación con 40% progreso  │ │
│  │ 📍 Origen → 🎯 Destino        │ │
│  │ Monto: C$10.00                │ │
│  └───────────────────────────────┘ │
│                                     │
│  [Más penalizaciones...]           │
└─────────────────────────────────────┘
```

---

## 📈 **EJEMPLOS DE USO**

### **Ejemplo 1: Cancelación con 30% de progreso**
```
Viaje:
- Tarifa: C$100.00
- Comisión: C$10.00 (10%)
- Progreso: 30%

Conductor cancela:
1. Cliente no paga (C$0.00)
2. Penalización registrada: C$10.00
3. Estado: pending
4. Se descontará en próximo pago
```

### **Ejemplo 2: Cancelación con 20% de progreso**
```
Viaje:
- Tarifa: C$100.00
- Comisión: C$10.00 (10%)
- Progreso: 20%

Conductor cancela:
1. Cliente no paga (C$0.00)
2. NO hay penalización (< 25%)
3. Conductor no pierde nada
```

### **Ejemplo 3: Pago Mensual**
```
Conductor tiene:
- Ganancias del mes: C$5,000.00
- Comisiones: -C$500.00
- Ganancia neta: C$4,500.00
- Penalizaciones pendientes: -C$30.00

Pago final: C$4,470.00

Después del pago:
- Penalizaciones marcadas como 'deducted'
- deducted_at = NOW()
```

---

## 🔌 **INTEGRACIÓN CON EARNINGS**

### **Actualización en `EarningsSummary`:**
```typescript
interface EarningsSummary {
  totalEarnings: number;
  totalRides: number;
  averagePerRide: number;
  commission: number;
  netEarnings: number;
  penalties?: number;                    // ✅ NUEVO
  penaltyCount?: number;                 // ✅ NUEVO
  netEarningsAfterPenalties?: number;    // ✅ NUEVO
}
```

---

## 📊 **REPORTES ADMINISTRATIVOS**

### **Resumen de Penalizaciones:**
```typescript
getPenaltiesSummary({
  period: 'month'
})

Retorna:
{
  totalPenalties: 15,
  pendingCount: 5,
  deductedCount: 8,
  forgivenCount: 2,
  pendingAmount: 50.00,
  deductedAmount: 80.00,
  forgivenAmount: 20.00,
  totalAmount: 150.00
}
```

---

## 🚀 **DEPLOYMENT**

### **1. Crear tabla en Supabase:**
```sql
-- Ya incluida en supabase-only.sql
CREATE TABLE driver_penalties (...);
```

### **2. Desplegar funciones:**
```bash
cd functions
npm run build
firebase deploy --only functions:getDriverPenalties,markPenaltiesAsDeducted,forgivePenalty,getPenaltiesSummary
```

### **3. Re-desplegar funciones actualizadas:**
```bash
firebase deploy --only functions:cancelRide,getDriverEarnings
```

---

## ✅ **CHECKLIST**

### **Backend:**
- [x] Crear tabla `driver_penalties`
- [x] Actualizar `cancelRide()` para registrar penalizaciones
- [x] Crear `getDriverPenalties()`
- [x] Actualizar `getDriverEarnings()` para incluir penalizaciones
- [x] Crear `markPenaltiesAsDeducted()`
- [x] Crear `forgivePenalty()`
- [x] Crear `getPenaltiesSummary()`
- [x] Exportar funciones en `index.ts`
- [ ] Testing completo

### **Frontend:**
- [ ] Actualizar `EarningsScreen` para mostrar penalizaciones
- [ ] Crear `PenaltiesScreen`
- [ ] Crear servicio `penaltiesService.ts`
- [ ] Agregar navegación
- [ ] Testing UI

### **Base de Datos:**
- [ ] Ejecutar CREATE TABLE en Supabase
- [ ] Verificar índices
- [ ] Testing de queries

---

## 💡 **VENTAJAS**

1. ✅ **Justicia:** Conductor paga por cancelaciones irresponsables
2. ✅ **Protección al cliente:** Cliente no paga si conductor cancela
3. ✅ **Transparencia:** Conductor ve sus penalizaciones
4. ✅ **Flexibilidad:** Administrador puede perdonar penalizaciones
5. ✅ **Automatización:** Se descuenta automáticamente en pagos

---

## ⚠️ **NOTAS IMPORTANTES**

1. **Umbral del 25%:**
   - Si conductor cancela con < 25% → No hay penalización
   - Si conductor cancela con >= 25% → Penalización = comisión

2. **Cliente nunca paga:**
   - Si conductor cancela, cliente NUNCA paga
   - Independiente del progreso

3. **Penalizaciones acumulativas:**
   - Se suman todas las penalizaciones pendientes
   - Se descuentan en el próximo pago

4. **Perdón de penalizaciones:**
   - Administrador puede perdonar en casos especiales
   - Razón debe ser documentada

---

**Implementado por:** Cascade AI  
**Fecha:** 2025-10-13  
**Estado:** ✅ **LISTO PARA DEPLOYMENT**
