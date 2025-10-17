# 💳 LÓGICA COMPLETA DE PAGOS - DriveAngel.ni

**Última actualización:** 2025-10-16

---

## 🔄 FLUJO COMPLETO DE PAGOS

### **1. INICIO: Cliente Solicita Viaje**
```
Cliente selecciona método de pago:
├─ 💵 cash (efectivo)
├─ 💳 stripe (tarjeta internacional)
└─ 🏦 card_local (tarjetas locales: BAC, Banpro, Lafise, Ficohsa, Avanz)
```

**Backend:** `requestRide()`
```typescript
await admin.database().ref(`activeRides/${rideId}`).set({
  paymentMethod: 'cash' | 'stripe' | 'card_local',
  ...
});

await admin.database().ref(`paymentStatus/${rideId}`).set({
  method: paymentMethod,
  status: 'pending',
  amount: estimatedPrice,
  ...
});
```

**PostgreSQL:** `rides.payment_type` = 'cash' | 'stripe' | 'card_local'

---

### **2. Conductor Ve Solicitud**
- Conductor ve método de pago seleccionado
- Decide si acepta o no

---

### **3. Conductor Acepta → `acceptRide()`**
- Crea oferta con precio propuesto
- NO se procesa pago aún

---

### **4. Cliente Selecciona Conductor → `confirmDriver()`**

#### **SI payment_type = 'stripe' o 'card_local':**
```typescript
// Crear pre-autorización (hold)
const paymentIntent = await stripe.paymentIntents.create({
  amount: fareAmount,
  currency: 'nio',
  capture_method: 'manual', // ✅ NO cobra, solo bloquea fondos
});

await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'authorized',
  paymentIntentId: paymentIntent.id,
});
```

**Resultado:**
- ✅ Fondos bloqueados en tarjeta del cliente
- ❌ NO se cobra aún
- ✅ Cliente puede ver viaje en tracking

#### **SI payment_type = 'cash':**
```typescript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_confirmation',
});
```

**Resultado:**
- ✅ No se procesa pago
- ✅ Cliente puede ver viaje en tracking

---

### **5. Conductor Inicia Viaje → `startRide()`**
```typescript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'in_progress',
});
```

- Viaje en progreso
- Tracking en tiempo real

---

### **6. Conductor Completa Viaje → `completeRide()`**

```typescript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_capture',
  finalAmount: finalFare,
});
```

**Cálculo de Comisión:**
```typescript
const rideType = ride.rideType || ride.isDesignatedDriver ? 'designated_driver' : 'normal';
const commissionRate = rideType === 'designated_driver' ? 0.15 : 0.10;
const commission = finalFare * commissionRate;
```

| Tipo de Viaje | Comisión |
|---------------|----------|
| Normal | 10% |
| Conductor Designado | 15% |

**IMPORTANTE:** Comisión se calcula sobre `final_fare`, **NO** sobre propina.

---

### **7. REGISTRO EN TABLA `payments`**

**Trigger:** `syncPaymentStatusToPostgres`

```sql
INSERT INTO payments (
  ride_id,
  amount,        -- final_fare
  commission,    -- 10% o 15% según ride_type
  tip,           -- propina (si aplica)
  total,         -- amount + tip
  payment_method,
  payment_provider,
  status
) VALUES (...);
```

**Campos:**
- `amount` = `final_fare` (lo que paga el cliente sin propina)
- `commission` = `final_fare * (0.10 o 0.15)` según `ride_type`
- `tip` = propina (va 100% al conductor, **sin comisión**)
- `total` = `amount + tip` (lo que paga el cliente en total)
- `payment_method` = 'cash' | 'stripe' | 'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz'
- `payment_provider` = 'cash' | 'stripe' | 'local'
- `status` = 'pending' | 'completed' | 'canceled'

---

### **8. PROCESAMIENTO SEGÚN MÉTODO DE PAGO**

#### **A. Pago en Efectivo (cash)**

```
1. Cliente paga efectivo al conductor
2. Conductor recibe: final_fare + tip
3. Comisión queda registrada en payments
4. payments.status = 'completed'
```

**Ejemplo:**
```
final_fare: C$100.00
tip: C$10.00
commission (10%): C$10.00

Conductor recibe: C$110.00 (100 + 10)
Comisión registrada: C$10.00
Cliente paga: C$110.00
```

---

#### **B. Pago con Stripe (tarjeta internacional)**

```
1. capturePayment() captura pre-autorización
2. Stripe cobra: amount + tip
3. DriveAngel recibe: amount + tip
4. Comisión ya registrada en payments
5. payments.status = 'completed'
```

**Ejemplo:**
```
final_fare: C$100.00
tip: C$10.00
commission (10%): C$10.00

Stripe cobra al cliente: C$110.00
DriveAngel recibe: C$110.00
Comisión registrada: C$10.00
```

---

#### **C. Pago con Tarjeta Local (BAC, Banpro, etc.)**

```
1. capturePayment() captura pre-autorización con banco local
2. Banco cobra: amount + tip
3. DriveAngel recibe: amount + tip
4. Comisión ya registrada en payments
5. payments.status = 'completed'
```

**Ejemplo:**
```
final_fare: C$100.00
tip: C$10.00
commission (10%): C$10.00

Banco cobra al cliente: C$110.00
DriveAngel recibe: C$110.00
Comisión registrada: C$10.00
```

---

## 💰 PAGO QUINCENAL/MENSUAL AL CONDUCTOR

### **Cálculo del Pago Neto:**

```sql
-- 1. Total Bruto (lo que ganó el conductor)
SELECT SUM(final_fare) as total_bruto
FROM rides
WHERE driver_id = 'driverId'
  AND status = 'completed'
  AND completed_at BETWEEN start_date AND end_date;

-- 2. Total Comisiones (lo que debe DriveAngel)
SELECT SUM(commission) as total_comisiones
FROM payments
WHERE ride_id IN (
  SELECT id FROM rides WHERE driver_id = 'driverId' AND ...
);

-- 3. Penalizaciones (cancelaciones tardías, etc.)
SELECT SUM(amount) as total_penalizaciones
FROM driver_penalties
WHERE driver_id = 'driverId'
  AND status = 'pending';

-- 4. Pago Neto
Pago Neto = Total Bruto - Total Comisiones - Penalizaciones
```

---

### **EJEMPLO 1: Viajes Normales**

```
30 viajes completados (ride_type = 'normal')
Total Bruto: C$3,000.00
Comisiones (10%): -C$300.00
Penalizaciones: -C$0.00
────────────────────────────
Pago al Conductor: C$2,700.00
```

---

### **EJEMPLO 2: Viajes Mixtos**

```
20 viajes normales:
  Total: C$2,000.00
  Comisión (10%): C$200.00

10 viajes conductor designado:
  Total: C$1,500.00
  Comisión (15%): C$225.00

Total Bruto: C$3,500.00
Comisiones: -C$425.00
Penalizaciones: -C$15.00
────────────────────────────
Pago al Conductor: C$3,060.00
```

---

## ⚠️ CASOS ESPECIALES

### **1. CANCELACIÓN POR CLIENTE**

#### **Progreso < 25%:**
```
Cliente NO paga nada
Conductor NO recibe penalización
payments.status = 'canceled'
```

#### **Progreso ≥ 25%:**
```
Cliente paga comisión
Conductor NO recibe penalización
payments.status = 'partial_charged'
```

**Ejemplo:**
```
final_fare: C$100.00
Progreso: 30%
Cliente paga: C$10.00 (comisión)
Conductor recibe: C$0.00
```

---

### **2. CANCELACIÓN POR CONDUCTOR**

#### **Progreso < 25%:**
```
Nadie paga nada
payments.status = 'canceled'
```

#### **Progreso ≥ 25%:**
```
Cliente NO paga nada
Conductor recibe penalización = comisión del viaje
Penalización se descuenta en próximo pago
```

**Ejemplo:**
```
final_fare: C$100.00
Progreso: 30%
Comisión: C$10.00

INSERT INTO driver_penalties (
  driver_id,
  ride_id,
  amount,
  reason,
  status
) VALUES (
  'driverId',
  'rideId',
  10.00,
  'Cancelación tardía',
  'pending'
);
```

---

### **3. PROPINAS**

```
✅ Cliente puede agregar propina
✅ Propina va 100% al conductor
✅ NO se cobra comisión sobre propinas
```

**Ejemplo:**
```
final_fare: C$100.00
tip: C$20.00
commission (10%): C$10.00 (solo sobre final_fare)

Conductor recibe: C$120.00 (100 + 20)
Comisión: C$10.00 (NO sobre propina)
```

---

## 📊 TABLAS INVOLUCRADAS

### **1. `rides`**
```sql
id UUID PRIMARY KEY
client_id UUID
driver_id UUID
final_fare DECIMAL(10,2)
ride_type VARCHAR(50)  -- 'normal' | 'designated_driver'
payment_type VARCHAR(50)  -- 'cash' | 'stripe' | 'card_local'
status VARCHAR(50)
```

### **2. `payments`**
```sql
id UUID PRIMARY KEY
ride_id UUID
amount DECIMAL(10,2)  -- final_fare
commission DECIMAL(10,2)  -- 10% o 15%
tip DECIMAL(10,2)  -- propina
total DECIMAL(10,2)  -- amount + tip
payment_method VARCHAR(50)  -- 'cash' | 'stripe' | 'bac' | ...
payment_provider VARCHAR(50)  -- 'cash' | 'stripe' | 'local'
status VARCHAR(50)  -- 'pending' | 'completed' | 'canceled'
```

### **3. `driver_penalties`**
```sql
id UUID PRIMARY KEY
driver_id UUID
ride_id UUID
amount DECIMAL(10,2)
reason TEXT
status VARCHAR(50)  -- 'pending' | 'deducted'
```

---

## ✅ IMPLEMENTACIÓN ACTUAL

### **Frontend:**
- ✅ `SearchRideScreen.tsx` - Selector de método de pago
- ✅ `paymentMethod` enviado correctamente a backend

### **Backend:**
- ✅ `functions/src/api/rides.ts` - `requestRide()` guarda `paymentMethod`
- ✅ `functions/src/triggers/paymentStatusSync.ts` - Sincroniza a PostgreSQL
- ✅ Cálculo automático de comisión según `ride_type`

### **Base de Datos:**
- ✅ Firebase Realtime DB - `paymentStatus/{rideId}`
- ✅ PostgreSQL - Tabla `payments`
- ✅ Sincronización automática

---

**Estado: ✅ LÓGICA COMPLETA IMPLEMENTADA** 🚀
