# Feature: Omitir Calificación (Skip Rating)

## 📋 Resumen

Sistema implementado para manejar correctamente cuando los usuarios (cliente o conductor) deciden **omitir la calificación** después de un viaje.

**Fecha:** 2025-10-16

---

## 🎯 Problema Identificado

**Antes:**
- ❌ Si el usuario presionaba "Omitir por ahora", solo navegaba al home
- ❌ El viaje quedaba en `pending_rating` esperando indefinidamente
- ❌ Si ambos omitían, el viaje no se archivaba hasta el timeout de 24 horas
- ❌ No había forma de saber si el usuario omitió o simplemente no calificó

**Después:**
- ✅ Al omitir, se marca explícitamente que el usuario decidió no calificar
- ✅ Si ambos omiten (o califican), el viaje se archiva inmediatamente
- ✅ Sistema diferencia entre "no calificó aún" vs "omitió calificar"

---

## 🔄 Flujo Completo

### Caso 1: Ambos Califican

```
1. Viaje completado → status: 'pending_rating'
   ├─ clientRated: false
   └─ driverRated: false

2. Cliente califica (5 estrellas)
   ├─ clientRated: true
   ├─ clientRating: 5
   ├─ clientSkipped: false
   └─ status: 'pending_rating' (esperando conductor)

3. Conductor califica (5 estrellas)
   ├─ driverRated: true
   ├─ driverRating: 5
   ├─ driverSkipped: false
   ├─ bothRated: true
   └─ status: 'completed' ✅ (listo para archivar)
```

### Caso 2: Cliente Califica, Conductor Omite

```
1. Viaje completado → status: 'pending_rating'

2. Cliente califica (4 estrellas)
   ├─ clientRated: true
   ├─ clientRating: 4
   └─ status: 'pending_rating'

3. Conductor omite
   ├─ driverRated: true ✅ (marcado como "rated")
   ├─ driverSkipped: true ✅ (pero omitió)
   ├─ bothRated: true
   └─ status: 'completed' ✅ (listo para archivar)
```

### Caso 3: Ambos Omiten

```
1. Viaje completado → status: 'pending_rating'

2. Cliente omite
   ├─ clientRated: true
   ├─ clientSkipped: true
   └─ status: 'pending_rating'

3. Conductor omite
   ├─ driverRated: true
   ├─ driverSkipped: true
   ├─ bothRated: true
   └─ status: 'completed' ✅ (listo para archivar)
```

### Caso 4: Uno Califica, Otro No Hace Nada (Timeout)

```
1. Viaje completado → status: 'pending_rating'

2. Cliente califica
   ├─ clientRated: true
   └─ status: 'pending_rating'

3. Conductor no hace nada (ni califica ni omite)
   └─ status: 'pending_rating'

4. Después de 24 horas → Timeout
   └─ Sistema archiva automáticamente
```

---

## 🔧 Implementación

### 1. Backend - Función `skipRating()`

**Archivo:** `functions/src/api/ratings.ts`

```typescript
export const skipRating = functions.https.onCall(async (data, context) => {
  const { rideId } = data;
  const userId = context.auth.uid;

  // Obtener viaje
  const rideRef = admin.database().ref(`activeRides/${rideId}`);
  const ride = await rideRef.once('value').then(s => s.val());

  // Determinar rol
  const raterRole = userId === ride.clientId ? 'client' : 'driver';

  // Marcar que omitió
  const updateData: any = {};
  if (raterRole === 'client') {
    updateData.clientRated = true;      // ✅ Marcado como "rated"
    updateData.clientSkipped = true;    // ✅ Pero omitió
  } else {
    updateData.driverRated = true;
    updateData.driverSkipped = true;
  }

  await rideRef.update(updateData);

  // Si ambos "completaron" (calificaron u omitieron)
  const bothRated = (raterRole === 'client' && ride.driverRated) || 
                    (raterRole === 'driver' && ride.clientRated);

  if (bothRated) {
    await rideRef.update({
      status: 'completed',
      bothRated: true,
    });
  }

  return { success: true, bothRated };
});
```

---

### 2. Frontend - Servicio

**Archivo:** `Frontend/src/services/ridesService.ts`

```typescript
async skipRating(rideId: string): Promise<void> {
  const functions = await this.getFunctions();
  const skipRatingFunction = httpsCallable(functions, 'skipRating');
  
  await skipRatingFunction({ rideId });
}
```

---

### 3. Frontend - RatingScreen

**Archivo:** `Frontend/src/screens/Shared/RatingScreen.tsx`

```typescript
<TouchableOpacity
  style={styles.skipButton}
  onPress={async () => {
    try {
      // Llamar a skipRating para marcar que omitió
      await ridesService.skipRating(rideId);
      
      // Navegar al home
      if (isDriver) {
        navigation.replace('DriverHome');
      } else {
        navigation.replace('ClientHome');
      }
    } catch (error) {
      console.error('Error omitiendo calificación:', error);
      // Navegar de todas formas
      navigation.replace(isDriver ? 'DriverHome' : 'ClientHome');
    }
  }}
>
  <Text style={styles.skipButtonText}>Omitir por ahora</Text>
</TouchableOpacity>
```

---

## 📊 Estructura de Datos

### Firebase Realtime Database

```typescript
activeRides/${rideId} = {
  status: 'pending_rating' | 'completed',
  
  // Cliente
  clientRated: boolean,      // true si calificó O omitió
  clientRating?: number,     // Solo si calificó (1-5)
  clientSkipped?: boolean,   // true si omitió
  
  // Conductor
  driverRated: boolean,      // true si calificó O omitió
  driverRating?: number,     // Solo si calificó (1-5)
  driverSkipped?: boolean,   // true si omitió
  
  // Estado general
  bothRated: boolean,        // true si ambos completaron
  ...
}
```

### Ejemplos de Estados

**Cliente calificó, Conductor omitió:**
```json
{
  "clientRated": true,
  "clientRating": 5,
  "clientSkipped": false,
  "driverRated": true,
  "driverSkipped": true,
  "bothRated": true,
  "status": "completed"
}
```

**Ambos omitieron:**
```json
{
  "clientRated": true,
  "clientSkipped": true,
  "driverRated": true,
  "driverSkipped": true,
  "bothRated": true,
  "status": "completed"
}
```

**Cliente calificó, Conductor aún no:**
```json
{
  "clientRated": true,
  "clientRating": 4,
  "clientSkipped": false,
  "driverRated": false,
  "bothRated": false,
  "status": "pending_rating"
}
```

---

## 🧪 Testing

### Test 1: Ambos Omiten

```typescript
// 1. Completar viaje
await completeRide(rideId);

// 2. Cliente omite
await skipRating(rideId); // Como cliente
expect(ride.clientRated).toBe(true);
expect(ride.clientSkipped).toBe(true);
expect(ride.status).toBe('pending_rating');

// 3. Conductor omite
await skipRating(rideId); // Como conductor
expect(ride.driverRated).toBe(true);
expect(ride.driverSkipped).toBe(true);
expect(ride.bothRated).toBe(true);
expect(ride.status).toBe('completed'); // ✅ Listo para archivar
```

### Test 2: Cliente Califica, Conductor Omite

```typescript
// 1. Completar viaje
await completeRide(rideId);

// 2. Cliente califica
await submitRating(rideId, 5, 'Excelente');
expect(ride.clientRated).toBe(true);
expect(ride.clientRating).toBe(5);
expect(ride.clientSkipped).toBeUndefined();

// 3. Conductor omite
await skipRating(rideId);
expect(ride.driverRated).toBe(true);
expect(ride.driverSkipped).toBe(true);
expect(ride.bothRated).toBe(true);
expect(ride.status).toBe('completed'); // ✅
```

### Test 3: Ambos Califican

```typescript
// 1. Completar viaje
await completeRide(rideId);

// 2. Cliente califica
await submitRating(rideId, 5, 'Excelente');

// 3. Conductor califica
await submitRating(rideId, 5, 'Buen pasajero');

expect(ride.clientRated).toBe(true);
expect(ride.clientSkipped).toBeUndefined();
expect(ride.driverRated).toBe(true);
expect(ride.driverSkipped).toBeUndefined();
expect(ride.bothRated).toBe(true);
expect(ride.status).toBe('completed'); // ✅
```

---

## 📊 Matriz de Casos

| Cliente | Conductor | Resultado | Status |
|---------|-----------|-----------|--------|
| Califica | Califica | Ambos ratings guardados | `completed` ✅ |
| Califica | Omite | Solo rating cliente guardado | `completed` ✅ |
| Omite | Califica | Solo rating conductor guardado | `completed` ✅ |
| Omite | Omite | Ningún rating guardado | `completed` ✅ |
| Califica | (nada) | Esperando conductor | `pending_rating` ⏳ |
| Omite | (nada) | Esperando conductor | `pending_rating` ⏳ |
| (nada) | Califica | Esperando cliente | `pending_rating` ⏳ |
| (nada) | Omite | Esperando cliente | `pending_rating` ⏳ |
| (nada) | (nada) | Timeout 24h | `completed` ⏰ |

---

## ✅ Beneficios

1. ✅ **Archivado inmediato** - No espera 24h si ambos omiten
2. ✅ **Claridad de datos** - Se sabe quién omitió vs quién no calificó
3. ✅ **Mejor UX** - Usuario puede omitir sin sentirse obligado
4. ✅ **Limpieza eficiente** - Viajes se archivan más rápido
5. ✅ **Métricas precisas** - Se puede analizar tasa de omisión

---

## 📈 Métricas a Monitorear

### Queries Útiles

**Tasa de omisión:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE client_skipped = true) as client_skips,
  COUNT(*) FILTER (WHERE driver_skipped = true) as driver_skips,
  COUNT(*) as total_rides
FROM rides
WHERE completed_at > NOW() - INTERVAL '30 days';
```

**Viajes sin ninguna calificación:**
```sql
SELECT COUNT(*)
FROM rides r
LEFT JOIN ratings rat ON r.id = rat.ride_id
WHERE r.status = 'completed'
  AND r.completed_at > NOW() - INTERVAL '30 days'
  AND rat.id IS NULL;
```

---

## 🚀 Deployment

```bash
# 1. Compilar functions
cd functions
npm run build

# 2. Desplegar
firebase deploy --only functions:skipRating

# 3. Verificar
firebase functions:log --only skipRating
```

---

## ✅ Checklist

- [x] Crear función `skipRating()` en backend
- [x] Exportar en `index.ts`
- [x] Agregar método `skipRating()` en servicio frontend
- [x] Actualizar RatingScreen para llamar `skipRating()`
- [x] Manejar caso de ambos omiten
- [x] Documentar cambios
- [ ] Testing E2E
- [ ] Desplegar a producción
- [ ] Monitorear métricas de omisión

---

**Fecha de implementación:** 2025-10-16  
**Archivos modificados:**
- `functions/src/api/ratings.ts`
- `functions/src/index.ts`
- `Frontend/src/services/ridesService.ts`
- `Frontend/src/screens/Shared/RatingScreen.tsx`

**Estado:** ✅ Implementado - Pendiente de despliegue
