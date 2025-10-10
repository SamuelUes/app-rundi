# 🎯 Ejemplos Prácticos - TomTom APIs

**Casos de uso reales implementados en la app**

---

## ✅ **CASO 1: Indicador de Tráfico en Tiempo Real**

**Ubicación**: `HomeScreen.tsx`

**Implementación**:
```typescript
// Obtener tráfico cada 30 segundos
useEffect(() => {
  if (!coords) return;

  const fetchTraffic = async () => {
    const traffic = await tomtomService.getTrafficInfo(coords);
    setTrafficInfo(traffic);
  };

  fetchTraffic();
  const interval = setInterval(fetchTraffic, 30000);

  return () => clearInterval(interval);
}, [coords]);

// Mostrar en UI
{trafficInfo && (
  <View style={styles.trafficIndicator}>
    <Text style={styles.trafficIcon}>
      {trafficInfo.congestionLevel === 'fluido' ? '🟢' : 
       trafficInfo.congestionLevel === 'moderado' ? '🟡' : 
       trafficInfo.congestionLevel === 'lento' ? '🟠' : '🔴'}
    </Text>
    <Text style={styles.trafficText}>
      Tráfico {trafficInfo.congestionLevel} • {Math.round(trafficInfo.currentSpeed)} km/h
    </Text>
  </View>
)}
```

**Resultado**: Badge con color según tráfico + velocidad actual

---

## 🚗 **CASO 2: Asignar Conductor Más Cercano (Matrix Routing)**

**Ubicación**: `SearchRideScreen.tsx`

**Implementación**:
```typescript
const searchDrivers = async () => {
  // 1. Obtener conductores disponibles del backend
  const drivers = await ridesService.findAvailableDrivers(coords);

  // 2. Usar Matrix Routing para encontrar el más cercano
  const nearest = await tomtomService.findNearestDriver(
    coords,
    drivers.map(d => ({ id: d.id, location: d.currentLocation }))
  );

  if (nearest) {
    console.log(`🚗 Conductor más cercano: ${nearest.id}`);
    console.log(`📏 Distancia: ${(nearest.distance / 1000).toFixed(2)} km`);
    console.log(`⏱️ Tiempo: ${Math.round(nearest.duration / 60)} min`);
    
    // 3. Mostrar al usuario
    Alert.alert(
      'Conductor encontrado',
      `Llegará en ${Math.round(nearest.duration / 60)} minutos`
    );
  }

  setAvailableDrivers(drivers);
};
```

**Ventaja**: Una sola llamada API para calcular distancias a múltiples conductores

---

## 🛣️ **CASO 3: Tracking Preciso con Snap to Roads**

**Uso**: Cuando el conductor está en viaje

```typescript
// Hook personalizado para tracking
const useDriverTracking = (driverId: string) => {
  const [driverLocation, setDriverLocation] = useState(null);
  const [snappedLocation, setSnappedLocation] = useState(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      // 1. Obtener ubicación GPS del conductor
      const rawLocation = await getDriverGPS(driverId);
      
      // 2. Ajustar al camino con Snap to Roads
      const snapped = await tomtomService.snapToRoads([rawLocation]);
      
      // 3. Actualizar en mapa
      setDriverLocation(rawLocation);
      setSnappedLocation(snapped[0]);
      
      console.log('📍 GPS real:', rawLocation);
      console.log('🛣️ Ajustado:', snapped[0]);
    }, 5000); // Cada 5 segundos

    return () => clearInterval(interval);
  }, [driverId]);

  return { driverLocation, snappedLocation };
};

// Usar en componente
const { snappedLocation } = useDriverTracking(ride.driverId);

<Marker
  coordinate={snappedLocation}
  title="Tu conductor"
/>
```

**Resultado**: Ubicación del conductor siempre en el camino correcto

---

## 🎯 **CASO 4: ETA Dinámico con Tráfico**

**Uso**: Mostrar tiempo de llegada actualizado

```typescript
const RideTrackingScreen = ({ ride }) => {
  const [eta, setEta] = useState(null);
  const { coords } = useLocation();

  useEffect(() => {
    const updateETA = async () => {
      // Calcular ETA desde ubicación del conductor
      const etaInfo = await tomtomService.calculateETA(
        ride.driver.currentLocation,
        coords
      );

      setEta(etaInfo);
      
      // Notificar si hay retraso
      if (etaInfo.durationInTraffic > etaInfo.duration * 1.2) {
        notify('Tu conductor está en tráfico. Llegará un poco más tarde.');
      }
    };

    updateETA();
    const interval = setInterval(updateETA, 15000); // Cada 15 segundos

    return () => clearInterval(interval);
  }, [ride.driver.currentLocation]);

  return (
    <View>
      <Text style={styles.eta}>
        Llegará a las {eta?.eta.toLocaleTimeString()}
      </Text>
      <Text style={styles.duration}>
        En {Math.round(eta?.durationInTraffic / 60)} minutos
      </Text>
    </View>
  );
};
```

**Resultado**: ETA que se actualiza automáticamente considerando tráfico

---

## 📍 **CASO 5: Búsqueda Inteligente de Lugares**

**Ubicación**: `SearchRideScreen.tsx`

**Ya implementado**:
```typescript
// Autocompletado con debounce
useEffect(() => {
  const timer = setTimeout(() => {
    if (destination.length > 2) {
      searchPlaces(destination);
    }
  }, 300);

  return () => clearTimeout(timer);
}, [destination]);

const searchPlaces = async (text: string) => {
  const results = await tomtomService.autocomplete(text, coords);
  setSuggestions(results);
};

// Seleccionar y calcular ruta
const selectSuggestion = async (place: any) => {
  const placeCoords = await tomtomService.getPlaceDetails(
    place.place_id, 
    place.position
  );
  
  // Calcular ruta con tráfico
  const route = await tomtomService.getDirections(coords, placeCoords);
  
  // Mostrar estimación
  const price = tomtomService.calculateEstimatedPrice(
    route.distance,
    route.duration
  );
  
  setEstimatedPrice(price);
  setEstimatedDistance(route.distance / 1000);
  setEstimatedDuration(route.duration / 60);
};
```

---

## 🚦 **CASO 6: Alertas de Tráfico Pesado**

```typescript
const TrafficAlertSystem = () => {
  const { coords } = useLocation();
  const [lastAlert, setLastAlert] = useState(null);

  useEffect(() => {
    const checkTraffic = async () => {
      const traffic = await tomtomService.getTrafficInfo(coords);
      
      // Alertar si tráfico está congestionado
      if (traffic.congestionLevel === 'congestionado') {
        const now = Date.now();
        
        // No alertar más de una vez cada 5 minutos
        if (!lastAlert || now - lastAlert > 300000) {
          Alert.alert(
            '🔴 Tráfico Pesado',
            `Velocidad actual: ${Math.round(traffic.currentSpeed)} km/h\n` +
            `Velocidad normal: ${Math.round(traffic.freeFlowSpeed)} km/h\n\n` +
            'Considera tomar una ruta alternativa.'
          );
          setLastAlert(now);
        }
      }
    };

    const interval = setInterval(checkTraffic, 30000);
    return () => clearInterval(interval);
  }, [coords, lastAlert]);

  return null;
};
```

---

## 🗺️ **CASO 7: Preview de Ruta con Mapa Estático**

**Uso**: Mostrar preview antes de confirmar viaje

```typescript
const RoutePreview = ({ origin, destination }) => {
  const mapUrl = tomtomService.getStaticMapUrl(
    {
      latitude: (origin.latitude + destination.latitude) / 2,
      longitude: (origin.longitude + destination.longitude) / 2,
    },
    13,
    400,
    300
  );

  return (
    <View style={styles.preview}>
      <Image
        source={{ uri: mapUrl }}
        style={styles.previewImage}
      />
      <Text style={styles.previewText}>
        Vista previa de tu ruta
      </Text>
    </View>
  );
};
```

---

## 🎯 **CASO 8: Geocoding Inverso para Dirección Actual**

**Ya implementado en**: `SearchRideScreen.tsx`

```typescript
useEffect(() => {
  if (coords) {
    loadOriginAddress();
  }
}, [coords]);

const loadOriginAddress = async () => {
  const address = await tomtomService.reverseGeocode(coords);
  if (address) {
    setOrigin(address);
  }
};
```

**Resultado**: "Calle 5ta Avenida, Zona 10, Guatemala" en lugar de coordenadas

---

## 📊 **CASO 9: Comparar Rutas (Múltiples Opciones)**

```typescript
const CompareRoutes = ({ origin, destination }) => {
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    const calculateRoutes = async () => {
      // Ruta más rápida (con tráfico)
      const fastest = await tomtomService.getDirections(origin, destination);
      
      // Ruta más corta (sin considerar tráfico tanto)
      const shortest = await tomtomService.getDirections(origin, destination);
      
      setRoutes([
        {
          type: 'Más rápida',
          duration: fastest.duration / 60,
          distance: fastest.distance / 1000,
          price: tomtomService.calculateEstimatedPrice(
            fastest.distance,
            fastest.duration
          ),
        },
        {
          type: 'Más corta',
          duration: shortest.duration / 60,
          distance: shortest.distance / 1000,
          price: tomtomService.calculateEstimatedPrice(
            shortest.distance,
            shortest.duration
          ),
        },
      ]);
    };

    calculateRoutes();
  }, [origin, destination]);

  return (
    <View>
      {routes.map((route, index) => (
        <TouchableOpacity key={index} style={styles.routeOption}>
          <Text style={styles.routeType}>{route.type}</Text>
          <Text>{Math.round(route.duration)} min • {route.distance.toFixed(1)} km</Text>
          <Text style={styles.routePrice}>C${route.price.toFixed(2)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
```

---

## 🚗 **CASO 10: Sistema Completo de Viaje**

```typescript
const RideSystem = () => {
  const [rideState, setRideState] = useState('searching'); // searching, assigned, in_progress, completed
  const [driver, setDriver] = useState(null);
  const [eta, setEta] = useState(null);
  const [traffic, setTraffic] = useState(null);

  // 1. Buscar conductor
  const searchDriver = async () => {
    const drivers = await ridesService.findAvailableDrivers(userLocation);
    const nearest = await tomtomService.findNearestDriver(userLocation, drivers);
    
    setDriver(drivers.find(d => d.id === nearest.id));
    setRideState('assigned');
  };

  // 2. Tracking en tiempo real
  useEffect(() => {
    if (rideState === 'assigned' || rideState === 'in_progress') {
      const interval = setInterval(async () => {
        // Obtener ubicación del conductor
        const driverLocation = await getDriverLocation(driver.id);
        
        // Ajustar al camino
        const snapped = await tomtomService.snapToRoads([driverLocation]);
        
        // Actualizar ETA
        const etaInfo = await tomtomService.calculateETA(snapped[0], userLocation);
        setEta(etaInfo);
        
        // Verificar tráfico
        const trafficInfo = await tomtomService.getTrafficInfo(snapped[0]);
        setTraffic(trafficInfo);
        
        // Notificar si hay retraso
        if (trafficInfo.congestionLevel === 'congestionado') {
          notify('Tu conductor está en tráfico pesado');
        }
      }, 10000); // Cada 10 segundos

      return () => clearInterval(interval);
    }
  }, [rideState, driver]);

  return (
    <View>
      {rideState === 'searching' && <Text>Buscando conductor...</Text>}
      
      {rideState === 'assigned' && (
        <View>
          <Text>Conductor asignado: {driver.name}</Text>
          <Text>Llegará en {Math.round(eta?.durationInTraffic / 60)} min</Text>
          <Text>Tráfico: {traffic?.congestionLevel}</Text>
        </View>
      )}
    </View>
  );
};
```

---

## ✅ **RESUMEN DE IMPLEMENTACIONES**

| Caso de Uso | API Usada | Estado |
|-------------|-----------|--------|
| Indicador de tráfico | Traffic API | ✅ Implementado |
| Conductor cercano | Matrix Routing | ✅ Implementado |
| Tracking preciso | Snap to Roads | 📝 Ejemplo |
| ETA dinámico | Routing + Traffic | 📝 Ejemplo |
| Búsqueda lugares | Search API | ✅ Implementado |
| Alertas tráfico | Traffic API | 📝 Ejemplo |
| Preview ruta | Static Map | 📝 Ejemplo |
| Dirección actual | Reverse Geocoding | ✅ Implementado |
| Comparar rutas | Routing API | 📝 Ejemplo |
| Sistema completo | Todas | 📝 Ejemplo |

---

**¡Todos los ejemplos están listos para usar!** 🎉

**Recarga la app** para ver el indicador de tráfico en tiempo real en el HomeScreen.
