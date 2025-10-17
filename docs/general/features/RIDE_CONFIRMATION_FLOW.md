# 🚗 FLUJO DE CONFIRMACIÓN DE VIAJE - MEJORADO

## 🎯 **PROBLEMA IDENTIFICADO**

### **Situación Actual (Incorrecta):**
1. Cliente solicita viaje → Status: `requested`
2. Conductor acepta → Status: `accepted`
3. **PROBLEMA:** El viaje desaparece del conductor si regresa a inicio
4. **PROBLEMA:** Cliente no puede rechazar al conductor
5. **PROBLEMA:** No hay status intermedio de "pendiente confirmación"

---

## ✅ **SOLUCIÓN IMPLEMENTADA**

### **Nuevo Flujo Correcto:**

```
1. Cliente solicita viaje
   └─> Status: requested
   └─> Firebase Realtime: activeRides/{rideId}

2. Conductor acepta viaje
   └─> Status: pending_client_confirmation
   └─> Conductor asignado pero NO confirmado
   └─> Cliente recibe notificación

3. Cliente decide:
   
   A) ACEPTA al conductor
      └─> Status: accepted
      └─> Viaje confirmado
      └─> Ambos pueden ver tracking
      └─> Conductor puede iniciar viaje
   
   B) RECHAZA al conductor
      └─> Status: requested (vuelve a disponible)
      └─> Conductor removido
      └─> Viaje disponible para otros conductores
      └─> Conductor recibe notificación de rechazo
```

---

## 📊 **NUEVOS STATUS**

### **Status del Viaje:**

| Status | Descripción | Visible para |
|--------|-------------|--------------|
| `requested` | Cliente solicitó viaje | Todos los conductores |
| `pending_client_confirmation` | Conductor aceptó, esperando confirmación del cliente | Conductor asignado + Cliente |
| `accepted` | Cliente confirmó al conductor | Conductor + Cliente |
| `in_progress` | Viaje en curso | Conductor + Cliente |
| `completed` | Viaje finalizado | Conductor + Cliente |
| `cancelled` | Viaje cancelado | Todos |

---

## 🔧 **IMPLEMENTACIÓN**

### **1. Frontend - Cliente (RideConfirmationScreen)**

#### **Botones Agregados:**
```tsx
{/* Botón Aceptar Conductor */}
<TouchableOpacity
  style={styles.acceptButton}
  onPress={async () => {
    const confirmDriverFunction = httpsCallable(functions, 'confirmDriver');
    await confirmDriverFunction({ rideId: ride.id });
    // Navegar a RideTracking
  }}
>
  <Text>✅ Aceptar Conductor</Text>
</TouchableOpacity>

{/* Botón Rechazar Conductor */}
<TouchableOpacity
  style={styles.rejectButton}
  onPress={() => {
    Alert.alert(
      '❌ Rechazar Conductor',
      '¿Estás seguro? El viaje volverá a estar disponible.',
      [
        { text: 'Cancelar' },
        {
          text: 'Rechazar',
          onPress: async () => {
            const rejectDriverFunction = httpsCallable(functions, 'rejectDriver');
            await rejectDriverFunction({ rideId: ride.id });
          }
        }
      ]
    );
  }}
>
  <Text>❌ Rechazar</Text>
</TouchableOpacity>
```

---

### **2. Firebase Functions (Backend)**

#### **A) acceptRide (Modificada)**
```typescript
export const acceptRide = onCall(async (request) => {
  const { rideId, driverId, proposedPrice } = request.data;
  
  // Actualizar status a pending_client_confirmation
  await db.ref(`activeRides/${rideId}`).update({
    status: 'pending_client_confirmation',
    driverId: driverId,
    proposedPrice: proposedPrice || null,
    acceptedAt: Date.now(),
  });
  
  // Notificar al cliente
  await sendNotificationToClient(clientId, {
    title: '🎉 ¡Conductor encontrado!',
    body: `${driverName} aceptó tu viaje. Confirma para continuar.`,
  });
  
  return { success: true, status: 'pending_client_confirmation' };
});
```

#### **B) confirmDriver (Nueva)**
```typescript
export const confirmDriver = onCall(async (request) => {
  const { rideId } = request.data;
  const userId = request.auth?.uid;
  
  // Verificar que el usuario es el cliente del viaje
  const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
  const ride = rideSnapshot.val();
  
  if (ride.clientId !== userId) {
    throw new HttpsError('permission-denied', 'No autorizado');
  }
  
  if (ride.status !== 'pending_client_confirmation') {
    throw new HttpsError('failed-precondition', 'El viaje no está pendiente de confirmación');
  }
  
  // Actualizar status a accepted
  await db.ref(`activeRides/${rideId}`).update({
    status: 'accepted',
    confirmedAt: Date.now(),
  });
  
  // Notificar al conductor
  await sendNotificationToDriver(ride.driverId, {
    title: '✅ Cliente confirmó el viaje',
    body: 'El cliente aceptó tu oferta. Dirígete al punto de recogida.',
  });
  
  return { success: true, status: 'accepted' };
});
```

#### **C) rejectDriver (Nueva)**
```typescript
export const rejectDriver = onCall(async (request) => {
  const { rideId } = request.data;
  const userId = request.auth?.uid;
  
  // Verificar que el usuario es el cliente del viaje
  const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
  const ride = rideSnapshot.val();
  
  if (ride.clientId !== userId) {
    throw new HttpsError('permission-denied', 'No autorizado');
  }
  
  if (ride.status !== 'pending_client_confirmation') {
    throw new HttpsError('failed-precondition', 'El viaje no está pendiente de confirmación');
  }
  
  const rejectedDriverId = ride.driverId;
  
  // Volver el viaje a requested (disponible)
  await db.ref(`activeRides/${rideId}`).update({
    status: 'requested',
    driverId: null,
    proposedPrice: null,
    acceptedAt: null,
    rejectedDrivers: admin.database.ServerValue.arrayUnion(rejectedDriverId),
  });
  
  // Notificar al conductor rechazado
  await sendNotificationToDriver(rejectedDriverId, {
    title: '❌ Cliente rechazó tu oferta',
    body: 'El cliente eligió otro conductor. Busca otros viajes disponibles.',
  });
  
  // Notificar a otros conductores que el viaje está disponible nuevamente
  await notifyAvailableDrivers(rideId);
  
  return { success: true, status: 'requested' };
});
```

---

### **3. Frontend - Conductor (DriverHomeScreen & AvailableRidesScreen)**

#### **Filtrar Viajes:**
```typescript
// Mostrar viajes según status
const availableRides = rides.filter(ride => {
  // Mostrar viajes requested (disponibles)
  if (ride.status === 'requested') {
    // No mostrar si el conductor fue rechazado antes
    return !ride.rejectedDrivers?.includes(currentDriverId);
  }
  
  // Mostrar viajes pending_client_confirmation si es el conductor asignado
  if (ride.status === 'pending_client_confirmation') {
    return ride.driverId === currentDriverId;
  }
  
  // Mostrar viajes accepted si es el conductor asignado
  if (ride.status === 'accepted') {
    return ride.driverId === currentDriverId;
  }
  
  return false;
});
```

#### **Mostrar Status en UI:**
```tsx
{ride.status === 'pending_client_confirmation' && (
  <View style={styles.pendingBadge}>
    <Text style={styles.pendingText}>
      ⏳ Esperando confirmación del cliente
    </Text>
  </View>
)}

{ride.status === 'accepted' && (
  <View style={styles.acceptedBadge}>
    <Text style={styles.acceptedText}>
      ✅ Viaje confirmado - Dirígete al punto de recogida
    </Text>
  </View>
)}
```

---

## 🎨 **UI/UX MEJORADA**

### **Cliente:**
- ✅ Ve información del conductor
- ✅ Puede aceptar o rechazar
- ✅ Confirmación antes de rechazar
- ✅ Feedback claro de la acción

### **Conductor:**
- ✅ Ve viajes disponibles
- ✅ Ve viajes pendientes de confirmación
- ✅ Ve viajes confirmados
- ✅ No pierde el viaje si regresa a inicio
- ✅ Recibe notificación si es rechazado

---

## 📝 **ARCHIVOS MODIFICADOS**

### **Frontend:**
1. ✅ `RideConfirmationScreen.tsx`
   - Agregados botones Aceptar/Rechazar
   - Estilos para botones
   - Lógica de confirmación/rechazo

2. ⏳ `DriverHomeScreen.tsx`
   - Filtrar viajes por status
   - Mostrar badge de status

3. ⏳ `AvailableRidesScreen.tsx`
   - Filtrar viajes por status
   - Mostrar badge de status

### **Backend (Firebase Functions):**
1. ⏳ `acceptRide` - Modificar para usar `pending_client_confirmation`
2. ⏳ `confirmDriver` - Nueva función
3. ⏳ `rejectDriver` - Nueva función

---

## ✅ **BENEFICIOS**

1. ✅ **Cliente tiene control** - Puede aceptar o rechazar
2. ✅ **Conductor no pierde viaje** - Permanece asignado hasta confirmación
3. ✅ **Status claro** - Todos saben en qué etapa está el viaje
4. ✅ **Notificaciones** - Ambas partes reciben feedback
5. ✅ **Viaje no desaparece** - Permanece visible para el conductor asignado
6. ✅ **Flujo lógico** - Similar a Uber/Lyft

---

## 🚀 **PRÓXIMOS PASOS**

1. ✅ Frontend Cliente - Botones agregados
2. ⏳ Backend - Crear Firebase Functions
3. ⏳ Frontend Conductor - Actualizar filtros y UI
4. ⏳ Testing completo del flujo
5. ⏳ Documentación de usuario

---

**Fecha:** 2025-10-13  
**Estado:** 🟡 EN PROGRESO  
**Prioridad:** 🔴 ALTA
