# 🔴 PROBLEMAS DE WEBSOCKET Y SOLUCIONES

**Fecha:** 2025-10-10
**Estado:** ⚠️ WebSocket no funciona - Usando polling como alternativa

---

## 🐛 **PROBLEMAS IDENTIFICADOS:**

### **1. WebSocket Connection Errors**
```
ERROR ❌ Error de conexión: [Error: websocket error]
ERROR Error iniciando tracking: [Error: websocket error]
```

**Causa:**
- Firebase Realtime Database WebSocket no se conecta correctamente
- Posibles problemas de red/firewall
- Configuración incorrecta de Firebase RTDB

**Impacto:**
- ❌ Notificaciones en tiempo real no funcionan
- ❌ Cliente no recibe actualización cuando conductor cancela/completa viaje
- ❌ Chat muestra usuarios como "desconectados"
- ❌ Tracking en tiempo real no funciona

---

### **2. ETA Calculation Error**
```
ERROR Error calculando ETA: [SyntaxError: JSON Parse error: Unexpected character: <]
```

**Causa:**
- La API está retornando HTML en lugar de JSON
- Probablemente un error 404 o 500 del backend
- La función de cálculo de ETA no existe o tiene errores

**Impacto:**
- ❌ No se muestra tiempo estimado de llegada
- ❌ Conductor no puede ver cuánto falta para llegar

---

### **3. Expo Push Notifications Error**
```
ERROR ❌ Error inicializando notificaciones: 
"projectId": Invalid uuid
```

**Causa:**
- El `projectId` en `app.json` no es un UUID válido de Expo
- Expo requiere un UUID específico para push notifications

**Impacto:**
- ❌ Push notifications no funcionan
- ❌ Usuario no recibe notificaciones cuando está fuera de la app

---

## ✅ **SOLUCIONES IMPLEMENTADAS:**

### **1. Polling como alternativa a WebSocket**

**Ubicación:** `RideConfirmationScreen.tsx`, `RideTrackingScreen.tsx`

```typescript
// Polling cada 5 segundos para actualizar el estado
const interval = setInterval(loadRideDetails, 5000);
return () => clearInterval(interval);
```

**Ventajas:**
- ✅ Funciona sin WebSocket
- ✅ Actualiza estado del viaje cada 5 segundos
- ✅ Más confiable que WebSocket en redes inestables

**Desventajas:**
- ⚠️ No es en tiempo real (delay de hasta 5 segundos)
- ⚠️ Más consumo de batería
- ⚠️ Más requests al backend

---

### **2. Cambio de Google Maps a Mapbox**

**Ubicación:** `mapsService.ts`

```typescript
// ANTES:
private providers: MapProvider[] = ['google', 'mapbox', 'tomtom'];
private currentProvider: MapProvider = 'google';

// DESPUÉS:
private providers: MapProvider[] = ['mapbox', 'google', 'tomtom'];
private currentProvider: MapProvider = 'mapbox';
```

**Ventajas:**
- ✅ Mapbox funciona correctamente
- ✅ No hay errores de `REQUEST_DENIED`
- ✅ Mejor cobertura para Nicaragua

---

## 🔧 **SOLUCIONES PENDIENTES:**

### **1. Arreglar WebSocket de Firebase RTDB**

**Pasos:**
1. Verificar reglas de Firebase Realtime Database
2. Verificar configuración de red/firewall
3. Considerar usar Firebase Cloud Messaging (FCM) en lugar de WebSocket

**Reglas sugeridas para Firebase RTDB:**
```json
{
  "rules": {
    "driverLocations": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "activeRides": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "chatMessages": {
      "$rideId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

---

### **2. Arreglar cálculo de ETA**

**Archivo:** `trackingService.ts` o función de backend

**Problema:** La función está retornando HTML en lugar de JSON

**Solución:**
1. Verificar que la función existe en el backend
2. Verificar que la URL es correcta
3. Agregar manejo de errores HTTP

---

### **3. Arreglar Expo Push Notifications**

**Archivo:** `app.json`

**Solución:**
1. Obtener un UUID válido de Expo:
```bash
expo login
expo whoami
```

2. Actualizar `app.json`:
```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "TU-UUID-AQUI"
      }
    }
  }
}
```

---

## 📊 **COMPARACIÓN: WebSocket vs Polling**

| Característica | WebSocket | Polling (5s) |
|----------------|-----------|--------------|
| Tiempo real | ✅ Instantáneo | ⚠️ Delay 5s |
| Consumo batería | ✅ Bajo | ⚠️ Medio |
| Requests/min | ✅ ~1 | ⚠️ 12 |
| Confiabilidad | ❌ No funciona | ✅ Funciona |
| Complejidad | ⚠️ Alta | ✅ Baja |

**Recomendación:** Mantener polling hasta arreglar WebSocket.

---

## 🚀 **PRÓXIMOS PASOS:**

1. **Corto plazo (Hoy):**
   - ✅ Usar Mapbox para routing
   - ✅ Mantener polling para actualizaciones
   - ⏳ Arreglar cálculo de ETA

2. **Mediano plazo (Esta semana):**
   - ⏳ Configurar Firebase RTDB correctamente
   - ⏳ Implementar Firebase Cloud Messaging
   - ⏳ Arreglar Expo Push Notifications

3. **Largo plazo (Próximo sprint):**
   - ⏳ Migrar de WebSocket a FCM
   - ⏳ Optimizar polling (usar exponential backoff)
   - ⏳ Implementar reconnection logic

---

## 📝 **NOTAS TÉCNICAS:**

### **Por qué WebSocket falla:**

1. **Firebase Realtime Database WebSocket:**
   - Requiere configuración específica de red
   - Puede ser bloqueado por firewalls
   - Requiere reglas de seguridad correctas

2. **Alternativas:**
   - **Firebase Cloud Messaging (FCM):** Más confiable para notificaciones
   - **Polling:** Simple pero efectivo
   - **Server-Sent Events (SSE):** Alternativa a WebSocket

### **Por qué Mapbox es mejor:**

1. **Cobertura:** Mejor para América Latina
2. **Confiabilidad:** No requiere API key con permisos especiales
3. **Costo:** Más barato que Google Maps
4. **Funcionalidad:** Direcciones y routing funcionan bien

---

**Estado actual:** La app funciona correctamente con polling y Mapbox. WebSocket es un "nice to have" pero no es crítico para el funcionamiento básico.
