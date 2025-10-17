# Integración de Ratings con Supabase PostgreSQL

## 📋 Resumen

Sistema de calificaciones que guarda los ratings en Supabase PostgreSQL con manejo inteligente de viajes en `pending_rating`.

**Fecha:** 2025-10-16

---

## 🎯 Problema y Solución

### Problema:
- Los viajes en `pending_rating` aún no están en PostgreSQL
- No se puede guardar el rating sin el UUID del viaje
- El `rideId` de Firebase es un string, no un UUID

### Solución:
- Buscar el viaje en PostgreSQL por `client_id` y `driver_id`
- Si existe, guardar el rating con el UUID
- Si NO existe (aún en `pending_rating`), solo actualizar Firebase
- Cuando el viaje se archive, los ratings se pueden agregar después

---

## 🔄 Flujo Completo

### Caso 1: Viaje Ya Archivado en PostgreSQL

```
1. Usuario califica
   ↓
2. submitRating() busca viaje en PostgreSQL
   ├─ SELECT id FROM rides WHERE client_id = ? AND driver_id = ?
   └─ ✅ Encontrado → pgRideId = UUID

3. Guardar rating en PostgreSQL
   ├─ INSERT INTO ratings (ride_id, from_user_id, to_user_id, rating, ...)
   └─ ✅ Rating guardado con UUID

4. Actualizar Firebase Realtime
   ├─ clientRated = true
   └─ clientRating = 5

5. Si ambos calificaron
   └─ status = 'completed'
```

### Caso 2: Viaje en `pending_rating` (No en PostgreSQL)

```
1. Usuario califica
   ↓
2. submitRating() busca viaje en PostgreSQL
   ├─ SELECT id FROM rides WHERE client_id = ? AND driver_id = ?
   └─ ❌ No encontrado → pgRideId = null

3. NO guardar en PostgreSQL aún
   ├─ ⚠️ Log: "Rating NO guardado en PostgreSQL (viaje aún no archivado)"
   └─ Se guardará cuando se archive

4. Actualizar Firebase Realtime
   ├─ clientRated = true
   └─ clientRating = 5

5. Si ambos calificaron
   └─ status = 'completed'

6. Sistema de limpieza archiva el viaje
   ├─ Guarda viaje en PostgreSQL
   └─ ⚠️ Los ratings se pueden agregar después manualmente
```

---

## 🔧 Implementación

### 1. Buscar Viaje en PostgreSQL

```typescript
// Buscar por client_id y driver_id (más reciente)
const rideResult = await client.query(
  `SELECT id, client_id, driver_id, status 
   FROM rides 
   WHERE client_id = $1 
     AND driver_id = $2 
     AND completed_at IS NOT NULL
   ORDER BY completed_at DESC
   LIMIT 1`,
  [firebaseRide.clientId, firebaseRide.driverId]
);

let pgRideId: string | null = null;

if (rideResult.rows.length > 0) {
  pgRideId = rideResult.rows[0].id;  // ✅ UUID de PostgreSQL
} else {
  pgRideId = null;  // ❌ Viaje aún no archivado
}
```

---

### 2. Guardar Rating (Solo si Existe en PostgreSQL)

```typescript
let newRating: any = null;

if (pgRideId) {
  // ✅ Guardar en PostgreSQL
  const ratingResult = await client.query(
    `INSERT INTO ratings (
      ride_id, from_user_id, to_user_id, rating, comment, 
      punctuality, cleanliness, communication, driving, safety, friendliness,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    RETURNING id, created_at`,
    [
      pgRideId,  // ✅ UUID de PostgreSQL
      fromUserId,
      toUserId,
      rating,
      comment || null,
      punctuality || null,
      cleanliness || null,
      communication || null,
      driving || null,
      safety || null,
      friendliness || null,
    ]
  );
  
  newRating = ratingResult.rows[0];
  console.log(`✅ Rating guardado en PostgreSQL con ID: ${newRating.id}`);
} else {
  // ⚠️ NO guardar en PostgreSQL aún
  console.log(`⚠️ Rating NO guardado en PostgreSQL (viaje aún no archivado)`);
  console.log(`   Se guardará cuando el viaje se archive en PostgreSQL`);
  newRating = { id: null, created_at: new Date() };
}
```

---

### 3. Siempre Actualizar Firebase

```typescript
// Actualizar Firebase Realtime (siempre)
const rideRef = admin.database().ref(`activeRides/${rideId}`);

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
```

---

## 📊 Schema de Supabase

### Tabla `ratings`

```sql
CREATE TABLE public.ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,  -- ✅ UUID de PostgreSQL
  from_user_id VARCHAR(255) NOT NULL,  -- Firebase UID
  to_user_id VARCHAR(255) NOT NULL,    -- Firebase UID
  rating INTEGER NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NULL,
  
  -- Categorías detalladas
  punctuality INTEGER NULL CHECK (punctuality >= 1 AND punctuality <= 5),
  cleanliness INTEGER NULL CHECK (cleanliness >= 1 AND cleanliness <= 5),
  communication INTEGER NULL CHECK (communication >= 1 AND communication <= 5),
  driving INTEGER NULL CHECK (driving >= 1 AND driving <= 5),
  safety INTEGER NULL CHECK (safety >= 1 AND safety <= 5),
  friendliness INTEGER NULL CHECK (friendliness >= 1 AND friendliness <= 5),
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT ratings_pkey PRIMARY KEY (id),
  CONSTRAINT ratings_ride_id_fkey FOREIGN KEY (ride_id) 
    REFERENCES rides (id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX idx_ratings_ride_id ON ratings (ride_id);
CREATE INDEX idx_ratings_to_user_id ON ratings (to_user_id);
CREATE INDEX idx_ratings_from_user_id ON ratings (from_user_id);
CREATE INDEX idx_ratings_user_rating ON ratings (to_user_id, rating);
```

---

## 🧪 Testing

### Test 1: Viaje Ya Archivado

```typescript
// 1. Completar y archivar viaje
await completeRide(rideId);
await wait(1 * 60 * 60 * 1000); // 1 hora
await cleanupOldRides(); // Archiva en PostgreSQL

// 2. Calificar
await submitRating(rideId, 5, 'Excelente');

// 3. Verificar en PostgreSQL
const pgRating = await client.query(
  'SELECT * FROM ratings WHERE from_user_id = $1',
  [userId]
);

expect(pgRating.rows.length).toBe(1); // ✅ Guardado
expect(pgRating.rows[0].rating).toBe(5);
expect(pgRating.rows[0].ride_id).toBeDefined(); // ✅ UUID
```

### Test 2: Viaje en `pending_rating`

```typescript
// 1. Completar viaje (no archivar aún)
await completeRide(rideId);

// 2. Calificar inmediatamente
await submitRating(rideId, 5, 'Excelente');

// 3. Verificar en PostgreSQL
const pgRating = await client.query(
  'SELECT * FROM ratings WHERE from_user_id = $1',
  [userId]
);

expect(pgRating.rows.length).toBe(0); // ❌ NO guardado aún

// 4. Verificar en Firebase
const firebaseRide = await getActiveRide(rideId);
expect(firebaseRide.clientRated).toBe(true); // ✅ Marcado
expect(firebaseRide.clientRating).toBe(5); // ✅ Rating guardado
```

---

## 📈 Queries Útiles

### Ver Ratings de un Usuario

```sql
SELECT 
  r.id,
  r.rating,
  r.comment,
  r.punctuality,
  r.cleanliness,
  r.communication,
  r.created_at,
  rides.client_id,
  rides.driver_id
FROM ratings r
JOIN rides ON r.ride_id = rides.id
WHERE r.to_user_id = 'FIREBASE_UID'
ORDER BY r.created_at DESC;
```

### Promedio de Rating

```sql
SELECT 
  to_user_id,
  COUNT(*) as total_ratings,
  ROUND(AVG(rating)::numeric, 2) as average_rating,
  ROUND(AVG(punctuality)::numeric, 2) as avg_punctuality,
  ROUND(AVG(cleanliness)::numeric, 2) as avg_cleanliness,
  ROUND(AVG(communication)::numeric, 2) as avg_communication
FROM ratings
WHERE to_user_id = 'FIREBASE_UID'
GROUP BY to_user_id;
```

### Ratings Sin Viaje (Huérfanos)

```sql
SELECT 
  r.id,
  r.from_user_id,
  r.to_user_id,
  r.rating,
  r.created_at
FROM ratings r
WHERE r.ride_id IS NULL;
```

---

## ⚠️ Consideraciones

### 1. **Ratings Huérfanos**

Si un usuario califica antes de que el viaje se archive, el rating NO se guarda en PostgreSQL. Opciones:

**Opción A: Guardar después (Recomendado)**
- Crear script que busque viajes archivados sin ratings
- Obtener ratings de Firebase
- Guardar en PostgreSQL

**Opción B: Guardar con ride_id NULL**
- Permitir `ride_id NULL` en ratings
- Actualizar después cuando se archive el viaje

**Opción C: Forzar archivado inmediato**
- Al calificar, archivar el viaje inmediatamente
- Garantiza que siempre haya UUID

---

### 2. **Sincronización Firebase ↔ PostgreSQL**

Actualmente:
- Firebase: Fuente de verdad para viajes activos
- PostgreSQL: Fuente de verdad para historial

Para ratings:
- Firebase: Marca quién calificó (`clientRated`, `driverRated`)
- PostgreSQL: Guarda el rating completo con detalles

---

## 🚀 Mejoras Futuras

### 1. Script de Sincronización

```typescript
// Sincronizar ratings de Firebase a PostgreSQL
async function syncRatingsToPostgres() {
  // 1. Obtener viajes completados de Firebase
  const completedRides = await getCompletedRidesFromFirebase();
  
  // 2. Para cada viaje con ratings
  for (const ride of completedRides) {
    if (ride.clientRated && ride.clientRating) {
      // Buscar viaje en PostgreSQL
      const pgRide = await findRideInPostgres(ride.clientId, ride.driverId);
      
      if (pgRide && !hasRating(pgRide.id, ride.clientId)) {
        // Guardar rating
        await saveRatingToPostgres({
          ride_id: pgRide.id,
          from_user_id: ride.clientId,
          to_user_id: ride.driverId,
          rating: ride.clientRating,
        });
      }
    }
  }
}
```

### 2. Trigger de Archivado

```typescript
// Al archivar viaje, guardar ratings pendientes
async function archiveRideWithRatings(ride, rideId) {
  // 1. Guardar viaje en PostgreSQL
  const pgRideId = await saveRideToPostgres(ride);
  
  // 2. Guardar ratings si existen
  if (ride.clientRated && ride.clientRating) {
    await saveRatingToPostgres({
      ride_id: pgRideId,
      from_user_id: ride.clientId,
      to_user_id: ride.driverId,
      rating: ride.clientRating,
    });
  }
  
  if (ride.driverRated && ride.driverRating) {
    await saveRatingToPostgres({
      ride_id: pgRideId,
      from_user_id: ride.driverId,
      to_user_id: ride.clientId,
      rating: ride.driverRating,
    });
  }
}
```

---

## ✅ Checklist

- [x] Buscar viaje en PostgreSQL por client_id y driver_id
- [x] Usar UUID de PostgreSQL para ride_id
- [x] Manejar caso cuando viaje no existe en PostgreSQL
- [x] Guardar rating solo si existe UUID
- [x] Siempre actualizar Firebase Realtime
- [x] Logs informativos
- [x] Documentación completa
- [ ] Script de sincronización de ratings huérfanos
- [ ] Trigger para guardar ratings al archivar
- [ ] Testing E2E

---

**Fecha de implementación:** 2025-10-16  
**Archivo modificado:** `functions/src/api/ratings.ts`  
**Estado:** ✅ Implementado - Pendiente de despliegue
