# 💳 Estructura de Pagos en Firebase Realtime Database

## 🎯 Objetivo
Manejar TODO el flujo de pagos en Firebase Realtime DB para:
- ✅ Mayor velocidad (sin consultas a PostgreSQL durante el viaje)
- ✅ Actualizaciones en tiempo real
- ✅ Sincronización automática cliente-conductor
- ✅ Menor latencia
- ✅ Mejor experiencia de usuario

---

## 📊 Estructura de `paymentStatus/{rideId}`

```json
{
  "paymentStatus": {
    "{rideId}": {
      // Información básica
      "rideId": "3c881443-f63a-4a92-893e-87cb7b71e0fa",
      "method": "cash",           // 'cash', 'card', 'stripe'
      "provider": "cash",          // 'cash', 'stripe', 'local'
      
      // Montos
      "amount": 140.00,            // Tarifa base del viaje
      "tip": 14,                   // Propina
      "total": 154,                // Total a pagar
      "finalAmount": 140.00,       // Monto final (puede cambiar si hay ajustes)
      "chargedAmount": 0,          // Monto cobrado (en caso de cancelación parcial)
      
      // Estado del pago
      "status": "pending_capture", // Ver estados abajo
      
      // Timestamps
      "createdAt": 1760418173424,
      "lastUpdatedAt": 1760418329211,
      "confirmedAt": null,
      "canceledAt": null,
      
      // Metadata
      "lastUpdatedBy": "client",   // 'client', 'driver', 'backend'
      
      // Stripe (solo si method = 'stripe' o 'card')
      "paymentIntentId": "pi_xxx", // ID del PaymentIntent de Stripe
      "stripeChargeId": null,      // ID del cargo una vez capturado
      
      // Cancelación
      "cancelReason": null,
      "progressPercentage": null,  // % del viaje completado al cancelar
      "message": null              // Mensaje para el usuario
    }
  }
}
```

---

## 🔄 Estados del Pago (`status`)

### **1. Estados Iniciales**
- `initiated` - Pago iniciado cuando conductor acepta
- `authorized` - Pago pre-autorizado (solo tarjeta/Stripe)
- `pending_confirmation` - Esperando confirmación (solo efectivo)

### **2. Estados Durante el Viaje**
- `in_progress` - Viaje en progreso, pago activo
- `pending_capture` - Viaje completado, esperando captura del pago

### **3. Estados Finales - Éxito**
- `completed` - Pago completado exitosamente
- `confirmed` - Conductor confirmó recepción (solo efectivo)

### **4. Estados Finales - Cancelación**
- `canceled` - Pago cancelado (sin cargo)
- `partial_charged` - Cargo parcial por cancelación tardía (tarjeta)
- `pending_cash_payment` - Deuda pendiente por cancelación tardía (efectivo)

### **5. Estados de Error**
- `failed` - Pago falló
- `refunded` - Pago reembolsado

---

## 🚀 Flujo Completo por Método de Pago

### **A. Pago con Tarjeta/Stripe**

#### **1. Conductor Acepta Viaje** (`acceptRide`)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).set({
  rideId,
  status: 'initiated',
  method: 'stripe',
  provider: 'stripe',
  amount: fare,
  tip: 0,
  total: fare,
  createdAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});

// Pre-autorizar con Stripe
const paymentIntent = await stripe.paymentIntents.create({
  amount: fareAmount,
  currency: 'nio',
  capture_method: 'manual'
});

await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'authorized',
  paymentIntentId: paymentIntent.id,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP
});
```

#### **2. Viaje Inicia** (`startRide`)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'in_progress',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP
});
```

#### **3. Viaje Completa** (`completeRide`)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_capture',
  finalAmount: finalFare,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});
```

#### **4. Cliente Agrega Propina y Confirma** (Frontend)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  tip: tipAmount,
  total: finalAmount + tipAmount,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'client'
});
```

#### **5. Backend Captura Pago** (`capturePayment`)
```javascript
// Capturar con Stripe
await stripe.paymentIntents.capture(paymentIntentId, {
  amount_to_capture: totalAmount
});

await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'completed',
  chargedAmount: totalAmount,
  stripeChargeId: charge.id,
  confirmedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});
```

---

### **B. Pago en Efectivo**

#### **1. Conductor Acepta Viaje** (`acceptRide`)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).set({
  rideId,
  status: 'initiated',
  method: 'cash',
  provider: 'cash',
  amount: fare,
  tip: 0,
  total: fare,
  createdAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});

await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_confirmation',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP
});
```

#### **2. Viaje Inicia** (`startRide`)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'in_progress',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP
});
```

#### **3. Viaje Completa** (`completeRide`)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_confirmation',
  finalAmount: finalFare,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});
```

#### **4. Cliente Agrega Propina** (Frontend - CashPaymentScreen)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  tip: tipAmount,
  total: finalAmount + tipAmount,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'client'
});
```

#### **5. Conductor Confirma Recepción** (Frontend - ConfirmCashPaymentScreen)
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'completed',
  confirmedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'driver'
});

// Backend escucha y registra en PostgreSQL
```

---

### **C. Cancelación con Tarjeta**

#### **Cliente cancela con ≥60% de progreso:**
```javascript
const chargePercentage = progressPercentage / 100;
const chargedAmount = payment.amount * chargePercentage;

// Capturar parcial con Stripe
await stripe.paymentIntents.update(paymentIntentId, {
  amount: Math.round(chargedAmount * 100)
});
await stripe.paymentIntents.capture(paymentIntentId);

await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'partial_charged',
  chargedAmount: chargedAmount,
  progressPercentage: progressPercentage,
  cancelReason: reason,
  canceledAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});
```

#### **Cliente cancela con <60% de progreso:**
```javascript
// Cancelar autorización
await stripe.paymentIntents.cancel(paymentIntentId);

await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'canceled',
  chargedAmount: 0,
  progressPercentage: progressPercentage,
  cancelReason: reason,
  canceledAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});
```

---

### **D. Cancelación con Efectivo**

#### **Cliente cancela con ≥60% de progreso:**
```javascript
const chargePercentage = progressPercentage / 100;
const chargedAmount = payment.amount * chargePercentage;

await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_cash_payment',
  chargedAmount: chargedAmount,
  progressPercentage: progressPercentage,
  cancelReason: reason,
  message: `Debes pagar C$${chargedAmount.toFixed(2)} en efectivo al conductor por cancelación tardía`,
  canceledAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});
```

#### **Cliente cancela con <60% de progreso:**
```javascript
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'canceled',
  chargedAmount: 0,
  progressPercentage: progressPercentage,
  cancelReason: reason,
  message: 'Cancelación sin cargo',
  canceledAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});
```

---

## 🎧 Listeners en Frontend

### **Cliente - Escuchar Estado del Pago**
```typescript
// En CashPaymentScreen o PaymentScreen
const paymentRef = ref(db, `paymentStatus/${rideId}`);
const unsubscribe = onValue(paymentRef, (snapshot) => {
  const data = snapshot.val();
  
  if (data?.status === 'completed') {
    // Navegar a RatingScreen
    navigation.replace('Rating', { rideId });
  }
  
  if (data?.status === 'pending_cash_payment') {
    // Mostrar mensaje de deuda
    Alert.alert('Pago Pendiente', data.message);
  }
});
```

### **Conductor - Escuchar Confirmación de Pago**
```typescript
// En ConfirmCashPaymentScreen o WaitingPaymentScreen
const paymentRef = ref(db, `paymentStatus/${rideId}`);
const unsubscribe = onValue(paymentRef, (snapshot) => {
  const data = snapshot.val();
  
  if (data?.status === 'completed') {
    // Pago confirmado
    navigation.replace('AvailableRides');
  }
  
  // Mostrar tip actualizado en tiempo real
  setTipAmount(data?.tip || 0);
  setTotalAmount(data?.total || 0);
});
```

---

## 🔒 Reglas de Seguridad Actualizadas

```json
{
  "paymentStatus": {
    "$rideId": {
      ".read": "auth != null",
      ".write": "auth != null",
      ".validate": "newData.hasChildren(['rideId', 'status', 'method', 'amount'])",
      
      "status": {
        ".validate": "newData.isString() && newData.val().matches(/^(initiated|authorized|pending_confirmation|in_progress|pending_capture|completed|confirmed|canceled|partial_charged|pending_cash_payment|failed|refunded)$/)"
      },
      
      "method": {
        ".validate": "newData.isString() && newData.val().matches(/^(cash|card|stripe)$/)"
      },
      
      "amount": {
        ".validate": "newData.isNumber() && newData.val() >= 0"
      },
      
      "tip": {
        ".validate": "newData.isNumber() && newData.val() >= 0"
      }
    }
  }
}
```

---

## 📊 Ventajas de Esta Arquitectura

1. **Velocidad:** Sin consultas a PostgreSQL durante el viaje
2. **Tiempo Real:** Cliente y conductor ven actualizaciones instantáneas
3. **Sincronización:** Un solo source of truth para el estado del pago
4. **Escalabilidad:** Firebase Realtime DB maneja millones de conexiones
5. **Offline:** Funciona con cache local de Firebase
6. **Auditoría:** PostgreSQL guarda historial completo al finalizar

---

## 🔄 Sincronización con PostgreSQL

### **Cuándo Sincronizar:**
- ✅ Al completar viaje → Guardar pago en `payments` table
- ✅ Al cancelar viaje → Guardar pago cancelado
- ✅ Al confirmar efectivo → Actualizar status en PostgreSQL
- ❌ NO sincronizar durante el viaje (solo Realtime DB)

### **Trigger de Sincronización:**
```javascript
// Cloud Function que escucha cambios en paymentStatus
exports.syncPaymentToPostgres = functions.database
  .ref('/paymentStatus/{rideId}')
  .onUpdate(async (change, context) => {
    const after = change.after.val();
    
    // Solo sincronizar en estados finales
    if (['completed', 'canceled', 'partial_charged'].includes(after.status)) {
      await savePaymentToPostgres(after);
    }
  });
```

---

## ✅ Checklist de Implementación

- [ ] Actualizar reglas de seguridad en Firebase
- [ ] Modificar `acceptRide` para inicializar paymentStatus
- [ ] Modificar `startRide` para actualizar status
- [ ] Modificar `completeRide` para actualizar status
- [ ] Modificar `cancelRide` para manejar estados según método
- [ ] Crear trigger de sincronización a PostgreSQL
- [ ] Actualizar CashPaymentScreen para escuchar cambios
- [ ] Actualizar PaymentScreen para escuchar cambios
- [ ] Actualizar ConfirmCashPaymentScreen para actualizar status
- [ ] Testing completo de todos los flujos

---

**Arquitectura optimizada para máxima velocidad y sincronización en tiempo real!** 🚀
