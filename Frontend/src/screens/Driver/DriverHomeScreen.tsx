import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Switch, ScrollView, Alert, Linking, Modal, Animated, PanResponder, Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
import { useTheme } from '../../context/ThemeContext';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { AnimatedCard } from '../../components/AnimatedCard';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import { formatNicaraguaTime } from '../../utils/dateUtils';
import { safeFormatTime } from '../../utils/safeFormatters';
import { useAuth } from '../../context/AuthContext';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import mapsService from '../../services/mapsService';
import ridesService from '../../services/ridesService';
import driversService from '../../services/driversService';
import driverAvailabilityService from '../../services/driverAvailabilityService';

export default function DriverHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords, loading: locationLoading, error, refreshLocation } = useLocation();
  
  const [isAvailable, setIsAvailable] = useState(false);
  const [isDesignatedDriverMode, setIsDesignatedDriverMode] = useState(false);
  const [vehicleIs4x4, setVehicleIs4x4] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [rideRequests, setRideRequests] = useState<any[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [todayStats, setTodayStats] = useState({ trips: 0, earnings: 0 });
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [availableRideRequests, setAvailableRideRequests] = useState<any[]>([]); // Solicitudes disponibles para mostrar en mapa

  // Panel deslizable
  const PANEL_MIN_HEIGHT = 180; // Altura mínima (solo switch)
  const PANEL_MAX_HEIGHT = SCREEN_HEIGHT * 0.7; // Altura máxima
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
          // Expandir
          Animated.spring(panelHeight, {
            toValue: PANEL_MAX_HEIGHT,
            useNativeDriver: false,
          }).start();
        } else {
          // Contraer
          Animated.spring(panelHeight, {
            toValue: PANEL_MIN_HEIGHT,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // Consultar proveedor de mapas al backend
  useEffect(() => {
    mapsService.fetchProviderFromBackend();
  }, []);

  // Restaurar estado de disponibilidad al iniciar
  useEffect(() => {
    const restoreAvailabilityState = async () => {
      const savedState = await driverAvailabilityService.getAvailabilityState();
      
      if (savedState) {
        console.log('🔄 Restaurando estado guardado:', savedState);
        setIsAvailable(savedState.isAvailable);
        setIsDesignatedDriverMode(savedState.isDesignatedDriverMode);
        
        // Si estaba disponible, actualizar en el backend
        if (savedState.isAvailable && coords) {
          try {
            await driversService.updateStatus('available', coords);
            console.log('✅ Estado restaurado en el backend');
          } catch (error) {
            console.error('❌ Error restaurando estado:', error);
          }
        }
      }
    };
    
    if (coords) {
      restoreAvailabilityState();
    }
  }, [coords]);

  // Inicializar AppState listener y heartbeat
  useEffect(() => {
    if (!coords) return;

    // Iniciar listener de AppState
    driverAvailabilityService.initAppStateListener(coords, (restoredState) => {
      console.log('🔄 Estado restaurado desde background:', restoredState);
      setIsAvailable(restoredState.isAvailable);
      setIsDesignatedDriverMode(restoredState.isDesignatedDriverMode);
    });

    // Iniciar heartbeat si está disponible
    if (isAvailable) {
      driverAvailabilityService.startHeartbeat(coords);
    }

    // Cleanup al desmontar
    return () => {
      driverAvailabilityService.cleanup();
    };
  }, [coords, isAvailable]);

  // Verificar si el vehículo del conductor es 4x4 (ya no es necesario para conductor designado)
  useEffect(() => {
    const checkVehicle = async () => {
      // Solo verificar si hay usuario autenticado y es conductor
      if (!user || !user.id || user.role !== 'driver') {
        return;
      }
      
      try {
        const driverProfile = await driversService.getDriverProfile(user.id);
        // Verificar si el vehículo es 4x4 (opcional, ya no requerido)
        const is4x4 = driverProfile?.vehicle?.is4x4 || false;
        setVehicleIs4x4(is4x4);
      } catch (error) {
        console.error('Error verificando vehículo:', error);
        // No mostrar error al usuario, solo log
      }
    };
    
    checkVehicle();
  }, [user]);

  // Manejar cambio de disponibilidad
  const handleAvailabilityChange = async (newValue: boolean) => {
    if (!user) {
      Alert.alert('Error', 'Debes iniciar sesión para cambiar tu estado');
      return;
    }

    if (!coords) {
      Alert.alert('Error', 'No se pudo obtener tu ubicación');
      return;
    }

    setUpdatingStatus(true);
    try {
      const status = newValue ? 'available' : 'offline';
      await driversService.updateStatus(status, coords);
      setIsAvailable(newValue);
      setLastUpdate(new Date());
      console.log(`✅ Estado actualizado: ${status}`);
      
      // Si se desactiva disponibilidad, también desactivar modo conductor designado
      if (!newValue && isDesignatedDriverMode) {
        setIsDesignatedDriverMode(false);
        await driversService.updateDesignatedDriverMode(user.id, false);
        console.log('✅ Modo conductor designado desactivado automáticamente');
      }

      // Guardar estado en AsyncStorage para persistencia
      await driverAvailabilityService.saveAvailabilityState({
        isAvailable: newValue,
        isDesignatedDriverMode: newValue ? isDesignatedDriverMode : false,
        lastUpdate: new Date().toISOString(),
        coords: {
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
      });

      // Controlar heartbeat
      if (newValue) {
        driverAvailabilityService.startHeartbeat(coords);
      } else {
        driverAvailabilityService.stopHeartbeat();
        await driverAvailabilityService.clearAvailabilityState();
      }
      
      // Feedback visual
      if (newValue) {
        Alert.alert(
          '✅ Disponible', 
          'Ahora estás visible para los pasajeros.\n\nTu disponibilidad se mantendrá activa incluso si la app está en segundo plano.'
        );
      } else {
        console.log('📴 Ahora estás offline');
      }
    } catch (error: any) {
      console.error('❌ Error actualizando estado:', error.message);
      Alert.alert(
        'Error', 
        error.message || 'No se pudo actualizar tu estado. Por favor, intenta de nuevo.'
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Manejar cambio de modo conductor designado
  const handleDesignatedDriverModeChange = async (newValue: boolean) => {
    if (!isAvailable) {
      Alert.alert(
        'Activa tu disponibilidad',
        'Primero debes activar tu estado como disponible',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setUpdatingStatus(true);
      // Actualizar en Firebase Realtime DB
      if (user && coords) {
        await driversService.updateDesignatedDriverMode(user.id, newValue);
        setIsDesignatedDriverMode(newValue);

        // Guardar estado actualizado
        await driverAvailabilityService.saveAvailabilityState({
          isAvailable,
          isDesignatedDriverMode: newValue,
          lastUpdate: new Date().toISOString(),
          coords: {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        });
        
        if (newValue) {
          Alert.alert(
            '✅ Modo Conductor Designado Activado',
            'Ahora recibirás solicitudes de conductor designado (2 conductores por viaje)'
          );
        }
      }
    } catch (error: any) {
      console.error('Error actualizando modo:', error);
      Alert.alert('Error', 'No se pudo actualizar el modo');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Obtener dirección actual
  useEffect(() => {
    if (!coords) return;

    const fetchAddress = async () => {
      const address = await mapsService.reverseGeocode(coords);
      if (address) {
        setCurrentAddress(address);
      }
    };

    fetchAddress();
  }, [coords]);

  // Verificar si hay un viaje activo
  useEffect(() => {
    if (!user?.id) {
      console.log('⚠️ No hay user.id para verificar viajes activos');
      return;
    }

    console.log('👤 Conductor ID:', user.id);
    const db = getDatabase();
    const ridesRef = ref(db, 'activeRides');

    const unsubscribe = onValue(ridesRef, (snapshot) => {
      const data = snapshot.val();
      console.log('📦 Datos de activeRides:', data);
      
      if (data) {
        // Buscar viaje donde el conductor es el usuario actual
        const rides = Object.values(data) as any[];
        console.log('🔍 Total de viajes activos:', rides.length);
        
        const myActiveRide = rides.find(
          (ride: any) => {
            const match = ride.driverId === user.id && 
                         (ride.status === 'pending_confirm' || ride.status === 'accepted' || ride.status === 'in_progress');
            console.log(`🔍 Viaje ${ride.id}: status=${ride.status}, driverId=${ride.driverId}, match=${match}`);
            return match;
          }
        );
        
        if (myActiveRide) {
          console.log('✅ Viaje activo encontrado para conductor:', myActiveRide.id);
          setActiveRide(myActiveRide);
        } else {
          console.log('❌ No se encontró viaje activo para conductor');
          setActiveRide(null);
        }
      } else {
        console.log('⚠️ No hay datos en activeRides');
        setActiveRide(null);
      }
    });

    return () => off(ridesRef);
  }, [user?.id]);

  // Escuchar solicitudes de viaje disponibles para mostrar en el mapa
  useEffect(() => {
    const db = getDatabase();
    const ridesRef = ref(db, 'activeRides');

    const unsubscribe = onValue(ridesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Filtrar solo viajes con status 'requested' (disponibles)
        const rides = Object.values(data) as any[];
        const availableRides = rides
          .filter((ride: any) => ride.status === 'requested' && ride.origin)
          .map((ride: any) => ({
            id: ride.id,
            latitude: parseFloat(ride.origin.lat),
            longitude: parseFloat(ride.origin.lng),
            address: ride.origin.address,
            estimatedPrice: ride.estimatedPrice,
            passengers: ride.passengers,
            rideType: ride.rideType,
          }));

        console.log(`🗺️ ${availableRides.length} solicitudes disponibles para mostrar en mapa`);
        setAvailableRideRequests(availableRides);
      } else {
        setAvailableRideRequests([]);
      }
    });

    return () => off(ridesRef);
  }, []);

  // Escuchar cuando el cliente selecciona al conductor (oferta aceptada)
  useEffect(() => {
    if (!user?.id) return;

    const db = getDatabase();
    const ridesRef = ref(db, 'activeRides');

    const unsubscribe = onValue(ridesRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Buscar viajes donde este conductor fue seleccionado
      const rides = Object.values(data) as any[];
      const acceptedRide = rides.find((ride: any) => {
        // Verificar si este conductor fue seleccionado
        if (ride.driverId !== user.id || ride.status !== 'accepted') {
          return false;
        }
        
        // Buscar la oferta en 'offers' O 'driverOffers'
        const offerAccepted = 
          ride.offers?.[user.id]?.status === 'accepted' ||
          ride.driverOffers?.[user.id]?.status === 'accepted';
        
        return offerAccepted;
      });

      if (acceptedRide) {
        console.log('✅ Cliente te seleccionó! Navegando a ActiveRide...');
        
        // Mostrar alerta y navegar
        Alert.alert(
          '🎉 ¡Cliente Te Eligió!',
          `El cliente aceptó tu oferta de C$${acceptedRide.finalFare || acceptedRide.estimatedPrice}. Dirígete al punto de recogida.`,
          [{
            text: 'Ver Viaje',
            onPress: () => {
              navigation.navigate('ActiveRide', {
                rideId: acceptedRide.id,
              });
            }
          }]
        );
      }
    });

    return () => off(ridesRef);
  }, [user?.id]);

  // Obtener solicitudes de viaje disponibles
  useEffect(() => {
    if (!coords || !isAvailable) {
      setRideRequests([]);
      return;
    }

    let isMounted = true;

    const fetchRideRequests = async () => {
      try {
        const rides = await ridesService.getAvailableRides(
          coords.latitude,
          coords.longitude,
          15 // 15 km de radio (mayor cobertura en Nicaragua)
        );
        if (isMounted) {
          if (rides && rides.length > 0) {
            console.log('✅ Viajes disponibles:', rides.length);
            setRideRequests(rides);
          } else {
            setRideRequests([]);
          }
          setLastUpdate(new Date());
        }
      } catch (error: any) {
        if (isMounted) {
          // Silenciar completamente error 404 (no hay viajes disponibles)
          if (error.response?.status !== 404) {
            console.error('❌ Error buscando viajes:', error.message);
          }
          setRideRequests([]);
        }
      }
    };

    fetchRideRequests();
    const interval = setInterval(fetchRideRequests, 30000); // Cada 30 segundos (reducido de 10s)

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [coords, isAvailable]);

  if (locationLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Obteniendo ubicación...</Text>
      </View>
    );
  }

  if (error || !coords) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>❌ {error || 'No se pudo obtener la ubicación'}</Text>
        <TouchableOpacity onPress={refreshLocation} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header flotante más pequeño */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Conductor</Text>
          {/* Solo botón de Perfil */}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.headerButtonText}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Botones de navegación con SOS */}
      <View style={styles.navButtonsContainer}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Earnings')}
        >
          <Text style={styles.navButtonIcon}>💰</Text>
          <Text style={styles.navButtonText}>Ganancias</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('RideHistory')}
        >
          <Text style={styles.navButtonIcon}>📋</Text>
          <Text style={styles.navButtonText}>Historial</Text>
        </TouchableOpacity>
        {/* Botón SOS */}
        <TouchableOpacity 
          style={styles.sosButtonNav}
          onPress={() => setShowEmergencyModal(true)}
        >
          <Text style={styles.sosButtonText}>SOS</Text>
        </TouchableOpacity>
      </View>

      {/* Ubicación actual - Translúcida debajo de navegación */}
      <View style={styles.locationBanner}>
        <Text style={styles.locationIcon}>📍</Text>
        <Text style={styles.locationText} numberOfLines={1}>
          {currentAddress || 'Obteniendo ubicación...'}
        </Text>
      </View>

      {/* Botón de Viaje Activo */}
      {activeRide && (
        <TouchableOpacity
          style={styles.activeRideButton}
          onPress={() => navigation.navigate('ActiveRide', { rideId: activeRide.id })}
        >
          <Text style={styles.activeRideButtonText}>
            {activeRide.status === 'pending_confirm' 
              ? '⏳ Ver Estado del Viaje' 
              : '🚗 Regresar a Viaje Activo'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Mapa */}
      <DynamicMap
        latitude={coords.latitude}
        longitude={coords.longitude}
        style={styles.map}
        showMarker={true}
        markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
        markerType="car"
        rideRequests={availableRideRequests}
        onRideRequestPress={(rideRequest) => {
          console.log('🚗 Viaje seleccionado desde mapa:', rideRequest);
          navigation.navigate('AvailableRides');
        }}
      />

      {/* Panel de información deslizable */}
      <Animated.View style={[styles.infoPanel, { height: panelHeight }]}>
        {/* Indicador de arrastre */}
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
                {updatingStatus && (
                  <Text style={styles.updatingText}>Actualizando...</Text>
                )}
              </View>
              <Switch
                value={isAvailable}
                onValueChange={handleAvailabilityChange}
                trackColor={{ false: '#ccc', true: '#4CAF50' }}
                thumbColor={isAvailable ? '#fff' : '#f4f3f4'}
                disabled={updatingStatus}
              />
            </View>
            {isAvailable && (
              <View>
                <Text style={styles.availabilitySubtext}>
                  Estás visible para los pasajeros
                </Text>
                <Text style={styles.lastUpdateText}>
                  Última actualización: {lastUpdate ? safeFormatTime(lastUpdate.toISOString()) : 'N/A'}
                </Text>
              </View>
            )}
          </View>

          {/* Modo Conductor Designado */}
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.availabilityTitle}>
                  {isDesignatedDriverMode ? '👨‍✈️ Modo Conductor Designado' : '🚗 Modo Normal'}
                </Text>
                <Text style={styles.availabilitySubtext}>
                  {isDesignatedDriverMode 
                    ? 'Recibirás solicitudes de conductor designado (2 conductores)'
                    : 'Solo viajes normales'}
                </Text>
              </View>
              <Switch
                value={isDesignatedDriverMode}
                onValueChange={handleDesignatedDriverModeChange}
                trackColor={{ false: '#ccc', true: '#FF9800' }}
                thumbColor={isDesignatedDriverMode ? '#fff' : '#f4f3f4'}
                disabled={updatingStatus || !isAvailable}
              />
            </View>
          </View>

          {/* Estadísticas del día */}
          <View style={styles.statsCard}>
            <Text style={styles.cardTitle}>📊 Hoy</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{todayStats.trips}</Text>
                <Text style={styles.statLabel}>Viajes</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>C${todayStats.earnings}</Text>
                <Text style={styles.statLabel}>Ganancias</Text>
              </View>
            </View>
          </View>

          {/* Estado del conductor */}
          {isAvailable && (
            <AnimatedCard delay={100}>
              <View style={styles.statusCard}>
                <View style={styles.statusHeader}>
                  <View style={styles.statusIconContainer}>
                    <Text style={styles.statusIcon}>🚗</Text>
                  </View>
                  <View style={styles.statusInfo}>
                    <Text style={styles.statusTitle}>Estado</Text>
                    <Text style={styles.statusSubtitle}>
                      Estás visible para los pasajeros cercanos
                    </Text>
                  </View>
                </View>
                
                {rideRequests.length > 0 && (
                  <View style={styles.requestsBadge}>
                    <Text style={styles.requestsBadgeText}>
                      {rideRequests.length} viaje{rideRequests.length > 1 ? 's' : ''} disponible{rideRequests.length > 1 ? 's' : ''}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.viewRidesButton}
                  onPress={() => navigation.navigate('AvailableRides')}
                >
                  <Text style={styles.viewRidesButtonText}>
                    Ver Viajes Disponibles
                  </Text>
                  <Text style={styles.viewRidesButtonIcon}>→</Text>
                </TouchableOpacity>
              </View>
            </AnimatedCard>
          )}

          {/* Solicitudes de viaje */}
          {isAvailable && rideRequests.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🚕 Viajes Disponibles</Text>
              {rideRequests.map((request, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.requestCard}
                  onPress={() => navigation.navigate('AvailableRides')}
                >
                  <Text style={styles.requestText}>
                    {request.origin?.address || 'Origen'} → {request.destination?.address || 'Destino'}
                  </Text>
                  <Text style={styles.requestPrice}>C${request.estimatedPrice || 0}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => navigation.navigate('AvailableRides')}
              >
                <Text style={styles.viewAllText}>Ver todos los viajes</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Modal de Emergencia */}
      <Modal
        visible={showEmergencyModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEmergencyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.emergencyModal}>
            {/* Header del Modal */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>🆘</Text>
              <Text style={styles.modalTitle}>Emergencia</Text>
              <Text style={styles.modalSubtitle}>Selecciona el servicio que necesitas</Text>
            </View>

            {/* Botones de Emergencia */}
            <View style={styles.emergencyOptions}>
              {/* Policía */}
              <TouchableOpacity
                style={[styles.emergencyOption, styles.policeOption]}
                onPress={() => {
                  setShowEmergencyModal(false);
                  Linking.openURL('tel:118');
                }}
              >
                <View style={styles.optionIconContainer}>
                  <Text style={styles.optionIcon}>🚓</Text>
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Policía Nacional</Text>
                  <Text style={styles.optionNumber}>118</Text>
                  <Text style={styles.optionDescription}>Emergencias policiales</Text>
                </View>
              </TouchableOpacity>

              {/* Ambulancia */}
              <TouchableOpacity
                style={[styles.emergencyOption, styles.ambulanceOption]}
                onPress={() => {
                  setShowEmergencyModal(false);
                  Linking.openURL('tel:102');
                }}
              >
                <View style={styles.optionIconContainer}>
                  <Text style={styles.optionIcon}>🚑</Text>
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Central de Ambulancias</Text>
                  <Text style={styles.optionNumber}>102</Text>
                  <Text style={styles.optionDescription}>Emergencias médicas</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Botón Cancelar */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowEmergencyModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.card,
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.5,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  headerButtonText: {
    fontSize: 22,
  },
  sosButton: {
    backgroundColor: '#FF1744',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#FF1744',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  sosButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  navButtonsContainer: {
    position: 'absolute',
    top: 75,
    left: 16,
    right: 16,
    zIndex: 9,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navButton: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    minWidth: 60,
  },
  navButtonIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  navButtonText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  sosButtonNav: {
    backgroundColor: '#FF1744',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    shadowColor: '#FF1744',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
    minWidth: 60,
    alignItems: 'center',
  },
  locationBanner: {
    position: 'absolute',
    top: 165,
    left: 16,
    right: 16,
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  locationIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  activeRideButton: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  activeRideButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  map: {
    height: '40%',
  },
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dragIndicator: {
    width: 40,
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 3,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.card,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  availabilityCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  availabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  availabilitySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  updatingText: {
    fontSize: 12,
    color: '#2196F3',
    marginTop: 4,
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statDivider: {
    width: 2,
    height: 50,
    backgroundColor: colors.border,
    marginHorizontal: 20,
    borderRadius: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  addressText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  requestsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  requestText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  requestPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  viewAllButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  viewAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emergencyButton: {
    backgroundColor: '#FF1744',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    shadowColor: '#FF1744',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  emergencyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Estilos del Modal de Emergencia
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emergencyModal: {
    backgroundColor: colors.card,
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emergencyOptions: {
    gap: 16,
    marginBottom: 20,
  },
  emergencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  policeOption: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1976D2',
  },
  ambulanceOption: {
    backgroundColor: '#FFF3E0',
    borderColor: '#F57C00',
  },
  optionIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionIcon: {
    fontSize: 32,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  optionNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
  },
  cancelButton: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  // Nuevos estilos para la card de Estado mejorada
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusIcon: {
    fontSize: 28,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  requestsBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  requestsBadgeText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  viewRidesButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  viewRidesButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginRight: 8,
  },
  viewRidesButtonIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
  },
});
