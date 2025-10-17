# 🔧 TROUBLESHOOTING - CONDUCTORES NO APARECEN EN MAPA DEL CLIENTE

## 🎯 **PROBLEMA**

Los conductores no aparecen en el mapa del cliente aunque:
- ✅ El conductor está disponible (switch activado)
- ✅ El conductor tiene ubicación GPS
- ✅ El mapa del cliente está funcionando

---

## 🔍 **DIAGNÓSTICO**

### **1. Verificar que el conductor está guardando su ubicación:**

#### **En Firebase Console:**
1. Ir a: https://console.firebase.google.com
2. Seleccionar proyecto: `driveangel-ni`
3. Ir a: Realtime Database
4. Buscar path: `driverLocations/`
5. Verificar que existe: `driverLocations/{driverId}`

**Estructura esperada:**
```json
driverLocations/
  {driverId}/
    latitude: 37.4219999
    longitude: -122.0840575
    isAvailable: true
    heading: 0
    timestamp: 1697234567890
```

---

### **2. Verificar logs del conductor:**

Cuando el conductor activa disponibilidad, debería ver:
```
✅ Estado actualizado: available
💓 Iniciando heartbeat de disponibilidad
💓 Heartbeat enviado - Conductor disponible
```

---

### **3. Verificar logs del cliente:**

Cuando el cliente abre HomeScreen, debería ver:
```
🚗 X conductores disponibles en el mapa
OpenStreetMap loaded successfully with X nearby drivers
```

---

## ✅ **SOLUCIONES**

### **Solución 1: Verificar Firebase Function `updateDriverStatus`**

La función debe guardar en Firebase Realtime DB:

```typescript
// En functions/src/api/drivers.ts
export const updateDriverStatus = functions.https.onCall(async (data, context) => {
  const { status, latitude, longitude } = data;
  const driverId = context.auth?.uid;
  
  // Guardar en Realtime DB
  const db = admin.database();
  const driverLocationRef = db.ref(`driverLocations/${driverId}`);
  
  await driverLocationRef.set({
    latitude: latitude,
    longitude: longitude,
    isAvailable: status === 'available',
    heading: 0,
    timestamp: Date.now(),
  });
  
  return { success: true };
});
```

---

### **Solución 2: Verificar reglas de Firebase Realtime DB**

Las reglas deben permitir que conductores escriban y clientes lean:

```json
{
  "rules": {
    "driverLocations": {
      "$driverId": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $driverId"
      }
    }
  }
}
```

---

### **Solución 3: Verificar que el cliente está escuchando correctamente**

En `HomeScreen.tsx` del cliente:

```typescript
useEffect(() => {
  const db = getDatabase();
  const driversRef = ref(db, 'driverLocations');

  const unsubscribe = onValue(driversRef, (snapshot) => {
    const data = snapshot.val();
    console.log('📦 Datos de driverLocations:', data); // ← AGREGAR ESTE LOG
    
    if (data) {
      const drivers = Object.entries(data).map(([driverId, driverData]: [string, any]) => ({
        id: driverId,
        latitude: driverData.latitude,
        longitude: driverData.longitude,
        isAvailable: driverData.isAvailable,
        heading: driverData.heading || 0,
      })).filter(driver => driver.isAvailable);

      console.log(`🚗 ${drivers.length} conductores disponibles`);
      setAvailableDrivers(drivers);
    }
  });

  return () => off(driversRef);
}, []);
```

---

## 🧪 **TESTING PASO A PASO**

### **1. Probar guardado de ubicación del conductor:**

```typescript
// En DriverHomeScreen, agregar log temporal:
const handleAvailabilityChange = async (newValue: boolean) => {
  // ... código existente ...
  
  // AGREGAR ESTE LOG:
  if (newValue && coords) {
    console.log('📍 Guardando ubicación del conductor:', {
      latitude: coords.latitude,
      longitude: coords.longitude,
      userId: user.id
    });
  }
};
```

### **2. Verificar en Firebase Console:**

Después de activar disponibilidad:
1. Ir a Firebase Console
2. Realtime Database
3. Buscar `driverLocations/{userId}`
4. Verificar que los datos están ahí

### **3. Verificar en el cliente:**

Agregar log temporal en HomeScreen:
```typescript
useEffect(() => {
  const driversRef = ref(db, 'driverLocations');
  
  const unsubscribe = onValue(driversRef, (snapshot) => {
    console.log('🔍 Snapshot de driverLocations:', snapshot.val());
    // ... resto del código
  });
}, []);
```

---

## 🚀 **SOLUCIÓN RÁPIDA**

Si nada funciona, agregar actualización directa en el frontend:

```typescript
// En DriverHomeScreen.tsx
const handleAvailabilityChange = async (newValue: boolean) => {
  // ... código existente ...
  
  // AGREGAR: Guardar directamente en Firebase Realtime DB
  if (newValue && coords && user) {
    try {
      const db = getDatabase();
      const driverLocationRef = ref(db, `driverLocations/${user.id}`);
      await import('firebase/database').then(({ set }) =>
        set(driverLocationRef, {
          latitude: coords.latitude,
          longitude: coords.longitude,
          isAvailable: true,
          heading: 0,
          timestamp: Date.now(),
        })
      );
      console.log('✅ Ubicación guardada directamente en Firebase');
    } catch (error) {
      console.error('❌ Error guardando ubicación:', error);
    }
  }
};
```

---

## 📊 **CHECKLIST DE VERIFICACIÓN**

- [ ] Firebase Function `updateDriverStatus` existe y está desplegada
- [ ] Reglas de Firebase Realtime DB permiten lectura/escritura
- [ ] Conductor activa disponibilidad correctamente
- [ ] Logs muestran "Heartbeat enviado"
- [ ] Firebase Console muestra datos en `driverLocations/`
- [ ] Cliente escucha `driverLocations` correctamente
- [ ] Logs del cliente muestran conductores encontrados
- [ ] Marcadores se renderizan en el mapa

---

## 🔧 **COMANDOS ÚTILES**

### **Ver logs de Firebase Functions:**
```bash
firebase functions:log --only updateDriverStatus
```

### **Verificar reglas desplegadas:**
```bash
firebase database:get / --project driveangel-ni
```

### **Desplegar cambios:**
```bash
# Desplegar functions
firebase deploy --only functions:updateDriverStatus

# Desplegar reglas
firebase deploy --only database
```

---

## 📝 **PRÓXIMOS PASOS**

1. ✅ Verificar logs del conductor al activar disponibilidad
2. ✅ Verificar Firebase Console (`driverLocations/`)
3. ✅ Verificar logs del cliente al abrir HomeScreen
4. ✅ Si no hay datos en Firebase, implementar solución rápida
5. ✅ Testing completo

---

**Fecha:** 2025-10-13  
**Estado:** 🔍 DEBUGGING  
**Prioridad:** 🔴 ALTA
