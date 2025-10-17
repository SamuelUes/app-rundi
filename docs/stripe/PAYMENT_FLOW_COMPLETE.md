# 💳 FLUJO COMPLETO DE PAGOS Y FACTURACIÓN

**Fecha:** 2025-10-13  
**Estado:** ✅ **ACTUALIZADO Y CORREGIDO**

---

## 🔄 **FLUJO COMPLETO DEL PAGO**

### **1. Cliente Solicita Viaje**
```
Estado: requested
Precio: C$100.00 (estimado)
Payment: No existe aún
```

### **2. Conductor Acepta / Cliente Confirma**
```
Estado: accepted
Precio: C$100.00 (final_fare confirmado)
Payment: No existe aún
```

### **3. Cliente Autoriza Pago (Pre-autorización)**
```
Estado: accepted o in_progress
Acción: createPaymentIntent()

Datos guardados en payments:
- ride_id: uuid del viaje
- amount: C$100.00 (final_fare, SIN tip)
- tip: C$10.00 (propina del cliente)
- commission: C$10.00 (10% normal) o C$15.00 (15% designado)
- total: C$110.00 (amount + tip) ← CALCULADO POR BD
- payment_method: 'card'
- status: 'pending'
- stripe_payment_intent_id: 'pi_xxx...'

Stripe:
- Crea Payment Intent por C$110.00 (amount + tip)
- capture_method: 'manual' (NO captura aún)
- Estado: requires_payment_method
```

### **4. Conductor Inicia Viaje**
```
Estado: in_progress
Payment: Sigue en 'pending'
```

### **5. Conductor Completa Viaje**
```
Estado: completed
Acción: completeRide()

Actualiza en rides:
- status: 'completed'
- completed_at: NOW()
- final_fare: C$100.00
- actual_distance: 2800m
- actual_duration: 540s

Payment: Sigue en 'pending' (esperando captura)
```

### **6. Sistema Captura Pago (Automático o Manual)**
```
Acción: capturePayment()

Stripe:
- Captura el Payment Intent
- Cobra C$110.00 al cliente

Actualiza en payments:
- status: 'completed'
- paid_at: NOW()

Cliente recibe:
- Notificación de pago exitoso
- Factura con desglose
```

---

## 📊 **ESTRUCTURA DE DATOS EN `payments`**

### **Tabla Actualizada:**
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  
  -- Montos
  amount NUMERIC(10, 2) NOT NULL,        -- final_fare (SIN tip)
  tip NUMERIC(10, 2) DEFAULT 0,          -- Propina
  commission NUMERIC(10, 2),             -- 10% o 15%
  total NUMERIC(10, 2) GENERATED ALWAYS AS 
    (amount + tip) STORED,               -- Total que paga el cliente
  
  -- Stripe
  payment_method VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  
  -- Timestamps
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Ejemplo de Registro:**
```json
{
  "id": "uuid-123",
  "ride_id": "uuid-456",
  "amount": 100.00,        // Tarifa del viaje
  "tip": 10.00,            // Propina
  "commission": 10.00,     // 10% (viaje normal)
  "total": 110.00,         // amount + tip (calculado)
  "payment_method": "card",
  "status": "completed",
  "stripe_payment_intent_id": "pi_xxx",
  "paid_at": "2025-10-13 19:00:00",
  "created_at": "2025-10-13 18:50:00"
}
```

---

## 🧾 **FACTURA PARA EL CLIENTE**

### **Desglose:**
```
┌─────────────────────────────────────┐
│         FACTURA DE VIAJE            │
├─────────────────────────────────────┤
│ Viaje ID: #12345                    │
│ Fecha: 13 Oct 2025, 19:00          │
│                                     │
│ 📍 Origen:                          │
│   27a Calle S.E., Managua          │
│                                     │
│ 🎯 Destino:                         │
│   Universidad Uam, Managua         │
│                                     │
│ 📏 Distancia: 2.8 km               │
│ ⏱️ Duración: 9 min                 │
├─────────────────────────────────────┤
│ DESGLOSE DE PAGO:                   │
│                                     │
│ Tarifa del viaje:      C$100.00    │
│ Propina:              +C$10.00     │
│ ─────────────────────────────────   │
│ TOTAL PAGADO:          C$110.00    │
│                                     │
│ Método de pago: 💳 Visa ****1234   │
│ Estado: ✅ Pagado                   │
└─────────────────────────────────────┘
```

### **Datos del Query:**
```sql
SELECT 
  r.id,
  r.origin_address,
  r.destination_address,
  r.actual_distance,
  r.actual_duration,
  r.completed_at,
  p.amount as fare,
  p.tip,
  p.total,
  p.payment_method,
  p.status,
  p.paid_at
FROM rides r
INNER JOIN payments p ON r.id = p.ride_id
WHERE r.id = $1
```

---

## 💰 **GANANCIAS DEL CONDUCTOR**

### **Cálculo:**
```
Tarifa del viaje:  C$100.00  (amount)
Comisión (10%):   -C$10.00   (commission)
─────────────────────────────
Ganancia neta:     C$90.00

Nota: La propina NO va al conductor en este modelo
```

### **Si incluimos propina para el conductor:**
```
Tarifa del viaje:  C$100.00  (amount)
Propina:          +C$10.00   (tip)
Comisión (10%):   -C$10.00   (commission)
─────────────────────────────
Ganancia neta:     C$100.00
```

---

## 📱 **PANTALLAS AFECTADAS**

### **1. Cliente - Pantalla de Pago**
**Archivo:** `Frontend/src/screens/Client/PaymentScreen.tsx`

**Muestra:**
- Tarifa del viaje: C$100.00
- Selector de propina: 0%, 10%, 15%, 20%, Custom
- Total a pagar: C$110.00
- Método de pago: Tarjeta
- Botón: "Autorizar Pago"

**Datos del query:**
```typescript
const ride = await ridesService.getRideDetails(rideId);
// ride.final_fare = 100.00
// tip = seleccionado por usuario
// total = ride.final_fare + tip
```

---

### **2. Cliente - Factura/Recibo**
**Archivo:** `Frontend/src/screens/Client/ReceiptScreen.tsx` (crear)

**Muestra:**
- Detalles del viaje
- Desglose de pago
- Total pagado
- Método de pago
- Estado del pago
- Botón: "Descargar PDF" (opcional)

**Datos del query:**
```sql
SELECT 
  r.*,
  p.amount,
  p.tip,
  p.total,
  p.payment_method,
  p.status,
  p.paid_at
FROM rides r
INNER JOIN payments p ON r.id = p.ride_id
WHERE r.id = $1 AND r.client_id = $2
```

---

### **3. Cliente - Historial de Viajes**
**Archivo:** `Frontend/src/screens/Client/RideHistoryScreen.tsx`

**Muestra cada viaje:**
- Fecha y hora
- Origen → Destino
- Total pagado: C$110.00
- Estado del pago: ✅ Pagado / ⏳ Pendiente

**Datos del query:**
```sql
SELECT 
  r.id,
  r.origin_address,
  r.destination_address,
  r.completed_at,
  r.status,
  p.total,
  p.status as payment_status
FROM rides r
LEFT JOIN payments p ON r.id = p.ride_id
WHERE r.client_id = $1
ORDER BY r.completed_at DESC
```

---

### **4. Conductor - Historial de Ganancias**
**Archivo:** `Frontend/src/screens/Driver/EarningsScreen.tsx` ✅ YA IMPLEMENTADO

**Muestra cada viaje:**
- Fecha y hora
- Origen → Destino
- Tarifa: C$100.00
- Comisión: -C$10.00
- Ganancia neta: C$90.00
- Estado del pago: ✅ Pagado / ⏳ Pendiente

**Datos del query:**
```sql
SELECT 
  r.id,
  r.origin_address,
  r.destination_address,
  r.actual_distance,
  r.actual_duration,
  r.final_fare,
  r.completed_at,
  r.ride_type,
  p.commission,
  p.status as payment_status
FROM rides r
LEFT JOIN payments p ON r.id = p.ride_id
WHERE r.driver_id = $1 
AND r.status = 'completed'
ORDER BY r.completed_at DESC
```

---

## ✅ **CAMBIOS REALIZADOS**

### **Backend:**
1. ✅ `functions/src/api/payments.ts` - `createPaymentIntent()`
   - Ahora guarda `amount` = `final_fare` (sin tip)
   - Calcula y guarda `commission` (10% o 15%)
   - Guarda `tip` por separado
   - `total` se calcula automáticamente en la BD

2. ✅ `functions/src/api/earnings.ts`
   - Actualizado para calcular comisiones correctamente
   - Usa datos de la tabla `payments`

### **Base de Datos:**
1. ✅ Tabla `payments` con estructura correcta
2. ✅ `total` calculado como `amount + tip`
3. ✅ `commission` guardada por separado

---

## 🚀 **PRÓXIMOS PASOS**

### **1. Crear pantalla de Factura para Cliente:**
```bash
Frontend/src/screens/Client/ReceiptScreen.tsx
```

### **2. Actualizar Historial de Cliente:**
```bash
Frontend/src/screens/Client/RideHistoryScreen.tsx
```
- Agregar columna "Total Pagado"
- Agregar estado del pago

### **3. Crear Firebase Function para obtener factura:**
```typescript
export const getReceipt = functions.https.onCall(async (data, context) => {
  const { rideId } = data;
  // Query con JOIN a payments
  // Retornar datos completos para la factura
});
```

### **4. Testing:**
- Completar un viaje
- Autorizar pago con propina
- Verificar que se guarda correctamente en `payments`
- Verificar que aparece en historial del cliente
- Verificar que aparece en ganancias del conductor

---

## 📝 **NOTAS IMPORTANTES**

1. **Propina:**
   - Se suma al `total` que paga el cliente
   - Actualmente NO va al conductor (se queda en la plataforma)
   - Si quieres que vaya al conductor, hay que modificar el cálculo de ganancias

2. **Comisión:**
   - Se calcula al crear el payment
   - 10% para viajes normales
   - 15% para conductor designado
   - Se descuenta de las ganancias del conductor

3. **Total:**
   - Es lo que paga el cliente
   - `total = amount + tip`
   - Se calcula automáticamente en la BD

---

**Actualizado por:** Cascade AI  
**Fecha:** 2025-10-13  
**Estado:** ✅ **LISTO PARA IMPLEMENTAR PANTALLAS**
