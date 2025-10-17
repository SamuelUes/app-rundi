# 🧪 TEST MANUAL END-TO-END

## DriveAngel.ni - Flujo Completo
**Fecha:** 2025-10-15

---

## 📋 PREPARACIÓN

### Herramientas Necesarias:
- **Postman** o **Insomnia** (para hacer requests HTTP)
- **Firebase Console** (para ver datos en tiempo real)
- **Supabase Dashboard** (para verificar datos en PostgreSQL)

### URLs Base:
```
Firebase Functions: https://us-central1-driveangel-ni.cloudfunctions.net
Firebase Console: https://console.firebase.google.com/project/driveangel-ni
Supabase: https://supabase.com/dashboard/project/ceytngpresytjhafcadu
```

---

## 🎯 FLUJO DE TEST (15 PASOS)

### ✅ PASO 1: REGISTRAR CLIENTE

**Endpoint:** `POST /register`
```json
{
  "data": {
    "email": "cliente.test@driveangel.ni",
    "password": "Test123456",
    "displayName": "Juan Cliente Test",
    "phoneNumber": "+50588887777",
    "role": "client"
  }
}
```

**Respuesta esperada:**
```json
{
  "result": {
    "user": {
      "uid": "...",
      "email": "cliente.test@driveangel.ni"
    },
    "token": "..."
  }
}
```

**Guardar:** `clientToken` y `clientUid`

---

### ✅ PASO 2: REGISTRAR CONDUCTOR 1

**Endpoint:** `POST /register`
```json
{
  "data": {
    "email": "conductor1.test@driveangel.ni",
    "password": "Test123456",
    "displayName": "Pedro Conductor 1",
    "phoneNumber": "+50588881111",
    "role": "driver",
    "driverData": {
      "licenseNumber": "LIC-001-TEST",
      "licenseExpiry": "2026-12-31",
      "licensePhoto": "https://example.com/license1.jpg"
    },
    "vehicleData": {
      "plate": "M-12345",
      "brand": "Toyota",
      "model": "Corolla",
      "year": 2020,
      "color": "Blanco",
      "type": "auto"
    }
  }
}
```

**Guardar:** `driver1Token` y `driver1Uid`

---

### ✅ PASO 3: REGISTRAR CONDUCTOR 2

**Endpoint:** `POST /register`
```json
{
  "data": {
    "email": "conductor2.test@driveangel.ni",
    "password": "Test123456",
    "displayName": "Carlos Conductor 2",
    "phoneNumber": "+50588882222",
    "role": "driver",
    "driverData": {
      "licenseNumber": "LIC-002-TEST",
      "licenseExpiry": "2026-12-31",
      "licensePhoto": "https://example.com/license2.jpg"
    },
    "vehicleData": {
      "plate": "M-67890",
      "brand": "Honda",
      "model": "Civic",
      "year": 2021,
      "color": "Negro",
      "type": "auto"
    }
  }
}
```

**Guardar:** `driver2Token` y `driver2Uid`

---

### ✅ PASO 4: ACTUALIZAR UBICACIÓN DE CONDUCTORES

**Ir a Firebase Console:**
1. Realtime Database
2. Agregar manualmente:

```json
driverLocations/
  {driver1Uid}/
    lat: 12.1364
    lng: -86.2514
    status: "available"
    timestamp: [timestamp actual]
  
  {driver2Uid}/
    lat: 12.1400
    lng: -86.2550
    status: "available"
    timestamp: [timestamp actual]
```

---

### ✅ PASO 5: CLIENTE SOLICITA VIAJE

**Endpoint:** `POST /requestRide`
**Headers:** `Authorization: Bearer {clientToken}`

```json
{
  "data": {
    "origin": {
      "lat": 12.1364,
      "lng": -86.2514,
      "address": "Metrocentro, Managua"
    },
    "destination": {
      "lat": 12.1150,
      "lng": -86.2362,
      "address": "Plaza Inter, Managua"
    },
    "estimatedDistance": 3500,
    "estimatedDuration": 15,
    "estimatedPrice": 150,
    "passengers": 2,
    "vehicleType": "auto",
    "paymentType": "cash"
  }
}
```

**Guardar:** `rideId`

**Verificar en Firebase Realtime:**
- `activeRides/{rideId}` debe existir
- `status: "requested"`

---

### ✅ PASO 6: CONDUCTOR 1 ACEPTA (CREA OFERTA)

**Endpoint:** `POST /acceptRide`
**Headers:** `Authorization: Bearer {driver1Token}`

```json
{
  "data": {
    "rideId": "{rideId}",
    "offeredPrice": 140
  }
}
```

**Verificar en Firebase Realtime:**
- `activeRides/{rideId}/offers/{driver1Uid}` debe existir
- `offeredPrice: 140`
- `status: "pending"`

---

### ✅ PASO 7: CONDUCTOR 2 ACEPTA (CREA OFERTA)

**Endpoint:** `POST /acceptRide`
**Headers:** `Authorization: Bearer {driver2Token}`

```json
{
  "data": {
    "rideId": "{rideId}",
    "offeredPrice": 150
  }
}
```

**Verificar en Firebase Realtime:**
- `activeRides/{rideId}/offers/{driver2Uid}` debe existir
- `offersCount: 2`

---

### ✅ PASO 8: CLIENTE SELECCIONA CONDUCTOR 1

**Endpoint:** `POST /confirmDriver`
**Headers:** `Authorization: Bearer {clientToken}`

```json
{
  "data": {
    "rideId": "{rideId}",
    "selectedDriverId": "{driver1Uid}"
  }
}
```

**Verificar:**
- `activeRides/{rideId}/driverId` = `{driver1Uid}`
- `activeRides/{rideId}/status` = `"accepted"`
- `activeRides/{rideId}/offers/{driver1Uid}/status` = `"accepted"`
- `activeRides/{rideId}/offers/{driver2Uid}/status` = `"rejected"`
- `activeRides/{rideId}/rejectedDrivers` incluye `{driver2Uid}`

---

### ✅ PASO 9: CONDUCTOR INICIA VIAJE

**Endpoint:** `POST /startRide`
**Headers:** `Authorization: Bearer {driver1Token}`

```json
{
  "data": {
    "rideId": "{rideId}"
  }
}
```

**Verificar:**
- `activeRides/{rideId}/status` = `"in_progress"`
- `activeRides/{rideId}/startedAt` tiene timestamp

---

### ✅ PASO 10: TRACKING OPTIMIZADO (5 PUNTOS)

**Endpoint:** `POST /updateDriverLocationOptimized`
**Headers:** `Authorization: Bearer {driver1Token}`

**Punto 1:**
```json
{
  "data": {
    "rideId": "{rideId}",
    "latitude": 12.1350,
    "longitude": -86.2500,
    "speed": 30,
    "heading": 180,
    "accuracy": 10
  }
}
```

**Repetir con:**
- Punto 2: `lat: 12.1320, lng: -86.2470, speed: 45`
- Punto 3: `lat: 12.1280, lng: -86.2430, speed: 50`
- Punto 4: `lat: 12.1230, lng: -86.2400, speed: 40`
- Punto 5: `lat: 12.1180, lng: -86.2370, speed: 35`

**Verificar:**
- Firebase Realtime: `activeRides/{rideId}/currentLocation` se actualiza
- Supabase: `ride_locations` tiene ~2-3 puntos (comprimido)

---

### ✅ PASO 11: CALCULAR ETA INTELIGENTE

**Endpoint:** `POST /getIntelligentETA`

```json
{
  "data": {
    "rideId": "{rideId}",
    "currentLat": 12.1180,
    "currentLng": -86.2370,
    "destinationLat": 12.1150,
    "destinationLng": -86.2362
  }
}
```

**Respuesta esperada:**
```json
{
  "result": {
    "success": true,
    "etaMinutes": 5,
    "distanceRemaining": 0.5,
    "avgSpeed": 35,
    "trafficMultiplier": 1.0
  }
}
```

---

### ✅ PASO 12: COMPLETAR VIAJE

**Endpoint:** `POST /completeRide`
**Headers:** `Authorization: Bearer {driver1Token}`

```json
{
  "data": {
    "rideId": "{rideId}",
    "actualDistance": 3200,
    "actualDuration": 12
  }
}
```

**Verificar:**
- `activeRides/{rideId}/status` = `"completed"`
- Supabase `rides`: viaje con `status = 'completed'`
- Supabase `payments`: pago con `status = 'completed'` (si era cash)

---

### ✅ PASO 13: CLIENTE CALIFICA CONDUCTOR

**Endpoint:** `POST /submitRating`
**Headers:** `Authorization: Bearer {clientToken}`

```json
{
  "data": {
    "rideId": "{rideId}",
    "rating": 5,
    "comment": "Excelente conductor, muy puntual y amable",
    "punctuality": 5,
    "cleanliness": 5,
    "communication": 5,
    "driving": 5,
    "safety": 5,
    "friendliness": 5
  }
}
```

**Verificar en Supabase:**
- `ratings`: 1 calificación con todas las categorías

---

### ✅ PASO 14: CONDUCTOR CALIFICA CLIENTE

**Endpoint:** `POST /submitRating`
**Headers:** `Authorization: Bearer {driver1Token}`

```json
{
  "data": {
    "rideId": "{rideId}",
    "rating": 5,
    "comment": "Cliente puntual y respetuoso",
    "punctuality": 5,
    "communication": 5,
    "friendliness": 5
  }
}
```

**Verificar en Supabase:**
- `ratings`: 2 calificaciones totales

---

### ✅ PASO 15: OBTENER RATING DEL CONDUCTOR

**Endpoint:** `POST /getUserRating`

```json
{
  "data": {
    "userId": "{driver1Uid}"
  }
}
```

**Respuesta esperada:**
```json
{
  "result": {
    "userId": "...",
    "totalRatings": 1,
    "averageRating": 5.0,
    "categories": {
      "punctuality": 5.0,
      "cleanliness": 5.0,
      "communication": 5.0,
      "driving": 5.0,
      "safety": 5.0,
      "friendliness": 5.0
    }
  }
}
```

---

## ✅ VERIFICACIÓN FINAL EN SUPABASE

### Queries de Verificación:

```sql
-- 1. Verificar conductores registrados
SELECT * FROM drivers ORDER BY created_at DESC LIMIT 2;

-- 2. Verificar vehículos
SELECT * FROM vehicles ORDER BY created_at DESC LIMIT 2;

-- 3. Verificar viaje completado
SELECT * FROM rides WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1;

-- 4. Verificar calificaciones
SELECT * FROM ratings ORDER BY created_at DESC LIMIT 2;

-- 5. Verificar tracking comprimido
SELECT COUNT(*) as total_points FROM ride_locations WHERE ride_id = '{rideId}';
-- Debe retornar ~2-5 puntos (comprimido)

-- 6. Verificar rating del conductor
SELECT 
  to_user_id,
  COUNT(*) as total,
  AVG(rating) as avg_rating,
  AVG(punctuality) as avg_punctuality,
  AVG(cleanliness) as avg_cleanliness,
  AVG(communication) as avg_communication,
  AVG(driving) as avg_driving,
  AVG(safety) as avg_safety,
  AVG(friendliness) as avg_friendliness
FROM ratings
WHERE to_user_id = '{driver1Uid}'
GROUP BY to_user_id;
```

---

## 🎉 CHECKLIST DE ÉXITO

- [ ] Cliente registrado correctamente
- [ ] 2 conductores registrados con vehículos
- [ ] Viaje solicitado y visible en Firebase Realtime
- [ ] 2 ofertas creadas por conductores
- [ ] Cliente seleccionó conductor (sistema de ofertas funcionando)
- [ ] Conductor rechazado no puede re-ofertar
- [ ] Viaje iniciado correctamente
- [ ] Tracking optimizado: Firebase actualizado cada request
- [ ] Tracking optimizado: PostgreSQL solo ~2-5 puntos (83% compresión)
- [ ] ETA inteligente calculado correctamente
- [ ] Viaje completado
- [ ] 2 calificaciones registradas (bidireccional)
- [ ] Calificaciones con 6 categorías funcionando
- [ ] Rating promedio calculado correctamente

---

## 📊 RESULTADOS ESPERADOS

### Firebase Realtime Database:
- `activeRides/{rideId}` eliminado (viaje completado)
- `driverLocations/{driver1Uid}` actualizado

### Supabase PostgreSQL:
- **drivers**: 2 registros
- **vehicles**: 2 registros
- **rides**: 1 viaje completado
- **ratings**: 2 calificaciones
- **ride_locations**: 2-5 puntos (comprimido)
- **payments**: 1 pago completado

---

## 🔧 TROUBLESHOOTING

### Si algo falla:

**Error de autenticación:**
- Verificar que el token esté en el header `Authorization: Bearer {token}`

**Viaje no se crea:**
- Verificar que las coordenadas sean válidas
- Verificar que `estimatedDistance` > 100m

**Ofertas no aparecen:**
- Verificar que conductores tengan ubicación en Firebase Realtime
- Verificar que el viaje esté en estado `requested`

**Tracking no se guarda:**
- Verificar que el viaje esté en estado `in_progress`
- Verificar que el conductor sea el asignado al viaje

**Calificaciones fallan:**
- Verificar que el viaje esté `completed`
- Verificar que no hayas calificado ya (solo 1 vez por usuario)

---

**Estado:** 🟢 LISTO PARA TESTING  
**Tiempo estimado:** 20-30 minutos  
**Dificultad:** Media

---

*Guía creada por Cascade AI* 🚀
