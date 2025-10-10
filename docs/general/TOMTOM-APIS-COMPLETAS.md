# 🗺️ TomTom APIs - Suite Completa Integrada

**Fecha**: 2025-10-07 23:34  
**API Key**: `3NDFoFMjpXAs6W2PbCIEAMG0eAlQymMA`

---

## ✅ APIS IMPLEMENTADAS

### **1. 🗺️ Map Display API**
**Uso**: Mostrar el mapa y movimiento en tiempo real

**Implementación**:
- `TomTomMap.tsx` - Componente WebView con mapa interactivo
- Marcadores personalizados
- Controles de navegación
- Zoom y pan

**Código**:
```typescript
<TomTomMap
  latitude={coords.latitude}
  longitude={coords.longitude}
  style={styles.map}
/>
```

---

### **2. 🚘 Routing API**
**Uso**: Calcular rutas entre origen/destino

**Función**: `getDirections(origin, destination)`

**Retorna**:
- Distancia en metros
- Duración en segundos (con tráfico)
- Polyline (array de coordenadas)

**Ejemplo**:
```typescript
const route = await tomtomService.getDirections(
  { latitude: 14.6349, longitude: -90.5069 },
  { latitude: 14.6500, longitude: -90.5100 }
);

console.log(`Distancia: ${route.distance / 1000} km`);
console.log(`Duración: ${route.duration / 60} min`);
```

---

### **3. 🚦 Traffic API**
**Uso**: Obtener tráfico en tiempo real

**Función**: `getTrafficInfo(coords, radius)`

**Retorna**:
- Velocidad actual
- Velocidad sin tráfico
- Nivel de congestión (fluido/moderado/lento/congestionado)
- Cierres de carretera

**Ejemplo**:
```typescript
const traffic = await tomtomService.getTrafficInfo(coords);

console.log(`Velocidad: ${traffic.currentSpeed} km/h`);
console.log(`Congestión: ${traffic.congestionLevel}`);
```

---

### **4. 📍 Search API**
**Uso**: Buscar lugares con autocompletado

**Función**: `autocomplete(query, location)`

**Retorna**:
- Lista de sugerencias
- Nombre del lugar
- Dirección completa
- Coordenadas

**Ejemplo**:
```typescript
const results = await tomtomService.autocomplete('restaurante', coords);

results.forEach(place => {
  console.log(place.structured_formatting.main_text);
});
```

---

### **5. 📍 Geocoding API**
**Uso**: Convertir dirección a coordenadas

**Función**: `geocode(address)`

**Ejemplo**:
```typescript
const coords = await tomtomService.geocode('Zona 10, Guatemala');

console.log(`Lat: ${coords.latitude}, Lng: ${coords.longitude}`);
```

---

### **6. 📍 Reverse Geocoding API**
**Uso**: Convertir coordenadas a dirección

**Función**: `reverseGeocode(coords)`

**Ejemplo**:
```typescript
const address = await tomtomService.reverseGeocode({
  latitude: 14.6349,
  longitude: -90.5069
});

console.log(`Dirección: ${address}`);
```

---

### **7. 🛣️ Snap to Roads API**
**Uso**: Ajustar ubicación GPS del conductor al camino correcto

**Función**: `snapToRoads(points)`

**Uso en tracking**:
```typescript
// GPS del conductor puede estar desviado
const rawGPS = [
  { latitude: 14.6349, longitude: -90.5069 },
  { latitude: 14.6350, longitude: -90.5070 },
];

// Ajustar al camino real
const snappedPoints = await tomtomService.snapToRoads(rawGPS);

// Ahora los puntos están en el camino correcto
```

---

### **8. 🚗 Matrix Routing API**
**Uso**: Asignar el conductor más cercano al pasajero

**Función**: `findNearestDriver(origin, drivers)`

**Ventaja**: Calcula distancias a múltiples conductores en una sola llamada

**Ejemplo**:
```typescript
const drivers = [
  { id: '1', location: { latitude: 14.6349, longitude: -90.5069 } },
  { id: '2', location: { latitude: 14.6400, longitude: -90.5100 } },
  { id: '3', location: { latitude: 14.6300, longitude: -90.5000 } },
];

const nearest = await tomtomService.findNearestDriver(userLocation, drivers);

console.log(`Conductor más cercano: ${nearest.id}`);
console.log(`Distancia: ${nearest.distance / 1000} km`);
console.log(`Tiempo: ${nearest.duration / 60} min`);
```

---

### **9. 🎯 ETA Calculation**
**Uso**: Calcular tiempo estimado de llegada con tráfico

**Función**: `calculateETA(origin, destination)`

**Retorna**:
- Hora de llegada estimada
- Duración sin tráfico
- Duración con tráfico
- Distancia

**Ejemplo**:
```typescript
const eta = await tomtomService.calculateETA(driverLocation, userLocation);

console.log(`Llegará a las: ${eta.eta.toLocaleTimeString()}`);
console.log(`En ${eta.durationInTraffic / 60} minutos`);
```

---

### **10. 🗺️ Static Map URL**
**Uso**: Obtener imagen estática del mapa (para previews)

**Función**: `getStaticMapUrl(coords, zoom, width, height)`

**Ejemplo**:
```typescript
const mapUrl = tomtomService.getStaticMapUrl(coords, 15, 400, 300);

<Image source={{ uri: mapUrl }} style={styles.preview} />
```

---

## 🎯 CASOS DE USO EN LA APP

### **Solicitar Viaje**
```typescript
// 1. Buscar destino
const places = await tomtomService.autocomplete('Metrocentro', userLocation);

// 2. Seleccionar lugar
const destination = await tomtomService.getPlaceDetails(places[0].place_id);

// 3. Calcular ruta
const route = await tomtomService.getDirections(userLocation, destination);

// 4. Mostrar precio
const price = tomtomService.calculateEstimatedPrice(route.distance, route.duration);

// 5. Buscar conductor más cercano
const nearest = await tomtomService.findNearestDriver(userLocation, availableDrivers);

// 6. Calcular ETA
const eta = await tomtomService.calculateETA(nearest.location, userLocation);
```

### **Tracking en Tiempo Real**
```typescript
// 1. Obtener ubicación del conductor (cada 5 segundos)
const driverLocation = await getDriverGPS();

// 2. Ajustar al camino
const snapped = await tomtomService.snapToRoads([driverLocation]);

// 3. Actualizar ETA
const eta = await tomtomService.calculateETA(snapped[0], userLocation);

// 4. Verificar tráfico
const traffic = await tomtomService.getTrafficInfo(snapped[0]);

// 5. Notificar al usuario
if (traffic.congestionLevel === 'congestionado') {
  notify('Tu conductor está en tráfico pesado');
}
```

---

## 📊 LÍMITES DE LA API

**Tier Gratuito**: 2,500 requests/mes

**Distribución recomendada**:
- Search API: 1,000 requests (búsquedas)
- Routing API: 800 requests (rutas)
- Matrix Routing: 300 requests (conductores cercanos)
- Traffic API: 200 requests (tráfico)
- Snap to Roads: 200 requests (tracking)

**Total**: ~2,500 requests/mes

---

## 🚀 OPTIMIZACIONES

### **1. Cache de Rutas**
```typescript
// Guardar rutas calculadas
const routeCache = new Map();

async function getCachedRoute(origin, destination) {
  const key = `${origin.latitude},${origin.longitude}-${destination.latitude},${destination.longitude}`;
  
  if (routeCache.has(key)) {
    return routeCache.get(key);
  }
  
  const route = await tomtomService.getDirections(origin, destination);
  routeCache.set(key, route);
  
  return route;
}
```

### **2. Debounce en Búsqueda**
```typescript
// Ya implementado en SearchRideScreen
useEffect(() => {
  const timer = setTimeout(() => {
    if (destination.length > 2) {
      searchPlaces(destination);
    }
  }, 300); // Esperar 300ms antes de buscar

  return () => clearTimeout(timer);
}, [destination]);
```

### **3. Batch Matrix Routing**
```typescript
// Calcular distancias a múltiples conductores de una vez
// En lugar de hacer 10 llamadas, hacer 1 sola
const nearest = await tomtomService.findNearestDriver(userLocation, drivers);
```

---

## 📝 PRÓXIMAS FEATURES

### **Geofencing** (Extra)
- Definir zonas seguras
- Alertas al salir de zona
- Zonas de alta demanda

### **Speed Limits**
- Obtener límite de velocidad
- Alertar si conductor excede límite

### **Alternative Routes**
- Mostrar rutas alternativas
- Comparar tiempos y distancias

---

## ✅ RESUMEN

| API | Implementada | Uso en App |
|-----|--------------|------------|
| Map Display | ✅ | Mapa principal |
| Routing | ✅ | Calcular rutas |
| Traffic | ✅ | Tráfico en tiempo real |
| Search | ✅ | Buscar lugares |
| Geocoding | ✅ | Dirección → Coords |
| Reverse Geocoding | ✅ | Coords → Dirección |
| Snap to Roads | ✅ | Tracking preciso |
| Matrix Routing | ✅ | Conductor cercano |
| ETA Calculation | ✅ | Tiempo de llegada |
| Static Map | ✅ | Previews |

**Total**: 10 APIs de TomTom integradas 🎉

---

**¡Suite completa de TomTom Maps lista para usar!** 🗺️
