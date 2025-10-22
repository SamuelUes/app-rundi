/**
 * RideTrackingScreen - Versión refactorizada
 * 
 * Permite al cliente seguir el progreso de su viaje, ver la ubicación del conductor,
 * comunicarse con el conductor y gestionar el viaje.
 * 
 * Esta versión implementa:
 * - Estructura modular con hooks personalizados
 * - alertService para manejo de alertas
 * - LoadingOverlay para estados de carga
 * - useFirebaseData para consultas optimizadas
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  ScrollView,
  Share,
  Linking,
} from 'react-native';

// Servicios y componentes compartidos
import alertService from '../../services/alertService';
import LoadingOverlay from '../../components/LoadingOverlay';
import DynamicMap from '../../components/DynamicMap';
import ETADisplay from '../../components/ETADisplay';
import { RideProgressIndicator } from '../../components/RideProgressIndicator';
import { useTheme } from '../../context/ThemeContext';
import { useLocation } from '../../hooks/useLocation';

// Servicios optimizados
import ridesService from '../../services/ridesService';
import { useFirebaseData, useFirebaseItem } from '../../hooks/useFirebaseData';
import firebaseTrackingService from '../../services/firebaseTrackingService';

// Navegación
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ClientStackParamList } from '../../navigation/ClientStack';

// Tipos
interface DriverLocation {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

interface RideTrackingScreenProps {
  route: {
    params: {
      rideId: string;
      driverId: string;
      driverName?: string;
      vehiclePlate?: string;
      vehicleBrand?: string;
      vehicleModel?: string;
      vehicleColor?: string;
      estimatedFare?: number;
    }
  };
  navigation: NativeStackNavigationProp<ClientStackParamList, 'RideTracking'>;
}

// Hooks personalizados para separar la lógica

/**
 * Hook para manejar la ubicación del conductor
 */
const useDriverLocation = (driverId: string) => {
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Suscribirse a la ubicación del conductor
  useEffect(() => {
    if (!driverId) return;

    let unsubscribe: (() => void) | null = null;

    const subscribeToDriverLocation = async () => {
      try {
        unsubscribe = await firebaseTrackingService.subscribeToDriverLocation(
          driverId,
          (location) => {
            if (location) {
              setDriverLocation({
                latitude: location.latitude,
                longitude: location.longitude,
                speed: location.speed ?? null,
                heading: location.heading ?? null,
                timestamp: new Date().toISOString(),
              });
              setIsConnected(true);
            } else {
              console.log('⚠️ No se recibió ubicación del conductor');
            }
          }
        );
      } catch (error) {
        console.error('❌ Error al suscribirse a ubicación del conductor:', error);
        setIsConnected(false);
      }
    };

    subscribeToDriverLocation();

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [driverId]);

  return { driverLocation, isConnected };
};

/**
 * Hook para manejar el estado del viaje
 */
const useRideStatus = (rideId: string) => {
  // Usar hook optimizado para consultas Firebase
  const { 
    data: rideData, 
    loading: rideLoading,
    error: rideError 
  } = useFirebaseItem<any>(`activeRides`, rideId);

  const [rideStatus, setRideStatus] = useState('in_progress');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'stripe'>('cash');
  const [finalFare, setFinalFare] = useState<number>(0);

  useEffect(() => {
    if (rideData) {
      console.log('🚕 Datos del viaje actualizados:', {
        status: rideData.status,
        paymentMethod: rideData.paymentMethod,
        finalFare: rideData.finalFare
      });
      
      setRideStatus(rideData.status || 'in_progress');
      
      // Obtener método de pago (puede estar en payment.method o directamente en paymentMethod)
      if (rideData.payment?.method) {
        setPaymentMethod(rideData.payment.method);
      } else if (rideData.paymentMethod) {
        setPaymentMethod(rideData.paymentMethod);
      }
      
      // Obtener precio final
      setFinalFare(rideData.finalFare || rideData.estimatedPrice || 0);
    }
  }, [rideData]);

  return { 
    rideStatus, 
    paymentMethod, 
    finalFare,
    rideData,
    loading: rideLoading, 
    error: rideError 
  };
};

/**
 * Hook para manejar datos del conductor y vehículo
 */
const useDriverAndVehicleData = (driverId: string, initialData: any) => {
  // Datos del conductor
  const [driverData, setDriverData] = useState({
    name: initialData.driverName || 'Conductor',
    phone: null as string | null,
    rating: 0,
    email: '',
    photo: null as string | null,
  });

  // Datos del vehículo
  const [vehicleData, setVehicleData] = useState({
    plate: initialData.vehiclePlate || 'Cargando...',
    brand: initialData.vehicleBrand || '',
    model: initialData.vehicleModel || '',
    color: initialData.vehicleColor || '',
    photos: [] as string[],
  });

  // Cargar datos del conductor desde driversInfo (accesible públicamente)
  const { data: driverDbData } = useFirebaseItem<any>(
    'driversInfo',
    driverId,
    { once: false } // Listener en tiempo real para obtener actualizaciones
  );

  // Actualizar datos cuando se carguen desde Firebase
  useEffect(() => {
    if (driverDbData) {
      console.log('📦 Datos del conductor desde driversInfo:', driverDbData);
      
      setDriverData({
        name: driverDbData.name || driverData.name,
        phone: driverDbData.phone || driverData.phone,
        rating: driverDbData.rating !== undefined ? driverDbData.rating : driverData.rating,
        email: driverDbData.email || driverData.email,
        photo: driverDbData.photoURL || driverData.photo,
      });

      // Buscar datos del vehículo en driversInfo
      if (driverDbData.vehicle || driverDbData.vehicleInfo) {
        const vehicleInfo = driverDbData.vehicle || driverDbData.vehicleInfo;
        console.log('🚗 Datos del vehículo encontrados:', vehicleInfo);
        
        setVehicleData(prev => ({
          ...prev,
          plate: vehicleInfo.plate || vehicleInfo.licensePlate || prev.plate,
          brand: vehicleInfo.brand || vehicleInfo.make || prev.brand,
          model: vehicleInfo.model || prev.model,
          color: vehicleInfo.color || prev.color,
          photos: vehicleInfo.photos || prev.photos,
        }));
      } else {
        console.log('⚠️ No se encontraron datos del vehículo en driversInfo');
      }
    }
  }, [driverDbData, driverId]);

  return { driverData, vehicleData };
};

/**
 * Hook para manejar la ubicación de destino y rutas
 */
/**
 * Calcular ruta real usando OSRM (gratuito)
 */
async function calculateRealRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<Array<{ latitude: number; longitude: number }>> {
  try {
    console.log(`🗺️ [Cliente] Calculando ruta de [${startLat}, ${startLng}] a [${endLat}, ${endLng}]`);
    
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No se encontró ninguna ruta');
    }
    
    const coordinates = data.routes[0].geometry.coordinates;
    const route = coordinates.map((coord: [number, number]) => ({
      longitude: coord[0],
      latitude: coord[1],
    }));
    
    console.log(`✅ [Cliente] Ruta calculada con ${route.length} puntos`);
    return route;
  } catch (error) {
    console.error('❌ [Cliente] Error calculando ruta:', error);
    return [
      { latitude: startLat, longitude: startLng },
      { latitude: endLat, longitude: endLng },
    ];
  }
}

const useDestinationAndRoute = (rideData: any) => {
  const [destinationCoords, setDestinationCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [originCoords, setOriginCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{latitude: number, longitude: number}>>([]);

  useEffect(() => {
    if (!rideData) return;

    // Extraer coordenadas de destino (solo si cambió)
    if (rideData.destination) {
      const destLat = rideData.destination.latitude || rideData.destination.lat;
      const destLng = rideData.destination.longitude || rideData.destination.lng;
      
      if (destLat && destLng) {
        setDestinationCoords(prev => {
          if (!prev || prev.latitude !== destLat || prev.longitude !== destLng) {
            return { latitude: destLat, longitude: destLng };
          }
          return prev;
        });
      }
    }

    // Extraer coordenadas de origen (solo si cambió)
    if (rideData.origin) {
      const origLat = rideData.origin.latitude || rideData.origin.lat;
      const origLng = rideData.origin.longitude || rideData.origin.lng;
      
      if (origLat && origLng) {
        setOriginCoords(prev => {
          if (!prev || prev.latitude !== origLat || prev.longitude !== origLng) {
            return { latitude: origLat, longitude: origLng };
          }
          return prev;
        });
      }
    }

    // Calcular ruta real si no existe en rideData
    const calculateRoute = async () => {
      // Prioridad 1: Usar ruta del backend si existe
      if (rideData.route && Array.isArray(rideData.route) && rideData.route.length > 0) {
        console.log('✅ [Cliente] Usando ruta del backend:', rideData.route.length, 'puntos');
        setRouteCoordinates(rideData.route);
        return;
      }
      
      // Prioridad 2: Calcular ruta real
      const origLat = rideData.origin?.latitude || rideData.origin?.lat;
      const origLng = rideData.origin?.longitude || rideData.origin?.lng;
      const destLat = rideData.destination?.latitude || rideData.destination?.lat;
      const destLng = rideData.destination?.longitude || rideData.destination?.lng;
      
      if (origLat && origLng && destLat && destLng) {
        console.log('🗺️ [Cliente] Calculando ruta real...');
        const route = await calculateRealRoute(origLat, origLng, destLat, destLng);
        setRouteCoordinates(route);
      }
    };
    
    calculateRoute();
  }, [rideData?.destination?.latitude, rideData?.destination?.lat, rideData?.destination?.longitude, rideData?.destination?.lng, rideData?.origin?.latitude, rideData?.origin?.lat, rideData?.origin?.longitude, rideData?.origin?.lng, rideData?.route?.length]);

  return { destinationCoords, originCoords, routeCoordinates };
};

// Componente principal
export default function RideTrackingScreen({ route, navigation }: RideTrackingScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords: clientCoords } = useLocation();

  // Extraer parámetros de la ruta
  const { 
    rideId, 
    driverId, 
    driverName = 'Conductor',
    vehiclePlate = '',
    vehicleBrand = '',
    vehicleModel = '', 
    vehicleColor = '',
    estimatedFare = 0
  } = route.params;

  // Estado de carga y mensajes
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Conectando con el conductor...');
  
  // Hooks personalizados
  const { driverLocation, isConnected } = useDriverLocation(driverId);
  const { rideStatus, paymentMethod, finalFare, rideData, loading: rideLoading, error: rideError } = useRideStatus(rideId);
  const { driverData, vehicleData } = useDriverAndVehicleData(driverId, { driverName, vehiclePlate, vehicleBrand, vehicleModel, vehicleColor });
  const { destinationCoords, originCoords, routeCoordinates } = useDestinationAndRoute(rideData);
  
  // Efecto adicional: intentar obtener datos del vehículo desde rideData si existen
  useEffect(() => {
    if (rideData) {
      console.log('🔍 Verificando datos del vehículo en rideData:', rideData);
      
      // Buscar vehículo en diferentes ubicaciones posibles
      const vehicleFromRide = rideData.vehicle || 
                             rideData.driver?.vehicle || 
                             rideData.vehicleInfo;
      
      if (vehicleFromRide && vehicleFromRide.plate && vehicleFromRide.plate !== 'N/A') {
        console.log('✅ Vehículo encontrado en rideData, actualizando...');
        // Forzar actualización de vehicleData desde el componente padre
        // usando los valores del viaje
      }
    }
  }, [rideData]);

  // Estado para la UI
  const [rideProgress, setRideProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [isDeviated, setIsDeviated] = useState(false);
  const [deviationDistance, setDeviationDistance] = useState(0);
  const [rideStartTime, setRideStartTime] = useState<Date | null>(null);
  
  // Computar estados derivados para las diferentes fases del viaje
  const isAccepted = rideStatus === 'accepted';
  const isInProgress = rideStatus === 'in_progress';
  const isCompleted = rideStatus === 'completed';
  const isCanceled = rideStatus === 'canceled';
  
  // Efecto para calcular el progreso del viaje
  useEffect(() => {
    if (!driverLocation || !destinationCoords || !originCoords) return;
    
    // Calcular distancia estimada total (origen -> destino)
    const calculateProgress = () => {
      try {
        // Cálculo simplificado (habría que usar un servicio de rutas para mayor precisión)
        const estimatedDistance = getDistanceBetweenPoints(
          originCoords.latitude, originCoords.longitude,
          destinationCoords.latitude, destinationCoords.longitude
        );
        
        // Distancia restante (posición actual del conductor -> destino)
        const remainingDistance = getDistanceBetweenPoints(
          driverLocation.latitude, driverLocation.longitude,
          destinationCoords.latitude, destinationCoords.longitude
        );
        
        // Distancia ya recorrida
        const traveledDistance = estimatedDistance - remainingDistance;
        
        // Calcular progreso como porcentaje
        const progress = Math.round((traveledDistance / estimatedDistance) * 100);
        
        // Limitar entre 0 y 100
        const finalProgress = Math.min(Math.max(progress, 0), 100);
        setRideProgress(finalProgress);
      } catch (error) {
        console.error('Error calculando progreso:', error);
      }
    };
    
    calculateProgress();
    
    // Actualizar cada 30 segundos
    const interval = setInterval(calculateProgress, 30000);
    return () => clearInterval(interval);
  }, [driverLocation, destinationCoords, originCoords]);
  
  // Actualizar estado y mensaje según status del viaje
  useEffect(() => {
    console.log('🔄 [RideTrackingScreen] useEffect ejecutado:', {
      rideStatus,
      paymentMethod,
      finalFare,
      estimatedFare
    });
    
    switch (rideStatus) {
      case 'accepted':
        setStatusMessage('El conductor está en camino');
        break;
      case 'in_progress':
        setStatusMessage('En viaje hacia el destino');
        
        // Guardar tiempo de inicio si no existe
        if (!rideStartTime) {
          setRideStartTime(new Date());
        }
        break;
      case 'pending_payment':
        console.log('💰 [RideTrackingScreen] Status cambió a pending_payment');
        setStatusMessage('Viaje completado - Procesando pago');
        
        // Navegar a pantalla de pago según el método
        if (paymentMethod === 'cash') {
          console.log('💰 [RideTrackingScreen] Navegando a CashPayment con params:', {
            rideId,
            amount: finalFare || estimatedFare,
            driverName: driverData.name || driverName,
          });
          navigation.replace('CashPayment', {
            rideId,
            amount: finalFare || estimatedFare,
            driverName: driverData.name || driverName,
            driverPhoto: driverData.photo || undefined,
          });
        } else {
          console.log('💳 [RideTrackingScreen] Navegando a Payment');
          navigation.replace('Payment', {
            rideId,
            amount: finalFare || estimatedFare,
            driverName: driverData.name || driverName,
            driverPhoto: driverData.photo || undefined,
          });
        }
        break;
      case 'pending_rating':
        setStatusMessage('Pago confirmado - Califica tu experiencia');
        
        // Navegar a pantalla de calificación
        navigation.replace('Rating', {
          rideId,
        });
        break;
      case 'completed':
        setStatusMessage('Viaje completado');
        break;
      case 'canceled':
        setStatusMessage('Viaje cancelado');
        break;
      default:
        setStatusMessage('');
    }
  }, [rideStatus, rideStartTime, paymentMethod, finalFare, estimatedFare, driverData, driverName, rideId, navigation]);
  
  // Actualizar loading state basado en datos cargados
  useEffect(() => {
    if (rideData && driverLocation) {
      setLoading(false);
    } else if (rideLoading) {
      setLoadingMessage('Cargando detalles del viaje...');
    }
  }, [rideData, driverLocation, rideLoading]);
  
  // Funciones del componente
  const handleNavigate = useCallback(() => {
    if (!destinationCoords) {
      alertService.showErrorAlert('No hay destino disponible');
      return;
    }

    const originLat = clientCoords?.latitude || 0;
    const originLng = clientCoords?.longitude || 0;

    alertService.showOptionsAlert(
      'Navegar al Destino',
      'Abre Google Maps para ver la ruta',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir Google Maps',
          onPress: async () => {
            // URL para Google Maps en distintas plataformas
            const url = Platform.select({
              ios: `comgooglemaps://?saddr=${originLat},${originLng}&daddr=${destinationCoords.latitude},${destinationCoords.longitude}&directionsmode=driving`,
              android: `google.navigation:q=${destinationCoords.latitude},${destinationCoords.longitude}&mode=d`,
            });
            
            const fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destinationCoords.latitude},${destinationCoords.longitude}&travelmode=driving`;
            
            try {
              // Guardar ID de viaje activo en AsyncStorage
              const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
              await AsyncStorage.setItem('ACTIVE_RIDE_ID', rideId);
              
              // Mostrar instrucciones y abrir navegación
              await alertService.showExternalNavAlert(
                'Cuando vuelvas a la app, ve a la pantalla principal. El banner "Viaje en curso" te permitirá volver al viaje.',
                'ACTIVE_RIDE_ID',
                rideId,
                () => {
                  Linking.canOpenURL(url || fallbackUrl).then((supported) => {
                    Linking.openURL(supported && url ? url : fallbackUrl);
                  }).catch(() => Linking.openURL(fallbackUrl));
                }
              );
            } catch (error) {
              console.error('Error iniciando navegación:', error);
            }
          },
        },
      ]
    );
  }, [clientCoords, destinationCoords, rideId]);
  
  const handleShareTrip = useCallback(async () => {
    try {
      // Construir mensaje para compartir
      const message = `🚗 Estoy en un viaje con ${driverData.name} (${vehicleData.brand} ${vehicleData.model} - ${vehicleData.color}) - Placa: ${vehicleData.plate}`;
      
      await Share.share({
        message,
        title: 'Compartir viaje',
      });
    } catch (error) {
      console.error('Error al compartir viaje:', error);
    }
  }, [driverData, vehicleData]);
  
  const handleCancelRide = useCallback(() => {
    // Verificar si el viaje puede ser cancelado
    const canCancel = rideStatus !== 'completed' && rideStatus !== 'canceled';
    
    if (!canCancel) {
      alertService.showInfoAlert(
        'No se puede cancelar',
        'Este viaje no puede ser cancelado en este momento.',
      );
      return;
    }
    
    alertService.showConfirmAlert(
      'Cancelar Viaje',
      '¿Estás seguro que deseas cancelar este viaje?',
      async () => {
        try {
          // Llamar al servicio de cancelación
          const result = await ridesService.cancelRide(rideId, 'Cancelado por el cliente');
          
          if (result.success) {
            alertService.showSuccessAlert('Viaje Cancelado', result.message, () => {
              navigation.replace('SearchRide');
            });
          } else {
            alertService.showErrorAlert(result.message || 'No se pudo cancelar el viaje');
          }
        } catch (error: any) {
          console.error('Error cancelando viaje:', error);
          alertService.showErrorAlert(error?.message || 'No se pudo cancelar el viaje');
        }
      }
    );
  }, [rideStatus, rideId, navigation]);
  
  const handleCallDriver = useCallback(() => {
    if (!driverData.phone) {
      alertService.showErrorAlert('No hay número de teléfono disponible');
      return;
    }
    
    const phoneUrl = `tel:${driverData.phone}`;
    Linking.canOpenURL(phoneUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(phoneUrl);
        } else {
          alertService.showErrorAlert('No se puede realizar la llamada');
        }
      })
      .catch((err) => console.error('Error al llamar:', err));
  }, [driverData]);
  
  const handleOpenChat = useCallback(() => {
    navigation.navigate('Chat', {
      rideId,
      otherUserName: driverData.name,
      otherUserPhone: driverData.phone || undefined,
    });
  }, [navigation, rideId, driverData]);
  
  // Helper para calcular distancia entre puntos
  const getDistanceBetweenPoints = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    // Función para convertir de grados a radianes
    const deg2rad = (deg: number) => deg * (Math.PI / 180);
    
    // Radio de la Tierra en metros
    const R = 6371000;
    
    // Conversión a radianes
    const dLat = deg2rad(lat2 - lat1);
    const dLng = deg2rad(lng2 - lng1);
    
    // Fórmula haversine
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    // Distancia en metros
    return R * c;
  };
  
  // Función auxiliar para determinar color según status
  const getStatusColor = () => {
    switch (rideStatus) {
      case 'accepted':
        return '#FF9800';
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
  
  // Mostrar pantalla de carga si corresponde
  if (loading) {
    return <LoadingOverlay visible={true} message={loadingMessage} />;
  }

  // Mostrar mensaje si no hay conexión
  if (!isConnected) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No hay conexión a Internet</Text>
        <Text style={styles.errorDescription}>Verifica tu conexión para seguir el viaje</Text>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Renderizado principal
  return (
    <View style={styles.container}>
      {/* Mapa con ubicación del conductor */}
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={driverLocation?.latitude || clientCoords?.latitude || 12.1364}
          longitude={driverLocation?.longitude || clientCoords?.longitude || -86.2514}
          style={styles.map}
          showMarker={!!driverLocation}
          markerPosition={driverLocation ? {
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude
          } : undefined}
          markerType="car"
          destinationMarker={destinationCoords ? destinationCoords : undefined}
          originMarker={isAccepted && originCoords ? originCoords : undefined}
          routeCoordinates={routeCoordinates}
        />
        
        {/* Indicador de conexión */}
        <View style={[styles.connectionBadge, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]}>
          <Text style={styles.connectionText}>
            {isConnected ? '📶 Conectado' : '❌ Sin conexión'}
          </Text>
        </View>
      </View>

      {/* Panel de información */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.infoContainer}>
          {/* Badge de estado */}
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
          
          {/* Información del conductor */}
          <View style={styles.driverInfo}>
            {driverData.photo ? (
              <Image source={{ uri: driverData.photo }} style={styles.driverAvatar} />
            ) : (
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>{driverData.name[0]}</Text>
              </View>
            )}
            
            <View style={styles.driverDetails}>
              <Text style={styles.driverName}>{driverData.name}</Text>
              <Text style={styles.vehicleInfo}>
                {vehicleData.brand || 'N/A'} {vehicleData.model || 'N/A'} - {vehicleData.color || 'N/A'}
              </Text>
              <Text style={styles.vehiclePlate}>
                {vehicleData.plate && vehicleData.plate !== 'Cargando...' ? vehicleData.plate : 'N/A'}
              </Text>
              {driverData.phone && (
                <Text style={styles.driverPhone}>{driverData.phone}</Text>
              )}
            </View>
          </View>

          {/* ETA y progreso */}
          {isInProgress && (
            <View style={styles.etaContainer}>
              <ETADisplay
                rideId={rideId}
                currentLat={clientCoords?.latitude || 0}
                currentLng={clientCoords?.longitude || 0}
              />
              <Text style={styles.etaDescription}>
                Basado en las condiciones actuales de tráfico
              </Text>
            </View>
          )}

          {/* Indicador de desviación */}
          {isDeviated && (
            <View style={styles.deviationAlert}>
              <Text style={styles.deviationIcon}>⚠️</Text>
              <Text style={styles.deviationText}>
                El conductor se ha desviado {deviationDistance}m de la ruta esperada.
              </Text>
            </View>
          )}

          {/* Botones de acción */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity style={styles.navigateButton} onPress={handleNavigate}>
              <Text style={styles.navigateButtonText}>🗺️ Ver Ruta en Google Maps</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.shareButton} onPress={handleShareTrip}>
              <Text style={styles.shareButtonText}>👥 Compartir Viaje</Text>
            </TouchableOpacity>
            
            {(isAccepted || isInProgress) && (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelRide}>
                <Text style={styles.cancelButtonText}>❌ Cancelar Viaje</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Botón de chat flotante */}
      <TouchableOpacity style={styles.chatButton} onPress={handleOpenChat}>
        <Text style={[styles.chatButtonIcon, { color: '#fff' }]}>💬</Text>
      </TouchableOpacity>
    </View>
  );
}

// Definición de estilos
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    zIndex: 1,
  },
  connectionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '60%',
  },
  contentContainer: {
    paddingBottom: 20,
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
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
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
    fontWeight: '600',
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
  buttonsContainer: {
    gap: 12,
    marginTop: 16,
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
    marginTop: 8,
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
    backgroundColor: colors.primary,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
