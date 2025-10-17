# 📍 IMPLEMENTACIÓN DE ETA (Estimated Time of Arrival)

**Fecha:** 2025-10-10  
**Estado:** ✅ **IMPLEMENTADO - Pendiente de Deploy**

---

## 🎯 **¿QUÉ ES ETA?**

ETA (Estimated Time of Arrival) es el **tiempo estimado de llegada** del conductor al destino. Se calcula en tiempo real basándose en:

1. **Ubicación actual del conductor**
2. **Destino del viaje**
3. **Velocidad promedio del conductor** (últimas 5 ubicaciones)
4. **Distancia restante** (calculada con fórmula de Haversine)

---

## ✅ **LO QUE SE IMPLEMENTÓ:**

### **1. Backend: Firebase Callable Function `getETA`**

**Archivo:** `functions/src/api/tracking-functions.ts`

**Funcionalidad:**
```typescript
getETA({ rideId, lat, lng })
```

**Proceso:**
1. Obtiene datos del viaje desde PostgreSQL
2. Calcula distancia restante (Haversine)
3. Obtiene velocidad promedio de últimas 5 ubicaciones
4. Calcula ETA en minutos: `(distancia / velocidad) * 60`
5. Calcula hora de llegada estimada
6. Retorna: `{ etaMinutes, etaTime, distanceRemaining, avgSpeed }`

**Ejemplo de respuesta:**
```json
{
  "success": true,
  "data": {
    "etaMinutes": 12,
    "etaTime": "14:35",
    "distanceRemaining": 3.5,
    "avgSpeed": 35.2
  }
}
```

---

### **2. Frontend: Componente `ETADisplay`**

**Archivo:** `Frontend/src/components/ETADisplay.tsx`

**Funcionalidad:**
- Muestra ETA dinámico en tiempo real
- Se actualiza automáticamente cada 30 segundos
- Muestra:
  - ⏱️ Tiempo estimado de llegada (minutos + hora)
  - 🚗 Distancia restante (km)
- Manejo de errores graceful

**Uso:**
```tsx
<ETADisplay
  rideId="ride-id"
  currentLat={37.4235709}
  currentLng={-122.0849872}
  updateInterval={30000} // 30 segundos
/>
```

---

### **3. Funciones Adicionales Implementadas:**

#### **`saveRideLocation`**
- Guarda ubicación del conductor cada X segundos
- Solo funciona si viaje está en estado `in_progress`
- Verifica que el usuario sea el conductor del viaje
- Guarda en tabla `ride_locations` de PostgreSQL

#### **`getRideHistory`**
- Obtiene historial completo de ruta de un viaje
- Retorna todas las ubicaciones ordenadas por timestamp
- Útil para mostrar ruta completa después del viaje

---

## 📁 **ARCHIVOS CREADOS/MODIFICADOS:**

### **Backend:**
```
✅ functions/src/api/tracking-functions.ts (NUEVO)
   - getETA()
   - saveLocation()
   - getRouteHistory()

✅ functions/src/index.ts (MODIFICADO)
   - Exporta: getETA, saveRideLocation, getRideHistory
```

### **Frontend:**
```
✅ Frontend/src/components/ETADisplay.tsx (MODIFICADO)
   - Habilitado para usar Firebase Callable Function
   - Actualización automática cada 30s
```

---

## 🚀 **CÓMO USAR:**

### **1. Deploy del Backend:**
```bash
cd d:\Documentos\GitHub\App-Uber
firebase deploy --only functions
```

Esto desplegará las 3 nuevas funciones:
- `getETA`
- `saveRideLocation`
- `getRideHistory`

---

### **2. Usar en el Frontend:**

#### **Opción A: Componente ETADisplay (Recomendado)**
```tsx
import ETADisplay from '../components/ETADisplay';

// En RideTrackingScreen o ActiveRideScreen
<ETADisplay
  rideId={rideId}
  currentLat={driverLocation.latitude}
  currentLng={driverLocation.longitude}
  updateInterval={30000} // Actualizar cada 30s
/>
```

#### **Opción B: Llamar directamente a la función**
```typescript
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

const getETAFunction = httpsCallable(functions, 'getETA');
const response = await getETAFunction({
  rideId: 'ride-id',
  lat: 37.4235709,
  lng: -122.0849872,
});

const result = response.data as { success: boolean; data: any };
console.log(result.data.etaMinutes); // 12
console.log(result.data.etaTime); // "14:35"
console.log(result.data.distanceRemaining); // 3.5 km
```

---

### **3. Guardar ubicaciones del conductor:**

Para que el ETA funcione correctamente, necesitas guardar las ubicaciones del conductor:

```typescript
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

const saveLocationFunction = httpsCallable(functions, 'saveRideLocation');

// Cada 5-10 segundos durante el viaje
setInterval(async () => {
  if (rideStatus === 'in_progress') {
    await saveLocationFunction({
      rideId: currentRideId,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      speed: currentLocation.speed,
      heading: currentLocation.heading,
      accuracy: currentLocation.accuracy,
    });
  }
}, 10000); // Cada 10 segundos
```

---

## 📊 **CÓMO FUNCIONA EL CÁLCULO:**

### **Fórmula de Haversine (Distancia):**
```typescript
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distancia en km
}
```

### **Cálculo de ETA:**
```typescript
// 1. Obtener velocidad promedio de últimas 5 ubicaciones
const avgSpeed = speeds.reduce((a, b) => a + b) / speeds.length;

// 2. Calcular tiempo en minutos
const etaMinutes = (distanceRemaining / avgSpeed) * 60;

// 3. Calcular hora de llegada
const arrivalTime = new Date();
arrivalTime.setMinutes(arrivalTime.getMinutes() + etaMinutes);
```

---

## 🎨 **DISEÑO DEL COMPONENTE:**

```
┌─────────────────────────────────────┐
│  ⏱️  Llegada estimada               │
│      12 min (14:35)                 │
│  ─────────────────────────────────  │
│  🚗  3.5 km restantes               │
└─────────────────────────────────────┘
```

---

## ⚙️ **CONFIGURACIÓN:**

### **Intervalo de actualización:**
- **Recomendado:** 30 segundos
- **Mínimo:** 10 segundos (más preciso pero más requests)
- **Máximo:** 60 segundos (menos preciso pero menos requests)

### **Velocidad por defecto:**
- Si no hay ubicaciones previas: **30 km/h**
- Se filtra velocidades < 5 km/h (conductor detenido)

---

## 🔍 **DEBUGGING:**

### **Ver logs en Firebase:**
```bash
firebase functions:log --only getETA
```

### **Probar función localmente:**
```bash
# En Firebase Emulators
firebase emulators:start

# Llamar función
curl -X POST http://localhost:5001/driveangel-ni/us-central1/getETA \
  -H "Content-Type: application/json" \
  -d '{"data":{"rideId":"ride-id","lat":37.4235709,"lng":-122.0849872}}'
```

---

## 📝 **TABLA REQUERIDA EN POSTGRESQL:**

La función requiere la tabla `ride_locations`:

```sql
CREATE TABLE ride_locations (
  id SERIAL PRIMARY KEY,
  ride_id UUID NOT NULL REFERENCES rides(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ride_locations_ride_id ON ride_locations(ride_id);
CREATE INDEX idx_ride_locations_timestamp ON ride_locations(timestamp DESC);
```

---

## ✅ **CHECKLIST DE IMPLEMENTACIÓN:**

- [x] Crear función `getETA` en backend
- [x] Crear función `saveRideLocation` en backend
- [x] Crear función `getRideHistory` en backend
- [x] Exportar funciones en `index.ts`
- [x] Habilitar componente `ETADisplay` en frontend
- [ ] **Desplegar funciones a Firebase** ⚠️ PENDIENTE
- [ ] Agregar `ETADisplay` a `RideTrackingScreen`
- [ ] Agregar `ETADisplay` a `ActiveRideScreen`
- [ ] Implementar guardado automático de ubicaciones
- [ ] Probar flujo completo

---

## 🚀 **PRÓXIMOS PASOS:**

1. **Deploy del backend:**
   ```bash
   firebase deploy --only functions
   ```

2. **Agregar ETADisplay a pantallas:**
   - `RideTrackingScreen.tsx` (Cliente)
   - `ActiveRideScreen.tsx` (Conductor)

3. **Implementar guardado de ubicaciones:**
   - Hook `useLocationTracking`
   - Guardar cada 10 segundos cuando viaje está `in_progress`

4. **Probar:**
   - Solicitar viaje
   - Aceptar viaje
   - Iniciar viaje
   - Verificar que ETA se actualiza correctamente

---

## 💡 **MEJORAS FUTURAS:**

1. **Usar Mapbox Directions API:**
   - Calcular ruta real (no línea recta)
   - Considerar tráfico en tiempo real
   - Más preciso pero más costoso

2. **Machine Learning:**
   - Predecir velocidad basándose en hora del día
   - Considerar patrones de tráfico históricos

3. **Alertas:**
   - Notificar si ETA aumenta significativamente
   - Alertar si conductor se desvía de la ruta

---

**¡ETA implementado y listo para deploy!** 🎉

**Comando para desplegar:**
```bash
cd d:\Documentos\GitHub\App-Uber
firebase deploy --only functions
```
