# 🚗 SISTEMA DE DISPONIBILIDAD DE CONDUCTORES

## 📋 RESUMEN:

Sistema completo para gestionar la disponibilidad de conductores en tiempo real, con verificación automática antes de solicitar viajes.

---

## ✅ IMPLEMENTADO:

### **1. Backend - Firebase Functions**

#### **Nueva Función: `getAvailableDrivers`**
**Archivo:** `functions/src/api/drivers.ts`

**Funcionalidad:**
- Busca conductores con estado "available" en Firestore
- Verifica ubicación en Firebase Realtime DB
- Calcula distancia usando fórmula de Haversine
- Filtra por radio (default: 10 km)
- Retorna lista de conductores disponibles cercanos

**Parámetros:**
```typescript
{
  latitude: number,
  longitude: number,
  radius?: number  // en km, default: 10
}
```

**Respuesta:**
```typescript
{
  success: boolean,
  available: boolean,
  count: number,
  drivers: Array<{
    id: string,
    currentLocation: { lat, lng, status },
    distance: number,
    ...userData
  }>
}
```

---

#### **Función Mejorada: `updateDriverStatus`**
**Archivo:** `functions/src/api/drivers.ts`

**Mejoras:**
- Ahora acepta ubicación opcional (latitude, longitude)
- Actualiza estado en Firestore
- Actualiza estado y ubicación en Realtime DB
- Estados: "offline", "available", "busy"

**Uso:**
```typescript
await updateDriverStatus({
  status: 'available',
  latitude: 12.1364,
  longitude: -86.2514
});
```

---

### **2. Frontend - Servicios**

#### **Nuevo Servicio: `driversService.ts`**
**Archivo:** `Frontend/src/services/driversService.ts`

**Métodos:**
- `updateStatus(status, location?)` - Actualizar estado del conductor
- `checkAvailableDrivers(location, radius)` - Verificar conductores disponibles
- `updateLocation(lat, lng, heading, speed, accuracy)` - Actualizar ubicación

---

### **3. Frontend - DriverHomeScreen**

#### **Cambios Implementados:**

✅ **Toggle de Disponibilidad Mejorado:**
- Llama a `driversService.updateStatus()` al cambiar
- Actualiza estado en Firebase automáticamente
- Envía ubicación actual del conductor
- Muestra loading mientras actualiza
- Manejo de errores con Alert

**Código:**
```typescript
const handleAvailabilityChange = async (newValue: boolean) => {
  const status = newValue ? 'available' : 'offline';
  await driversService.updateStatus(status, coords);
  setIsAvailable(newValue);
};
```

---

### **4. Frontend - SearchRideScreen (Cliente)**

#### **Cambios Implementados:**

✅ **Verificación Automática de Disponibilidad:**
- Verifica conductores al abrir la pantalla
- Actualiza cada vez que cambia la ubicación
- Muestra mensaje si no hay conductores

✅ **Mensaje Visual de No Disponibilidad:**
```
🚗
No hay conductores disponibles

En este momento no hay conductores cerca de tu 
ubicación. Por favor, intenta más tarde.

[🔄 Verificar de nuevo]
```

✅ **Botón "Buscar Conductor":**
- Solo se muestra si hay conductores disponibles
- Deshabilitado mientras verifica disponibilidad
- Previene solicitudes innecesarias

---

## 🔄 FLUJO COMPLETO:

### **Conductor se pone disponible:**
```
1. Conductor abre app
2. Toggle "Disponible" → ON
3. Frontend llama updateDriverStatus('available', location)
4. Firebase actualiza:
   - Firestore: users/{uid}.driverStatus = 'available'
   - Realtime DB: driverLocations/{uid} = { status: 'available', lat, lng }
5. Conductor visible para clientes
```

### **Cliente busca viaje:**
```
1. Cliente abre SearchRideScreen
2. Frontend llama getAvailableDrivers(location, 10km)
3. Firebase busca:
   - Firestore: users donde role='driver' y driverStatus='available'
   - Realtime DB: driverLocations con status='available'
   - Calcula distancia de cada conductor
   - Filtra por radio (10 km)
4. Si hay conductores:
   - Muestra botón "Buscar Conductor"
5. Si NO hay conductores:
   - Muestra mensaje "No hay conductores disponibles"
   - Oculta botón "Buscar Conductor"
```

---

## 📊 ESTRUCTURA DE DATOS:

### **Firestore: `users/{uid}`**
```json
{
  "role": "driver",
  "driverStatus": "available",  // "offline" | "available" | "busy"
  "updatedAt": timestamp
}
```

### **Realtime DB: `driverLocations/{uid}`**
```json
{
  "lat": 12.1364,
  "lng": -86.2514,
  "status": "available",
  "lastUpdate": 1234567890,
  "heading": 0,
  "speed": 0,
  "accuracy": 10
}
```

---

## 🎯 VENTAJAS:

✅ **Tiempo Real:** Estado sincronizado en Firebase
✅ **Eficiente:** Solo busca conductores con estado "available"
✅ **Preciso:** Calcula distancia real con Haversine
✅ **UX Mejorada:** Cliente sabe si hay conductores antes de solicitar
✅ **Sin Solicitudes Vacías:** Previene viajes sin conductores disponibles
✅ **Escalable:** Firebase maneja miles de conductores simultáneos

---

## 🚀 PRÓXIMOS PASOS:

### **Para Desplegar:**

1. **Compilar Functions:**
```bash
cd functions
npm run build
```

2. **Desplegar a Firebase:**
```bash
firebase deploy --only functions:updateDriverStatus,functions:getAvailableDrivers
```

3. **Reiniciar Frontend:**
```bash
cd Frontend
npm start -- --clear
# Presiona 'r' para recargar
```

---

### **Para Probar:**

#### **Test 1: Conductor se pone disponible**
1. Abrir emulador como conductor
2. Toggle "Disponible" → ON
3. Verificar en logs: `✅ Estado actualizado: available`
4. Verificar en Firebase Console:
   - Firestore: users/{uid}.driverStatus = 'available'
   - Realtime DB: driverLocations/{uid}.status = 'available'

#### **Test 2: Cliente verifica disponibilidad**
1. Abrir emulador como cliente
2. Ir a SearchRideScreen
3. Si conductor disponible:
   - Ver botón "Buscar Conductor"
4. Si NO hay conductor:
   - Ver mensaje "No hay conductores disponibles"

#### **Test 3: Flujo completo**
1. Conductor → Toggle ON
2. Cliente → Selecciona destino
3. Cliente → Ve botón "Buscar Conductor"
4. Cliente → Solicita viaje
5. Conductor → Recibe solicitud

---

## 📝 ARCHIVOS MODIFICADOS:

### **Backend:**
- ✅ `functions/src/api/drivers.ts` - Nueva función getAvailableDrivers
- ✅ `functions/src/index.ts` - Export de nueva función

### **Frontend:**
- ✅ `Frontend/src/services/driversService.ts` - Nuevo servicio (CREADO)
- ✅ `Frontend/src/screens/Driver/DriverHomeScreen.tsx` - Toggle mejorado
- ✅ `Frontend/src/screens/Client/SearchRideScreen.tsx` - Verificación automática

---

## 🔧 COMANDOS ÚTILES:

### **Ver estado de conductores en Firebase:**
```bash
# Firestore
firebase firestore:get users --where role==driver --where driverStatus==available

# Realtime DB
firebase database:get /driverLocations
```

### **Logs en tiempo real:**
```bash
firebase functions:log --only updateDriverStatus,getAvailableDrivers
```

---

## 💡 MEJORAS FUTURAS:

1. **Notificaciones Push:** Avisar a conductores cuando hay viajes cerca
2. **Priorización:** Mostrar conductores más cercanos primero
3. **Historial:** Guardar cambios de estado en analytics
4. **Optimización:** Caché de conductores disponibles
5. **Filtros:** Por tipo de vehículo, rating, etc.

---

**Documentación creada:** 2025-10-09 18:45
**Estado:** ✅ Implementado, pendiente desplegar
