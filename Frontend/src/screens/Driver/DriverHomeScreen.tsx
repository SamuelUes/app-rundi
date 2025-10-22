import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';

// Contextos y Hooks
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useFirebaseData, useFirebaseItem } from '../../hooks/useFirebaseData';

// Componentes
import LoadingOverlay from '../../components/LoadingOverlay';
import DynamicMap from '../../components/DynamicMap';
import EmergencyButton from '../../components/EmergencyButton';

// Servicios
import alertService from '../../services/alertService';
import mapsService from '../../services/mapsService';
import ridesService from '../../services/ridesService';
import driversService from '../../services/driversService';
import driverAvailabilityService from '../../services/driverAvailabilityService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Función para calcular distancia entre dos puntos (Haversine)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default function DriverHomeScreen({ navigation }: any) {
  // ============================================
  // HOOKS - TODOS AL INICIO (REGLA DE REACT)
  // ============================================
  
  const { user } = useAuth();
  const { colors } = useTheme();
  const { coords, loading: locationLoading, error, refreshLocation } = useLocation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Estados
  const [isAvailable, setIsAvailable] = useState(false);
  const [isDesignatedDriverMode, setIsDesignatedDriverMode] = useState(false);
  const [vehicleIs4x4, setVehicleIs4x4] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [rideRequests, setRideRequests] = useState<any[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [todayStats, setTodayStats] = useState({ trips: 0, earnings: 0 });
  const [activeRide, setActiveRide] = useState<any>(null);
  const [availableRideRequests, setAvailableRideRequests] = useState<any[]>([]);
  const [savedRideId, setSavedRideId] = useState<string | null>(null);

  // Refs
  const notifiedRides = useRef<Set<string>>(new Set());
  const PANEL_MIN_HEIGHT = 180;
  const PANEL_MAX_HEIGHT = SCREEN_HEIGHT * 0.7;
  const panelHeight = useRef(new Animated.Value(PANEL_MIN_HEIGHT)).current;
  
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newHeight = PANEL_MIN_HEIGHT - gestureState.dy;
        if (newHeight >= PANEL_MIN_HEIGHT && newHeight <= PANEL_MAX_HEIGHT) {
          panelHeight.setValue(newHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const newHeight = PANEL_MIN_HEIGHT - gestureState.dy;
        if (newHeight > (PANEL_MIN_HEIGHT + PANEL_MAX_HEIGHT) / 2) {
          Animated.spring(panelHeight, {
            toValue: PANEL_MAX_HEIGHT,
            useNativeDriver: false,
          }).start();
        } else {
          Animated.spring(panelHeight, {
            toValue: PANEL_MIN_HEIGHT,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // Firebase Hooks - Simplificado para evitar problemas de orden de hooks
  // Nota: Se removieron useFirebaseData y useFirebaseItem para evitar hooks condicionales

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    mapsService.fetchProviderFromBackend();
  }, []);

  useEffect(() => {
    const restoreAvailabilityState = async () => {
      const savedState = await driverAvailabilityService.getAvailabilityState();
      if (savedState) {
        setIsAvailable(savedState.isAvailable);
        setIsDesignatedDriverMode(savedState.isDesignatedDriverMode);
        
        if (savedState.isAvailable && coords) {
          try {
            await driversService.updateStatus('available', coords);
          } catch (error) {
            console.error('Error restaurando estado:', error);
          }
        }
      }
    };
    
    if (coords) {
      restoreAvailabilityState();
    }
  }, [coords]);

  useEffect(() => {
    if (!coords) {
      return;
    }

    driverAvailabilityService.initAppStateListener(coords, (restoredState) => {
      setIsAvailable(restoredState.isAvailable);
      setIsDesignatedDriverMode(restoredState.isDesignatedDriverMode);
    });

    if (isAvailable) {
      driverAvailabilityService.startHeartbeat(coords);
    }

    return () => {
      driverAvailabilityService.cleanup();
    };
  }, [coords, isAvailable]);

  useEffect(() => {
    const checkVehicle = async () => {
      if (!user || !user.id || user.role !== 'driver') {
        return;
      }
      
      try {
        const driverProfile = await driversService.getDriverProfile(user.id);
        const is4x4 = driverProfile?.vehicle?.is4x4 || false;
        setVehicleIs4x4(is4x4);
      } catch (error) {
        console.error('Error verificando vehículo:', error);
      }
    };
    
    checkVehicle();
  }, [user]);

  useEffect(() => {
    const loadSavedRideId = async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const activeRideId = await AsyncStorage.getItem('ACTIVE_RIDE_ID');
        if (activeRideId) {
          setSavedRideId(activeRideId);
        }
      } catch (error) {
        console.error('Error cargando viaje guardado:', error);
      }
    };
    
    loadSavedRideId();
  }, []);

  // Verificar viaje guardado - Simplificado sin useFirebaseItem
  useEffect(() => {
    if (!savedRideId || !user?.id) {
      return;
    }
    
    const handleSavedRide = async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        // Simplemente limpiar el ID guardado
        await AsyncStorage.removeItem('ACTIVE_RIDE_ID');
        setSavedRideId(null);
      } catch (error) {
        console.error('Error manejando viaje guardado:', error);
      }
    };
    
    handleSavedRide();
  }, [savedRideId, user?.id]);

  // Escuchar activeRides directamente desde Firebase (como funcionaba antes)
  useEffect(() => {
    console.log('🔍 [DriverHomeScreen] useEffect - coords:', coords, 'isAvailable:', isAvailable);
    
    if (!coords || !isAvailable) {
      console.log('⚠️ [DriverHomeScreen] No se puede buscar viajes - coords:', !!coords, 'isAvailable:', isAvailable);
      setRideRequests([]);
      setAvailableRideRequests([]);
      return;
    }

    console.log('🎯 Iniciando listener de activeRides para conductor');
    console.log('📍 Ubicación del conductor:', coords);
    
    const setupListener = async () => {
      try {
        const { getDatabase, ref, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const activeRidesRef = ref(db, 'activeRides');
        
        const SEARCH_RADIUS_KM = 12;
        
        const unsubscribe = onValue(activeRidesRef, (snapshot) => {
          const data = snapshot.val();
          console.log('📦 Snapshot recibido');
          console.log('📦 Datos:', data);
          
          if (!data || typeof data !== 'object') {
            console.log('❌ No hay datos de viajes activos');
            setRideRequests([]);
            setAvailableRideRequests([]);
            return;
          }
          
          // Filtrar viajes disponibles para este conductor
          const availableRides: any[] = [];
          let myActiveRide: any = null;
          
          Object.entries(data).forEach(([rideId, rideData]: [string, any]) => {
            console.log(`🔍 Viaje ${rideId}:`, {
              status: rideData.status,
              driverId: rideData.driverId,
              estimatedPrice: rideData.estimatedPrice,
              clientSuggestedPrice: rideData.clientSuggestedPrice,
              negotiationStatus: rideData.negotiationStatus
            });
            
            // Detectar viaje activo del conductor (accepted o in_progress)
            if (rideData.driverId === user?.id && 
                (rideData.status === 'accepted' || rideData.status === 'in_progress')) {
              console.log('🚗 Viaje activo detectado para este conductor:', rideId);
              myActiveRide = { id: rideId, ...rideData };
            }
            
            // Incluir viajes que:
            // 1. Están en estado 'requested' (sin conductor asignado aún)
            // 2. O están en negociación con este conductor específicamente
            const isRequested = rideData.status === 'requested' && !rideData.driverId;
            const isNegotiatingWithMe = rideData.driverId === user?.id && 
                                       (rideData.status === 'pending_confirm' || 
                                        rideData.status === 'driver_assigned');
            
            if (isRequested || isNegotiatingWithMe) {
              console.log(`✅ Viaje ${rideId} es elegible (requested o negociando)`);
              
              // Calcular distancia al punto de origen
              const originLat = rideData.origin?.latitude || rideData.origin?.lat;
              const originLng = rideData.origin?.longitude || rideData.origin?.lng;
              
              console.log(`📍 Origen del viaje ${rideId}:`, { originLat, originLng });
              console.log(`📍 Ubicación conductor:`, { lat: coords.latitude, lng: coords.longitude });
              
              if (originLat && originLng && coords) {
                const distance = calculateDistance(
                  coords.latitude,
                  coords.longitude,
                  originLat,
                  originLng
                );
                
                console.log(`📏 Distancia calculada: ${distance.toFixed(2)} km (límite: ${SEARCH_RADIUS_KM} km)`);
                
                if (distance <= SEARCH_RADIUS_KM) {
                  console.log(`✅ Viaje ${rideId} dentro del radio, agregando a lista`);
                  availableRides.push({
                    id: rideId,
                    ...rideData,
                    distance: distance
                  });
                } else {
                  console.log(`❌ Viaje ${rideId} fuera del radio (${distance.toFixed(2)} km > ${SEARCH_RADIUS_KM} km)`);
                }
              } else {
                console.log(`❌ Viaje ${rideId} no tiene coordenadas válidas o conductor sin ubicación`);
              }
            } else {
              console.log(`⏭️ Viaje ${rideId} no es elegible (status: ${rideData.status}, driverId: ${rideData.driverId})`);
            }
          });
          
          console.log(`✅ ${availableRides.length} viajes disponibles`);
          
          // Ordenar por distancia
          availableRides.sort((a, b) => a.distance - b.distance);
          setRideRequests(availableRides);
          
          // Formatear para el mapa
          const formattedRides = availableRides.map((ride: any) => ({
            id: ride.id,
            latitude: ride.origin?.latitude || ride.origin?.lat || 0,
            longitude: ride.origin?.longitude || ride.origin?.lng || 0,
            address: ride.originAddress || ride.origin?.address || 'Origen desconocido',
            estimatedPrice: `C$${ride.estimatedPrice || ride.clientSuggestedPrice || 0}`,
            passengers: ride.passengers || 1,
            destination: ride.destinationAddress || 'Destino',
            distance: `${ride.distance.toFixed(1)} km`,
          }));
          
          setAvailableRideRequests(formattedRides);
          console.log(`📍 ${formattedRides.length} solicitudes formateadas para el mapa`);
          console.log('📍 Solicitudes formateadas:', JSON.stringify(formattedRides, null, 2));
          
          // Actualizar estado de viaje activo
          if (myActiveRide) {
            console.log('✅ Actualizando estado con viaje activo:', myActiveRide.id);
            setActiveRide(myActiveRide);
            // Guardar en AsyncStorage
            (async () => {
              const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
              await AsyncStorage.setItem('ACTIVE_RIDE_ID', myActiveRide.id);
            })();
          } else {
            setActiveRide(null);
          }
          
          setLastUpdate(new Date());
        });
        
        return () => {
          off(activeRidesRef);
        };
      } catch (error) {
        console.error('❌ Error configurando listener de activeRides:', error);
      }
    };
    
    setupListener();
  }, [coords, isAvailable, user?.id]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleAvailabilityChange = async (newValue: boolean) => {
    if (!user || !coords) {
      alertService.showErrorAlert('No se pudo actualizar tu estado');
      return;
    }

    setUpdatingStatus(true);
    try {
      const status = newValue ? 'available' : 'offline';
      await driversService.updateStatus(status, coords);
      setIsAvailable(newValue);
      setLastUpdate(new Date());
      
      if (!newValue && isDesignatedDriverMode && user?.role === 'designated_driver') {
        setIsDesignatedDriverMode(false);
        await driversService.updateDesignatedDriverMode(user.id, false);
      }

      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await driverAvailabilityService.saveAvailabilityState({
        isAvailable: newValue,
        isDesignatedDriverMode: newValue ? isDesignatedDriverMode : false,
        lastUpdate: new Date().toISOString(),
        coords: { latitude: coords.latitude, longitude: coords.longitude },
      });

      if (newValue) {
        driverAvailabilityService.startHeartbeat(coords);
      } else {
        driverAvailabilityService.stopHeartbeat();
        await driverAvailabilityService.clearAvailabilityState();
      }
    } catch (error: any) {
      alertService.showErrorAlert(error.message || 'Error actualizando estado');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ============================================
  // RENDER CONDICIONALES (DESPUÉS DE TODOS LOS HOOKS)
  // ============================================

  if (locationLoading) {
    return <LoadingOverlay visible={true} message="Obteniendo tu ubicación..." />;
  }

  if (error || !coords) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[{ color: colors.text, fontSize: 16 }]}>❌ {error || 'No se pudo obtener la ubicación'}</Text>
        <TouchableOpacity onPress={refreshLocation} style={[{ marginTop: 16, padding: 12, backgroundColor: colors.primary, borderRadius: 8 }]}>
          <Text style={[{ color: '#FFFFFF', fontWeight: '600' }]}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Conductor</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('DriverProfile')}
            activeOpacity={0.7}
          >
            <Text style={styles.headerButtonText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Card de Acciones Rápidas - Arriba del Mapa */}
      <View style={styles.topActionsContainer}>
        <View style={styles.quickActionsCard}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('Earnings')}
          >
            <Text style={styles.quickActionIcon}>💵</Text>
            <Text style={styles.quickActionLabel}>Ganancias</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('RideHistory')}
          >
            <Text style={styles.quickActionIcon}>📋</Text>
            <Text style={styles.quickActionLabel}>Historial</Text>
          </TouchableOpacity>

          <View style={[styles.quickActionBtn, styles.sosBtn]}>
            <EmergencyButton rideId={activeRide?.id} />
          </View>
        </View>
      </View>

      {coords && (
        <DynamicMap
          key={`map-${availableRideRequests.length}-${availableRideRequests.map(r => r.id).join('-')}`}
          latitude={coords.latitude}
          longitude={coords.longitude}
          style={styles.map}
          showMarker={true}
          markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
          markerType="car"
          rideRequests={availableRideRequests}
          onRideRequestPress={() => navigation.navigate('AvailableRides')}
        />
      )}

      {/* Banner de Viaje Activo */}
      {activeRide && (
        <TouchableOpacity
          style={styles.activeRideBanner}
          onPress={() => navigation.navigate('ActiveRide', {
            rideId: activeRide.id,
            clientId: activeRide.clientId,
            origin: activeRide.origin,
            destination: activeRide.destination,
            estimatedFare: activeRide.finalFare || activeRide.estimatedPrice
          })}
          activeOpacity={0.9}
        >
          <View style={styles.activeRideBannerContent}>
            <View style={styles.activeRideIcon}>
              <Text style={styles.activeRideEmoji}>🚗</Text>
            </View>
            <View style={styles.activeRideInfo}>
              <Text style={styles.activeRideTitle}>Viaje activo</Text>
              <Text style={styles.activeRideSubtitle}>
                {activeRide.status === 'accepted' ? '🟡 En camino al cliente' : '🟢 Viaje en progreso'}
              </Text>
            </View>
            <View style={styles.activeRideArrow}>
              <Text style={styles.activeRideArrowText}>→</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      <Animated.View style={[styles.infoPanel, { height: panelHeight }]}>
        <View {...panResponder.panHandlers} style={styles.dragHandle}>
          <View style={styles.dragIndicator} />
        </View>
        
        <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
          {/* Estado de disponibilidad */}
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityHeader}>
              <View>
                <Text style={styles.availabilityTitle}>
                  {isAvailable ? '🟢 Disponible' : '⚪ No disponible'}
                </Text>
                {updatingStatus && <Text style={styles.updatingText}>Actualizando...</Text>}
              </View>
              <Switch
                value={isAvailable}
                onValueChange={handleAvailabilityChange}
                trackColor={{ false: '#ccc', true: '#4CAF50' }}
                thumbColor={isAvailable ? '#fff' : '#f4f3f4'}
                disabled={updatingStatus}
              />
            </View>
          </View>

          {/* Modo Conductor Designado */}
          {user?.role === 'designated_driver' && (
            <View style={[styles.modeCard, isDesignatedDriverMode && styles.modeCardActive]}>
              <View style={styles.modeHeader}>
                <View>
                  <Text style={styles.modeTitle}>👥 Modo de Viaje Designado</Text>
                  <Text style={styles.modeSubtitle}>2 conductores por viaje</Text>
                </View>
                <Switch
                  value={isDesignatedDriverMode}
                  onValueChange={(newValue) => setIsDesignatedDriverMode(newValue)}
                  trackColor={{ false: '#ccc', true: '#FF9800' }}
                  thumbColor={isDesignatedDriverMode ? '#fff' : '#f4f3f4'}
                  disabled={!isAvailable || updatingStatus}
                />
              </View>
              {isDesignatedDriverMode && (
                <View style={styles.modeInfo}>
                  <Text style={styles.modeInfoText}>✅ Modo activo - Recibirás viajes con 2 conductores</Text>
                </View>
              )}
            </View>
          )}

          {/* Estadísticas del día */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🚗</Text>
              <Text style={styles.statValue}>{todayStats.trips}</Text>
              <Text style={styles.statLabel}>Viajes</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>💰</Text>
              <Text style={styles.statValue}>${todayStats.earnings.toFixed(2)}</Text>
              <Text style={styles.statLabel}>Ganancias</Text>
            </View>
          </View>

          {/* Botón Viajes Disponibles */}
          <TouchableOpacity
            style={styles.availableRidesBtn}
            onPress={() => navigation.navigate('AvailableRides')}
          >
            <Text style={styles.availableRidesIcon}>🗺️</Text>
            <View style={styles.availableRidesContent}>
              <Text style={styles.availableRidesTitle}>Ver Viajes Disponibles</Text>
              <Text style={styles.availableRidesSubtitle}>Encuentra nuevas oportunidades</Text>
            </View>
            <Text style={styles.availableRidesArrow}>›</Text>
          </TouchableOpacity>

          {/* Información */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              📍 Ubicación: {currentAddress || 'Obteniendo...'}
            </Text>
            <Text style={styles.infoText}>
              ⏰ Última actualización: {lastUpdate.toLocaleTimeString()}
            </Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { 
      paddingTop: 16, 
      paddingHorizontal: 14, 
      paddingBottom: 14, 
      backgroundColor: colors.card + 'F8', 
      borderBottomWidth: 0,
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 5,
    },
    headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { fontSize: 24, fontWeight: '800', color: '#D4AF37', letterSpacing: 0.3 },
    headerButton: { 
      width: 42, 
      height: 42, 
      borderRadius: 21, 
      backgroundColor: '#D4AF37' + '25', 
      justifyContent: 'center', 
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#D4AF37',
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    headerButtonText: { fontSize: 20, fontWeight: '700' },
    map: { flex: 1 },
    infoPanel: { 
      position: 'absolute', 
      bottom: 0, 
      left: 0, 
      right: 0, 
      backgroundColor: colors.card + 'FA', 
      borderTopLeftRadius: 20, 
      borderTopRightRadius: 20, 
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 10,
    },
    dragHandle: { paddingVertical: 12, alignItems: 'center' },
    dragIndicator: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D4AF37' + '40' },
    scrollContent: { paddingHorizontal: 14, paddingBottom: 14 },
    availabilityCard: { 
      backgroundColor: colors.background + 'F5', 
      borderRadius: 14, 
      padding: 14, 
      marginBottom: 12, 
      borderWidth: 1.5,
      borderColor: '#D4AF37' + '50',
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 5,
      elevation: 3,
    },
    availabilityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    availabilityTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 2 },
    updatingText: { fontSize: 11, color: '#D4AF37', fontWeight: '600' },
    modeCard: { 
      backgroundColor: colors.background + 'F8', 
      borderRadius: 14, 
      padding: 14, 
      marginBottom: 12, 
      borderWidth: 2,
      borderColor: '#D4AF37' + '60',
      borderLeftWidth: 4,
      borderLeftColor: '#D4AF37',
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
    },
    modeCardActive: { backgroundColor: '#D4AF37' + '20', borderColor: '#D4AF37' },
    modeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modeTitle: { fontSize: 15, fontWeight: '700', color: '#D4AF37' },
    modeSubtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    modeInfo: { backgroundColor: '#D4AF37' + '15', borderRadius: 8, padding: 10, marginTop: 10, borderLeftWidth: 3, borderLeftColor: '#D4AF37' },
    modeInfoText: { fontSize: 11, color: '#D4AF37', fontWeight: '700' },
    statsContainer: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    statCard: { 
      flex: 1, 
      backgroundColor: colors.background + 'F5', 
      borderRadius: 14, 
      padding: 14, 
      borderWidth: 1.5,
      borderColor: '#D4AF37' + '50',
      alignItems: 'center',
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 5,
      elevation: 3,
    },
    statIcon: { fontSize: 28, marginBottom: 6 },
    statValue: { fontSize: 18, fontWeight: '800', color: '#D4AF37' },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 3, fontWeight: '600' },
    buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    navCard: { 
      flex: 1, 
      minWidth: '48%', 
      backgroundColor: colors.background + 'F5', 
      borderRadius: 14, 
      padding: 14, 
      borderWidth: 1.5,
      borderColor: '#D4AF37' + '50',
      alignItems: 'center', 
      justifyContent: 'center',
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 5,
      elevation: 3,
    },
    navIcon: { fontSize: 32, marginBottom: 6 },
    navLabel: { fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center' },
    sosCard: { backgroundColor: '#FF5252' + '25', borderColor: '#FF5252', borderWidth: 1.5 },
    infoBox: { 
      backgroundColor: colors.background + 'F5', 
      borderRadius: 12, 
      padding: 11, 
      borderWidth: 1.5,
      borderColor: '#D4AF37' + '40',
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 2,
    },
    infoText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', lineHeight: 16 },
    topActionsContainer: { 
      position: 'absolute', 
      top: 90, 
      left: 0, 
      right: 0, 
      paddingHorizontal: 16, 
      zIndex: 10 
    },
    quickActionsCard: { 
      backgroundColor: colors.card, 
      borderRadius: 16, 
      flexDirection: 'row', 
      justifyContent: 'space-between',
      gap: 12,
      padding: 12,
      shadowColor: '#000', 
      shadowOffset: { width: 0, height: 4 }, 
      shadowOpacity: 0.15, 
      shadowRadius: 8, 
      elevation: 8,
      borderWidth: 1,
      borderColor: colors.border + '30'
    },
    quickActionBtn: { 
      flex: 1, 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: colors.border + '20',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2
    },
    sosBtn: { 
      backgroundColor: '#FFEBEE',
      borderRadius: 12, 
      borderWidth: 2, 
      borderColor: '#F44336',
      shadowColor: '#F44336', 
      shadowOffset: { width: 0, height: 3 }, 
      shadowOpacity: 0.3, 
      shadowRadius: 6, 
      elevation: 4 
    },
    quickActionIcon: { 
      fontSize: 32, 
      marginBottom: 6 
    },
    quickActionLabel: { 
      fontSize: 11, 
      fontWeight: '700', 
      color: colors.text,
      textAlign: 'center'
    },
    activeRideBanner: {
      position: 'absolute',
      bottom: 200,
      left: 16,
      right: 16,
      backgroundColor: '#D4AF37',
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
      zIndex: 100,
    },
    activeRideBannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    activeRideIcon: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    activeRideEmoji: {
      fontSize: 24,
    },
    activeRideInfo: {
      flex: 1,
    },
    activeRideTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
      marginBottom: 4,
    },
    activeRideSubtitle: {
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.9)',
    },
    activeRideArrow: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    activeRideArrowText: {
      fontSize: 18,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    availableRidesBtn: { 
      backgroundColor: colors.background + 'F5', 
      borderRadius: 14, 
      padding: 14, 
      marginBottom: 12, 
      borderWidth: 1.5,
      borderColor: '#D4AF37' + '50',
      flexDirection: 'row', 
      alignItems: 'center', 
      shadowColor: '#D4AF37',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 4,
    },
    availableRidesIcon: { fontSize: 32, marginRight: 12, color: '#D4AF37' },
    availableRidesContent: { flex: 1 },
    availableRidesTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
    availableRidesSubtitle: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
    availableRidesArrow: { fontSize: 24, color: '#D4AF37', fontWeight: '400' },
  });
