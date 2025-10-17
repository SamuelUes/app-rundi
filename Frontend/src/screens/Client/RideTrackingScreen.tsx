import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
  Linking,
  Image,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { MapSkeleton } from '../../components/SkeletonLoader';
import { NoConnectionEmptyState } from '../../components/EmptyState';
import DynamicMap from '../../components/DynamicMap';
import ETADisplay from '../../components/ETADisplay';
import { RideProgressIndicator } from '../../components/RideProgressIndicator';
import mapsService from '../../services/mapsService';
import firebaseTrackingService from '../../services/firebaseTrackingService';
import ridesService from '../../services/ridesService';
import { useLocation } from '../../hooks/useLocation';
import backendConfig from '../../config/backendConfig';
import { formatNicaraguaTime } from '../../utils/dateUtils';
import { safeToDate, safeFormatTime } from '../../utils/safeFormatters';
import { getDatabase, ref, onValue, off } from 'firebase/database';

interface DriverLocation {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}

export default function RideTrackingScreen({ route, navigation }: any) {
  const { 
    rideId, 
    driverId, 
    driverName, 
    vehiclePlate, 
    vehicleBrand, 
    vehicleModel, 
    vehicleColor,
    estimatedFare 
  } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords: clientCoords } = useLocation();

  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [rideStatus, setRideStatus] = useState('in_progress');
  const [statusMessage, setStatusMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [rideProgress, setRideProgress] = useState(0);
  const [estimatedDistance, setEstimatedDistance] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'stripe'>('cash');
  const [isDeviated, setIsDeviated] = useState(false);
  const [deviationDistance, setDeviationDistance] = useState(0);
  const [expectedRoute, setExpectedRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [destinationLat, setDestinationLat] = useState<number | null>(null);
  const [destinationLng, setDestinationLng] = useState<number | null>(null);
  const [originLat, setOriginLat] = useState<number | null>(null);
  const [originLng, setOriginLng] = useState<number | null>(null);
  const [rideStartTime, setRideStartTime] = useState<Date | null>(null);
  const [vehicleData, setVehicleData] = useState({
    plate: vehiclePlate || 'Cargando...',
    brand: vehicleBrand || 'Cargando...',
    model: vehicleModel || '',
    color: vehicleColor || '',
    photos: [] as string[],
  });
  const [driverPhone, setDriverPhone] = useState<string | null>(null);
  const [driverData, setDriverData] = useState({
    name: driverName,
    phone: null as string | null,
    rating: 0,
    email: '',
  });

  // Listener para obtener datos del vehículo y conductor desde Firebase
  useEffect(() => {
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);
    
    console.log('🎯 Iniciando listener de activeRides para rideId:', rideId);
    
    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();
      console.log('🔍 [activeRides] Datos completos del viaje:', JSON.stringify(data, null, 2));
      
      if (!data) {
        console.log('⚠️ No hay datos en activeRides para este viaje');
        return;
      }

      // Obtener datos del conductor PRIMERO
      if (data.driver) {
        console.log('👤 [activeRides] Datos del conductor:', {
          name: data.driver.name,
          phone: data.driver.phone,
          rating: data.driver.rating,
          id: data.driver.id,
        });
        
        setDriverData(prev => ({
          name: data.driver.name || prev.name || 'Conductor',
          phone: data.driver.phone || prev.phone || null,
          rating: data.driver.rating !== undefined ? data.driver.rating : prev.rating,
          email: data.driver.email || prev.email || '',
        }));
        setDriverPhone(data.driver.phone || null);
      } else {
        console.log('⚠️ [activeRides] No hay datos del conductor aún');
      }

      // Obtener datos del vehículo
      if (data.vehicle) {
        console.log('🚗 [activeRides] Datos del vehículo:', {
          plate: data.vehicle.plate,
          brand: data.vehicle.brand || data.vehicle.make,
          model: data.vehicle.model,
          color: data.vehicle.color,
        });
        
        setVehicleData(prev => {
          const newVehicleData = {
            plate: data.vehicle.plate || prev.plate || 'N/A',
            brand: data.vehicle.brand || data.vehicle.make || prev.brand || 'N/A',
            model: data.vehicle.model || prev.model || 'N/A',
            color: data.vehicle.color || prev.color || 'N/A',
            photos: data.vehicle.photos || prev.photos || [],
          };
          console.log('🚗 Actualizando vehicleData:', newVehicleData);
          return newVehicleData;
        });
      } else {
        console.log('⚠️ [activeRides] No hay datos del vehículo aún');
      }

      // Obtener distancia estimada para calcular progreso
      if (data.estimatedDistance) {
        setEstimatedDistance(data.estimatedDistance);
      }

      // Obtener coordenadas de origen y destino
      if (data.origin) {
        setOriginLat(data.origin.lat || data.origin.latitude);
        setOriginLng(data.origin.lng || data.origin.longitude);
      }
      if (data.destination) {
        setDestinationLat(data.destination.lat || data.destination.latitude);
        setDestinationLng(data.destination.lng || data.destination.longitude);
      }
    });

    return () => {
      console.log('🛑 Deteniendo listener de activeRides');
      off(rideRef);
    };
  }, [rideId]);

  // Calcular ruta esperada cuando se carga el conductor
  useEffect(() => {
    const calculateRoute = async () => {
      if (!driverLocation?.latitude || !driverLocation?.longitude) return;

      try {
        console.log('🛣️ Calculando ruta para cliente...');
        console.log('📊 Estado del viaje:', rideStatus);

        let route;

        // Si el viaje está accepted (conductor yendo a recoger), mostrar ruta conductor→origen
        if (rideStatus === 'accepted' && originLat && originLng) {
          console.log('📍 Calculando ruta: Conductor → Origen (punto de recogida)');
          route = await mapsService.getDirections(
            { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
            { latitude: originLat, longitude: originLng }
          );
        } 
        // Si el viaje está in_progress (conductor llevando al cliente), mostrar ruta conductor→destino
        else if (rideStatus === 'in_progress' && destinationLat && destinationLng) {
          console.log('📍 Calculando ruta: Conductor → Destino final');
          route = await mapsService.getDirections(
            { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
            { latitude: destinationLat, longitude: destinationLng }
          );
        } else {
          console.log('⏸️ No se puede calcular ruta - faltan coordenadas o estado inválido');
          return;
        }

        if (route?.polyline) {
          setExpectedRoute(route.polyline);
          console.log('✅ Ruta calculada para cliente');
        }
      } catch (error) {
        console.error('❌ Error calculando ruta para cliente:', error);
        // Fallback: línea recta al destino apropiado
        const targetLat = rideStatus === 'accepted' ? originLat : destinationLat;
        const targetLng = rideStatus === 'accepted' ? originLng : destinationLng;
        
        if (targetLat && targetLng) {
          setExpectedRoute([
            { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
            { latitude: targetLat, longitude: targetLng }
          ]);
        }
      }
    };

    calculateRoute();
  }, [driverLocation, destinationLat, destinationLng, originLat, originLng, rideStatus]);

  // Calcular progreso del viaje
  useEffect(() => {
    if (!driverLocation || !destinationLat || !destinationLng || !estimatedDistance || rideStatus !== 'in_progress') {
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

    // Calcular distancia restante al destino
    const remainingDistance = calculateDistance(
      driverLocation.latitude,
      driverLocation.longitude,
      destinationLat,
      destinationLng
    );

    // Calcular distancia recorrida
    const traveledDistance = estimatedDistance - remainingDistance;

    // Calcular porcentaje
    const progress = (traveledDistance / estimatedDistance) * 100;

    // Limitar entre 0 y 100
    const finalProgress = Math.min(Math.max(progress, 0), 100);
    
    console.log('📊 [CLIENTE] Progreso calculado:', {
      estimatedDistance,
      remainingDistance,
      traveledDistance,
      progress,
      finalProgress
    });
    
    setRideProgress(finalProgress);
  }, [driverLocation, destinationLat, destinationLng, estimatedDistance, rideStatus]);

  useEffect(() => {
    const initializeTracking = async () => {
      try {
        // Suscribirse a la ubicación del conductor usando Firebase RTDB
        console.log('🎯 Iniciando tracking para viaje:', rideId);
        
        const unsubscribeLocation = await firebaseTrackingService.subscribeToDriverLocation(
          driverId,
          (location) => {
            if (location) {
              console.log('📍 Nueva ubicación del conductor:', location);
              setDriverLocation({
                latitude: location.latitude,
                longitude: location.longitude,
                speed: location.speed,
                heading: location.heading,
                timestamp: safeToDate(location.timestamp)?.toISOString() || new Date().toISOString(),
              });
              setIsConnected(true);
            }
          }
        );

        // Suscribirse al estado de pago
        const { getDatabase, ref: dbRef, onValue, get } = await import('firebase/database');
        const { initializeFirebase } = await import('../../config/firebase');
        const { app } = await initializeFirebase();
        
        if (app) {
          const db = getDatabase(app);
          const paymentStatusRef = dbRef(db, `paymentStatus/${rideId}`);
          
          // Leer valor inicial primero
          try {
            const snapshot = await get(paymentStatusRef);
            const paymentData = snapshot.val();
            if (paymentData?.method) {
              console.log('💳 Método de pago INICIAL desde paymentStatus:', paymentData.method);
              setPaymentMethod(paymentData.method);
            }
          } catch (error) {
            console.log('⚠️ No se pudo leer paymentStatus inicial:', error);
          }
          
          // Luego suscribirse a cambios
          onValue(paymentStatusRef, (snapshot) => {
            const paymentData = snapshot.val();
            if (paymentData?.method) {
              console.log('💳 Método de pago ACTUALIZADO desde paymentStatus:', paymentData.method);
              setPaymentMethod(paymentData.method);
            }
          });
        }

        // Suscribirse al estado del viaje
        const unsubscribeRide = await firebaseTrackingService.subscribeToRideTracking(
          rideId,
          (tracking: any) => {
            if (tracking) {
              console.log('📢 Estado del viaje:', tracking.status);
              setRideStatus(tracking.status);
              
              // Si el viaje pasa a in_progress, marcar el tiempo de inicio
              if (tracking.status === 'in_progress' && !rideStartTime) {
                setRideStartTime(new Date());
              }
              
              // Obtener coordenadas del origen y destino
              if (tracking.origin) {
                setOriginLat(tracking.origin.lat);
                setOriginLng(tracking.origin.lng);
              }
              
              if (tracking.destination) {
                setDestinationLat(tracking.destination.lat);
                setDestinationLng(tracking.destination.lng);
              }

              if (tracking.status === 'completed' || tracking.status === 'pending_rating') {
                // Viaje completado o esperando calificación - Esperar un momento para que paymentMethod se actualice
                setTimeout(async () => {
                  // Re-leer paymentStatus para asegurar que tenemos el valor más reciente
                  let finalPaymentMethod = paymentMethod;
                  
                  try {
                    const { getDatabase, ref: dbRef, get } = await import('firebase/database');
                    const { initializeFirebase } = await import('../../config/firebase');
                    const { app } = await initializeFirebase();
                    
                    if (app) {
                      const db = getDatabase(app);
                      const paymentStatusRef = dbRef(db, `paymentStatus/${rideId}`);
                      const snapshot = await get(paymentStatusRef);
                      const paymentData = snapshot.val();
                      
                      if (paymentData?.method) {
                        finalPaymentMethod = paymentData.method;
                        console.log('💳 Método de pago RE-LEÍDO:', finalPaymentMethod);
                      }
                    }
                  } catch (error) {
                    console.log('⚠️ Error re-leyendo paymentStatus');
                  }
                  
                  const finalAmount = tracking.finalFare || tracking.estimatedPrice || estimatedFare || 0;
                  
                  console.log('💳 Método de pago FINAL detectado:', finalPaymentMethod);
                  console.log('💳 paymentMethod (estado):', paymentMethod);
                  
                  if (finalPaymentMethod === 'cash') {
                  // Pago en efectivo
                  Alert.alert(
                    '✅ Viaje Completado',
                    '¡Has llegado a tu destino! Procede a pagar en efectivo al conductor.',
                    [
                      {
                        text: 'Continuar',
                        onPress: () => navigation.replace('CashPayment', { 
                          rideId,
                          amount: parseFloat(finalAmount),
                          tip: 0,
                          driverName: tracking.driver?.name || driverData.name,
                        }),
                      },
                    ],
                    { cancelable: false }
                  );
                } else {
                  // Pago con tarjeta
                  Alert.alert(
                    '✅ Viaje Completado',
                    '¡Has llegado a tu destino! Procede con el pago.',
                    [
                      {
                        text: 'Pagar Ahora',
                        onPress: () => navigation.replace('Payment', { 
                          rideId,
                          amount: parseFloat(finalAmount),
                          driverId: tracking.driverId,
                          driverName: tracking.driver?.name,
                          vehiclePlate: tracking.vehicle?.plate,
                        }),
                      },
                    ],
                    { cancelable: false }
                  );
                }
                }, 500); // Esperar 500ms para que paymentMethod se actualice
              }

              if (tracking.status === 'canceled') {
                // Viaje cancelado
                const cancelReason = tracking.cancelReason || 'Sin razón especificada';
                Alert.alert(
                  '❌ Viaje Cancelado',
                  `El viaje ha sido cancelado.\n\nRazón: ${cancelReason}`,
                  [
                    {
                      text: 'OK',
                      onPress: () => navigation.navigate('ClientHome'),
                    },
                  ],
                  { cancelable: false }
                );
              }
            } else {
              // Si tracking es null, el viaje fue eliminado (cancelado)
              console.log('⚠️ Viaje eliminado de Firebase');
              Alert.alert(
                '❌ Viaje Cancelado',
                'El viaje ha sido cancelado.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.navigate('ClientHome'),
                  },
                ],
                { cancelable: false }
              );
            }
          }
        );

        // Cleanup
        return () => {
          console.log('🛑 Deteniendo tracking');
          unsubscribeLocation();
          unsubscribeRide();
        };
      } catch (error) {
        console.error('❌ Error inicializando tracking:', error);
      }
    };

    initializeTracking();
  }, [rideId, driverId]);

  // TODO: Verificar desvío de ruta cada 10 segundos
  // Comentado temporalmente hasta implementar Firebase Function
  /*
  useEffect(() => {
    if (!driverLocation) return;

    const checkDeviation = async () => {
      try {
        const backendUrl = backendConfig.getApiUrl();
        const response = await fetch(
          `${backendUrl}/tracking/deviation/${rideId}?lat=${driverLocation.latitude}&lng=${driverLocation.longitude}`
        );
        
        if (!response.ok) {
          // Endpoint no existe aún, silenciar error
          return;
        }
        
        const data = await response.json();

        if (data.success) {
          setIsDeviated(data.data.isDeviated);
          setDeviationDistance(data.data.deviationDistance);

          // Alerta si hay desvío
          if (data.data.isDeviated && !isDeviated) {
            Alert.alert(
              '⚠️ Desvío de Ruta',
              `El conductor se ha desviado ${data.data.deviationDistance}m de la ruta esperada.`,
              [
                { text: 'OK' },
                {
                  text: 'Contactar',
                  onPress: () => navigation.navigate('Chat', { rideId, driverId }),
                },
              ]
            );
          }
        }
      } catch (error) {
        // Silenciar error si el endpoint no existe
        // console.error('Error verificando desvío:', error);
      }
    };

    checkDeviation();
    const interval = setInterval(checkDeviation, 10000); // Cada 10s

    return () => clearInterval(interval);
  }, [driverLocation, rideId, isDeviated]);
  */

  const shareTrackingLink = async () => {
    try {
      const trackingUrl = `https://driveangel.ni/track/${rideId}`;
      
      await Share.share({
        message: `🚗 Estoy en un viaje con DriveAngel.ni\n\nRastreame en tiempo real:\n${trackingUrl}\n\nConductor: ${driverData.name}\nPlaca: ${vehicleData.plate}`,
        url: trackingUrl,
        title: 'Compartir ubicación del viaje',
      });
    } catch (error) {
      console.error('Error compartiendo:', error);
    }
  };

  const handleNavigate = () => {
    if (!destinationLat || !destinationLng) {
      Alert.alert('Error', 'No hay destino disponible');
      return;
    }

    const originLat = clientCoords?.latitude || 0;
    const originLng = clientCoords?.longitude || 0;

    Alert.alert(
      'Navegar al Destino',
      'Abre Google Maps para ver la ruta',
      [
        {
          text: '🗺️ Google Maps',
          onPress: () => {
            const url = Platform.select({
              ios: `comgooglemaps://?saddr=${originLat},${originLng}&daddr=${destinationLat},${destinationLng}&directionsmode=driving`,
              android: `google.navigation:q=${destinationLat},${destinationLng}&mode=d`,
            });
            
            const fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destinationLat},${destinationLng}&travelmode=driving`;
            
            Linking.canOpenURL(url || fallbackUrl).then((supported) => {
              Linking.openURL(supported && url ? url : fallbackUrl);
            });
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const cancelRide = () => {
    // Verificar si se puede cancelar (antes del 15% del viaje)
    const canCancel = canCancelRide();

    if (!canCancel.allowed) {
      Alert.alert(
        'No se puede cancelar',
        canCancel.reason,
        [{ text: 'Entendido' }]
      );
      return;
    }

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
              // Cancelar viaje usando el servicio de rides
              const result = await ridesService.cancelRide(rideId, 'Cancelado por el cliente');
              
              if (result.success) {
                Alert.alert('Viaje Cancelado', result.message);
                // Navegar a SearchRideScreen con verificación automática de conductores
                navigation.replace('SearchRide');
              } else {
                Alert.alert('Error', result.message || 'No se pudo cancelar el viaje');
              }
            } catch (error: any) {
              console.error('Error cancelando viaje:', error);
              Alert.alert('Error', error?.message || 'No se pudo cancelar el viaje');
            }
          },
        },
      ]
    );
  };

  const canCancelRide = () => {
    // Si el viaje aún no ha sido aceptado por ningún conductor, se puede cancelar
    if (rideStatus === 'pending' || rideStatus === 'searching') {
      return { allowed: true };
    }

    // Si el conductor ya llegó, no se puede cancelar
    if (rideStatus === 'arrived') {
      return {
        allowed: false,
        reason: 'No puedes cancelar el viaje porque el conductor ya ha llegado a tu ubicación.'
      };
    }

    // Si el viaje está en progreso, verificar tiempo transcurrido (15%)
    if (rideStatus === 'in_progress') {
      // Para viajes en progreso, el 15% se refiere al tiempo total estimado
      // Usamos una estimación de tiempo (por ahora 30 minutos como tiempo promedio)
      const estimatedTripTime = 30 * 60; // 30 minutos en segundos
      const fifteenPercentTime = estimatedTripTime * 0.15; // 15% del tiempo

      // Si no tenemos tiempo de inicio, permitir cancelar
      if (!rideStartTime) {
        return { allowed: true };
      }

      const currentTime = new Date();
      const elapsedTime = Math.floor((currentTime.getTime() - rideStartTime.getTime()) / 1000);

      if (elapsedTime > fifteenPercentTime) {
        return {
          allowed: false,
          reason: `No puedes cancelar el viaje porque ya ha transcurrido más del 15% del tiempo estimado (${Math.round(elapsedTime / 60)} min de ${Math.round(estimatedTripTime / 60)} min).`
        };
      }
    }

    // Para viajes aceptados pero no iniciados, se puede cancelar
    return { allowed: true };
  };

  const getStatusText = () => {
    switch (rideStatus) {
      case 'accepted':
        return 'Conductor en camino';
      case 'arrived':
        return 'Conductor ha llegado';
      case 'in_progress':
        return 'Viaje en progreso';
      case 'completed':
        return 'Viaje completado';
      case 'canceled':
        return 'Viaje cancelado';
      default:
        return 'Conectando...';
    }
  };

  const getStatusColor = () => {
    switch (rideStatus) {
      case 'accepted':
        return '#FFA500';
      case 'arrived':
        return '#4CAF50';
      case 'in_progress':
        return '#2196F3';
      case 'completed':
        return '#4CAF50';
      case 'canceled':
        return '#F44336';
      default:
        return '#999';
    }
  };
  return (
    <View style={styles.container}>
      {/* Mapa con ubicación del conductor */}
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={driverLocation?.latitude || clientCoords?.latitude || 12.1364}
          longitude={driverLocation?.longitude || clientCoords?.longitude || -86.2514}
          style={styles.map}
          showMarker={!!driverLocation}
          markerPosition={driverLocation || undefined}
          markerType="car"
          routeCoordinates={expectedRoute.length > 0 ? expectedRoute : [
            { latitude: driverLocation?.latitude || 0, longitude: driverLocation?.longitude || 0 },
            { latitude: destinationLat || 0, longitude: destinationLng || 0 },
          ]}
          // Mostrar el destino si está disponible
          destinationMarker={destinationLat && destinationLng ? { latitude: destinationLat, longitude: destinationLng } : undefined}
        />

        {/* Indicador de conexión mejorado */}
        <View style={styles.connectionContainer}>
          <View style={[styles.connectionBadge, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]}>
            <Text style={styles.connectionText}>
              {isConnected ? '● En vivo' : '● Desconectado'}
            </Text>
          </View>
          
          {/* Indicador de movimiento si hay velocidad */}
          {driverLocation?.speed !== undefined && driverLocation.speed > 5 && (
            <View style={styles.movementIndicator}>
              <Text style={styles.movementText}>
                🚗 {Math.round(driverLocation.speed)} km/h
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Información del viaje */}
      <View style={styles.infoContainer}>
        {/* Estado */}
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>

        {statusMessage ? (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        ) : null}

        {/* Información del conductor */}
        <View style={styles.driverInfo}>
          <View style={styles.driverAvatar}>
            <Text style={styles.driverAvatarText}>{driverData.name?.charAt(0) || 'C'}</Text>
          </View>
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>{driverData.name || 'Conductor'}</Text>
            <Text style={styles.vehicleInfo}>
              🚗 {vehicleData.brand && vehicleData.brand !== 'N/A' && vehicleData.brand !== 'Cargando...' ? `${vehicleData.brand} ` : ''}{vehicleData.model && vehicleData.model !== 'N/A' ? `${vehicleData.model} ` : ''}{vehicleData.color && vehicleData.color !== 'N/A' ? vehicleData.color : ''}
            </Text>
            <Text style={styles.vehiclePlate}>
              📋 {vehicleData.plate && vehicleData.plate !== 'N/A' && vehicleData.plate !== 'Cargando...' ? vehicleData.plate : 'Cargando...'}
            </Text>
            {driverData.phone ? (
              <Text style={styles.driverPhone}>📞 {driverData.phone}</Text>
            ) : null}
          </View>
        </View>

        {/* Foto del vehículo - Solo cuando conductor está llegando (accepted) */}
        {rideStatus === 'accepted' && vehicleData.photos && vehicleData.photos.length > 0 && (
          <View style={styles.vehiclePhotoContainer}>
            <Text style={styles.vehiclePhotoTitle}>🚗 Tu conductor está llegando</Text>
            <Image
              source={{ uri: vehicleData.photos[0] }}
              style={styles.vehiclePhoto}
              resizeMode="cover"
            />
          </View>
        )}

        {/* ETA Display - Cuando conductor está en camino o viaje en progreso */}
        {(rideStatus === 'accepted' || rideStatus === 'in_progress') && driverLocation && (
          <View style={styles.etaContainer}>
            <ETADisplay
              rideId={rideId}
              currentLat={driverLocation.latitude}
              currentLng={driverLocation.longitude}
              updateInterval={30000}
              useRealtime={true}
            />
          </View>
        )}

        {/* Indicador de Progreso del Viaje */}
        <RideProgressIndicator
          progress={rideProgress}
          role="client"
          rideStatus={rideStatus}
          estimatedFare={estimatedFare}
          paymentMethod={paymentMethod}
        />

        {/* Alerta de desvío */}
        {isDeviated && (
          <View style={styles.deviationAlert}>
            <Text style={styles.deviationIcon}>⚠️</Text>
            <Text style={styles.deviationText}>
              Desvío detectado: {deviationDistance}m de la ruta
            </Text>
          </View>
        )}

        {/* Última actualización - Más prominente */}
        {driverLocation && (
          <View style={styles.updateContainer}>
            <View style={styles.updateBadge}>
              <Text style={styles.updateIcon}>📍</Text>
              <Text style={styles.updateText}>
                Actualizado: {formatNicaraguaTime(driverLocation.timestamp)}
              </Text>
            </View>
            <Text style={styles.updateSubtext}>
              Información en tiempo real
            </Text>
          </View>
        )}

        {/* Botones */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.navigateButton}
            onPress={handleNavigate}
          >
            <Text style={styles.navigateButtonText}>🧭 Navegar al Destino</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareButton}
            onPress={shareTrackingLink}
          >
            <Text style={styles.shareButtonText}>🔗 Compartir Ubicación</Text>
          </TouchableOpacity>

          {canCancelRide().allowed && rideStatus !== 'completed' && rideStatus !== 'canceled' && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelRide}
            >
              <Text style={styles.cancelButtonText}>Cancelar Viaje</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Botón flotante de chat - Solo disponible cuando el viaje es aceptado */}
      {(rideStatus === 'accepted' || rideStatus === 'driver_arrived' || rideStatus === 'in_progress') && (
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => navigation.navigate('Chat', { 
            rideId, 
            otherUserName: driverData.name,
            otherUserPhone: driverData.phone
          })}
        >
          <Text style={styles.chatButtonIcon}>💬</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  connectionBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  connectionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  connectionContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    right: 16,
    alignItems: 'flex-end',
  },
  movementIndicator: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  movementText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  statusMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  driverAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  vehicleInfo: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  vehiclePlate: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  driverPhone: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 4,
    fontWeight: '600',
  },
  vehiclePhotoContainer: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehiclePhotoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    padding: 12,
    backgroundColor: colors.background,
  },
  vehiclePhoto: {
    width: '100%',
    height: 200,
    backgroundColor: '#E0E0E0',
  },
  etaContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  etaDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  deviationAlert: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    alignItems: 'center',
  },
  deviationIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  deviationText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    fontWeight: '600',
  },
  lastUpdate: {
    marginBottom: 16,
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  speedText: {
    fontSize: 12,
    color: '#999',
  },
  updateContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  updateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  updateIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  updateText: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '600',
  },
  updateSubtext: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  buttonsContainer: {
    gap: 12,
  },
  navigateButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  navigateButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  shareButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
  chatButton: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  chatButtonIcon: {
    fontSize: 28,
  },
});
