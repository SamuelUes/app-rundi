# 📍 PRIORIDAD DE UBICACIÓN MANUAL - IMPLEMENTADO

## 🎯 **OBJETIVO**

Cuando el cliente mueve el pin manualmente en el HomeScreen, esa ubicación debe usarse como punto de origen al solicitar un viaje, en lugar de la ubicación GPS.

---

## ✅ **IMPLEMENTACIÓN COMPLETADA**

### **Flujo Completo:**

```
1. Cliente en HomeScreen
   └─> Mueve pin manualmente
   └─> Se guarda en Firebase: clientLocations/{userId}
   └─> isManual: true

2. Cliente presiona "Solicitar Viaje"
   └─> Navega a SearchRideScreen

3. SearchRideScreen se monta
   └─> useEffect se ejecuta
   └─> Lee clientLocations/{userId} de Firebase
   
4. ¿Existe ubicación manual?
   ├─> SÍ y es reciente (< 1 hora)
   │   └─> Usa ubicación manual como origen
   │   └─> Muestra dirección + 📍
   │
   └─> NO o es antigua
       └─> Usa ubicación GPS
       └─> Muestra dirección normal
```

---

## 📝 **CÓDIGO IMPLEMENTADO**

### **SearchRideScreen.tsx:**

```typescript
// Estado para tracking
const [usingManualLocation, setUsingManualLocation] = useState(false);

// useEffect modificado
useEffect(() => {
  if (coords && user) {
    loadOriginAddress();
  }
}, [coords, user]);

const loadOriginAddress = async () => {
  if (!coords || !user) return;
  
  try {
    // 1. Intentar obtener ubicación manual de Firebase
    const { getDatabase, ref, get } = await import('firebase/database');
    const db = getDatabase();
    const clientLocationRef = ref(db, `clientLocations/${user.id}`);
    const snapshot = await get(clientLocationRef);
    
    if (snapshot.exists()) {
      const manualLocation = snapshot.val();
      
      // 2. Verificar que es reciente (< 1 hora)
      const isRecent = (Date.now() - manualLocation.timestamp) < 3600000;
      
      if (manualLocation.isManual && isRecent) {
        console.log('📍 Usando ubicación manual guardada');
        
        const manualCoords = {
          latitude: manualLocation.latitude,
          longitude: manualLocation.longitude
        };
        
        // 3. Obtener dirección de la ubicación manual
        const address = await mapsService.reverseGeocode(manualCoords);
        
        if (address) {
          setOrigin(address + ' 📍'); // Indicador visual
          setOriginCoords(manualCoords);
          setUsingManualLocation(true);
          return;
        }
      }
    }
  } catch (error) {
    console.error('Error obteniendo ubicación manual:', error);
  }
  
  // 4. Fallback: Usar GPS
  console.log('📡 Usando ubicación GPS');
  const address = await mapsService.reverseGeocode(coords);
  if (address) {
    setOrigin(address);
    setOriginCoords(coords);
    setUsingManualLocation(false);
  }
};
```

---

## 🎨 **CARACTERÍSTICAS**

### **1. Prioridad Inteligente** 🧠
- ✅ Primero intenta usar ubicación manual
- ✅ Si no existe o es antigua → usa GPS
- ✅ Fallback automático

### **2. Validación de Tiempo** ⏰
- ✅ Solo usa ubicación manual si es reciente (< 1 hora)
- ✅ Evita usar ubicaciones obsoletas
- ✅ Timestamp: `Date.now() - manualLocation.timestamp < 3600000`

### **3. Indicador Visual** 📍
- ✅ Ubicación manual: "Dirección + 📍"
- ✅ Ubicación GPS: "Dirección"
- ✅ Usuario sabe qué ubicación está usando

### **4. Logs Detallados** 📊
```
📍 Usando ubicación manual guardada
// o
📡 Usando ubicación GPS
```

---

## 🔥 **CASOS DE USO**

### **Caso 1: Cliente movió el pin hace 10 minutos**
```
1. Cliente en HomeScreen → Mueve pin
2. Firebase guarda: isManual: true, timestamp: ahora
3. Cliente va a SearchRideScreen
4. ✅ Usa ubicación manual (es reciente)
5. Origen muestra: "Calle Principal 123 📍"
```

### **Caso 2: Cliente movió el pin hace 2 horas**
```
1. Cliente movió pin hace 2 horas
2. Firebase tiene: isManual: true, timestamp: hace 2h
3. Cliente va a SearchRideScreen
4. ❌ No usa ubicación manual (es antigua)
5. ✅ Usa GPS actual
6. Origen muestra: "Avenida Central 456"
```

### **Caso 3: Cliente nunca movió el pin**
```
1. Cliente nunca usó ubicación manual
2. Firebase: clientLocations/{userId} no existe
3. Cliente va a SearchRideScreen
4. ✅ Usa GPS directamente
5. Origen muestra: "Boulevard Norte 789"
```

### **Caso 4: Cliente presiona "Centrar Ubicación"**
```
1. Cliente tenía ubicación manual
2. Presiona botón "📍 Centrar Ubicación"
3. HomeScreen limpia: setManualLocation(null)
4. Cliente va a SearchRideScreen
5. ✅ Usa GPS (no hay ubicación manual)
```

---

## 📊 **ESTRUCTURA DE DATOS**

### **Firebase Realtime DB:**
```json
clientLocations/
  {userId}/
    latitude: 37.4215180
    longitude: -122.0920421
    isManual: true
    timestamp: 1697234567890
```

### **Validación de Tiempo:**
```typescript
const ONE_HOUR = 3600000; // 1 hora en milisegundos
const isRecent = (Date.now() - timestamp) < ONE_HOUR;
```

---

## 🎯 **BENEFICIOS**

### **Para el Cliente:**
- ✅ Ubicación precisa al solicitar viaje
- ✅ No necesita volver a ajustar
- ✅ Experiencia fluida
- ✅ Indicador visual claro (📍)

### **Para el Conductor:**
- ✅ Recibe ubicación correcta
- ✅ Menos confusión al recoger
- ✅ Punto de origen preciso

### **Para el Sistema:**
- ✅ Datos consistentes
- ✅ Menos errores de ubicación
- ✅ Mejor experiencia general

---

## 🔧 **CONFIGURACIÓN**

### **Cambiar tiempo de validez:**
```typescript
// En loadOriginAddress()
const isRecent = (Date.now() - manualLocation.timestamp) < 7200000; // 2 horas
```

### **Deshabilitar indicador visual:**
```typescript
setOrigin(address); // Sin el ' 📍'
```

### **Cambiar prioridad (GPS primero):**
```typescript
// Invertir el orden del try-catch
// Primero GPS, luego manual
```

---

## 🚀 **TESTING**

### **Prueba 1: Ubicación manual reciente**
1. ✅ Abrir HomeScreen
2. ✅ Mover pin a nueva ubicación
3. ✅ Presionar "Solicitar Viaje"
4. ✅ Verificar que origen muestra ubicación manual con 📍

### **Prueba 2: Sin ubicación manual**
1. ✅ Abrir HomeScreen (sin mover pin)
2. ✅ Presionar "Solicitar Viaje"
3. ✅ Verificar que origen muestra ubicación GPS sin 📍

### **Prueba 3: Centrar ubicación**
1. ✅ Mover pin manualmente
2. ✅ Presionar botón "Centrar Ubicación"
3. ✅ Presionar "Solicitar Viaje"
4. ✅ Verificar que origen muestra ubicación GPS

### **Logs esperados:**
```
// Con ubicación manual:
📍 Usando ubicación manual guardada

// Sin ubicación manual:
📡 Usando ubicación GPS
```

---

## ✅ **ESTADO**

- ✅ Implementación completada
- ✅ Prioridad de ubicación manual
- ✅ Validación de tiempo (1 hora)
- ✅ Indicador visual (📍)
- ✅ Fallback a GPS
- ✅ Logs detallados
- ⏳ Testing pendiente

---

**Fecha:** 2025-10-13  
**Estado:** ✅ COMPLETADO  
**Feature:** Prioridad de ubicación manual en solicitud de viaje
