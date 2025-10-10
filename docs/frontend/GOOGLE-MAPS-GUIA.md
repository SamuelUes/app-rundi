# 🗺️ Google Maps Platform - Guía Completa para App Uber

**Fecha**: 2025-10-04  
**Prioridad**: Alta para funcionalidad completa

---

## 🎯 ¿Por qué Google Maps y no Waze?

### **Google Maps Platform** ✅ Recomendado
- ✅ API completa para desarrolladores
- ✅ Geocoding, Directions, Distance Matrix, Places
- ✅ Documentación extensa
- ✅ $200 USD gratis al mes (suficiente para desarrollo)
- ✅ Usado por Uber, Lyft, DoorDash, etc.
- ✅ Soporte para React Native

### **Waze** ❌ No recomendado
- ❌ No tiene API pública para desarrolladores
- ❌ Solo puedes abrir la app de Waze (deep linking)
- ❌ No permite integración en tu app
- ⚠️ Propiedad de Google (usan datos de Waze en Google Maps)

### **Alternativas**
- **Mapbox** - Buena alternativa, más barata
- **HERE Maps** - Buena para Europa
- **OpenStreetMap** - Gratis pero menos completo

**Conclusión**: Google Maps Platform es la mejor opción ✅

---

## 📋 APIs de Google Maps Necesarias

### **1. Maps SDK** (Ya instalado)
**Costo**: Gratis  
**Uso**: Mostrar el mapa

```typescript
import MapView from 'react-native-maps';
```

### **2. Geocoding API** ⭐
**Costo**: $5 por 1,000 requests  
**Crédito gratis**: 40,000 requests/mes

**Uso**: Convertir direcciones ↔ coordenadas

```typescript
// Dirección → Coordenadas
"Centro Comercial Managua" 
→ { lat: 12.1364, lng: -86.2514 }

// Coordenadas → Dirección
{ lat: 12.1364, lng: -86.2514 }
→ "Avenida Bolívar, Managua, Nicaragua"
```

### **3. Directions API** ⭐⭐⭐ (Muy importante)
**Costo**: $5 por 1,000 requests  
**Crédito gratis**: 40,000 requests/mes

**Uso**: Calcular rutas, distancia real, tiempo estimado

```typescript
const route = await mapsService.getDirections(origin, destination);
// Retorna:
{
  distance: 5420, // metros
  duration: 780, // segundos (13 minutos)
  polyline: "encodedPolylineString...",
  steps: [
    {
      instruction: "Gira a la izquierda en Avenida Bolívar",
      distance: 230,
      duration: 45
    },
    // ...más pasos
  ]
}
```

### **4. Distance Matrix API** ⭐⭐
**Costo**: $5 por 1,000 elementos  
**Crédito gratis**: 40,000 elementos/mes

**Uso**: Encontrar conductor más cercano

```typescript
// Tu ubicación vs 5 conductores
await mapsService.findNearestDriver(clientLocation, drivers);
// Retorna el conductor más cercano con distancia/tiempo
```

### **5. Places API (Autocomplete)** ⭐
**Costo**: 
- Autocomplete: $2.83 por 1,000 requests
- Place Details: $17 por 1,000 requests

**Crédito gratis**: 
- Autocomplete: 70,588 requests/mes
- Place Details: 11,764 requests/mes

**Uso**: Autocompletar direcciones

```typescript
Usuario escribe: "Centro Com..."
await mapsService.autocomplete("Centro Com");
// Retorna sugerencias:
[
  { description: "Centro Comercial Managua", place_id: "..." },
  { description: "Centro Comercial Metrocentro", place_id: "..." }
]
```

---

## 💰 Cálculo de Costos (Ejemplo Real)

### **Escenario**: 100 viajes al día

| API | Requests/Viaje | Total/Día | Total/Mes | Costo/Mes |
|-----|----------------|-----------|-----------|-----------|
| **Geocoding** | 2 | 200 | 6,000 | Gratis |
| **Directions** | 1 | 100 | 3,000 | Gratis |
| **Distance Matrix** | 1 | 100 | 3,000 | Gratis |
| **Places Autocomplete** | 5 | 500 | 15,000 | Gratis |
| **Places Details** | 2 | 200 | 6,000 | Gratis |

**Total mensual**: $0 USD (dentro del crédito gratis de $200)

### **Escenario**: 1,000 viajes al día (Startup creciendo)

| API | Requests/Mes | Costo |
|-----|--------------|-------|
| Geocoding | 60,000 | $3.00 |
| Directions | 30,000 | $1.50 |
| Distance Matrix | 30,000 | $1.50 |
| Places | 150,000 | $12.75 |

**Total mensual**: ~$20 USD (muy barato para 1,000 viajes/día)

---

## 🔑 Cómo Obtener API Key

### **Paso 1: Crear Proyecto en Google Cloud**

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Click en "Select a project" → "New Project"
3. Nombre: "App Uber"
4. Click "Create"

### **Paso 2: Habilitar APIs**

1. En el menú, ve a "APIs & Services" → "Library"
2. Busca y habilita estas APIs:
   - ✅ Maps SDK for Android
   - ✅ Maps SDK for iOS
   - ✅ Geocoding API
   - ✅ Directions API
   - ✅ Distance Matrix API
   - ✅ Places API

### **Paso 3: Crear API Key**

1. Ve a "APIs & Services" → "Credentials"
2. Click "+ CREATE CREDENTIALS" → "API key"
3. Copia la API key generada

### **Paso 4: Restringir API Key (Seguridad)**

**Para desarrollo:**
- No restricciones (más fácil para probar)

**Para producción:**
1. Click en la API key creada
2. En "Application restrictions":
   - Android: Agrega package name + SHA-1
   - iOS: Agrega bundle identifier
3. En "API restrictions":
   - Selecciona "Restrict key"
   - Marca solo las APIs que usas
4. Save

### **Paso 5: Configurar Billing**

1. Ve a "Billing" en el menú
2. Link a una tarjeta (no se cobrará nada dentro de $200/mes)
3. Activa el crédito gratis de $200

---

## ⚙️ Configuración en la App

### **1. Backend (.env)**

```env
# Google Maps API Key (Server-side)
GOOGLE_MAPS_API_KEY=AIzaSyABC123...
```

### **2. Frontend (.env)**

```env
# Google Maps API Key (Client-side)
GOOGLE_MAPS_API_KEY=AIzaSyAXYZ789...
```

⚠️ **Nota**: Puedes usar la misma key o keys diferentes (recomendado para producción)

### **3. Frontend (app.json)**

```json
{
  "expo": {
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "AIzaSyAXYZ789..."
        }
      }
    },
    "ios": {
      "config": {
        "googleMapsApiKey": "AIzaSyAXYZ789..."
      }
    }
  }
}
```

---

## 🚀 Uso en SearchRideScreen

Actualiza `SearchRideScreen.tsx` para usar el servicio:

```typescript
import mapsService from '../../services/mapsService';

// 1. Autocompletar destino
const [suggestions, setSuggestions] = useState([]);

const handleDestinationChange = async (text: string) => {
  setDestination(text);
  
  if (text.length > 2) {
    const results = await mapsService.autocomplete(text, coords);
    setSuggestions(results);
  }
};

// 2. Cuando usuario selecciona sugerencia
const handleSuggestionSelect = async (place: PlaceAutocomplete) => {
  setDestination(place.description);
  
  // Obtener coordenadas del lugar
  const placeCoords = await mapsService.getPlaceDetails(place.place_id);
  setDestinationCoords(placeCoords);
  
  // Calcular ruta real
  if (coords && placeCoords) {
    const route = await mapsService.getDirections(coords, placeCoords);
    
    if (route) {
      // Distancia en km
      const distanceKm = route.distance / 1000;
      setEstimatedDistance(distanceKm);
      
      // Duración en minutos
      const durationMin = route.duration / 60;
      setEstimatedDuration(durationMin);
      
      // Precio basado en distancia/duración REAL
      const price = mapsService.calculateEstimatedPrice(
        route.distance,
        route.duration
      );
      setEstimatedPrice(price);
      
      // Decodificar polyline para mostrar en mapa
      const routeCoordinates = mapsService.decodePolyline(route.polyline);
      setRouteCoordinates(routeCoordinates);
    }
  }
};

// 3. Mostrar ruta en el mapa
<MapView>
  {/* Ruta dibujada */}
  {routeCoordinates && (
    <Polyline
      coordinates={routeCoordinates}
      strokeColor="#000"
      strokeWidth={4}
    />
  )}
</MapView>

// 4. Buscar conductor más cercano
const searchDrivers = async () => {
  const drivers = await ridesService.findAvailableDrivers(coords);
  
  // Encontrar el más cercano usando Distance Matrix
  const nearest = await mapsService.findNearestDriver(coords, 
    drivers.map(d => ({ id: d.id, location: d.currentLocation }))
  );
  
  if (nearest) {
    console.log(`Conductor más cercano: ${nearest.id}`);
    console.log(`Distancia: ${nearest.distance / 1000} km`);
    console.log(`Tiempo de llegada: ${nearest.duration / 60} min`);
  }
};
```

---

## 📊 Funcionalidad Completa con Google Maps

### **Flujo del Usuario Mejorado**

1. **Usuario abre HomeScreen**
   - ✅ Obtiene ubicación GPS actual
   - ✅ Muestra mapa con ubicación marcada

2. **Usuario click "Solicitar Viaje"**
   - ✅ Navega a SearchRideScreen

3. **Usuario ingresa destino**
   ```
   Usuario escribe: "Centro..."
   → Autocomplete sugiere lugares
   → Usuario selecciona "Centro Comercial Managua"
   → Se obtienen coordenadas exactas
   → Se calcula ruta REAL con Directions API
   → Se muestra:
     - Distancia: 5.4 km
     - Duración: 13 minutos
     - Precio: C$57.50
     - Ruta dibujada en el mapa (polyline)
   ```

4. **Usuario busca conductores**
   ```
   → Distance Matrix API encuentra conductores
   → Ordena por distancia
   → Muestra: "Conductor a 2.3 km (5 min de ti)"
   ```

5. **Usuario confirma viaje**
   ```
   → Envía request al backend con:
     - Origen (coords + dirección)
     - Destino (coords + dirección)
     - Distancia real
     - Duración estimada
     - Precio calculado
     - Ruta (polyline)
   ```

6. **Durante el viaje** (futuro con WebSockets)
   ```
   → Actualiza ubicación del conductor cada 5 segundos
   → Recalcula tiempo de llegada
   → Muestra ruta actualizada
   ```

---

## 🔒 Seguridad de API Keys

### **Desarrollo**
```env
# .env (gitignored)
GOOGLE_MAPS_API_KEY=AIzaSyABC123...
```

### **Producción**

**Android:**
1. Restricción por package name
2. Restricción por SHA-1 fingerprint
3. Solo APIs específicas habilitadas

**iOS:**
1. Restricción por Bundle ID
2. Solo APIs específicas habilitadas

**Backend:**
1. Restricción por IP del servidor
2. Solo server-side APIs habilitadas

---

## 📈 Mejoras vs Estado Actual

| Feature | Actual | Con Google Maps API |
|---------|--------|---------------------|
| **Autocompletar destino** | ❌ Manual | ✅ Sugerencias reales |
| **Distancia** | ❌ Random 2-12 km | ✅ Real calculada |
| **Duración** | ❌ No calculada | ✅ Real con tráfico |
| **Precio** | ❌ Estimado básico | ✅ Preciso (distancia + tiempo) |
| **Ruta en mapa** | ❌ No mostrada | ✅ Polyline dibujada |
| **Conductor cercano** | ❌ Random | ✅ Ordenado por distancia real |
| **Instrucciones** | ❌ No disponible | ✅ Paso a paso |

---

## 🎯 Próximos Pasos

### **1. Obtener API Key** (15 minutos)
- Crear proyecto en Google Cloud
- Habilitar APIs necesarias
- Obtener y configurar API key

### **2. Configurar en la App** (5 minutos)
- Agregar a `.env`
- Agregar a `app.json`

### **3. Actualizar SearchRideScreen** (30 minutos)
- Integrar autocompletar
- Usar Directions API
- Mostrar polyline en mapa
- Calcular precio real

### **4. Actualizar Backend** (opcional)
- Validar distancia/precio calculados
- Guardar polyline de la ruta

---

## 💡 Tips y Best Practices

### **Performance**
- ✅ Cachea direcciones frecuentes (Casa, Trabajo)
- ✅ Debounce en autocomplete (espera 300ms antes de llamar API)
- ✅ Usa Distance Matrix en batch (varios conductores a la vez)

### **Costos**
- ✅ Solo llama Directions API cuando usuario confirma destino
- ✅ Autocomplete: Espera mínimo 3 caracteres
- ✅ Distance Matrix: Máximo 10 conductores a la vez

### **UX**
- ✅ Muestra loading mientras calcula ruta
- ✅ Muestra mapa con ruta antes de confirmar
- ✅ Permite al usuario ajustar pickup/dropoff arrastrando marcadores

---

## 📚 Recursos

- [Google Maps Platform Pricing](https://mapsplatform.google.com/pricing/)
- [Directions API Docs](https://developers.google.com/maps/documentation/directions)
- [Places API Docs](https://developers.google.com/maps/documentation/places)
- [React Native Maps](https://github.com/react-native-maps/react-native-maps)
- [Calculadora de Costos](https://mapsplatform.google.com/pricing/)

---

## ✅ Conclusión

**Google Maps Platform** es la mejor opción para tu app Uber porque:

1. ✅ APIs completas y potentes
2. ✅ $200 USD gratis al mes (suficiente para desarrollo y etapa inicial)
3. ✅ Usado por las apps más grandes del mundo
4. ✅ Excelente documentación
5. ✅ Fácil integración con React Native

**Waze NO es opción** porque no tiene API pública.

**Siguiente paso**: Obtener API key y actualizar `SearchRideScreen` para usar rutas reales.

---

**Costo estimado para 100 viajes/día**: $0 USD (dentro del crédito gratis)  
**Costo estimado para 1,000 viajes/día**: ~$20 USD/mes  

¡Muy barato para la funcionalidad que obtienes! 🚀
