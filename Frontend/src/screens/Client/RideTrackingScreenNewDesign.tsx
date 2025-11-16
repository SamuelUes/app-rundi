/**
 * RideTrackingScreenNewDesign - Diseño mejorado basado en wireframe
 * 
 * Características:
 * - Panel inferior retráctil (expandir/comprimir)
 * - Botón de regresar en esquina superior izquierda
 * - Botón de mensaje junto a info del conductor
 * - Botón Status flotante
 * - Mapa grande con ruta morada
 * - UI minimalista y limpia
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  Share,
  Animated,
  PanResponder,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

// Servicios y componentes
import alertService from '../../services/alertService';
import LoadingOverlay from '../../components/LoadingOverlay';
import DynamicMap from '../../components/DynamicMap';
import { useTheme } from '../../context/ThemeContext';
import { useLocation } from '../../hooks/useLocation';
import ridesService from '../../services/ridesService';
import { useFirebaseItem } from '../../hooks/useFirebaseData';
import firebaseTrackingService from '../../services/firebaseTrackingService';

// Navegación
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ClientStackParamList } from '../../navigation/ClientStack';

// Utils
import { ensureVehicleIconSource, extractVehicleTypeFromInfo } from '../../utils/vehicleIcons';

// Iconos
const BACK_BUTTON = require('../../assets/icons/back_button/back_button2x.png');

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_MIN_HEIGHT = 240; // Panel comprimido
const PANEL_MAX_HEIGHT = SCREEN_HEIGHT * 0.65; // Panel expandido
const PANEL_COLLAPSED_OFFSET = Math.max(PANEL_MAX_HEIGHT - PANEL_MIN_HEIGHT, 0);

const DEG_TO_RAD = Math.PI / 180;

const toRadians = (deg: number) => deg * DEG_TO_RAD;

const computeDistanceMeters = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number }
) => {
  const earthRadius = 6371000; // metros
  const dLat = toRadians(end.latitude - start.latitude);
  const dLon = toRadians(end.longitude - start.longitude);
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

const calculatePolylineDistance = (coords: Array<{ latitude: number; longitude: number }>) => {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += computeDistanceMeters(coords[i - 1], coords[i]);
  }
  return total;
};

const formatDistanceLabel = (meters?: number | null) => {
  if (!meters || meters <= 0) return '-- km';
  const km = meters / 1000;
  const decimals = km >= 100 ? 0 : km >= 10 ? 1 : 2;
  return `${km.toFixed(decimals)} km`;
};

const formatDurationLabel = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) return '-- min';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
};

const parseDate = (value: any): Date | null => {
  if (!value) return null;
  try {
    if (typeof value === 'number') {
      return new Date(value);
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (value instanceof Date) return value;
    if (typeof value === 'object') {
      if (value._seconds) {
        return new Date(value._seconds * 1000);
      }
      if (value.seconds) {
        return new Date(value.seconds * 1000);
      }
    }
  } catch (error) {
    console.warn('⚠️ No se pudo parsear fecha', value, error);
  }
  return null;
};

const formatEtaLabel = (rideData: any, durationSeconds: number | null) => {
  const etaCandidates = [
    rideData?.estimatedArrivalTime,
    rideData?.estimatedArrival,
    rideData?.etaTime,
    rideData?.etaTimestamp,
    rideData?.driverEta?.arrivalTime,
    rideData?.arrivalAt,
  ];

  for (const candidate of etaCandidates) {
    const date = parseDate(candidate);
    if (date) {
      return `Llega a las ${date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
  }

  if (durationSeconds && durationSeconds > 0) {
    const startDate =
      parseDate(rideData?.startedAt) ||
      parseDate(rideData?.acceptedAt) ||
      new Date();
    const etaDate = new Date(startDate.getTime() + durationSeconds * 1000);
    return `Llega a las ${etaDate.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  if (rideData?.status === 'accepted') {
    return 'Conductor en camino';
  }

  return 'Calculando...';
};

const deriveVehicleType = (vehicleDataType: string | null, rideData: any): string | null => {
  if (vehicleDataType) return vehicleDataType;

  const rideVehicleType = extractVehicleTypeFromInfo({ vehicle: rideData?.vehicle, vehicleType: rideData?.vehicleType });
  if (rideVehicleType) return rideVehicleType;

  const driverVehicleType = extractVehicleTypeFromInfo(rideData?.driver);
  if (driverVehicleType) return driverVehicleType;

  return rideData?.vehicleType ?? null;
};

const calculateRealRoute = async (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): Promise<Array<{ latitude: number; longitude: number }>> => {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM error ${response.status}`);
    }
    const data = await response.json();
    const coordinates: Array<[number, number]> = data?.routes?.[0]?.geometry?.coordinates ?? [];
    if (!coordinates.length) return [start, end];
    return coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch (error) {
    console.error('❌ Error calculando ruta con OSRM', error);
    return [start, end];
  }
};

interface DriverLocation {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

type RideTrackingScreenNewDesignProps = NativeStackScreenProps<ClientStackParamList, 'RideTracking'>;

// Hook para ubicación del conductor (reutilizado del archivo original)
const useDriverLocation = (driverId: string) => {
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [isConnected, setIsConnected] = useState(false);

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
              setIsConnected(false);
            }
          }
        );
      } catch (error) {
        console.error('❌ Error al suscribirse:', error);
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

// Hook para estado del viaje
const useRideStatus = (rideId: string) => {
  const { data: rideData, loading: rideLoading } = useFirebaseItem<any>(`activeRides`, rideId);

  const [rideStatus, setRideStatus] = useState('in_progress');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [finalFare, setFinalFare] = useState<number>(0);

  useEffect(() => {
    if (rideData) {
      setRideStatus(rideData.status || 'in_progress');
      
      if (rideData.payment?.method) {
        setPaymentMethod(rideData.payment.method);
      } else if (rideData.paymentMethod) {
        setPaymentMethod(rideData.paymentMethod);
      }
      
      setFinalFare(rideData.finalFare || rideData.estimatedPrice || 0);
    }
  }, [rideData]);

  return { rideStatus, paymentMethod, finalFare, rideData, loading: rideLoading };
};

// Hook para datos del conductor y vehículo
const useDriverAndVehicleData = (
  driverId: string,
  initialData: any,
  rideData?: any,
) => {
  const [driverData, setDriverData] = useState({
    name: initialData.driverName || 'Conductor',
    phone: initialData.driverPhone ?? null,
    photo: null as string | null,
  });

  const [vehicleData, setVehicleData] = useState({
    plate: initialData.vehiclePlate || 'N/A',
    brand: initialData.vehicleBrand || '',
    model: initialData.vehicleModel || '',
    color: initialData.vehicleColor || '',
    type: null as string | null,
  });

  const { data: driverDbData } = useFirebaseItem<any>('driversInfo', driverId, { once: false });

  useEffect(() => {
    if (!driverDbData) return;

    setDriverData(prev => ({
      ...prev,
      name: driverDbData.fullName || driverDbData.name || prev.name,
      phone: driverDbData.phone || driverDbData.phoneNumber || prev.phone,
      photo: driverDbData.photoURL || driverDbData.profilePhoto || prev.photo,
    }));

    const dbVehicle = driverDbData.vehicle || driverDbData.vehicleInfo;
    if (dbVehicle) {
      setVehicleData(prev => ({
        ...prev,
        plate: dbVehicle.plate || prev.plate,
        brand: dbVehicle.brand || dbVehicle.make || prev.brand,
        model: dbVehicle.model || prev.model,
        color: dbVehicle.color || prev.color,
        type: dbVehicle.type || prev.type,
      }));
    }
  }, [driverDbData]);

  useEffect(() => {
    if (!rideData) return;

    const rideDriver = rideData.driver || rideData.driverInfo;
    if (rideDriver) {
      setDriverData(prev => ({
        ...prev,
        name: rideDriver.name || prev.name,
        phone: rideDriver.phone || rideDriver.phoneNumber || prev.phone,
        photo: rideDriver.photoURL || rideDriver.profilePhoto || prev.photo,
      }));
    }

    if (
      rideData.vehicle ||
      rideData.vehicleInfo ||
      rideData.driver?.vehicle ||
      rideData.vehiclePlate ||
      rideData.vehicleBrand ||
      rideData.vehicleModel ||
      rideData.vehicleColor ||
      rideData.vehicleType
    ) {
      setVehicleData(prev => {
        const rideVehicle = rideData.vehicle || rideData.vehicleInfo || rideData.driver?.vehicle || {};
        const resolvedType = deriveVehicleType(
          rideVehicle?.type || rideData.vehicleType || prev.type,
          rideData,
        );

        return {
          ...prev,
          plate: rideVehicle?.plate || rideData.vehiclePlate || prev.plate,
          brand: rideVehicle?.brand || rideData.vehicleBrand || prev.brand,
          model: rideVehicle?.model || rideData.vehicleModel || prev.model,
          color: rideVehicle?.color || rideData.vehicleColor || prev.color,
          type: resolvedType,
        };
      });
    }
  }, [rideData]);

  return { driverData, vehicleData };
};

type LatLngPoint = { latitude: number; longitude: number };

// Hook para ubicaciones y rutas
const useDestinationAndRoute = (rideData: any) => {
  const [destinationCoords, setDestinationCoords] = useState<LatLngPoint | null>(null);
  const [originCoords, setOriginCoords] = useState<LatLngPoint | null>(null);
  const [waypointCoords, setWaypointCoords] = useState<LatLngPoint[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLngPoint[]>([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const extractLatLng = (value: any): LatLngPoint | null => {
      if (!value) return null;
      const latitude = value.latitude ?? value.lat ?? value._latitude ?? null;
      const longitude = value.longitude ?? value.lng ?? value._longitude ?? null;
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        return { latitude, longitude };
      }
      return null;
    };

    const resolveDurationFromRide = (): number | null => {
      const candidates = [
        rideData?.routeDuration,
        rideData?.duration,
        rideData?.estimatedDuration,
        rideData?.driverEta?.duration,
        rideData?.driverEta?.durationSeconds,
      ];
      for (const value of candidates) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          return value;
        }
      }
      return null;
    };

    const updateStaticData = () => {
      const destination = extractLatLng(rideData?.destination);
      if (destination) setDestinationCoords(destination);

      const origin = extractLatLng(rideData?.origin);
      if (origin) setOriginCoords(origin);

      if (Array.isArray(rideData?.extraDestinations)) {
        const waypoints = rideData.extraDestinations
          .map((value: any) => extractLatLng(value))
          .filter((point: LatLngPoint | null): point is LatLngPoint => !!point);
        setWaypointCoords(waypoints);
      } else {
        setWaypointCoords([]);
      }
    };

    const buildRoute = async () => {
      if (!isMounted) return;

      const sanitizeRouteCoords = (rawRoute: any[]): LatLngPoint[] =>
        rawRoute
          .map((value: any) => extractLatLng(value))
          .filter((point: LatLngPoint | null): point is LatLngPoint => !!point);

      const backendRoute = Array.isArray(rideData?.route) ? sanitizeRouteCoords(rideData.route) : [];
      if (backendRoute.length >= 2) {
        if (!isMounted) return;
        setRouteCoordinates(backendRoute);
        const backendDistance =
          typeof rideData?.routeDistance === 'number'
            ? rideData.routeDistance
            : typeof rideData?.distance === 'number'
            ? rideData.distance
            : typeof rideData?.estimatedDistance === 'number'
            ? rideData.estimatedDistance
            : calculatePolylineDistance(backendRoute);
        setRouteDistanceMeters(backendDistance);
        setRouteDurationSeconds(resolveDurationFromRide());
        return;
      }

      const origin = extractLatLng(rideData?.origin);
      const destination = extractLatLng(rideData?.destination);
      const stops = Array.isArray(rideData?.extraDestinations)
        ? rideData.extraDestinations
            .map((value: any) => extractLatLng(value))
            .filter((point: LatLngPoint | null): point is LatLngPoint => !!point)
        : [];

      if (!origin || !destination) {
        setRouteCoordinates([]);
        setRouteDistanceMeters(null);
        setRouteDurationSeconds(resolveDurationFromRide());
        return;
      }

      const points: LatLngPoint[] = [origin, ...stops, destination];
      const combinedRoute: LatLngPoint[] = [];
      let cumulativeDistance = 0;

      for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        const segment = await calculateRealRoute(start, end);
        const segmentDistance = calculatePolylineDistance(segment);
        cumulativeDistance += segmentDistance;

        segment.forEach((coord, index) => {
          if (i > 0 && index === 0) return;
          combinedRoute.push(coord);
        });
      }

      if (!isMounted) return;
      setRouteCoordinates(combinedRoute);
      setRouteDistanceMeters(cumulativeDistance > 0 ? cumulativeDistance : null);
      setRouteDurationSeconds(resolveDurationFromRide());
    };

    updateStaticData();
    setRouteDurationSeconds(resolveDurationFromRide());
    buildRoute();

    return () => {
      isMounted = false;
    };
  }, [rideData]);

  return {
    destinationCoords,
    originCoords,
    waypointCoords,
    routeCoordinates,
    routeDistanceMeters,
    routeDurationSeconds,
  };
};

export default function RideTrackingScreenNewDesign({ route, navigation }: RideTrackingScreenNewDesignProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords: clientCoords } = useLocation();

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

  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Conectando con el conductor...');
  
  const { driverLocation, isConnected } = useDriverLocation(driverId);
  const { rideStatus, paymentMethod, finalFare, rideData, loading: rideLoading } = useRideStatus(rideId);
  const { driverData, vehicleData } = useDriverAndVehicleData(driverId, { driverName, vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, rideData });
  const { destinationCoords, originCoords, waypointCoords, routeCoordinates, routeDistanceMeters, routeDurationSeconds } = useDestinationAndRoute(rideData);
  
  // Panel retráctil
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const panelTranslateY = useRef(new Animated.Value(0)).current;
  const [isCancellingRide, setIsCancellingRide] = useState(false);
  const cancelButtonScale = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0 && isPanelExpanded) {
          // Limitar el arrastre hacia abajo
          const maxDrag = PANEL_COLLAPSED_OFFSET;
          panelTranslateY.setValue(Math.min(gestureState.dy, maxDrag));
        } else if (gestureState.dy < 0 && !isPanelExpanded) {
          // Limitar el arrastre hacia arriba
          const maxDrag = PANEL_COLLAPSED_OFFSET;
          panelTranslateY.setValue(Math.max(gestureState.dy, -maxDrag));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const threshold = 50;
        if (gestureState.dy > threshold && isPanelExpanded) {
          compressPanel();
        } else if (gestureState.dy < -threshold && !isPanelExpanded) {
          expandPanel();
        } else {
          // Volver a posición actual
          if (isPanelExpanded) {
            Animated.spring(panelTranslateY, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          } else {
            Animated.spring(panelTranslateY, {
              toValue: PANEL_COLLAPSED_OFFSET,
              useNativeDriver: true,
            }).start();
          }
        }
      },
    })
  ).current;

  const expandPanel = () => {
    setIsPanelExpanded(true);
    Animated.spring(panelTranslateY, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };

  const compressPanel = () => {
    setIsPanelExpanded(false);
    Animated.spring(panelTranslateY, {
      toValue: PANEL_COLLAPSED_OFFSET,
      useNativeDriver: true,
    }).start();
  };

  const togglePanel = () => {
    if (isPanelExpanded) {
      compressPanel();
    } else {
      expandPanel();
    }
  };

  const isAccepted = rideStatus === 'accepted';
  const isInProgress = rideStatus === 'in_progress';
  
  useEffect(() => {
    if (rideData && driverLocation) {
      setLoading(false);
    } else if (rideLoading) {
      setLoadingMessage('Cargando detalles del viaje...');
    }
  }, [rideData, driverLocation, rideLoading]);
  
  useEffect(() => {
    switch (rideStatus) {
      case 'pending_payment':
      case 'completed':
        setTimeout(() => {
          if (paymentMethod === 'cash') {
            navigation.replace('CashPayment', {
              rideId,
              amount: finalFare || estimatedFare,
              driverName: driverData.name || driverName,
              driverPhoto: driverData.photo || undefined,
            });
          } else {
            navigation.replace('Payment', {
              rideId,
              amount: finalFare || estimatedFare,
              driverName: driverData.name || driverName,
              driverPhoto: driverData.photo || undefined,
            });
          }
        }, 500);
        break;
      case 'pending_rating':
        navigation.replace('Rating', { rideId });
        break;
      case 'canceled':
        setTimeout(() => {
          alertService.showInfoAlert('Viaje Cancelado', 'El viaje ha sido cancelado.', () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'ClientHome' }],
            });
          });
        }, 500);
        break;
    }
  }, [rideStatus, paymentMethod, finalFare, estimatedFare, driverData, driverName, rideId, navigation]);
  
  const handleGoBack = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'ClientHome' }],
    });
  }, [navigation]);

  const handleShareTrip = useCallback(async () => {
    try {
      const message = `🚗 Estoy en un viaje con ${driverData.name} (${vehicleData.brand} ${vehicleData.model} - ${vehicleData.color}) - Placa: ${vehicleData.plate}`;
      await Share.share({ message, title: 'Compartir viaje' });
    } catch (error) {
      console.error('Error al compartir viaje:', error);
    }
  }, [driverData, vehicleData]);
  
  const resetCancelAnimation = useCallback(() => {
    Animated.timing(cancelButtonScale, {
      toValue: 1,
      duration: 170,
      useNativeDriver: true,
    }).start();
    setIsCancellingRide(false);
  }, [cancelButtonScale]);

  const handleCancelRide = useCallback(() => {
    if (isCancellingRide) {
      return;
    }

    const canCancel = rideStatus !== 'completed' && rideStatus !== 'canceled';

    if (!canCancel) {
      alertService.showInfoAlert('No se puede cancelar', 'Este viaje no puede ser cancelado en este momento.');
      return;
    }

    setIsCancellingRide(true);
    Animated.timing(cancelButtonScale, {
      toValue: 0.94,
      duration: 130,
      useNativeDriver: true,
    }).start();

    alertService.showConfirmAlert(
      'Cancelar Viaje',
      '¿Estás seguro que deseas cancelar este viaje?',
      async () => {
        try {
          const result = await ridesService.cancelRide(rideId, 'Cancelado por el cliente');
          if (result.success) {
            alertService.showSuccessAlert('Viaje Cancelado', result.message, () => {
              navigation.reset({
                index: 0,
                routes: [{ name: 'ClientHome' }],
              });
            });
          } else {
            alertService.showErrorAlert(result.message || 'No se pudo cancelar el viaje');
          }
        } catch (error: any) {
          alertService.showErrorAlert(error?.message || 'No se pudo cancelar el viaje');
        } finally {
          resetCancelAnimation();
        }
      },
      () => {
        resetCancelAnimation();
      },
      'Cancelar viaje',
      'Seguir',
      true,
    );
  }, [cancelButtonScale, isCancellingRide, navigation, resetCancelAnimation, rideId, rideStatus]);

  const handleOpenChat = useCallback(() => {
    navigation.navigate('Chat', {
      rideId,
      otherUserName: driverData.name,
      otherUserPhone: driverData.phone || undefined,
    });
  }, [navigation, rideId, driverData.name, driverData.phone]);
  
  const getStatusColor = () => {
    switch (rideStatus) {
      case 'accepted':
      case 'driver_on_route':
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

  const getStatusText = () => {
    switch (rideStatus) {
      case 'accepted':
      case 'driver_on_route':
        return 'En camino';
      case 'in_progress':
        return 'En viaje';
      case 'completed':
        return 'Completado';
      case 'canceled':
        return 'Cancelado';
      default:
        return 'Status';
    }
  };

  // Etiquetas dinámicas para ETA, distancia y duración
  const distanceMeters = useMemo(() => {
    if (routeDistanceMeters && routeDistanceMeters > 0) return routeDistanceMeters;
    if (typeof rideData?.distance === 'number') return rideData.distance;
    if (typeof rideData?.estimatedDistance === 'number') return rideData.estimatedDistance;
    return null;
  }, [routeDistanceMeters, rideData?.distance, rideData?.estimatedDistance]);

  const durationSeconds = useMemo(() => {
    if (routeDurationSeconds && routeDurationSeconds > 0) return routeDurationSeconds;
    if (typeof rideData?.duration === 'number') return rideData.duration;
    if (typeof rideData?.estimatedDuration === 'number') return rideData.estimatedDuration;
    if (typeof rideData?.driverEta?.duration === 'number') return rideData.driverEta.duration;
    if (typeof rideData?.driverEta?.durationSeconds === 'number') return rideData.driverEta.durationSeconds;
    return null;
  }, [routeDurationSeconds, rideData?.duration, rideData?.estimatedDuration, rideData?.driverEta?.duration, rideData?.driverEta?.durationSeconds]);

  const etaLabel = useMemo(() => formatEtaLabel(rideData, durationSeconds), [rideData, durationSeconds]);
  const distanceLabel = useMemo(() => formatDistanceLabel(distanceMeters), [distanceMeters]);
  const durationLabel = useMemo(() => formatDurationLabel(durationSeconds), [durationSeconds]);
  const tripSummaryLabel = useMemo(() => `${durationLabel} - ${distanceLabel}`, [durationLabel, distanceLabel]);
  
  if (loading) {
    return <LoadingOverlay visible={true} message={loadingMessage} />;
  }

  if (!isConnected && !driverLocation) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Conectando con el conductor...</Text>
        <Text style={styles.errorDescription}>Por favor espera un momento</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Mapa */}
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
          markerVehicleType={vehicleData.type || undefined}
          markerVehicleIconSource={vehicleData.type ? ensureVehicleIconSource(vehicleData.type) : undefined}
          destinationMarker={destinationCoords ? destinationCoords : undefined}
          originMarker={isAccepted && originCoords ? originCoords : undefined}
          extraStopMarkers={
            waypointCoords && waypointCoords.length > 0
              ? waypointCoords.map((waypoint: LatLngPoint, index: number) => ({
                  latitude: waypoint.latitude,
                  longitude: waypoint.longitude,
                  index: index + 1,
                  color: '#FFA500',
                }))
              : undefined
          }
          routeCoordinates={routeCoordinates && routeCoordinates.length > 0 ? routeCoordinates : undefined}
        />
      </View>

      {/* Botón de regresar */}
      <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
        <Image source={BACK_BUTTON} style={styles.backButtonImage} />
      </TouchableOpacity>

      {/* Panel inferior retráctil */}
      <Animated.View 
        style={[
          styles.bottomPanel,
          {
            transform: [{ translateY: panelTranslateY }],
          }
        ]}
      >
        {/* Handle para arrastrar */}
        <View {...panResponder.panHandlers} style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* ETA siempre visible */}
        <View style={styles.etaSection}>
          <View style={styles.etaHeader}>
            <Text style={[isPanelExpanded ? styles.etaText : styles.etaTextLarge, { color: colors.text }]}>
              {etaLabel}
            </Text>
            <TouchableOpacity
              style={[styles.statusPill, { backgroundColor: getStatusColor() }]}
              onPress={togglePanel}
            >
              <Text style={styles.statusButtonText}>{getStatusText()}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.tripData, { color: colors.textSecondary }]}>
            Datos de viaje: {tripSummaryLabel}
          </Text>
        </View>

        {/* Contenido expandido */}
        {isPanelExpanded && (
          <ScrollView 
            style={styles.expandedContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          >

            {/* Info del Conductor */}
            <View style={styles.driverSection}>
              {driverData.photo ? (
                <Image source={{ uri: driverData.photo }} style={styles.driverAvatar} />
              ) : (
                <View style={[styles.driverAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.driverInitial}>
                    {driverData.name?.[0] || 'C'}
                  </Text>
                </View>
              )}
              
              <View style={styles.driverInfo}>
                <Text style={[styles.driverName, { color: colors.text }]}>
                  {driverData.name} - {vehicleData.plate}
                </Text>
                <Text style={[styles.vehicleInfo, { color: colors.textSecondary }]}>
                  {vehicleData.brand} {vehicleData.model} - {vehicleData.color}
                </Text>
              </View>

              {/* Botón de Mensaje */}
              <TouchableOpacity style={styles.messageButton} onPress={handleOpenChat}>
                <Text style={styles.messageIcon}>💬</Text>
              </TouchableOpacity>
            </View>

            {/* Ubicaciones */}
            <View style={styles.locationsContainer}>
              {originCoords && (
                <View style={styles.locationItem}>
                  <Text style={styles.locationIcon}>📍</Text>
                  <View style={styles.locationContent}>
                    <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
                      Punto de Recogida
                    </Text>
                    <Text style={[styles.locationAddress, { color: colors.text }]}>
                      {rideData?.origin?.address || 'Mi ubicación'}
                    </Text>
                  </View>
                </View>
              )}

              {waypointCoords && waypointCoords.length > 0 && (
                <>
                  {waypointCoords.map((waypoint, index) => {
                    const extraDest = rideData?.extraDestinations?.[index];
                    return (
                      <View key={`waypoint-${index}`} style={styles.locationItem}>
                        <Text style={styles.locationIcon}>🟠</Text>
                        <View style={styles.locationContent}>
                          <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
                            Parada {index + 1}
                          </Text>
                          <Text style={[styles.locationAddress, { color: colors.text }]}>
                            {extraDest?.address || `Parada ${index + 1}`}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              {destinationCoords && (
                <View style={styles.locationItem}>
                  <Text style={styles.locationIcon}>🎯</Text>
                  <View style={styles.locationContent}>
                    <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>
                      Destino Final
                    </Text>
                    <Text style={[styles.locationAddress, { color: colors.text }]}>
                      {rideData?.destination?.address || 'Destino'}
                    </Text>
                  </View>
                </View>
              )}
            </View>

          </ScrollView>
        )}

        {/* Botones de Acción - siempre visibles */}
        <View style={styles.actionButtons}>
          <AnimatedTouchableOpacity
            style={[
              styles.cancelButton,
              {
                backgroundColor: '#FF4444',
                transform: [{ scale: cancelButtonScale }],
                opacity: isCancellingRide ? 0.7 : 1,
              },
            ]}
            onPress={handleCancelRide}
            disabled={isCancellingRide}
            activeOpacity={0.85}
          >
            {isCancellingRide ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            )}
          </AnimatedTouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

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
  
  // Botón de regresar
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 64 : 28,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card + 'F5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 10,
  },
  backButtonImage: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  
  // Botón Status flotante
  statusButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 10,
  },
  statusButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  
  // Panel inferior retráctil
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PANEL_MAX_HEIGHT,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    overflow: 'hidden',
  },
  
  // Handle para arrastrar
  handleContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: colors.textSecondary || '#999',
    borderRadius: 3,
    opacity: 0.5,
  },
  
  etaTextLarge: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  
  // Contenido expandido
  expandedContent: {
    flex: 1,
    maxHeight: PANEL_MAX_HEIGHT - 160,
  },
  
  // ETA
  etaSection: {
    marginBottom: 16,
  },
  etaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  etaText: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  tripData: {
    fontSize: 13,
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  
  // Conductor
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '40',
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  vehicleInfo: {
    fontSize: 13,
  },
  messageButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border + '60',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageIcon: {
    fontSize: 22,
  },
  
  // Ubicaciones
  locationsContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '40',
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  locationContent: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  
  // Botones de acción
  actionButtons: {
    gap: 12,
    marginTop: 8,
  },
  shareButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  
  // Error
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
    textAlign: 'center',
  },
});
