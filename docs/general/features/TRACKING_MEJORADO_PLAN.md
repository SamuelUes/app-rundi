# 🗺️ TRACKING MEJORADO - PLAN DE IMPLEMENTACIÓN

**Fecha:** 2025-10-09 21:50
**Prioridad:** Alta
**Tiempo estimado:** 3-4 horas

---

## 🎯 **OBJETIVOS:**

1. **Historial de Ruta** - Guardar y mostrar la ruta completa del viaje
2. **ETA Dinámico** - Calcular tiempo estimado de llegada en tiempo real
3. **Alertas de Desvío** - Notificar si el conductor se desvía de la ruta

---

## 📋 **FEATURES A IMPLEMENTAR:**

### **1. Historial de Ruta (1.5 horas)**

**Backend:**
- ✅ Tabla `ride_locations` ya existe en PostgreSQL
- ⏳ Endpoint para guardar ubicaciones cada X segundos
- ⏳ Endpoint para obtener historial de ruta de un viaje

**Frontend:**
- ⏳ Hook `useRouteTracking` para guardar ubicaciones
- ⏳ Componente `RouteHistoryMap` para mostrar ruta completa
- ⏳ Integrar en `RideTrackingScreen` y `ActiveRideScreen`

**Estructura de datos:**
```typescript
interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: Date;
  speed?: number;
  heading?: number;
}
```

---

### **2. ETA Dinámico (1 hora)**

**Backend:**
- ⏳ Función para calcular ETA basado en:
  - Distancia restante
  - Velocidad promedio del conductor
  - Tráfico (si disponible en API de mapas)
- ⏳ Actualizar ETA cada 30 segundos

**Frontend:**
- ⏳ Mostrar ETA en `RideTrackingScreen`
- ⏳ Actualizar automáticamente
- ⏳ Formato: "Llegada estimada: 5 min" o "15:30 PM"

**Cálculo:**
```typescript
ETA = distanciaRestante / velocidadPromedio
// Ajustar por tráfico si disponible
```

---

### **3. Alertas de Desvío (0.5 horas)**

**Backend:**
- ⏳ Calcular si conductor se desvía > 500m de la ruta
- ⏳ Enviar notificación al cliente

**Frontend:**
- ⏳ Mostrar alerta en `RideTrackingScreen`
- ⏳ Opción de contactar al conductor
- ⏳ Botón de emergencia visible

**Lógica:**
```typescript
if (distanciaDesdeRuta > 500) {
  enviarAlerta("El conductor se ha desviado de la ruta");
}
```

---

## 🗂️ **ARCHIVOS A CREAR/MODIFICAR:**

### **Backend (Firebase Functions):**
1. `functions/src/api/tracking.ts` - Nuevo
   - `saveRoutePoint()` - Guardar punto de ruta
   - `getRouteHistory()` - Obtener historial
   - `calculateETA()` - Calcular ETA
   - `checkRouteDeviation()` - Verificar desvío

### **Frontend:**
1. `hooks/useRouteTracking.ts` - Nuevo
   - Guardar ubicaciones automáticamente
   - Calcular velocidad y heading

2. `components/RouteHistoryMap.tsx` - Nuevo
   - Mostrar ruta completa con polyline
   - Marcadores de inicio y fin

3. `components/ETADisplay.tsx` - Nuevo
   - Mostrar ETA dinámico
   - Actualizar cada 30s

4. **Modificar:**
   - `screens/Client/RideTrackingScreen.tsx`
   - `screens/Driver/ActiveRideScreen.tsx`

---

## 📊 **ESTRUCTURA DE BASE DE DATOS:**

### **PostgreSQL (Supabase) - Ya existe:**
```sql
CREATE TABLE ride_locations (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  speed DECIMAL(5, 2),
  heading DECIMAL(5, 2),
  accuracy DECIMAL(5, 2),
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### **Firebase Realtime DB:**
```json
{
  "activeRides": {
    "rideId": {
      "currentLocation": {
        "latitude": 12.1234,
        "longitude": -86.5678,
        "timestamp": 1234567890
      },
      "eta": {
        "minutes": 5,
        "arrivalTime": "15:30"
      },
      "routeDeviation": false
    }
  }
}
```

---

## 🔄 **FLUJO DE TRACKING:**

```
1. Conductor acepta viaje
   ↓
2. Iniciar tracking automático (cada 5 segundos)
   ↓
3. Guardar ubicación en:
   - Firebase Realtime DB (tiempo real)
   - PostgreSQL (historial)
   ↓
4. Calcular ETA cada 30 segundos
   ↓
5. Verificar desvío de ruta
   ↓
6. Actualizar UI del cliente en tiempo real
   ↓
7. Al completar viaje, detener tracking
```

---

## 🎨 **UI/UX:**

### **RideTrackingScreen (Cliente):**
```
┌─────────────────────────────────────┐
│  [Mapa con ruta y conductor]        │
│                                     │
│  📍 Conductor en camino             │
│  ⏱️ Llegada estimada: 5 min         │
│  🚗 2.3 km restantes                │
│                                     │
│  [Contactar] [Emergencia]           │
└─────────────────────────────────────┘
```

### **ActiveRideScreen (Conductor):**
```
┌─────────────────────────────────────┐
│  [Mapa con ruta]                    │
│                                     │
│  📍 Destino: Calle Principal #123   │
│  ⏱️ ETA: 5 min                      │
│  🚗 Velocidad: 45 km/h              │
│                                     │
│  [Completar Viaje]                  │
└─────────────────────────────────────┘
```

---

## ⚙️ **CONFIGURACIÓN:**

```typescript
// config/tracking.ts
export const TRACKING_CONFIG = {
  LOCATION_UPDATE_INTERVAL: 5000, // 5 segundos
  ETA_UPDATE_INTERVAL: 30000, // 30 segundos
  MAX_ROUTE_DEVIATION: 500, // 500 metros
  MIN_SPEED_FOR_ETA: 5, // 5 km/h (si está más lento, no calcular ETA)
  ROUTE_HISTORY_LIMIT: 1000, // Máximo 1000 puntos por viaje
};
```

---

## 🧪 **TESTING:**

1. **Tracking básico:**
   - Verificar que se guarden ubicaciones cada 5s
   - Verificar que se muestren en tiempo real

2. **ETA:**
   - Verificar cálculo correcto
   - Verificar actualización automática

3. **Desvío:**
   - Simular desvío > 500m
   - Verificar alerta al cliente

---

## 📈 **MÉTRICAS:**

- Precisión de ubicación: ±10 metros
- Frecuencia de actualización: 5 segundos
- Latencia de actualización: < 1 segundo
- ETA accuracy: ±2 minutos

---

## 🚀 **PRÓXIMOS PASOS:**

1. Crear `tracking.ts` en Firebase Functions
2. Crear hook `useRouteTracking`
3. Crear componente `ETADisplay`
4. Modificar `RideTrackingScreen`
5. Modificar `ActiveRideScreen`
6. Testing completo

---

**¿Empezamos con el Backend (tracking.ts) o el Frontend (hook)?** 🎯
