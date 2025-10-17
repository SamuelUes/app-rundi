# Sistema de Pending Rating - Mantener Viajes hasta Calificación

## 📋 Resumen

Sistema implementado para mantener los viajes completados en `activeRides` hasta que ambas partes (cliente y conductor) califiquen el viaje.

**Fecha:** 2025-10-16

---

## 🎯 Objetivo

Anteriormente, los viajes se archivaban inmediatamente después de completarse, lo que impedía que ambas partes calificaran. Ahora:

1. ✅ Viaje se completa → Estado cambia a `pending_rating`
2. ✅ Permanece en `activeRides` esperando calificaciones
3. ✅ Cuando ambos califican → Estado cambia a `completed`
4. ✅ Sistema de limpieza lo archiva automáticamente

---

## 🔄 Flujo Completo

### 1. Completar Viaje

```typescript
// Conductor completa el viaje
await completeRide(rideId, { finalFare: 75 });

// Firebase Realtime DB
activeRides/${rideId} = {
  status: 'pending_rating',  // ✅ Nuevo estado
  completedAt: timestamp,
  finalFare: 75,
  clientRated: false,        // ✅ Nuevo campo
  driverRated: false,        // ✅ Nuevo campo
  ...
}
```

### 2. Cliente Califica

```typescript
// Cliente envía calificación
await submitRating(rideId, 5, 'Excelente conductor');

// Firebase Realtime DB se actualiza
activeRides/${rideId} = {
  status: 'pending_rating',  // Sigue esperando al conductor
  clientRated: true,         // ✅ Cliente ya calificó
  clientRating: 5,           // ✅ Rating del cliente
  driverRated: false,        // Conductor aún no califica
  ...
}

// PostgreSQL
INSERT INTO ratings (
  ride_id, from_user_id, to_user_id, rating, comment
) VALUES (...)
```

### 3. Conductor Califica

```typescript
// Conductor envía calificación
await submitRating(rideId, 5, 'Excelente pasajero');

// Firebase Realtime DB se actualiza
activeRides/${rideId} = {
  status: 'completed',       // ✅ Ambos calificaron, listo para archivar
  bothRated: true,           // ✅ Marcador de ambos calificados
  clientRated: true,
  clientRating: 5,
  driverRated: true,         // ✅ Conductor ya calificó
  driverRating: 5,           // ✅ Rating del conductor
  ...
}

// PostgreSQL
INSERT INTO ratings (
  ride_id, from_user_id, to_user_id, rating, comment
) VALUES (...)
```

### 4. Archivado Automático

```typescript
// Sistema de limpieza (cada hora)
if (ride.status === 'completed' && ride.completedAt < oneHourAgo) {
  // Archivar en PostgreSQL
  await saveCompletedRideToPostgres(ride, rideId);
  
  // Eliminar de Firebase Realtime
  await admin.database().ref(`activeRides/${rideId}`).remove();
}
```

---

## 📊 Estados del Viaje

| Estado | Descripción | Cuándo |
|--------|-------------|--------|
| `requested` | Viaje solicitado | Cliente crea viaje |
| `accepted` | Conductor aceptado | Cliente confirma conductor |
| `in_progress` | Viaje en curso | Conductor inicia viaje |
| `pending_rating` | ⭐ Esperando calificaciones | Conductor completa viaje |
| `completed` | Ambos calificaron | Ambos enviaron rating |
| `canceled` | Viaje cancelado | Cliente/Conductor cancela |

---

## 🔧 Cambios Implementados

### 1. Función `completeRide()` - `functions/src/api/rides.ts`

**Antes (❌):**
```typescript
await admin.database().ref(`activeRides/${rideId}`).update({
  status: 'completed',  // ❌ Se archivaba inmediatamente
  completedAt: timestamp,
  ...
});
```

**Después (✅):**
```typescript
await admin.database().ref(`activeRides/${rideId}`).update({
  status: 'pending_rating',  // ✅ Espera calificaciones
  completedAt: timestamp,
  clientRated: false,        // ✅ Inicializar flags
  driverRated: false,
  ...
});
```

---

### 2. Función `submitRating()` - `functions/src/api/ratings.ts`

**Agregado:**
```typescript
// Actualizar Firebase Realtime Database
const rideRef = admin.database().ref(`activeRides/${rideId}`);
const firebaseRide = await rideRef.once('value').then(s => s.val());

// Marcar quién calificó
if (raterRole === 'client') {
  await rideRef.update({
    clientRated: true,
    clientRating: rating,
  });
} else {
  await rideRef.update({
    driverRated: true,
    driverRating: rating,
  });
}

// Si ambos calificaron, cambiar a completed
const bothRated = (raterRole === 'client' && firebaseRide.driverRated) || 
                  (raterRole === 'driver' && firebaseRide.clientRated);

if (bothRated) {
  await rideRef.update({
    status: 'completed',
    bothRated: true,
  });
}
```

---

### 3. Sistema de Limpieza - `functions/src/scheduled/cleanupOldRides.ts`

**Agregado:**
```typescript
// Archivar viajes completados (ambos calificaron) después de 1 hora
if (ride.status === 'completed' && ride.completedAt < oneHourAgo) {
  await archiveCompletedRide(ride, rideId);
}

// Archivar viajes pending_rating después de 24 horas (timeout)
else if (ride.status === 'pending_rating' && ride.completedAt < twentyFourHoursAgo) {
  console.log('⏰ Archivando viaje sin calificaciones completas (24h timeout)');
  await archiveCompletedRide(ride, rideId);
}
```

---

## 📁 Estructura de Datos

### Firebase Realtime Database

```typescript
activeRides/${rideId} = {
  // Datos básicos
  clientId: string,
  driverId: string,
  status: 'pending_rating' | 'completed',
  
  // Timestamps
  createdAt: number,
  completedAt: number,
  
  // Calificaciones
  clientRated: boolean,      // ✅ Nuevo
  clientRating: number,      // ✅ Nuevo
  driverRated: boolean,      // ✅ Nuevo
  driverRating: number,      // ✅ Nuevo
  bothRated: boolean,        // ✅ Nuevo
  
  // Otros datos
  finalFare: number,
  ...
}
```

### PostgreSQL - Tabla `ratings`

```sql
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id),
  from_user_id VARCHAR(255) NOT NULL,  -- Quién califica
  to_user_id VARCHAR(255) NOT NULL,    -- A quién califica
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  
  -- Categorías detalladas
  punctuality INTEGER CHECK (punctuality >= 1 AND punctuality <= 5),
  cleanliness INTEGER CHECK (cleanliness >= 1 AND cleanliness <= 5),
  communication INTEGER CHECK (communication >= 1 AND communication <= 5),
  driving INTEGER CHECK (driving >= 1 AND driving <= 5),
  safety INTEGER CHECK (safety >= 1 AND safety <= 5),
  friendliness INTEGER CHECK (friendliness >= 1 AND friendliness <= 5),
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## ⏰ Tiempos de Archivado

| Condición | Tiempo | Acción |
|-----------|--------|--------|
| `status: 'completed'` (ambos calificaron) | 1 hora | Archivar |
| `status: 'pending_rating'` (sin calificar) | 24 horas | Archivar (timeout) |
| `status: 'canceled'` | 1 hora | Archivar |

---

## 🧪 Testing

### Test 1: Ambos Califican

```typescript
// 1. Completar viaje
await completeRide(rideId);
expect(ride.status).toBe('pending_rating');
expect(ride.clientRated).toBe(false);
expect(ride.driverRated).toBe(false);

// 2. Cliente califica
await submitRating(rideId, 5, 'Excelente');
expect(ride.clientRated).toBe(true);
expect(ride.status).toBe('pending_rating'); // Sigue esperando

// 3. Conductor califica
await submitRating(rideId, 5, 'Buen pasajero');
expect(ride.driverRated).toBe(true);
expect(ride.status).toBe('completed'); // ✅ Ambos calificaron
expect(ride.bothRated).toBe(true);

// 4. Esperar 1 hora
await wait(1 * 60 * 60 * 1000);

// 5. Ejecutar limpieza
await cleanupOldRides();

// 6. Verificar archivado
const firebaseRide = await getActiveRide(rideId);
expect(firebaseRide).toBeNull(); // ✅ Eliminado de Firebase

const pgRide = await getRideFromPostgres(rideId);
expect(pgRide).toBeDefined(); // ✅ Guardado en PostgreSQL
```

### Test 2: Solo Cliente Califica (Timeout)

```typescript
// 1. Completar viaje
await completeRide(rideId);

// 2. Cliente califica
await submitRating(rideId, 5, 'Excelente');
expect(ride.clientRated).toBe(true);
expect(ride.driverRated).toBe(false);

// 3. Esperar 24 horas (conductor no califica)
await wait(24 * 60 * 60 * 1000);

// 4. Ejecutar limpieza
await cleanupOldRides();

// 5. Verificar archivado por timeout
const firebaseRide = await getActiveRide(rideId);
expect(firebaseRide).toBeNull(); // ✅ Archivado por timeout
```

---

## 📚 Beneficios

1. ✅ **Ambas partes pueden calificar** - No se pierde la oportunidad
2. ✅ **Datos en tiempo real** - Viaje sigue visible hasta calificar
3. ✅ **Archivado automático** - No requiere intervención manual
4. ✅ **Timeout de seguridad** - Viajes sin calificar se archivan a las 24h
5. ✅ **Historial completo** - Todas las calificaciones se guardan en PostgreSQL

---

## 🚀 Deployment

```bash
# 1. Compilar functions
cd functions
npm run build

# 2. Desplegar
firebase deploy --only functions

# 3. Verificar logs
firebase functions:log
```

---

## 📊 Monitoreo

### Queries Útiles

**Ver viajes pending_rating:**
```typescript
const pendingRatings = await admin.database()
  .ref('activeRides')
  .orderByChild('status')
  .equalTo('pending_rating')
  .once('value');
```

**Ver viajes listos para archivar:**
```typescript
const oneHourAgo = Date.now() - (60 * 60 * 1000);
const readyToArchive = await admin.database()
  .ref('activeRides')
  .orderByChild('status')
  .equalTo('completed')
  .once('value')
  .then(snapshot => {
    const rides = snapshot.val();
    return Object.entries(rides).filter(([_, ride]) => 
      ride.completedAt < oneHourAgo
    );
  });
```

---

## ✅ Checklist

- [x] Actualizar `completeRide()` para usar `pending_rating`
- [x] Agregar campos `clientRated` y `driverRated`
- [x] Modificar `submitRating()` para actualizar Firebase
- [x] Implementar lógica de `bothRated`
- [x] Actualizar sistema de limpieza
- [x] Agregar timeout de 24 horas
- [x] Documentar cambios
- [ ] Testing E2E
- [ ] Desplegar a producción
- [ ] Monitorear métricas

---

**Fecha de implementación:** 2025-10-16  
**Archivos modificados:**
- `functions/src/api/rides.ts`
- `functions/src/api/ratings.ts`
- `functions/src/scheduled/cleanupOldRides.ts`

**Estado:** ✅ Implementado - Pendiente de despliegue
