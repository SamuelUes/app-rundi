import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { MapSkeleton } from '../../components/SkeletonLoader';
import { AnimatedButton } from '../../components/AnimatedButton';
import DynamicMap from '../../components/DynamicMap';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useRouteTracking } from '../../hooks/useRouteTracking';
import ETADisplay from '../../components/ETADisplay';
import DeviationAlert from '../../components/DeviationAlert';
import { RideProgressIndicator } from '../../components/RideProgressIndicator';
import ridesService from '../../services/ridesService';
import mapsService from '../../services/mapsService';
import firebaseTrackingService from '../../services/firebaseTrackingService';
import { getDatabase, ref, onValue, off } from 'firebase/database';

export default function ActiveRideScreen({ route, navigation }: any) {
  const { rideId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { coords } = useLocation();
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [rideStartTime, setRideStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [expectedRoute, setExpectedRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rideProgress, setRideProgress] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'stripe'>('cash');

  // Calcular valores constantes
  const isPendingConfirm = ride?.status === 'pending_confirm';
  const isAccepted = ride?.status === 'accepted';
  const isInProgress = ride?.status === 'in_progress';

  // Timer del viaje
  useEffect(() => {
    if (!rideStartTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - rideStartTime.getTime()) / 1000);
      setElapsedTime(diff);
    }, 1000);

    return () => clearInterval(timer);
  }, [rideStartTime]);

  // Calcular ruta esperada del conductor
  useEffect(() => {
    const calculateRoute = async () => {
      // Normalizar coordenadas del destino
      const destLat = ride?.destination?.latitude || ride?.destination?.lat;
      const destLng = ride?.destination?.longitude || ride?.destination?.lng;
      
      if (!coords?.latitude || !coords?.longitude || !destLat || !destLng) {
        console.log('⏸️ No se puede calcular ruta - faltan coordenadas');
        return;
      }

      try {
        console.log('🛣️ Calculando ruta para viaje activo...');
        console.log('📍 Origen (conductor):', coords.latitude, coords.longitude);
        console.log('🎯 Destino:', destLat, destLng);

        let combinedRoute: Array<{ latitude: number; longitude: number }> = [];

        // Normalizar coordenadas del origen
        const originLat = ride.origin?.latitude || ride.origin?.lat;
        const originLng = ride.origin?.longitude || ride.origin?.lng;

        // Si el viaje está accepted pero no iniciado, calcular ruta completa conductor → origen → destino
        if (isAccepted && originLat && originLng) {
          console.log('📍 Origen del viaje (punto de recogida):', originLat, originLng);
          console.log('🛣️ Calculando ruta completa: Conductor → Origen → Destino');
          
          // Ruta 1: Conductor → Origen (punto de recogida)
          const route1 = await mapsService.getDirections(
            { latitude: coords.latitude, longitude: coords.longitude },
            { latitude: originLat, longitude: originLng }
          );
          
          // Ruta 2: Origen → Destino
          const route2 = await mapsService.getDirections(
            { latitude: originLat, longitude: originLng },
            { latitude: destLat, longitude: destLng }
          );
          
          // Combinar ambas rutas
          combinedRoute = [
            ...(route1?.polyline || []),
            ...(route2?.polyline || [])
          ];
          
          console.log('✅ Ruta completa calculada:', combinedRoute.length, 'puntos');
        } else {
          // Viaje in_progress: solo calcular ruta conductor → destino
          console.log('🛣️ Calculando ruta: Conductor → Destino');
          const route = await mapsService.getDirections(
            { latitude: coords.latitude, longitude: coords.longitude },
            { latitude: destLat, longitude: destLng }
          );
          
          combinedRoute = route?.polyline || [];
          console.log('✅ Ruta calculada:', combinedRoute.length, 'puntos');
        }

        if (combinedRoute.length > 0) {
          setExpectedRoute(combinedRoute);
        } else {
          console.log('❌ No se pudo calcular ruta, usando línea recta');
          setExpectedRoute([
            { latitude: coords.latitude, longitude: coords.longitude },
            { latitude: destLat, longitude: destLng }
          ]);
        }
      } catch (error) {
        console.error('❌ Error calculando ruta para viaje activo:', error);
        // Fallback: línea recta
        setExpectedRoute([
          { latitude: coords.latitude, longitude: coords.longitude },
          { latitude: destLat, longitude: destLng }
        ]);
      }
    };

    calculateRoute();
  }, [ride?.destination, coords, isAccepted]);

  // Hook de tracking automático
  const { isTracking, totalPoints } = useRouteTracking({
    rideId,
    isActive: ride?.status === 'in_progress',
    interval: 5000, // Guardar cada 5 segundos
  });

  // Calcular progreso del viaje
  useEffect(() => {
    if (!ride || !coords || ride.status !== 'in_progress') {
      setRideProgress(0);
      return;
    }

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371e3; // Radio de la Tierra en metros
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c; // Distancia en metros
    };

    const calculateProgress = () => {
      const destLat = parseFloat(ride.destination?.lat || ride.destination?.latitude || 0);
      const destLng = parseFloat(ride.destination?.lng || ride.destination?.longitude || 0);
      const estimatedDistance = ride.estimatedDistance || 0;

      if (!destLat || !destLng || !estimatedDistance) {
        return 0;
      }

      // Calcular distancia restante al destino
      const remainingDistance = calculateDistance(
        coords.latitude,
        coords.longitude,
        destLat,
        destLng
      );

      // Calcular distancia recorrida
      const traveledDistance = estimatedDistance - remainingDistance;

      // Calcular porcentaje
      const progress = (traveledDistance / estimatedDistance) * 100;

      // Limitar entre 0 y 100
      const finalProgress = Math.min(Math.max(progress, 0), 100);
      
      console.log('📊 [CONDUCTOR] Progreso calculado:', {
        estimatedDistance,
        remainingDistance,
        traveledDistance,
        progress,
        finalProgress
      });
      
      return finalProgress;
    };

    const progress = calculateProgress();
    setRideProgress(progress);
  }, [coords, ride]);

  // Listener en tiempo real para el viaje activo
  useEffect(() => {
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);
    
    const unsubscribe = onValue(rideRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log('🔥 Datos del viaje actualizados desde Firebase:', data);
        setRide(data);
        setLoading(false);
        
        // Obtener método de pago desde paymentStatus
        try {
          const paymentStatusRef = ref(db, `paymentStatus/${rideId}`);
          const paymentSnapshot = await import('firebase/database').then(({ get }) => get(paymentStatusRef));
          const paymentData = paymentSnapshot.val();
          
          if (paymentData?.method) {
            console.log('💳 Método de pago desde paymentStatus:', paymentData.method);
            setPaymentMethod(paymentData.method);
          } else {
            console.log('💳 No hay método de pago en paymentStatus, usando default: cash');
            setPaymentMethod('cash');
          }
        } catch (error) {
          console.log('⚠️ Error leyendo paymentStatus, usando default: cash');
          setPaymentMethod('cash');
        }

        // Si el viaje fue cancelado o completado, volver atrás
        if (data.status === 'canceled' || data.status === 'completed') {
          Alert.alert(
            'Viaje Finalizado',
            `El viaje ha sido ${data.status === 'canceled' ? 'cancelado' : 'completado'}`,
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }
      } else {
        console.log('❌ No hay datos del viaje en Firebase');
        setLoadError('No se encontró el viaje');
        setLoading(false);
      }
    });
    
    return () => {
      off(rideRef);
    };
  }, [rideId]);

  // Listener para detectar cuando el cliente confirma el viaje
  useEffect(() => {
    if (!ride || ride.status !== 'pending_confirm') return;

    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);
    
    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.status === 'accepted') {
        // El cliente confirmó el viaje
        Alert.alert(
          '✅ Cliente Confirmó',
          'El cliente aceptó el viaje. Dirígete al punto de recogida.',
          [{ text: 'OK' }]
        );
      }
    });

    return () => off(rideRef);
  }, [ride?.status, rideId]);

  // Timer del viaje
  useEffect(() => {
    if (!rideStartTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - rideStartTime.getTime()) / 1000);
      setElapsedTime(diff);
    }, 1000);

    return () => clearInterval(timer);
  }, [rideStartTime]);


  const handleStartRide = async () => {
    try {
      setUpdating(true);
      await ridesService.updateRideStatus(rideId, 'in_progress');
      setRideStartTime(new Date());
      Alert.alert('¡Viaje Iniciado!', 'El viaje ha comenzado');
      // Firebase listener actualizará automáticamente
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'No se pudo iniciar el viaje');
    } finally {
      setUpdating(false);
    }
  };

  const handleCompleteRide = async () => {
    Alert.alert(
      'Completar Viaje',
      '¿Has llegado al destino?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, completar',
          onPress: async () => {
            try {
              setUpdating(true);
              
              // Calcular datos del viaje completado
              const finalFare = ride?.finalFare || ride?.estimatedPrice || 0;
              const actualDistance = ride?.estimatedDistance || 0;
              const actualDuration = ride?.estimatedDuration || 0;
              
              await ridesService.updateRideStatus(rideId, 'completed', {
                finalFare,
                actualDistance,
                actualDuration,
              });
              
              // Escuchar paymentStatus para navegar según método de pago
              const { getDatabase, ref: dbRef, onValue } = await import('firebase/database');
              const { initializeFirebase } = await import('../../config/firebase');
              
              const { app } = await initializeFirebase();
              if (!app) {
                navigation.goBack();
                return;
              }
              
              const db = getDatabase(app);
              const paymentStatusRef = dbRef(db, `paymentStatus/${rideId}`);
              
              const unsubscribe = onValue(paymentStatusRef, (snapshot) => {
                const paymentData = snapshot.val();
                
                if (paymentData) {
                  const { method, status } = paymentData;
                  
                  // Navegar según método de pago
                  if (method === 'cash' && (status === 'pending_confirmation' || status === 'pending_cash_payment')) {
                    unsubscribe();
                    navigation.replace('ConfirmCashPayment', {
                      rideId,
                      amount: finalFare,
                      tip: paymentData.tip || 0,
                      clientName: ride?.client?.name || 'Cliente',
                    });
                  } else if ((method === 'card' || method === 'stripe') && status === 'pending_capture') {
                    unsubscribe();
                    navigation.replace('WaitingPayment', {
                      rideId,
                      amount: finalFare,
                      clientName: ride?.client?.name || 'Cliente',
                    });
                  }
                }
              });
              
              // Timeout de seguridad (10 segundos)
              setTimeout(() => {
                unsubscribe();
                Alert.alert(
                  '¡Viaje Completado!',
                  'El cliente realizará el pago. Puedes continuar con otros viajes.',
                  [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
                );
              }, 10000);
            } catch (error: any) {
              console.error('Error completando viaje:', error);
              Alert.alert('Error', error.message || 'No se pudo completar el viaje');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelRide = () => {
    Alert.alert(
      'Cancelar Viaje',
      '¿Estás seguro que deseas cancelar este viaje?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              setUpdating(true);
              await ridesService.cancelRide(rideId, 'Cancelado por el conductor');
              Alert.alert(
                'Viaje Cancelado',
                'El viaje ha sido cancelado',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'No se pudo cancelar el viaje');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenChat = () => {
    navigation.navigate('Chat', {
      rideId,
      otherUserName: ride?.client?.name || 'Cliente',
      otherUserPhone: ride?.client?.phone || null,
    });
  };

  const handleCallClient = () => {
    if (!ride?.client?.phone) {
      Alert.alert('Error', 'No hay número de teléfono disponible');
      return;
    }

    const phoneUrl = `tel:${ride.client.phone}`;
    Linking.canOpenURL(phoneUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(phoneUrl);
        } else {
          Alert.alert('Error', 'No se puede realizar la llamada');
        }
      })
      .catch((err) => console.error('Error al llamar:', err));
  };

  const handleNavigate = () => {
    console.log('🧭 Intentando navegar. Ride object completo:', JSON.stringify(ride, null, 2));

    if (!coords || !coords.latitude || !coords.longitude) {
      console.log('❌ Error: Ubicación actual del conductor no disponible');
      Alert.alert('Error', 'No se puede determinar tu ubicación actual. Verifica que el GPS esté activado.');
      return;
    }

    // Determinar el destino basado en el estado del viaje
    let destination;
    let navigationMessage;

    if (isAccepted) {
      // Viaje aceptado pero no iniciado: navegar al ORIGEN del viaje
      destination = ride.origin;
      navigationMessage = 'Ruta desde tu ubicación actual hasta el punto de recogida del cliente';
    } else if (isInProgress) {
      // Viaje en progreso: navegar al DESTINO del viaje
      destination = ride.destination;
      navigationMessage = 'Ruta desde tu ubicación actual hasta el destino final';
    } else {
      console.log('❌ Error: Estado del viaje inválido para navegación');
      Alert.alert('Error', 'El estado del viaje no permite navegación GPS.');
      return;
    }

    // Normalizar coordenadas (puede venir como lat/lng o latitude/longitude)
    const destLat = destination?.latitude || destination?.lat;
    const destLng = destination?.longitude || destination?.lng;

    if (!destination || !destLat || !destLng) {
      console.log('❌ Error: Destino no válido:', destination);
      Alert.alert('Error', 'Información de destino incompleta.');
      return;
    }

    const currentLat = coords.latitude;
    const currentLng = coords.longitude;

    // Determinar el destino final y waypoints basado en el estado del viaje
    let finalDestination;
    let waypoints = '';
    let routeDescription = '';

    if (isAccepted) {
      // Viaje aceptado: ruta desde ubicación actual → origen del viaje → destino del viaje
      finalDestination = ride.destination; // Destino final del viaje
      waypoints = `${destLat},${destLng}`; // Origen del viaje como waypoint
      routeDescription = `Ruta completa: Tu ubicación → Punto de recogida → Destino final`;
    } else if (isInProgress) {
      // Viaje en progreso: ruta desde ubicación actual → destino del viaje
      finalDestination = ride.destination;
      waypoints = '';
      routeDescription = `Ruta desde tu ubicación actual hasta el destino final`;
    } else {
      console.log('❌ Error: Estado del viaje inválido para navegación');
      Alert.alert('Error', 'El estado del viaje no permite navegación GPS.');
      return;
    }

    // Normalizar coordenadas del destino final
    const finalDestLat = finalDestination?.latitude || finalDestination?.lat;
    const finalDestLng = finalDestination?.longitude || finalDestination?.lng;

    console.log('📍 Coordenadas finales:', {
      currentLat,
      currentLng,
      waypointLat: isAccepted ? destLat : null,
      waypointLng: isAccepted ? destLng : null,
      finalDestLat,
      finalDestLng,
      destinationType: isAccepted ? 'viaje accepted con waypoint' : 'viaje in_progress'
    });

    // Validar coordenadas del destino final
    if (!finalDestLat || !finalDestLng || !currentLat || !currentLng) {
      console.log('❌ Coordenadas inválidas:', { currentLat, currentLng, finalDestLat, finalDestLng });
      Alert.alert('Error', 'Coordenadas inválidas para navegación');
      return;
    }

    console.log('✅ Coordenadas válidas, procediendo con navegación');

    // Agregar paradas adicionales si existen
    if (ride.extraDestinations && ride.extraDestinations.length > 0) {
      const extraWaypoints = ride.extraDestinations
        .map((stop: any) => `${stop.lat},${stop.lng}`)
        .join('|');
      waypoints = waypoints ? `${waypoints}|${extraWaypoints}` : extraWaypoints;
    }

    const stopsText = ride.extraDestinations && ride.extraDestinations.length > 0
      ? `\n\n📍 Paradas adicionales: ${ride.extraDestinations.length}`
      : '';

    Alert.alert(
      'Navegar con GPS',
      `${routeDescription}${stopsText}`,
      [
        {
          text: '🗺️ Google Maps',
          onPress: () => {
            // URL para Google Maps: desde ubicación actual hasta destino (con waypoints si es viaje accepted)
            const url = Platform.select({
              ios: `comgooglemaps://?saddr=${currentLat},${currentLng}&daddr=${finalDestLat},${finalDestLng}${waypoints ? `&waypoints=${waypoints}` : ''}&directionsmode=driving`,
              android: `google.navigation:q=${finalDestLat},${finalDestLng}${waypoints ? `&waypoints=${waypoints}` : ''}&mode=d`,
            });

            const fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentLat},${currentLng}&destination=${finalDestLat},${finalDestLng}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;

            console.log('🗺️ URLs generadas:', { url, fallbackUrl, waypoints });

            Linking.canOpenURL(url || fallbackUrl).then((supported) => {
              console.log('📱 App soportada:', supported);
              Linking.openURL(supported && url ? url : fallbackUrl);
            });
          },
        },
        {
          text: '🚗 Waze',
          onPress: () => {
            // Waze no soporta waypoints, solo destino final
            const url = `waze://?ll=${finalDestLat},${finalDestLng}&navigate=yes`;
            console.log('🚗 Waze URL:', url);
            Linking.canOpenURL(url).then((supported) => {
              if (supported) {
                Linking.openURL(url);
              } else {
                Linking.openURL(`https://www.waze.com/ul?ll=${finalDestLat},${finalDestLng}&navigate=yes`);
              }
            });
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || !ride) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>
          {loading ? 'Cargando detalles...' : 'Esperando datos del viaje...'}
        </Text>
        {loadError && (
          <Text style={[styles.loadingText, { color: '#f44336', marginTop: 10 }]}>
            {loadError}
          </Text>
        )}
      </View>
    );
  }

  // Validar que el ride tenga las propiedades necesarias
  if (!ride.origin || !ride.destination) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.loadingText, { color: '#f44336' }]}>
          Error: El viaje no tiene información completa de origen o destino.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 20 }]}
          onPress={() => {
            setLoadError(null);
            setLoading(true);
            // Firebase listener reintentará automáticamente
          }}
        >
          <Text style={styles.primaryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Pantalla de espera cuando está pending_confirm
  if (isPendingConfirm) {
    return (
      <View style={styles.container}>
        <View style={styles.waitingContainer}>
          <Text style={styles.waitingIcon}>⏳</Text>
          <Text style={styles.waitingTitle}>Esperando Confirmación</Text>
          <Text style={styles.waitingText}>
            El cliente está revisando tu oferta.{'\n'}
            Te notificaremos cuando confirme el viaje.
          </Text>
          
          <View style={styles.waitingCard}>
            <Text style={styles.waitingCardTitle}>📍 Detalles del Viaje</Text>
            <View style={styles.waitingDetail}>
              <Text style={styles.waitingDetailLabel}>Origen:</Text>
              <Text style={styles.waitingDetailValue}>{ride?.origin?.address || 'N/A'}</Text>
            </View>
            <View style={styles.waitingDetail}>
              <Text style={styles.waitingDetailLabel}>Destino:</Text>
              <Text style={styles.waitingDetailValue}>{ride?.destination?.address || 'N/A'}</Text>
            </View>
            <View style={styles.waitingDetail}>
              <Text style={styles.waitingDetailLabel}>Precio:</Text>
              <Text style={styles.waitingDetailValue}>C${ride?.finalFare || ride?.estimatedPrice || 0}</Text>
            </View>
          </View>

          {/* Nota informativa en lugar del botón */}
          <View style={styles.infoNote}>
            <Text style={styles.infoNoteText}>
              💡 Permanece en esta pantalla hasta que el cliente confirme o rechace tu oferta.
            </Text>
          </View> 
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mapa */}
      {coords && ride && (
        <View style={styles.mapContainer}>
          <DynamicMap
            latitude={coords.latitude}
            longitude={coords.longitude}
            style={styles.map}
            showMarker={true}
            markerPosition={coords}
            markerType="car"
            originMarker={ride.origin ? { 
              latitude: ride.origin.latitude || ride.origin.lat, 
              longitude: ride.origin.longitude || ride.origin.lng 
            } : undefined}
            clientMarker={ride.origin ? { 
              latitude: ride.origin.latitude || ride.origin.lat, 
              longitude: ride.origin.longitude || ride.origin.lng 
            } : undefined}
            routeCoordinates={expectedRoute.length > 0 ? expectedRoute : (
              (ride?.destination?.latitude || ride?.destination?.lat) && (ride?.destination?.longitude || ride?.destination?.lng) && coords ? (
                isAccepted && (ride?.origin?.latitude || ride?.origin?.lat) && (ride?.origin?.longitude || ride?.origin?.lng) ? [
                  { latitude: coords.latitude, longitude: coords.longitude }, // Ubicación conductor
                  { latitude: ride.origin.latitude || ride.origin.lat, longitude: ride.origin.longitude || ride.origin.lng }, // Origen del viaje
                  { latitude: ride.destination.latitude || ride.destination.lat, longitude: ride.destination.longitude || ride.destination.lng } // Destino del viaje
                ] : [
                  { latitude: coords.latitude, longitude: coords.longitude }, // Ubicación conductor
                  { latitude: ride.destination.latitude || ride.destination.lat, longitude: ride.destination.longitude || ride.destination.lng } // Destino del viaje
                ]
              ) : undefined
            )}
          />
        </View>
      )}

      <ScrollView style={styles.content}>
        {/* Header con botón de regreso */}
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Atrás</Text>
          </TouchableOpacity>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Viaje Activo</Text>
              {isInProgress && rideStartTime && (
                <Text style={styles.timerText}>
                  ⏱️ Tiempo: {formatTime(elapsedTime)}
                </Text>
              )}
            </View>
            <View style={[styles.statusBadge, isInProgress ? styles.statusInProgress : styles.statusAccepted]}>
              <Text style={styles.statusText}>
                {isInProgress ? 'En Progreso' : 'Aceptado'}
              </Text>
            </View>
          </View>
        </View>

      {/* Detalles del viaje */}
      <View style={styles.detailsContainer}>
        <View style={styles.locationContainer}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔵</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Origen</Text>
              <Text style={styles.locationAddress}>
                {ride.origin?.address || 'Dirección no disponible'}
              </Text>
            </View>
          </View>

          <View style={styles.locationDivider} />

          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔴</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Destino</Text>
              <Text style={styles.locationAddress}>
                {ride.destination?.address || 'Dirección no disponible'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>📏 Distancia</Text>
            <Text style={styles.infoValue}>
              {ride.estimatedDistance 
                ? (ride.estimatedDistance / 1000).toFixed(1) 
                : (ride.distance 
                  ? (ride.distance / 1000).toFixed(1) 
                  : '0.0')} km
            </Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>⏱️ Duración</Text>
            <Text style={styles.infoValue}>
              {ride.estimatedDuration 
                ? Math.round(ride.estimatedDuration / 60) 
                : '0'} min
            </Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>💰 Precio</Text>
            <Text style={styles.infoValue}>C${ride.estimatedPrice || 0}</Text>
          </View>
        </View>

        {/* Info del cliente */}
        {ride.client && (
          <View style={styles.clientInfo}>
            <Text style={styles.clientLabel}>Cliente:</Text>
            <Text style={styles.clientName}>{ride.client.name}</Text>
          </View>
        )}

        {/* ETA Display - Solo cuando el viaje está en progreso */}
        {isInProgress && coords && (
          <ETADisplay
            rideId={rideId}
            currentLat={coords.latitude}
            currentLng={coords.longitude}
            updateInterval={30000}
            useRealtime={true}
          />
        )}

        {/* Indicador de Progreso del Viaje */}
        <RideProgressIndicator
          progress={rideProgress}
          role="driver"
          rideStatus={ride?.status || ''}
          estimatedFare={ride?.finalFare || ride?.estimatedPrice || 0}
          paymentMethod={paymentMethod}
        />

        {/* Alerta de Desvío */}
        {isInProgress && coords && expectedRoute.length > 0 && (
          <DeviationAlert
            currentLat={coords.latitude}
            currentLng={coords.longitude}
            expectedRoute={expectedRoute}
            threshold={500}
            onDeviation={(distance) => {
              console.log(`⚠️ Desvío detectado: ${distance}m`);
            }}
          />
        )}

        {/* Tracking Status */}
        {isInProgress && (
          <View style={styles.trackingInfo}>
            <Text style={styles.trackingText}>
              {isTracking ? '🟢' : '⚪'} Tracking: {isTracking ? 'Activo' : 'Inactivo'}
            </Text>
            <Text style={styles.trackingPoints}>
              📍 {totalPoints} puntos guardados
            </Text>
          </View>
        )}

        {/* Advertencia de auto-cancelación */}
        {isAccepted && (
          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>⏰</Text>
            <Text style={styles.warningText}>
              Debes iniciar el viaje en los próximos 10 minutos o se cancelará automáticamente
            </Text>
          </View>
        )}
      </View>

      {/* Botones de acción */}
      <View style={styles.actionsContainer}>
        {/* Botones de llamada y navegación */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleCallClient}
          >
            <Text style={styles.quickActionIcon}>📞</Text>
            <Text style={styles.quickActionText}>Llamar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleNavigate}
          >
            <Text style={styles.quickActionIcon}>🧭</Text>
            <Text style={styles.quickActionText}>Navegar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleOpenChat}
          >
            <Text style={styles.quickActionIcon}>💬</Text>
            <Text style={styles.quickActionText}>Chat</Text>
          </TouchableOpacity>
        </View>
        {isAccepted && (
          <TouchableOpacity
            style={[styles.primaryButton, updating && styles.buttonDisabled]}
            onPress={handleStartRide}
            disabled={updating}
          >
            <Text style={styles.primaryButtonText}>
              {updating ? 'Iniciando...' : '🚗 Iniciar Viaje'}
            </Text>
          </TouchableOpacity>
        )}

        {isInProgress && (
          <TouchableOpacity
            style={[styles.primaryButton, updating && styles.buttonDisabled]}
            onPress={handleCompleteRide}
            disabled={updating}
          >
            <Text style={styles.primaryButtonText}>
              {updating ? 'Completando...' : '✅ Completar Viaje'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.cancelButton, updating && styles.buttonDisabled]}
          onPress={handleCancelRide}
          disabled={updating}
        >
          <Text style={styles.cancelButtonText}>Cancelar Viaje</Text>
        </TouchableOpacity>

        {/* Info de pago */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            💳 El cliente realizará el pago al finalizar el viaje
          </Text>
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    backgroundColor: colors.card,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusAccepted: {
    backgroundColor: '#FFA726',
  },
  statusInProgress: {
    backgroundColor: '#2196F3',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  detailsContainer: {
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationContainer: {
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  locationDivider: {
    height: 20,
    width: 2,
    backgroundColor: '#e0e0e0',
    marginLeft: 10,
    marginVertical: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  infoCard: {
    alignItems: 'center',
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  clientLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 8,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#E65100',
    lineHeight: 18,
  },
  trackingInfo: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  trackingPoints: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionsContainer: {
    padding: 16,
  },
  primaryButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  chatButton: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  chatButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cancelButton: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ff4444',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  footer: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    alignItems: 'center',
    marginTop: 16,
    borderRadius: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
  },
  // Nuevos estilos
  mapContainer: {
    height: 250,
  },
  map: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  waitingIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  waitingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  waitingText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  waitingCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  waitingCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  waitingDetail: {
    marginBottom: 12,
  },
  waitingDetailLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  waitingDetailValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  infoNote: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoNoteText: {
    fontSize: 14,
    color: '#1976D2',
    textAlign: 'center',
    lineHeight: 20,
  },
  timerText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  headerContainer: {
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
