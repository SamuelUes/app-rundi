# 💳 IMPLEMENTACIÓN COMPLETA: FLUJO DE PAGOS AUTOMÁTICO

**Fecha:** 2025-10-13  
**Estado:** ✅ **IMPLEMENTADO**

---

## 🔄 **FLUJO COMPLETO IMPLEMENTADO**

### **1. Cliente Acepta Viaje y Confirma Conductor**
```
Acción: confirmDriver()
Estado: accepted

✅ Se crea automáticamente la PRE-AUTORIZACIÓN en Stripe
✅ Se guarda en tabla payments:
   - amount: C$100.00 (final_fare)
   - tip: C$0.00 (por defecto)
   - commission: C$10.00 (10%) o C$15.00 (15%)
   - status: 'pending'
   - stripe_payment_intent_id: 'pi_xxx'

Stripe:
- Payment Intent creado
- capture_method: 'manual'
- Estado: requires_payment_method
- Monto: C$100.00

Cliente:
- NO ve pantalla de pago todavía
- El proceso está en backend
```

---

## 🎯 **3 OPCIONES DE FINALIZACIÓN**

### **OPCIÓN 1: Conductor Completa el Viaje ✅**

```
Acción: completeRide()
Estado: completed

✅ Se CAPTURA el pago COMPLETO (100%)
✅ Se actualiza payment:
   - status: 'completed'
   - paid_at: NOW()

Stripe:
- Payment Intent capturado
- Monto cobrado: C$100.00

Cliente:
- Ve confirmación de viaje completado
- Ve pantalla de pago/factura
- Puede agregar propina (opcional)
- Confirma el pago

Conductor:
- Recibe notificación de pago completado
- Ganancia: C$100.00 - C$10.00 = C$90.00
```

**Código implementado en `completeRide()`:**
```typescript
// Capturar pago completo
const paymentResult = await client.query(
  `SELECT * FROM payments WHERE ride_id = $1`,
  [rideId]
);

if (paymentResult.rows.length > 0) {
  const payment = paymentResult.rows[0];
  
  // Capturar en Stripe
  await stripe.paymentIntents.capture(payment.stripe_payment_intent_id);
  
  // Actualizar estado
  await client.query(
    `UPDATE payments SET status = $1, paid_at = NOW() WHERE id = $2`,
    ['completed', payment.id]
  );
}
```

---

### **OPCIÓN 2: Cliente Cancela con >= 60% de Progreso 💰**

```
Acción: cancelRide()
Cancelado por: client
Progreso: >= 60%
Estado: canceled

✅ Se CAPTURA el pago PARCIAL (según progreso)
✅ Se actualiza payment:
   - amount: C$60.00 (60% del total)
   - status: 'completed'
   - paid_at: NOW()

Stripe:
- Payment Intent actualizado con nuevo monto
- Payment Intent capturado
- Monto cobrado: C$60.00 (60% de C$100.00)

Cliente:
- Ve mensaje: "Se cobró el 60% del total (C$60.00)"
- Pago automático, no requiere confirmación

Conductor:
- Recibe notificación de cancelación
- Ganancia: C$60.00 - C$6.00 = C$54.00
```

**Código implementado en `cancelRide()`:**
```typescript
if (canceledBy === 'client' && progressPercentage >= 60) {
  const chargePercentage = Math.min(progressPercentage, 100) / 100;
  chargedAmount = payment.amount * chargePercentage;
  
  // Actualizar monto en Stripe
  await stripe.paymentIntents.update(payment.stripe_payment_intent_id, {
    amount: Math.round(chargedAmount * 100),
  });
  
  // Capturar pago parcial
  await stripe.paymentIntents.capture(payment.stripe_payment_intent_id);
  
  // Actualizar payment
  await client.query(
    `UPDATE payments SET status = $1, paid_at = NOW(), amount = $2 WHERE id = $3`,
    ['completed', chargedAmount, payment.id]
  );
}
```

---

### **OPCIÓN 2.1: Cliente Cancela con < 60% de Progreso ❌**

```
Acción: cancelRide()
Cancelado por: client
Progreso: < 60%
Estado: canceled

✅ Se CANCELA la autorización
✅ Se actualiza payment:
   - status: 'canceled'

Stripe:
- Payment Intent cancelado
- Monto cobrado: C$0.00

Cliente:
- Ve mensaje: "Viaje cancelado. No se realizó ningún cargo."
- No paga nada

Conductor:
- Recibe notificación de cancelación
- Ganancia: C$0.00
```

**Código implementado en `cancelRide()`:**
```typescript
else if (canceledBy === 'client' && progressPercentage < 60) {
  // Cancelar en Stripe
  await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
  
  // Actualizar payment
  await client.query(
    `UPDATE payments SET status = $1 WHERE id = $2`,
    ['canceled', payment.id]
  );
}
```

---

### **OPCIÓN 3: Conductor Cancela el Viaje ❌**

```
Acción: cancelRide()
Cancelado por: driver
Progreso: Cualquiera
Estado: canceled

✅ Se CANCELA la autorización
✅ Se actualiza payment:
   - status: 'canceled'

Stripe:
- Payment Intent cancelado
- Monto cobrado: C$0.00

Cliente:
- Ve mensaje: "Viaje cancelado por el conductor. No se realizó ningún cargo."
- No paga nada

Conductor:
- Viaje cancelado
- Ganancia: C$0.00
- Puede recibir penalización (opcional)
```

**Código implementado en `cancelRide()`:**
```typescript
else if (canceledBy === 'driver') {
  // Cancelar en Stripe
  await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
  
  // Actualizar payment
  await client.query(
    `UPDATE payments SET status = $1 WHERE id = $2`,
    ['canceled', payment.id]
  );
}
```

---

## 📊 **CÁLCULO DE PROGRESO**

### **Fórmula:**
```typescript
// Obtener ubicación actual del conductor
const driverLocation = await admin.database()
  .ref(`driverLocations/${ride.driver_id}`)
  .once('value');

// Calcular distancia restante hasta el destino
const remainingDistance = calculateDistance(
  driverLocation.lat,
  driverLocation.lng,
  ride.destination_lat,
  ride.destination_lng
);

// Calcular progreso
const totalDistance = ride.estimated_distance;
const traveledDistance = totalDistance - remainingDistance;
const progressPercentage = (traveledDistance / totalDistance) * 100;
```

### **Función Haversine:**
```typescript
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distancia en metros
}
```

---

## 📱 **TABLA DE DECISIONES**

| Escenario | Cancelado Por | Progreso | Acción | Monto Cobrado | Estado Payment |
|-----------|---------------|----------|--------|---------------|----------------|
| Viaje completado | N/A | 100% | Capturar completo | 100% (C$100) | completed |
| Cliente cancela | client | 80% | Capturar parcial | 80% (C$80) | completed |
| Cliente cancela | client | 60% | Capturar parcial | 60% (C$60) | completed |
| Cliente cancela | client | 50% | Cancelar | 0% (C$0) | canceled |
| Cliente cancela | client | 20% | Cancelar | 0% (C$0) | canceled |
| Conductor cancela | driver | Cualquiera | Cancelar | 0% (C$0) | canceled |

---

## 🔧 **ARCHIVOS MODIFICADOS**

### **1. `functions/src/api/rides.ts`**

**Función `confirmDriver()`:**
- ✅ Agregada creación automática de pre-autorización
- ✅ Calcula comisión según tipo de viaje
- ✅ Guarda en tabla `payments`
- ✅ Crea Payment Intent en Stripe

**Función `completeRide()`:**
- ✅ Agregada captura automática de pago completo
- ✅ Actualiza estado del payment a 'completed'
- ✅ Log de analytics

**Función `cancelRide()`:**
- ✅ Agregado cálculo de progreso del viaje
- ✅ Lógica de pago según quién canceló y progreso
- ✅ Captura parcial si cliente cancela con >= 60%
- ✅ Cancelación si cliente cancela con < 60%
- ✅ Cancelación si conductor cancela
- ✅ Log de analytics

### **2. `functions/src/utils/rideProgressUtils.ts`** ✅ NUEVO

**Funciones:**
- `calculateRideProgress()` - Calcula progreso basado en tracking
- `calculateDistance()` - Fórmula de Haversine
- `calculateChargeAmount()` - Calcula monto a cobrar
- `shouldChargeForCancellation()` - Determina si se debe cobrar

---

## 📄 **TABLA `payments` ACTUALIZADA**

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  
  -- Montos
  amount NUMERIC(10, 2) NOT NULL,        -- final_fare (puede ser parcial si cancelación)
  tip NUMERIC(10, 2) DEFAULT 0,          -- Propina
  commission NUMERIC(10, 2),             -- 10% o 15%
  total NUMERIC(10, 2) GENERATED ALWAYS AS 
    (amount + tip) STORED,               -- Total que paga el cliente
  
  -- Stripe
  payment_method VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',  -- pending, completed, canceled
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  
  -- Timestamps
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🎯 **ESTADOS DEL PAYMENT**

| Estado | Descripción |
|--------|-------------|
| `pending` | Pre-autorización creada, esperando captura |
| `completed` | Pago capturado exitosamente (completo o parcial) |
| `canceled` | Autorización cancelada, no se cobró nada |

---

## 📱 **PRÓXIMOS PASOS (FRONTEND)**

### **1. Pantalla de Confirmación de Pago (Cliente)**
```typescript
// Mostrar después de completar viaje
Frontend/src/screens/Client/PaymentConfirmationScreen.tsx
```

**Muestra:**
- Detalles del viaje
- Tarifa: C$100.00
- Selector de propina (opcional)
- Total a pagar: C$110.00
- Botón: "Confirmar Pago"

### **2. Actualizar RideTrackingScreen**
```typescript
// Agregar listener para cuando el viaje se completa
useEffect(() => {
  if (ride.status === 'completed') {
    navigation.replace('PaymentConfirmation', { rideId });
  }
}, [ride.status]);
```

### **3. Pantalla de Cancelación**
```typescript
// Mostrar resultado de cancelación
Frontend/src/screens/Client/CancellationResultScreen.tsx
```

**Muestra:**
- Mensaje según el escenario
- Monto cobrado (si aplica)
- Razón de cancelación

---

## ✅ **TESTING**

### **Caso 1: Viaje Completado**
1. Cliente confirma conductor → Pre-autorización creada
2. Conductor inicia viaje
3. Conductor completa viaje → Pago capturado (100%)
4. Verificar payment.status = 'completed'
5. Verificar payment.amount = C$100.00

### **Caso 2: Cliente Cancela con 70% de Progreso**
1. Cliente confirma conductor → Pre-autorización creada
2. Conductor inicia viaje
3. Viaje avanza al 70%
4. Cliente cancela → Pago parcial capturado (70%)
5. Verificar payment.status = 'completed'
6. Verificar payment.amount = C$70.00

### **Caso 3: Cliente Cancela con 40% de Progreso**
1. Cliente confirma conductor → Pre-autorización creada
2. Conductor inicia viaje
3. Viaje avanza al 40%
4. Cliente cancela → Autorización cancelada
5. Verificar payment.status = 'canceled'
6. Verificar payment.amount = C$100.00 (original)

### **Caso 4: Conductor Cancela**
1. Cliente confirma conductor → Pre-autorización creada
2. Conductor cancela → Autorización cancelada
3. Verificar payment.status = 'canceled'
4. Cliente no paga nada

---

## 🚀 **DEPLOYMENT**

```bash
cd functions
npm run build
firebase deploy --only functions:confirmDriver,completeRide,cancelRide
```

---

**Implementado por:** Cascade AI  
**Fecha:** 2025-10-13  
**Estado:** ✅ **LISTO PARA TESTING Y DEPLOYMENT**
