# 💳 Flujo de Pago CORREGIDO - Inicio Temprano

**Fecha:** 2025-10-13  
**Estado:** 🔄 **CORRECCIÓN NECESARIA**

---

## ❌ Problema con el Flujo Anterior

**Flujo Incorrecto:**
```
Viaje Completa → paymentStatus: 'initiated' → Cliente selecciona método
```

**Problema:** Si el pago se inicia al completar el viaje, NO podemos manejar cancelaciones con cobros parciales según el progreso.

---

## ✅ Flujo CORRECTO

### **1. Cliente Solicita Viaje**
```
Cliente busca viaje en SearchRideScreen
↓
Selecciona origen, destino, método de pago
↓
Backend: requestRide()
  - Guarda rides en PostgreSQL
  - Guarda activeRides en Realtime DB
  - Estado: 'requested'
```

### **2. Conductor Acepta**
```
Conductor ve viaje disponible
↓
Conductor acepta (con o sin negociación)
↓
Backend: acceptRide()
  - Actualiza rides.status = 'accepted'
  - Establece final_fare
  - Actualiza activeRides
```

### **3. Cliente Confirma Viaje y Conductor** ⭐ **AQUÍ INICIA EL PAGO**
```
Cliente ve RideConfirmationScreen
↓
Cliente confirma conductor y viaje
↓
Backend: confirmRide() (NUEVA FUNCIÓN)
  - Actualiza rides.status = 'confirmed'
  - Inicializa paymentStatus en Realtime DB:
    {
      status: 'initiated',
      method: selectedMethod, // Ya seleccionado en SearchRideScreen
      amount: final_fare,
      tip: 0
    }
  - Si método = 'card':
    → Llama createPaymentIntent()
    → Pre-autoriza pago (hold)
    → paymentStatus.status = 'authorized'
  - Si método = 'cash':
    → Llama registerCashPayment()
    → paymentStatus.status = 'pending_confirmation'
```

### **4. Viaje en Progreso**
```
Conductor inicia viaje
↓
Backend: startRide()
  - Actualiza rides.status = 'in_progress'
  - Pago YA está autorizado/registrado
```

### **5. Cancelación (Si ocurre)**
```
Cliente o Conductor cancela
↓
Backend: cancelRide()
  - Calcula progressPercentage
  
  Si Cliente cancela:
    - progress < 60%: Cancela autorización, NO cobra
    - progress >= 60%: Cobra parcial (% del total)
  
  Si Conductor cancela:
    - Cancela autorización, NO cobra
    - Si progress >= 25%: Penalización al conductor
```

### **6. Viaje Completa**
```
Conductor completa viaje
↓
Backend: completeRide()
  - Actualiza rides.status = 'completed'
  - Actualiza rides.final_fare (si cambió)
  - NO inicializa pago (ya está iniciado)
  - Actualiza paymentStatus:
    {
      status: 'pending_capture', // Nuevo status
      finalAmount: final_fare + tip
    }
```

### **7. Captura de Pago**
```
Si método = 'card':
  Cliente ve PaymentScreen (puede agregar propina)
  ↓
  Cliente confirma
  ↓
  Backend: capturePayment()
    - Captura el pago pre-autorizado
    - paymentStatus.status = 'completed'

Si método = 'cash':
  Conductor ve ConfirmCashPaymentScreen
  ↓
  Conductor confirma recepción
  ↓
  Backend: completeCashPayment()
    - paymentStatus.status = 'completed'
```

---

## 🔄 Comparación de Flujos

### **Flujo Anterior (Incorrecto):**
```
Solicitar → Aceptar → Iniciar → Completar → INICIAR PAGO → Capturar
                                              ↑
                                         Muy tarde!
```

### **Flujo Nuevo (Correcto):**
```
Solicitar → Aceptar → INICIAR PAGO → Confirmar → Iniciar → Completar → Capturar
                          ↑
                    Momento correcto!
```

---

## 📊 Estados de paymentStatus

| Status | Cuándo | Quién actualiza |
|--------|--------|-----------------|
| `initiated` | Cliente confirma viaje | Backend (confirmRide) |
| `processing` | Creando pre-autorización | Backend (createPaymentIntent) |
| `authorized` | Pago pre-autorizado (hold) | Backend (createPaymentIntent) |
| `pending_confirmation` | Efectivo registrado | Backend (registerCashPayment) |
| `pending_capture` | Viaje completado, esperando captura | Backend (completeRide) |
| `completed` | Pago capturado/confirmado | Backend (capture/complete) |
| `canceled` | Viaje cancelado | Backend (cancelRide) |
| `partial_charged` | Cancelación con cobro parcial | Backend (cancelRide) |

---

## 🔧 Cambios Necesarios

### **1. Crear confirmRide() - NUEVA FUNCIÓN**
**Archivo:** `functions/src/api/rides.ts`

```typescript
export const confirmRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId } = data;
  const clientId = context.auth.uid;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Obtener ride
    const result = await client.query(
      `SELECT * FROM rides WHERE id = $1 AND client_id = $2 AND status = $3`,
      [rideId, clientId, 'accepted']
    );

    if (result.rows.length === 0) {
      throw new Error("Ride not found or not in accepted status");
    }

    const ride = result.rows[0];

    // Actualizar status a 'confirmed'
    await client.query(
      `UPDATE rides SET status = $1, confirmed_at = NOW() WHERE id = $2`,
      ['confirmed', rideId]
    );

    // Inicializar paymentStatus
    await admin.database().ref(`paymentStatus/${rideId}`).set({
      rideId,
      status: 'initiated',
      method: ride.payment_type, // Ya seleccionado en SearchRideScreen
      amount: ride.final_fare,
      tip: 0,
      total: ride.final_fare,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Procesar según método de pago
    if (ride.payment_type === 'card' || ride.payment_type === 'stripe') {
      // Pre-autorizar pago con tarjeta
      const { createPaymentIntent } = await import('./payments');
      await createPaymentIntent.run({ rideId, tip: 0 }, { auth: context.auth });
      
      console.log(`💳 Pago pre-autorizado para viaje ${rideId}`);
    } else if (ride.payment_type === 'cash') {
      // Registrar pago en efectivo
      const { registerCashPayment } = await import('./payments');
      await registerCashPayment.run({ rideId, tip: 0 }, { auth: context.auth });
      
      console.log(`💵 Pago en efectivo registrado para viaje ${rideId}`);
    }

    await client.query("COMMIT");

    return {
      success: true,
      ride,
      message: 'Viaje confirmado y pago iniciado',
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Error confirmando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});
```

### **2. Actualizar completeRide()**
**Cambiar de:**
```typescript
// Inicializar paymentStatus
await admin.database().ref(`paymentStatus/${rideId}`).set({ ... });
```

**A:**
```typescript
// Actualizar paymentStatus (ya existe)
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_capture',
  finalAmount: finalFare,
  lastUpdatedBy: 'backend',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
});
```

### **3. Actualizar cancelRide()**
**Agregar actualización de paymentStatus:**
```typescript
// Después de manejar el pago
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: paymentAction === 'partial_charge' ? 'partial_charged' : 'canceled',
  canceledAt: admin.database.ServerValue.TIMESTAMP,
  cancelReason: reason,
  canceledBy: canceledBy,
  progressPercentage: progressPercentage,
  chargedAmount: chargedAmount || 0,
  lastUpdatedBy: 'backend',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
});
```

### **4. Frontend - RideConfirmationScreen**
**Agregar botón de confirmación:**
```typescript
const handleConfirmRide = async () => {
  try {
    setLoading(true);
    
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { initializeFirebase } = await import('../../config/firebase');
    
    const { app } = await initializeFirebase();
    const functions = getFunctions(app);
    const confirmRideFn = httpsCallable(functions, 'confirmRide');
    
    await confirmRideFn({ rideId });
    
    // Navegar a RideTrackingScreen
    navigation.replace('RideTracking', { rideId });
  } catch (error) {
    Alert.alert('Error', 'No se pudo confirmar el viaje');
  } finally {
    setLoading(false);
  }
};
```

---

## 🎯 Ventajas del Nuevo Flujo

1. **Cancelaciones con Cobro:** Pago ya está autorizado, se puede cobrar parcial
2. **Seguridad:** Fondos garantizados desde que cliente confirma
3. **Penalizaciones:** Conductor sabe que hay pago autorizado
4. **UX Mejor:** Cliente no ve pantalla de pago al final (ya pagó)
5. **Menos Pasos:** Captura es automática al completar

---

## 📋 Reglas de Cancelación (Ya Implementadas)

### **Cliente Cancela:**
- **progress < 60%:** NO cobra, cancela autorización
- **progress >= 60%:** Cobra parcial (% del progreso)

### **Conductor Cancela:**
- **Siempre:** NO cobra, cancela autorización
- **progress >= 25%:** Penalización al conductor (comisión)

---

## 🚀 Orden de Implementación

1. ✅ Crear `confirmRide()` en `rides.ts`
2. ✅ Actualizar `completeRide()` para NO inicializar pago
3. ✅ Actualizar `cancelRide()` para actualizar paymentStatus
4. ✅ Actualizar `RideConfirmationScreen` con botón confirmar
5. ✅ Exportar `confirmRide` en `index.ts`
6. ✅ Testing completo

---

**Estado: CORRECCIÓN IDENTIFICADA - LISTO PARA IMPLEMENTAR** 🔄
