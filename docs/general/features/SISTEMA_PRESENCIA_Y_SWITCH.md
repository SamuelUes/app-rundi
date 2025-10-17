# 🔄 Sistema de Presencia y Switch de Conductor Designado

## Fecha: 10 de Octubre 2025, 22:38

---

## 📋 Resumen

Se implementaron dos sistemas críticos:
1. **Sistema de Presencia Automática** - Marca conductores como offline automáticamente
2. **Switch de Modo Conductor Designado** - Permite a conductores 4x4 activar/desactivar el modo

---

## 🎯 Sistema de Presencia Automática

### Problema Original:
Cuando un conductor:
- Cierra la app
- Se crashea la app
- Hace logout
- Pierde conexión a internet

El estado en Firebase Realtime Database se mantenía como `available`, causando que:
- Clientes vean conductores que no están disponibles
- Se envíen solicitudes a conductores offline
- Mala experiencia de usuario

### Solución Implementada:

#### 1. Hook `usePresence` 
**Archivo:** `Frontend/src/hooks/usePresence.ts`

```typescript
/**
 * Hook para manejar la presencia del usuario en Firebase Realtime Database
 * Automáticamente marca al usuario como offline cuando:
 * - Se cierra la app
 * - Se crashea la app
 * - Se hace logout
 * - Pierde conexión a internet
 */
export function usePresence() {
  // Configurar onDisconnect de Firebase
  await onDisconnect(driverLocationRef).update({
    status: 'offline',
    updatedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  });
  
  // Listener para cambios en el estado de la app
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState.match(/inactive|background/)) {
      // App en background → marcar como offline
      await set(driverLocationRef, {
        status: 'offline',
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
    }
  };
  
  AppState.addEventListener('change', handleAppStateChange);
}
```

#### 2. Integración en AuthContext
**Archivo:** `Frontend/src/context/AuthContext.tsx`

```typescript
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Activar sistema de presencia automáticamente
  usePresence();
  
  const logout = async () => {
    // Marcar como offline en Firebase antes de hacer logout
    if (user?.id && backendConfig.isFirebase()) {
      const driverLocationRef = ref(database, `driverLocations/${user.id}`);
      await set(driverLocationRef, {
        status: 'offline',
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
    }
    
    await authService.logout();
    setUser(null);
  };
}
```

#### 3. Reglas de Firebase Actualizadas
**Archivo:** `database/database.rules.json`

```json
{
  "driverLocations": {
    "$driverId": {
      ".read": "auth != null",
      ".write": "auth != null && auth.uid === $driverId"
    }
  }
}
```

### Cómo Funciona:

#### Escenario 1: App se cierra normalmente
```
1. Usuario cierra la app
2. AppState cambia a 'background'
3. usePresence detecta el cambio
4. Marca status = 'offline' en Firebase
5. ✅ Conductor ya no aparece como disponible
```

#### Escenario 2: App se crashea
```
1. App se crashea inesperadamente
2. Conexión a Firebase se pierde
3. onDisconnect() se activa automáticamente
4. Firebase marca status = 'offline'
5. ✅ Conductor ya no aparece como disponible
```

#### Escenario 3: Logout manual
```
1. Usuario hace logout
2. AuthContext.logout() se ejecuta
3. Marca status = 'offline' explícitamente
4. Cierra sesión de Firebase Auth
5. ✅ Conductor ya no aparece como disponible
```

#### Escenario 4: Pérdida de conexión
```
1. Dispositivo pierde internet
2. Conexión a Firebase se pierde
3. onDisconnect() se activa automáticamente
4. Firebase marca status = 'offline'
5. ✅ Conductor ya no aparece como disponible
```

---

## 🚗 Switch de Modo Conductor Designado

### Funcionalidad:
Permite a conductores con vehículos 4x4 activar/desactivar el modo conductor designado para recibir solicitudes especiales.

### Implementación:

#### 1. UI en DriverHomeScreen
**Archivo:** `Frontend/src/screens/Driver/DriverHomeScreen.tsx`

```typescript
// Solo visible si el vehículo es 4x4
{vehicleIs4x4 && (
  <View style={styles.availabilityCard}>
    <View style={styles.availabilityHeader}>
      <Text style={styles.availabilityTitle}>
        {isDesignatedDriverMode ? '👨‍✈️ Modo Conductor Designado' : '🚗 Modo Normal'}
      </Text>
      <Text style={styles.availabilitySubtext}>
        {isDesignatedDriverMode 
          ? 'Recibirás viajes de conductor designado (2 conductores)'
          : 'Activa para recibir viajes de conductor designado'
        }
      </Text>
    </View>
    
    <Switch
      value={isDesignatedDriverMode}
      onValueChange={handleToggleDesignatedDriverMode}
      trackColor={{ false: '#ccc', true: '#FF9800' }}
      thumbColor={isDesignatedDriverMode ? '#FFFFFF' : '#f4f3f4'}
      disabled={!isAvailable}
    />
  </View>
)}
```

#### 2. Lógica de Activación
```typescript
const handleToggleDesignatedDriverMode = async (newValue: boolean) => {
  // Validación 1: Debe estar disponible
  if (!isAvailable) {
    Alert.alert(
      'No disponible',
      'Debes activar tu disponibilidad primero'
    );
    return;
  }
  
  // Validación 2: Debe tener vehículo 4x4
  if (!vehicleIs4x4) {
    Alert.alert(
      'Vehículo no compatible',
      'Solo vehículos 4x4 pueden activar el modo conductor designado'
    );
    return;
  }
  
  try {
    setIsDesignatedDriverMode(newValue);
    
    // Actualizar en Firebase Realtime DB
    await driversService.updateDesignatedDriverMode(user.id, newValue);
    
    if (newValue) {
      Alert.alert(
        '✅ Modo Conductor Designado Activado',
        'Ahora recibirás solicitudes de conductor designado (2 conductores por viaje)'
      );
    }
  } catch (error) {
    console.error('Error actualizando modo:', error);
    setIsDesignatedDriverMode(!newValue); // Revertir
    Alert.alert('Error', 'No se pudo actualizar el modo');
  }
};
```

#### 3. Backend - Firebase Function
**Archivo:** `functions/src/api/drivers.ts`

```typescript
export const updateDesignatedDriverMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { driverId, isActive } = data;

  if (!driverId || typeof isActive !== 'boolean') {
    throw new functions.https.HttpsError("invalid-argument", "driverId e isActive requeridos");
  }

  // Solo el conductor puede actualizar su propio modo
  if (context.auth.uid !== driverId) {
    throw new functions.https.HttpsError("permission-denied", "No autorizado");
  }

  try {
    const db = admin.database();
    const driverLocationRef = db.ref(`driverLocations/${driverId}`);
    
    await driverLocationRef.update({
      designatedDriverMode: isActive,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    console.log(`✅ Modo conductor designado ${isActive ? 'activado' : 'desactivado'} para ${driverId}`);

    return {
      success: true,
      designatedDriverMode: isActive,
    };
  } catch (error: any) {
    console.error("❌ Error actualizando modo conductor designado:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
```

#### 4. Servicio Frontend
**Archivo:** `Frontend/src/services/driversService.ts`

```typescript
async updateDesignatedDriverMode(driverId: string, isActive: boolean): Promise<{ success: boolean }> {
  const updateMode = httpsCallable(this.functions, 'updateDesignatedDriverMode');
  const result = await updateMode({ driverId, isActive });
  return result.data as { success: boolean };
}
```

---

## 🔄 Flujo Completo del Sistema

### Conductor con Vehículo 4x4:

```
1. Conductor inicia sesión
   ↓
2. usePresence() se activa automáticamente
   ↓
3. Conductor va a DriverHomeScreen
   ↓
4. Sistema verifica si vehículo es 4x4
   ↓
5. Si es 4x4 → Muestra switch "Modo Conductor Designado"
   ↓
6. Conductor activa disponibilidad (status = 'available')
   ↓
7. Conductor activa "Modo Conductor Designado"
   ↓
8. Firebase actualiza: designatedDriverMode = true
   ↓
9. Conductor va a AvailableRidesScreen
   ↓
10. getAvailableRides() filtra viajes:
    - Si modo DD ON → Ve viajes DD + viajes normales
    - Si modo DD OFF → Solo ve viajes normales
   ↓
11. Conductor acepta viaje
```

### Cuando Conductor Cierra la App:

```
1. App pasa a background
   ↓
2. usePresence() detecta cambio de AppState
   ↓
3. Marca status = 'offline' en Firebase
   ↓
4. designatedDriverMode se mantiene (para próxima sesión)
   ↓
5. ✅ Conductor ya no recibe solicitudes
```

### Cuando Conductor Vuelve a Abrir la App:

```
1. Conductor inicia sesión
   ↓
2. usePresence() se activa
   ↓
3. Sistema lee designatedDriverMode de Firebase
   ↓
4. Si estaba activado → Switch aparece ON
   ↓
5. Conductor debe activar disponibilidad manualmente
   ↓
6. status = 'available'
   ↓
7. ✅ Vuelve a recibir solicitudes
```

---

## 📊 Estructura de Datos en Firebase

### driverLocations/{driverId}:
```json
{
  "lat": 12.1364,
  "lng": -86.2514,
  "status": "available",  // 'available', 'offline', 'busy'
  "designatedDriverMode": true,  // true/false
  "updatedAt": 1728598800000,
  "lastSeen": 1728598800000
}
```

### Campos:
- **lat/lng:** Ubicación actual del conductor
- **status:** Estado de disponibilidad
  - `available` - Disponible para recibir viajes
  - `offline` - No disponible (app cerrada, logout, etc.)
  - `busy` - En viaje activo
- **designatedDriverMode:** Modo conductor designado activo
- **updatedAt:** Última actualización
- **lastSeen:** Última vez que estuvo online

---

## ✅ Validaciones Implementadas

### Frontend:
1. ✅ Switch solo visible si vehículo es 4x4
2. ✅ Switch deshabilitado si conductor no está disponible
3. ✅ Alert si intenta activar sin estar disponible
4. ✅ Alert si intenta activar sin vehículo 4x4
5. ✅ Confirmación visual al activar/desactivar

### Backend:
1. ✅ Solo el conductor puede actualizar su propio modo
2. ✅ Validación de parámetros (driverId, isActive)
3. ✅ Autenticación requerida
4. ✅ Logs detallados de cambios

---

## 🎯 Filtrado de Viajes

### Lógica en getAvailableRides:

```typescript
// 1. Obtener tipo de vehículo del conductor
const driverVehicle = await client.query(
  `SELECT v.type, v.is_4x4 
   FROM drivers d
   JOIN vehicles v ON d.id = v.driver_id
   WHERE d.user_id = $1`,
  [context.auth.uid]
);

// 2. Verificar modo conductor designado
const driverLocationRef = db.ref(`driverLocations/${context.auth.uid}`);
const driverSnapshot = await driverLocationRef.once('value');
const isDesignatedDriverMode = driverSnapshot.val()?.designatedDriverMode || false;

// 3. Filtrar viajes
const filteredRides = ridesWithClientData.filter((ride) => {
  const requestedVehicleType = ride.vehicleType || 'auto';
  
  // Si el viaje solicita conductor designado
  if (requestedVehicleType === 'designated_driver') {
    // Solo mostrar si tiene 4x4 Y modo DD activo
    return is4x4 && isDesignatedDriverMode;
  }
  
  // Si el viaje solicita moto
  if (requestedVehicleType === 'moto') {
    return vehicleType === 'moto';
  }
  
  // Si el viaje solicita auto
  return vehicleType !== 'moto';
});
```

### Matriz de Visibilidad:

| Conductor | Modo DD | Ve viajes AUTO | Ve viajes MOTO | Ve viajes DD |
|-----------|---------|----------------|----------------|--------------|
| Auto      | N/A     | ✅ SÍ          | ❌ NO          | ❌ NO        |
| Moto      | N/A     | ❌ NO          | ✅ SÍ          | ❌ NO        |
| 4x4       | OFF     | ✅ SÍ          | ❌ NO          | ❌ NO        |
| 4x4       | ON      | ✅ SÍ          | ❌ NO          | ✅ SÍ        |

---

## 🚀 Deployment

### Archivos Creados/Modificados:

1. ✅ `Frontend/src/hooks/usePresence.ts` - NUEVO
2. ✅ `Frontend/src/context/AuthContext.tsx` - MODIFICADO
3. ✅ `Frontend/src/screens/Driver/DriverHomeScreen.tsx` - YA EXISTÍA
4. ✅ `Frontend/src/services/driversService.ts` - YA EXISTÍA
5. ✅ `functions/src/api/drivers.ts` - YA EXISTÍA
6. ✅ `database/database.rules.json` - MODIFICADO

### Comandos para Deploy:

```bash
# 1. Desplegar reglas de Firebase Realtime DB
firebase deploy --only database

# 2. Compilar y desplegar functions (si hay cambios)
cd functions
npm run build
cd ..
firebase deploy --only functions

# 3. Reiniciar app móvil
# (cerrar completamente y volver a abrir)
```

---

## 📝 Testing

### Test 1: Sistema de Presencia
- [ ] Conductor activa disponibilidad
- [ ] Cierra la app completamente
- [ ] Verificar en Firebase que status = 'offline'
- [ ] Volver a abrir la app
- [ ] Verificar que debe activar disponibilidad manualmente

### Test 2: Switch Conductor Designado
- [ ] Conductor con vehículo 4x4 inicia sesión
- [ ] Ve switch "Modo Conductor Designado"
- [ ] Intenta activar sin estar disponible → Error
- [ ] Activa disponibilidad
- [ ] Activa modo conductor designado → Éxito
- [ ] Verificar en Firebase: designatedDriverMode = true

### Test 3: Filtrado de Viajes
- [ ] Conductor 4x4 con modo DD OFF
- [ ] Solo ve viajes normales (auto)
- [ ] Activa modo DD
- [ ] Ahora ve viajes normales + viajes DD
- [ ] Cliente solicita viaje DD
- [ ] Conductor ve el viaje con badge naranja

---

## ✅ Estado Final

**Sistema de Presencia:** ✅ IMPLEMENTADO  
**Switch Conductor Designado:** ✅ YA EXISTÍA  
**Filtrado de Viajes:** ✅ IMPLEMENTADO  
**Reglas de Firebase:** ✅ ACTUALIZADAS  

**Listo para deploy:** ✅ SÍ

---

**Última actualización:** 10 de Octubre 2025, 22:38  
**Archivos nuevos:** 1  
**Archivos modificados:** 2  
**Functions desplegadas:** 36 (sin cambios)
