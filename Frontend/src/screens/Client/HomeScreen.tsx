import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import mapsService from '../../services/mapsService';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/Button';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../config/firebase';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { MapSkeleton } from '../../components/SkeletonLoader';
import { NoConnectionEmptyState } from '../../components/EmptyState';
import { AnimatedButton } from '../../components/AnimatedButton';

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { coords, loading: locationLoading, error, refreshLocation } = useLocation();
  const [mapReady, setMapReady] = useState(false);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [checkingRide, setCheckingRide] = useState(true);
  const [centeringLocation, setCenteringLocation] = useState(false);
  const [mapKey, setMapKey] = useState(0); // Para forzar re-render del mapa
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]); // Conductores disponibles
  const [manualLocation, setManualLocation] = useState<{latitude: number; longitude: number} | null>(null); // Ubicación manual del cliente
  const [effectiveLocation, setEffectiveLocation] = useState<{latitude: number; longitude: number} | null>(null); // Ubicación efectiva (manual o GPS)

  // Consultar proveedor de mapas al backend
  useEffect(() => {
    mapsService.fetchProviderFromBackend();
  }, []);

  // Cargar ubicación manual guardada de Firebase al montar
  useEffect(() => {
    const loadManualLocation = async () => {
      if (!user?.id) return;
      
      try {
        const db = getDatabase();
        const clientLocationRef = ref(db, `clientLocations/${user.id}`);
        const snapshot = await import('firebase/database').then(({ get }) => get(clientLocationRef));
        
        if (snapshot.exists()) {
          const savedLocation = snapshot.val();
          const isRecent = (Date.now() - savedLocation.timestamp) < 3600000; // 1 hora
          
          if (savedLocation.isManual && isRecent) {
            console.log('📍 Cargando ubicación manual guardada:', savedLocation);
            setManualLocation({
              latitude: savedLocation.latitude,
              longitude: savedLocation.longitude
            });
          }
        }
      } catch (error) {
        console.error('❌ Error cargando ubicación manual:', error);
      }
    };
    
    loadManualLocation();
  }, [user?.id]);

  // Actualizar ubicación efectiva cuando cambia manual o GPS
  useEffect(() => {
    console.log('🔄 Actualizando ubicación efectiva - manual:', manualLocation, 'GPS:', coords);
    if (manualLocation) {
      setEffectiveLocation(manualLocation);
      console.log('📍 Usando ubicación manual:', manualLocation);
    } else if (coords) {
      setEffectiveLocation(coords);
      console.log('📡 Usando ubicación GPS:', coords);
    } else {
      console.log('⚠️ No hay ubicación disponible (ni manual ni GPS)');
    }
  }, [manualLocation, coords]);

  // Verificar si hay viaje activo en tiempo real
  useEffect(() => {
    if (!user?.id) return;

    const db = getDatabase();
    const ridesRef = ref(db, 'activeRides');

    const unsubscribe = onValue(ridesRef, (snapshot) => {
      const data = snapshot.val();
      console.log('🔍 [HomeScreen] Buscando viajes activos para user.id:', user.id);
      
      if (data) {
        // Buscar viaje donde el cliente es el usuario actual
        const rides = Object.values(data) as any[];
        console.log('📦 [HomeScreen] Total de viajes en activeRides:', rides.length);
        
        const myActiveRide = rides.find(
          (ride: any) => {
            console.log('🔍 Comparando viaje:', {
              rideId: ride.id,
              clientId: ride.clientId,
              userId: user.id,
              match: ride.clientId === user.id,
              status: ride.status,
              validStatus: ['requested', 'pending_confirm', 'accepted', 'in_progress'].includes(ride.status)
            });
            
            return ride.clientId === user.id && 
              (ride.status === 'requested' || 
               ride.status === 'pending_confirm' || 
               ride.status === 'accepted' || 
               ride.status === 'in_progress');
          }
        );
        
        if (myActiveRide) {
          console.log('✅ [HomeScreen] Viaje activo encontrado:', myActiveRide.id, 'Status:', myActiveRide.status);
          setActiveRide(myActiveRide);
        } else {
          console.log('❌ [HomeScreen] No se encontró viaje activo para este usuario');
          setActiveRide(null);
        }
      } else {
        console.log('📭 [HomeScreen] No hay viajes en activeRides');
        setActiveRide(null);
      }
      setCheckingRide(false);
    });

    return () => off(ridesRef);
  }, [user?.id]);

  // Función para calcular distancia entre dos puntos (Haversine)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en km
  };

  // Escuchar ubicaciones de conductores disponibles en tiempo real
  useEffect(() => {
    console.log('🎯 useEffect conductores - effectiveLocation:', effectiveLocation);
    if (!effectiveLocation) {
      console.log('⚠️ No hay effectiveLocation, no se puede buscar conductores');
      return;
    }

    console.log('✅ Iniciando listener de conductores con ubicación:', effectiveLocation);
    
    try {
      const db = getDatabase();
      console.log('✅ Database obtenida:', db);
      const driversRef = ref(db, 'driversInfo');
      console.log('✅ Referencia creada a driversInfo');
      const SEARCH_RADIUS_KM = 15; // Radio de búsqueda en kilómetros (15km para mayor cobertura en Nicaragua)

      console.log('🔄 Configurando listener onValue...');
      
      const unsubscribe = onValue(
        driversRef, 
        (snapshot) => {
          console.log('🔔 onValue callback ejecutado! (INICIO)');
          
          try {
          console.log('🔔 onValue callback ejecutado!');
          const data = snapshot.val();
          console.log('📦 Datos RAW de driversInfo:', data ? Object.keys(data).length + ' conductores' : 'null');
          console.log('📍 Ubicación del cliente para buscar conductores:', effectiveLocation);
        
          if (!data || typeof data !== 'object') {
            console.log('ℹ️ No hay conductores en driversInfo (nodo vacío o no existe)');
            setAvailableDrivers([]);
            return;
          }
      
        if (data && typeof data === 'object') {
        // Convertir a array y filtrar conductores disponibles
        const allDrivers = Object.entries(data).map(([driverId, driverData]: [string, any]) => {
          // Validar que driverData existe y tiene las propiedades necesarias
          if (!driverData || typeof driverData !== 'object') {
            console.log(`⚠️ Conductor ${driverId} tiene datos inválidos`);
            return null;
          }
          const driver = {
            id: driverId,
            latitude: driverData.lat || driverData.latitude, // Soportar ambos formatos
            longitude: driverData.lng || driverData.longitude, // Soportar ambos formatos
            isAvailable: driverData.status === 'available' || driverData.isAvailable === true, // Soportar ambos formatos
            heading: driverData.heading || 0,
            lastUpdate: driverData.timestamp || driverData.updatedAt,
          };
          console.log(`🔍 Procesando conductor ${driverId.substring(0, 8)}:`, {
            lat: driver.latitude,
            lng: driver.longitude,
            available: driver.isAvailable,
            rawStatus: driverData.status,
            rawLat: driverData.lat,
            rawLng: driverData.lng
          });
          return driver;
        }).filter((driver): driver is NonNullable<typeof driver> => driver !== null);

        // Filtrar por disponibilidad, ubicación válida y radio de búsqueda
        const nearbyDrivers = allDrivers.filter(driver => {
          if (!driver.isAvailable || !driver.latitude || !driver.longitude) {
            return false;
          }

          // Calcular distancia usando la ubicación efectiva (manual o GPS)
          const distance = calculateDistance(
            effectiveLocation.latitude,
            effectiveLocation.longitude,
            driver.latitude,
            driver.longitude
          );

          console.log(`🚗 Conductor ${driver.id}: ${distance.toFixed(2)}km de distancia`);
          return distance <= SEARCH_RADIUS_KM;
        });

        console.log(`🚗 ${nearbyDrivers.length} conductores disponibles dentro de ${SEARCH_RADIUS_KM}km`);
        console.log('📍 Conductores cercanos:', nearbyDrivers.map(d => ({
          id: d.id.substring(0, 8),
          lat: d.latitude,
          lng: d.longitude,
          distance: calculateDistance(effectiveLocation.latitude, effectiveLocation.longitude, d.latitude, d.longitude).toFixed(2) + 'km'
        })));
        setAvailableDrivers(nearbyDrivers);
      } else {
        setAvailableDrivers([]);
      }
        } catch (callbackError) {
          console.error('❌ Error en callback de onValue:', callbackError);
          setAvailableDrivers([]);
        }
      },
      (error) => {
        console.error('❌ Error en listener de Firebase:', error);
        setAvailableDrivers([]);
      }
    );
    
    console.log('✅ Listener onValue configurado exitosamente');

      return () => {
        console.log('🔇 Deteniendo listener de conductores');
        off(driversRef);
      };
    } catch (error) {
      console.error('❌ Error configurando listener de conductores:', error);
    }
  }, [effectiveLocation]); // Dependencia: effectiveLocation (manual o GPS)

  const checkActiveRide = async () => {
    try {
      setCheckingRide(true);
      const functions = await getFirebaseFunctions();
      const getActiveRideFunction = httpsCallable(functions, 'getActiveRide');
      const response = await getActiveRideFunction({});
      const result = response.data as { success: boolean; hasActiveRide: boolean; ride: any };

      // Verificar que el viaje exista y NO esté cancelado o completado
      if (result.success && result.hasActiveRide && result.ride) {
        const validStatuses = ['requested', 'accepted', 'started'];
        if (validStatuses.includes(result.ride.status)) {
          setActiveRide(result.ride);
        } else {
          // Viaje cancelado o completado, no mostrar botón
          setActiveRide(null);
        }
      } else {
        setActiveRide(null);
      }
    } catch (error) {
      console.error('Error verificando viaje activo:', error);
      setActiveRide(null);
    } finally {
      setCheckingRide(false);
    }
  };

  const goToActiveRide = () => {
    if (!activeRide) return;

    if (activeRide.status === 'requested' || activeRide.status === 'pending_confirm') {
      // Viaje solicitado o esperando confirmación, ir a confirmación
      navigation.navigate('RideConfirmation', { rideId: activeRide.id });
    } else {
      // Viaje aceptado o en progreso, ir a tracking
      navigation.navigate('RideTracking', {
        rideId: activeRide.id,
        driverId: activeRide.driverId,
        driverName: activeRide.driver?.name || 'Conductor',
        vehiclePlate: activeRide.vehicle?.plate || 'N/A',
        vehicleBrand: activeRide.vehicle?.make || activeRide.vehicle?.brand || 'N/A',
        vehicleModel: activeRide.vehicle?.model || 'N/A',
        vehicleColor: activeRide.vehicle?.color || 'N/A',
        estimatedFare: activeRide.estimatedPrice || 0,
      });
    }
  };

  const handleCenterLocation = async () => {
    setCenteringLocation(true);
    try {
      // Actualizar ubicación
      await refreshLocation();
      // Limpiar ubicación manual (volver a GPS)
      setManualLocation(null);
      // Forzar re-render del mapa para centrar
      setMapKey(prev => prev + 1);
      console.log('📍 Ubicación actualizada y centrada');
    } catch (error) {
      console.error('Error actualizando ubicación:', error);
    } finally {
      setCenteringLocation(false);
    }
  };

  // Manejar cuando el usuario mueve el pin manualmente
  const handleMarkerDragEnd = async (newLocation: { latitude: number; longitude: number }) => {
    console.log('📍 Nueva ubicación manual:', newLocation);
    setManualLocation(newLocation);

    // Guardar en Firebase Realtime Database
    if (user?.id) {
      try {
        const db = getDatabase();
        const clientLocationRef = ref(db, `clientLocations/${user.id}`);
        await import('firebase/database').then(({ set }) => 
          set(clientLocationRef, {
            latitude: newLocation.latitude,
            longitude: newLocation.longitude,
            isManual: true,
            timestamp: Date.now(),
          })
        );
        console.log('✅ Ubicación manual guardada en Firebase');
      } catch (error) {
        console.error('❌ Error guardando ubicación manual:', error);
      }
    }
  };

  // Estilos dinámicos con tema
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Solo mostrar loading si NO hay ubicación efectiva (ni manual ni GPS)
  if (locationLoading && !effectiveLocation) {
    return (
      <View style={styles.container}>
        <MapSkeleton />
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Obteniendo ubicación...
          </Text>
        </View>
      </View>
    );
  }

  if (error || (!coords && !effectiveLocation)) {
    return (
      <View style={styles.container}>
        <NoConnectionEmptyState onRetry={refreshLocation} />
      </View>
    );
  }

  // Usar ubicación efectiva para el mapa
  const mapLocation = effectiveLocation || coords || { latitude: 0, longitude: 0 };

  return (
    <View style={styles.container}>
      {/* Mapa dinámico según backend */}
      <DynamicMap
        key={mapKey}
        latitude={mapLocation.latitude}
        longitude={mapLocation.longitude}
        style={styles.map}
        showMarker={true}
        markerPosition={mapLocation}
        markerType="origin"
        nearbyDrivers={availableDrivers}
        draggableMarker={true}
        onMarkerDragEnd={handleMarkerDragEnd}
      />

      {/* Header flotante */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>Hola, {user?.name || 'Usuario'}</Text>
          <Text style={styles.subtitle}>¿A dónde quieres ir?</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.headerButtonIcon}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.profileIcon}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>


      {/* Barra de búsqueda flotante */}
      <TouchableOpacity
        style={styles.searchBar}
        onPress={() => navigation.navigate('SearchRide')}
      >
        <View style={styles.searchIcon}>
          <Text style={styles.searchIconText}>🔍</Text>
        </View>
        <Text style={styles.searchText}>Buscar destino...</Text>
      </TouchableOpacity>

      {/* Botón flotante para centrar ubicación */}
      <TouchableOpacity
        style={styles.centerLocationButton}
        onPress={handleCenterLocation}
        disabled={centeringLocation}
      >
        {centeringLocation ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.centerLocationIcon}>📍</Text>
        )}
      </TouchableOpacity>

      {/* Botón de viaje activo (si existe) - Movido abajo */}
      {activeRide && !checkingRide ? (
        <TouchableOpacity
          style={styles.activeRideButton}
          onPress={goToActiveRide}
        >
          <View style={styles.activeRideContent}>
            <Text style={styles.activeRideIcon}>🚗</Text>
            <View style={styles.activeRideInfo}>
              <Text style={styles.activeRideTitle}>Viaje en curso</Text>
              <Text style={styles.activeRideSubtitle}>
                {activeRide.status === 'requested' ? 'Buscando conductor...' :
                 activeRide.status === 'pending_confirm' ? 'Confirma tu conductor' :
                 activeRide.status === 'accepted' ? 'Conductor en camino' : 
                 'Viaje en progreso'}
              </Text>
            </View>
            <Text style={styles.activeRideArrow}>→</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.requestButtonContainer}>
          <Button
            title="Solicitar Viaje"
            onPress={() => navigation.navigate('SearchRide')}
            style={styles.requestButton}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 24,
    borderRadius: 16,
    ...Platform.select({
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
      }
    }),
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  debugText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
    textAlign: 'center',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: colors.card + 'F2',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }
    }),
  },
  headerContent: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    ...Platform.select({
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }
    }),
  },
  headerButtonIcon: {
    fontSize: 20,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    ...Platform.select({
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }
    }),
  },
  profileIcon: {
    fontSize: 24,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  trafficIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  trafficIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  trafficText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  searchBar: {
    position: 'absolute',
    top: 150,
    left: 20,
    right: 20,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
      }
    }),
  },
  searchIcon: {
    width: 32,
    height: 32,
    backgroundColor: colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchIconText: {
    fontSize: 16,
  },
  searchText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  centerLocationButton: {
    position: 'absolute',
    top: 220,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)'
      },
      default: {
        shadowColor: '#2196F3',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 6,
      }
    }),
  },
  centerLocationIcon: {
    fontSize: 28,
  },
  requestButtonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  requestButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
  },
  activeRideButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  activeRideContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeRideIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  activeRideInfo: {
    flex: 1,
  },
  activeRideTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  activeRideSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  activeRideArrow: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
  },
});
