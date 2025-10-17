# 📋 TODO: Implementar Flujo de Pago con Realtime DB

**Fecha:** 2025-10-13  
**Estado:** 🔄 **EN PROGRESO**

---

## ✅ Completado

### 1. Backend - completeRide() ✅
**Archivo:** `functions/src/api/rides.ts`

**Cambios:**
- ✅ Ya NO procesa el pago inmediatamente
- ✅ Inicializa `paymentStatus/{rideId}` en Realtime DB con status: 'initiated'
- ✅ Retorna success y espera que cliente seleccione método

---

## 🔄 Pendiente

### 2. Backend - createPaymentIntent()
**Archivo:** `functions/src/api/payments.ts` (línea ~130)

**Agregar antes del return:**
```typescript
// Actualizar Realtime DB
const admin = require('firebase-admin');
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'processing',
  method: 'card',
  provider: 'stripe',
  tip: tip,
  total: totalAmount / 100,
  paymentIntentId: paymentIntent.id,
  lastUpdatedBy: 'backend',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
});
```

### 3. Backend - capturePayment()
**Archivo:** `functions/src/api/payments.ts` (línea ~190)

**Agregar después de actualizar PostgreSQL:**
```typescript
// Actualizar Realtime DB
const admin = require('firebase-admin');
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'completed',
  completedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
});
```

### 4. Backend - registerCashPayment()
**Archivo:** `functions/src/api/payments.ts` (línea ~235)

**Agregar antes del return:**
```typescript
// Actualizar Realtime DB
const admin = require('firebase-admin');
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_confirmation',
  method: 'cash',
  provider: 'cash',
  tip: tip,
  total: fare + tip,
  lastUpdatedBy: 'backend',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
});
```

### 5. Backend - completeCashPayment()
**Archivo:** `functions/src/api/payments.ts` (línea ~403)

**Agregar después de actualizar PostgreSQL:**
```typescript
// Actualizar Realtime DB
const admin = require('firebase-admin');
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'completed',
  completedAt: admin.database.ServerValue.TIMESTAMP,
  confirmedBy: 'driver',
  lastUpdatedBy: 'backend',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
});
```

### 6. Backend - cancelCashPayment()
**Archivo:** `functions/src/api/payments.ts` (línea ~451)

**Agregar después de actualizar PostgreSQL:**
```typescript
// Actualizar Realtime DB
const admin = require('firebase-admin');
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'canceled',
  cancelReason: reason,
  canceledAt: admin.database.ServerValue.TIMESTAMP,
  canceledBy: 'driver',
  lastUpdatedBy: 'backend',
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
});
```

---

## 🎨 Frontend

### 7. RideTrackingScreen (Cliente)
**Archivo:** `Frontend/src/screens/Client/RideTrackingScreen.tsx`

**Agregar listener:**
```typescript
useEffect(() => {
  const { getDatabase, ref, onValue } = await import('firebase/database');
  const { initializeFirebase } = await import('../../config/firebase');
  
  const { app } = await initializeFirebase();
  const db = getDatabase(app);
  const rideRef = ref(db, `activeRides/${rideId}`);
  
  const unsubscribe = onValue(rideRef, (snapshot) => {
    const data = snapshot.val();
    
    if (data?.status === 'completed') {
      // Viaje completado, ir a pagar
      navigation.replace('Payment', {
        rideId,
        amount: data.finalFare,
        driverId: data.driverId,
        driverName: data.driverName,
      });
    }
  });
  
  return () => unsubscribe();
}, [rideId]);
```

### 8. PaymentScreen (Cliente)
**Archivo:** `Frontend/src/screens/Client/PaymentScreen.tsx`

**Ya está actualizado** ✅ (líneas 107-118 y 219-230)

### 9. ActiveRideScreen (Conductor)
**Archivo:** `Frontend/src/screens/Driver/ActiveRideScreen.tsx`

**Agregar listener después de completar viaje:**
```typescript
const handleCompleteRide = async () => {
  // ... código existente de completar viaje ...
  
  // Escuchar paymentStatus
  const { getDatabase, ref, onValue } = await import('firebase/database');
  const db = getDatabase(app);
  const paymentRef = ref(db, `paymentStatus/${rideId}`);
  
  const unsubscribe = onValue(paymentRef, (snapshot) => {
    const data = snapshot.val();
    
    if (data?.status === 'pending_confirmation' && data?.method === 'cash') {
      // Pago en efectivo, ir a confirmar
      unsubscribe(); // Dejar de escuchar
      navigation.replace('ConfirmCashPayment', {
        rideId,
        amount: data.amount,
        tip: data.tip,
        clientName: clientData.name,
      });
    } else if (data?.status === 'processing' || data?.status === 'authorized') {
      // Pago con tarjeta, ir a esperar
      unsubscribe(); // Dejar de escuchar
      navigation.replace('WaitingPayment', {
        rideId,
        amount: data.total,
        clientName: clientData.name,
      });
    }
  });
};
```

### 10. WaitingPaymentScreen (Conductor)
**Archivo:** `Frontend/src/screens/Driver/WaitingPaymentScreen.tsx`

**Ya está implementado** ✅ (líneas 30-68)

### 11. ConfirmCashPaymentScreen (Conductor)
**Archivo:** `Frontend/src/screens/Driver/ConfirmCashPaymentScreen.tsx`

**Ya está implementado** ✅

### 12. Registrar pantallas en navegación
**Archivo:** `Frontend/src/navigation/DriverNavigator.tsx`

**Agregar:**
```typescript
<Stack.Screen 
  name="WaitingPayment" 
  component={WaitingPaymentScreen}
  options={{ title: 'Esperando Pago', headerShown: false }}
/>
<Stack.Screen 
  name="ConfirmCashPayment" 
  component={ConfirmCashPaymentScreen}
  options={{ title: 'Confirmar Pago', headerShown: false }}
/>
```

---

## 📊 Resumen de Cambios

### Backend (functions/):
- ✅ `rides.ts` - completeRide() actualizado
- 🔄 `payments.ts` - 5 funciones por actualizar

### Frontend (Frontend/src/):
- 🔄 `RideTrackingScreen.tsx` - Agregar listener
- ✅ `PaymentScreen.tsx` - Ya actualizado
- 🔄 `ActiveRideScreen.tsx` - Agregar listener
- ✅ `WaitingPaymentScreen.tsx` - Ya implementado
- ✅ `ConfirmCashPaymentScreen.tsx` - Ya implementado
- 🔄 `DriverNavigator.tsx` - Registrar pantallas

---

## 🚀 Orden de Implementación

1. ✅ Backend: completeRide() - **COMPLETADO**
2. Backend: Actualizar 5 funciones de payments.ts
3. Frontend: RideTrackingScreen listener
4. Frontend: ActiveRideScreen listener
5. Frontend: Registrar pantallas en navegación
6. Testing: Flujo completo tarjeta
7. Testing: Flujo completo efectivo
8. Deploy: Firebase functions
9. Deploy: Frontend

---

## 📝 Notas

- El flujo usa Firebase Realtime DB como fuente de verdad
- Todos los cambios de status se sincronizan en tiempo real
- PostgreSQL guarda el historial permanente
- Realtime DB se puede limpiar después de completar el pago

---

**Documentación completa:** `PAYMENT_FLOW_REALTIME_COMPLETE.md`
