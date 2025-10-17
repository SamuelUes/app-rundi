# Fix: Inconsistencia en Payment Status

## 🐛 Problema Identificado

**Fecha:** 2025-10-16

### Síntoma:
Cuando un viaje se completa con pago en efectivo, hay inconsistencia entre `activeRides` y `paymentStatus`:

**activeRides:**
```json
{
  "status": "completed",  // ✅ Correcto
  "finalFare": 75
}
```

**paymentStatus:**
```json
{
  "status": "pending_capture",  // ❌ Incorrecto (debería ser "completed")
  "finalAmount": 75
}
```

### Causa:
La función `completeRide()` siempre establecía `paymentStatus.status = 'pending_capture'` sin importar el método de pago.

---

## ✅ Solución Implementada

### Archivo: `functions/src/api/rides.ts`

**Antes (❌ Incorrecto):**
```typescript
// Actualizar paymentStatus para capturar el pago
await admin.database().ref(`paymentStatus/${rideId}`).update({
  status: 'pending_capture',  // ❌ Siempre pending_capture
  finalAmount: finalFare || ride.finalFare || ride.estimatedPrice,
  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
  lastUpdatedBy: 'backend'
});
```

**Después (✅ Correcto):**
```typescript
// Actualizar paymentStatus según el método de pago
const paymentMethod = ride.paymentMethod || 'cash';
const finalAmount = finalFare || ride.finalFare || ride.estimatedPrice;

if (paymentMethod === 'cash') {
  // Para efectivo, marcar como completado inmediatamente
  await admin.database().ref(`paymentStatus/${rideId}`).update({
    status: 'completed',  // ✅ Completado para cash
    finalAmount: finalAmount,
    lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    lastUpdatedBy: 'backend',
    message: 'Pago en efectivo completado'
  });
} else {
  // Para tarjeta, dejar en pending_capture para que se procese después
  await admin.database().ref(`paymentStatus/${rideId}`).update({
    status: 'pending_capture',  // ✅ Pending para tarjeta
    finalAmount: finalAmount,
    lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    lastUpdatedBy: 'backend',
    message: 'Esperando captura de pago con tarjeta'
  });
}
```

---

## 🔄 Flujo Corregido

### Pago en Efectivo (cash):

```
1. Conductor completa viaje
   ↓
2. completeRide() se ejecuta
   ↓
3. activeRides/${rideId}.status = 'completed'
   ↓
4. paymentStatus/${rideId}.status = 'completed' ✅
   ↓
5. Viaje se archiva en PostgreSQL
   ↓
6. Se elimina de Realtime Database
```

### Pago con Tarjeta (stripe/visanet):

```
1. Conductor completa viaje
   ↓
2. completeRide() se ejecuta
   ↓
3. activeRides/${rideId}.status = 'completed'
   ↓
4. paymentStatus/${rideId}.status = 'pending_capture' ✅
   ↓
5. capturePayment() se ejecuta (webhook o manual)
   ↓
6. paymentStatus/${rideId}.status = 'completed'
   ↓
7. Viaje se archiva en PostgreSQL
   ↓
8. Se elimina de Realtime Database
```

---

## 📊 Estados de Payment

### Estados Válidos:

| Estado | Descripción | Cuándo se usa |
|--------|-------------|---------------|
| `pending` | Esperando autorización | Al crear el viaje |
| `authorized` | Pre-autorizado (hold) | Al confirmar conductor (tarjeta) |
| `in_progress` | Viaje en curso | Al iniciar viaje |
| `pending_capture` | Listo para capturar | Al completar viaje (tarjeta) |
| `completed` | Pago completado | Al completar viaje (cash) o capturar (tarjeta) |
| `canceled` | Pago cancelado | Al cancelar viaje |
| `failed` | Pago fallido | Error en captura |

---

## 🧪 Testing

### Test 1: Viaje con Efectivo

```typescript
// 1. Crear viaje
const ride = await requestRide({
  paymentMethod: 'cash',
  estimatedPrice: 100
});

// 2. Iniciar viaje
await startRide(rideId);

// 3. Completar viaje
await completeRide(rideId, { finalFare: 75 });

// 4. Verificar paymentStatus
const paymentStatus = await getPaymentStatus(rideId);
expect(paymentStatus.status).toBe('completed'); // ✅
expect(paymentStatus.finalAmount).toBe(75);
```

### Test 2: Viaje con Tarjeta

```typescript
// 1. Crear viaje
const ride = await requestRide({
  paymentMethod: 'stripe',
  estimatedPrice: 100
});

// 2. Iniciar viaje
await startRide(rideId);

// 3. Completar viaje
await completeRide(rideId, { finalFare: 75 });

// 4. Verificar paymentStatus
const paymentStatus = await getPaymentStatus(rideId);
expect(paymentStatus.status).toBe('pending_capture'); // ✅
expect(paymentStatus.finalAmount).toBe(75);

// 5. Capturar pago
await capturePayment(rideId);

// 6. Verificar paymentStatus actualizado
const updatedStatus = await getPaymentStatus(rideId);
expect(updatedStatus.status).toBe('completed'); // ✅
```

---

## 🔧 Migración de Datos Existentes

Para corregir viajes que ya tienen esta inconsistencia:

```typescript
// Script de migración
async function fixInconsistentPayments() {
  const db = admin.database();
  
  // Obtener todos los viajes completados
  const ridesSnapshot = await db.ref('activeRides')
    .orderByChild('status')
    .equalTo('completed')
    .once('value');
  
  const rides = ridesSnapshot.val();
  let fixed = 0;
  
  for (const [rideId, ride] of Object.entries(rides)) {
    // Obtener paymentStatus
    const paymentSnapshot = await db.ref(`paymentStatus/${rideId}`).once('value');
    const payment = paymentSnapshot.val();
    
    // Si el payment está en pending_capture y el método es cash
    if (payment && 
        payment.status === 'pending_capture' && 
        ride.paymentMethod === 'cash') {
      
      // Actualizar a completed
      await db.ref(`paymentStatus/${rideId}`).update({
        status: 'completed',
        lastUpdatedAt: Date.now(),
        lastUpdatedBy: 'migration_script',
        message: 'Corregido por script de migración'
      });
      
      fixed++;
      console.log(`✅ Corregido payment para viaje: ${rideId}`);
    }
  }
  
  console.log(`📊 Total corregidos: ${fixed} payments`);
}
```

---

## 📚 Documentación Relacionada

- `SISTEMA_LIMPIEZA_REALTIME.md` - Sistema de archivado
- `VALIDACION_SCHEMA_PAYMENTS.md` - Schema de payments
- `PAYMENT_FLOW_COMPLETE.md` - Flujo completo de pagos

---

## ✅ Checklist

- [x] Identificar problema
- [x] Corregir función `completeRide()`
- [x] Diferenciar entre cash y tarjeta
- [x] Agregar mensajes descriptivos
- [x] Documentar cambios
- [ ] Ejecutar script de migración para datos existentes
- [ ] Testing E2E
- [ ] Desplegar a producción

---

**Fecha de corrección:** 2025-10-16  
**Archivo modificado:** `functions/src/api/rides.ts`  
**Estado:** ✅ Corregido - Pendiente de despliegue
