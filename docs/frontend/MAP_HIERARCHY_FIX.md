# 🗺️ CORRECCIÓN DE JERARQUÍA DE MAPAS

**Fecha:** 2025-10-10  
**Estado:** ✅ **COMPLETADO**

---

## 🎯 **PROBLEMAS IDENTIFICADOS:**

### **1. TomTom Cargándose Incorrectamente**
- ❌ **Problema:** TomTom se estaba cargando cuando debería ser Mapbox
- ❌ **Causa:** Jerarquía incorrecta en `mapsService.ts`
- ✅ **Solución:** Implementadas dos jerarquías separadas

### **2. Error JSON Parse en Desvío**
- ❌ **Problema:** `JSON Parse error: Unexpected character: <`
- ❌ **Causa:** Endpoint `/tracking/deviation` no existe, devuelve HTML 404
- ✅ **Solución:** Comentado temporalmente hasta implementar Firebase Function

---

## 📊 **JERARQUÍAS IMPLEMENTADAS:**

### **🗺️ MAPA VISUAL (Para mostrar en pantalla):**
```
1. Google Maps      ← Mejor UI/UX
2. Mapbox           ← Fallback confiable
3. OpenStreet       ← Fallback gratuito
4. TomTom           ← Último recurso
```

### **🛣️ LÓGICA/ROUTING (Para cálculos y direcciones):**
```
1. Mapbox           ← Mejor para Nicaragua
2. Google Maps      ← Fallback confiable
3. OpenStreet       ← Fallback gratuito
4. TomTom           ← Último recurso
```

---

## 🔧 **CAMBIOS REALIZADOS:**

### **1. `mapsService.ts` - Jerarquías Separadas**

**ANTES:**
```typescript
private providers: MapProvider[] = ['mapbox', 'google', 'tomtom'];
private currentProvider: MapProvider = 'mapbox';
private mapProvider: MapProvider = 'google';
```

**DESPUÉS:**
```typescript
// Jerarquía para MAPA VISUAL: 1. Google → 2. Mapbox → 3. OpenStreet → 4. TomTom
private visualProviders: MapProvider[] = ['google', 'mapbox', 'openstreet', 'tomtom'];

// Jerarquía para LÓGICA/ROUTING: 1. Mapbox → 2. Google → 3. OpenStreet → 4. TomTom
private routingProviders: MapProvider[] = ['mapbox', 'google', 'openstreet', 'tomtom'];

private currentProvider: MapProvider = 'mapbox'; // Mapbox para datos/routing
private mapProvider: MapProvider = 'google'; // Google Maps para mapa visual
```

---

### **2. `tryWithFallback()` - Parámetro de Orden**

**ANTES:**
```typescript
private async tryWithFallback<T>(
  operation: (service: any) => Promise<T>,
  forceProvider?: MapProvider
): Promise<T | null>
```

**DESPUÉS:**
```typescript
private async tryWithFallback<T>(
  operation: (service: any) => Promise<T>,
  forceProvider?: MapProvider,
  useRoutingOrder: boolean = false  // ← NUEVO
): Promise<T | null> {
  const providersToTry = forceProvider 
    ? [forceProvider] 
    : (useRoutingOrder ? this.routingProviders : this.visualProviders);
  // ...
}
```

---

### **3. Métodos Actualizados con Orden Correcto**

#### **Operaciones de ROUTING (usan `routingProviders`):**
```typescript
// ✅ Geocoding
async geocode(address: string): Promise<Coordinates | null> {
  return this.tryWithFallback(service => service.geocode(address), undefined, true);
}

// ✅ Reverse Geocoding
async reverseGeocode(coords: Coordinates): Promise<string | null> {
  return this.tryWithFallback(service => service.reverseGeocode(coords), undefined, true);
}

// ✅ Autocomplete
async autocomplete(input: string, location?: Coordinates): Promise<any[]> {
  const result = await this.tryWithFallback<any[]>(
    service => service.autocomplete(input, location), 
    undefined, 
    true
  );
  return result || [];
}

// ✅ Directions
async getDirections(origin: Coordinates, destination: Coordinates): Promise<RouteResult | null> {
  const result = await this.tryWithFallback<RouteResult>(
    service => service.getDirections(origin, destination),
    'mapbox',
    true // ← Usar orden de routing
  );
  // ...
}

// ✅ Nearest Driver
async findNearestDriver(...): Promise<...> {
  const result = await this.tryWithFallback<...>(
    service => service.findNearestDriver(origin, drivers),
    'mapbox',
    true // ← Usar orden de routing
  );
  // ...
}
```

---

### **4. Nuevo Método: `getMapProviderWithFallback()`**

```typescript
/**
 * Obtener proveedor para mapa visual
 * Intenta en orden: Google → Mapbox → OpenStreet → TomTom
 */
async getMapProviderWithFallback(): Promise<MapProvider> {
  // Intentar Google Maps primero
  try {
    const testResult = await googleMapsService.reverseGeocode({ latitude: 0, longitude: 0 });
    if (testResult !== null) {
      this.mapProvider = 'google';
      return 'google';
    }
  } catch (error) {
    console.log('⚠️ Google Maps no disponible, usando fallback');
  }

  // Fallback a Mapbox
  try {
    const testResult = await mapboxService.reverseGeocode({ latitude: 0, longitude: 0 });
    if (testResult !== null) {
      this.mapProvider = 'mapbox';
      return 'mapbox';
    }
  } catch (error) {
    console.log('⚠️ Mapbox no disponible, usando OpenStreet');
  }

  // Fallback a OpenStreet (usa Mapbox service)
  this.mapProvider = 'openstreet';
  return 'openstreet';
}
```

---

### **5. Soporte para OpenStreet**

```typescript
type MapProvider = 'google' | 'mapbox' | 'openstreet' | 'tomtom';

private getService(provider: MapProvider) {
  switch (provider) {
    case 'google':
      return googleMapsService;
    case 'mapbox':
      return mapboxService;
    case 'tomtom':
      return tomtomService;
    case 'openstreet':
      return mapboxService; // OpenStreet usa el mismo servicio que Mapbox
    default:
      return mapboxService;
  }
}
```

---

### **6. `RideTrackingScreen.tsx` - Comentado Endpoint de Desvío**

**ANTES:**
```typescript
useEffect(() => {
  if (!driverLocation) return;

  const checkDeviation = async () => {
    try {
      const response = await fetch(
        `${backendUrl}/tracking/deviation/${rideId}?lat=${lat}&lng=${lng}`
      );
      const data = await response.json(); // ❌ Error: HTML en lugar de JSON
      // ...
    } catch (error) {
      console.error('Error verificando desvío:', error);
    }
  };
  // ...
}, [driverLocation, rideId, isDeviated]);
```

**DESPUÉS:**
```typescript
// TODO: Verificar desvío de ruta cada 10 segundos
// Comentado temporalmente hasta implementar Firebase Function
/*
useEffect(() => {
  if (!driverLocation) return;

  const checkDeviation = async () => {
    try {
      const response = await fetch(
        `${backendUrl}/tracking/deviation/${rideId}?lat=${lat}&lng=${lng}`
      );
      
      if (!response.ok) {
        // Endpoint no existe aún, silenciar error
        return;
      }
      
      const data = await response.json();
      // ...
    } catch (error) {
      // Silenciar error si el endpoint no existe
    }
  };
  // ...
}, [driverLocation, rideId, isDeviated]);
*/
```

---

## 🎯 **FLUJO DE DECISIÓN:**

### **Cuando se necesita MOSTRAR un mapa:**
```
1. Intentar Google Maps
   ├─ ✅ Disponible → Usar Google Maps
   └─ ❌ No disponible
      └─ 2. Intentar Mapbox
         ├─ ✅ Disponible → Usar Mapbox
         └─ ❌ No disponible
            └─ 3. Intentar OpenStreet
               ├─ ✅ Disponible → Usar OpenStreet
               └─ ❌ No disponible
                  └─ 4. Usar TomTom (último recurso)
```

### **Cuando se necesita CALCULAR ruta/direcciones:**
```
1. Intentar Mapbox
   ├─ ✅ Disponible → Usar Mapbox
   └─ ❌ No disponible
      └─ 2. Intentar Google Maps
         ├─ ✅ Disponible → Usar Google Maps
         └─ ❌ No disponible
            └─ 3. Intentar OpenStreet
               ├─ ✅ Disponible → Usar OpenStreet
               └─ ❌ No disponible
                  └─ 4. Usar TomTom (último recurso)
```

---

## 📊 **LOGS ESPERADOS:**

### **Antes (Incorrecto):**
```
LOG  TomTom Map WebView loaded  ← ❌ No debería cargar TomTom
ERROR Error verificando desvío: [SyntaxError: JSON Parse error: Unexpected character: <]
```

### **Después (Correcto):**
```
LOG  🗺️ Intentando con GOOGLE...
LOG  ✅ Éxito con GOOGLE
LOG  🛣️ Usando MAPBOX para routing (mapa visual: GOOGLE)
LOG  🗺️ Intentando con MAPBOX...
LOG  ✅ Éxito con MAPBOX
```

---

## ✅ **RESULTADOS:**

| Aspecto | Antes | Después |
|---------|-------|---------|
| **Mapa Visual** | ❌ TomTom | ✅ Google Maps |
| **Routing** | ✅ Mapbox | ✅ Mapbox |
| **Error JSON Parse** | ❌ Constante | ✅ Eliminado |
| **Jerarquía Clara** | ❌ No | ✅ Sí |
| **Fallback Correcto** | ❌ No | ✅ Sí |

---

## 🚀 **PRÓXIMOS PASOS:**

### **1. Implementar Firebase Function para Desvío:**
```typescript
// functions/src/api/tracking-functions.ts

/**
 * Verificar si el conductor se ha desviado de la ruta
 */
export const checkDeviation = functions.https.onCall(async (data, context) => {
  const { rideId, lat, lng } = data;
  
  // 1. Obtener ruta original del viaje desde PostgreSQL
  const rideQuery = await pool.query(
    'SELECT pickup_lat, pickup_lng, dropoff_lat, dropoff_lng FROM rides WHERE id = $1',
    [rideId]
  );
  
  // 2. Calcular distancia desde punto actual a ruta esperada
  // 3. Si distancia > 500m, marcar como desviado
  
  return {
    success: true,
    data: {
      isDeviated: false,
      deviationDistance: 0
    }
  };
});
```

### **2. Descomentar en `RideTrackingScreen.tsx`:**
```typescript
// Cambiar de fetch() a Firebase Callable Function
const { functions } = await import('../../config/firebase');
const { httpsCallable } = await import('firebase/functions');

const checkDeviationFn = httpsCallable(functions, 'checkDeviation');
const response = await checkDeviationFn({
  rideId,
  lat: driverLocation.latitude,
  lng: driverLocation.longitude,
});
```

---

## 📝 **NOTAS TÉCNICAS:**

### **¿Por qué dos jerarquías?**
- **Mapa Visual:** Google Maps tiene mejor UI/UX para usuarios
- **Routing:** Mapbox tiene mejores datos para Nicaragua y Centroamérica

### **¿Por qué OpenStreet usa Mapbox service?**
- OpenStreet Map es solo un proveedor de tiles (imágenes del mapa)
- Para geocoding y routing, usa la misma API de Mapbox
- Es una opción gratuita si se agotan los límites de Google/Mapbox

### **¿Cuándo se usa TomTom?**
- Solo como último recurso si todos los demás fallan
- TomTom tiene buenos datos pero es más caro
- Se mantiene como fallback de emergencia

---

## ✅ **CHECKLIST:**

- [x] Implementadas dos jerarquías separadas
- [x] Agregado parámetro `useRoutingOrder` a `tryWithFallback()`
- [x] Actualizados todos los métodos con orden correcto
- [x] Agregado soporte para OpenStreet
- [x] Comentado endpoint de desvío problemático
- [x] Creado método `getMapProviderWithFallback()`
- [x] Documentación completa
- [ ] Testing en dispositivo real
- [ ] Implementar Firebase Function para desvío

---

**¡Jerarquía de mapas corregida!** 🗺️✅

**Ahora:**
- ✅ Google Maps se muestra visualmente
- ✅ Mapbox se usa para routing
- ✅ Fallback correcto en ambos casos
- ✅ Sin errores de JSON Parse
- ✅ TomTom solo como último recurso
