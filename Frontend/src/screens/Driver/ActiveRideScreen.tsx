import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert, // Mantenemos Alert temporalmente para migración gradual
  Linking,
  Platform,
  Image,
  ScrollView,
} from 'react-native';

// Servicio centralizado de alertas
import alertService from '../../services/alertService';
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
import { getDatabase, ref, onValue, off, DataSnapshot } from 'firebase/database';
// ✅ NUEVO: Imports para guardar ubicaciones con pgRideId
import { getFirebaseFunctions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { hasSavedCard, getCardsList } from '../../utils/cardUtils';

interface RouteParams {
  rideId: string;
}

/**
 * Calcular ruta real usando OpenRouteService (gratuito)
 * Retorna array de coordenadas que siguen las calles
 */
async function calculateRealRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<Array<{ latitude: number; longitude: number }>> {
  try {
    console.log(`🗺️ Calculando ruta de [${startLat}, ${startLng}] a [${endLat}, ${endLng}]`);
    
    // Usar OpenRouteService (gratuito, sin API key para uso básico)
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
    
    // Extraer coordenadas de la geometría
    const coordinates = data.routes[0].geometry.coordinates;
    
    // Convertir de [lng, lat] a { latitude, longitude }
    const route = coordinates.map((coord: [number, number]) => ({
      longitude: coord[0],
      latitude: coord[1],
    }));
    
    console.log(`✅ Ruta calculada con ${route.length} puntos`);
    return route;
  } catch (error) {
    console.error('❌ Error calculando ruta:', error);
    
    // Fallback: línea recta
    return [
      { latitude: startLat, longitude: startLng },
      { latitude: endLat, longitude: endLng },
    ];
  }
}

export default function ActiveRideScreen({ route, navigation }: any) {
  const { rideId } = route.params as RouteParams;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  // Estado para cliente compartiendo ubicación
  const [clientLocation, setClientLocation] = useState<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);

  // Estado para tracking del viaje
  const [isTracking, setIsTracking] = useState(false);
  const [rideStartTime, setRideStartTime] = useState<Date | null>(null);
  const [rideTimer, setRideTimer] = useState(0);
  const [showDeviationAlert, setShowDeviationAlert] = useState(false);
  const { coords } = useLocation();

  // Si es designated_driver, hay dos conductores
  const [isDesignatedDriver, setIsDesignatedDriver] = useState(false);
  const [designatedDriverConfirmed, setDesignatedDriverConfirmed] = useState(false);

  // Estado para detectar si llegó a la ubicación del cliente
  const [arrivedAtPickup, setArrivedAtPickup] = useState(false);
  const [vehicleInspectionCompleted, setVehicleInspectionCompleted] = useState(false);

  // Inicializamos el tracking con false, lo actualizaremos cuando tengamos el estado del viaje
  const { startTracking, stopTracking, isBackgroundTracking } = useRouteTracking({
    rideId,
    isActive: false, // Se actualizará después cuando tengamos el estado del viaje
    useBackgroundTracking: true
  });

  // Estados para snapping a la ruta actual
  const [snapToRoute, setSnapToRoute] = useState(true);
  const [routePolyline, setRoutePolyline] = useState<any[]>([]);

  // Verificamos si es conductor designado
  useEffect(() => {
    if (ride) {
      setIsDesignatedDriver(Boolean(ride.designatedDriverRide));
      setDesignatedDriverConfirmed(Boolean(ride.designatedDriverConfirmed));
    }
  }, [ride]);

  // Estado derivado para las fases del viaje
  const isPendingConfirm = ride?.status === 'pending_confirm';
  const isAccepted = ride?.status === 'accepted';
  const isInProgress = ride?.status === 'in_progress';

  // Cargar datos del viaje desde Firebase
  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    let hasShownConfirmation = false; // Para mostrar alerta solo una vez

    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);

    onValue(rideRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        console.log(`🚕 Datos del viaje ${rideId} actualizados:`, data.status);
        console.log('📦 RIDE COMPLETO:', JSON.stringify(data, null, 2));
        console.log('🗺️ routeCoordinates?', data.routeCoordinates?.length || 0, 'puntos');
        console.log('🗺️ route?', data.route?.length || 0, 'puntos');
        // ✅ NUEVO: Log para verificar extraDestinations
        console.log('📍 extraDestinations?', data.extraDestinations?.length || 0, 'paradas');
        console.log('📍 hasMultipleDestinations?', data.hasMultipleDestinations);
        console.log('📍 waypointsCount?', data.waypointsCount);
        if (data.extraDestinations && data.extraDestinations.length > 0) {
          console.log('📍 Paradas encontradas:', JSON.stringify(data.extraDestinations, null, 2));
        }
        // Log de todas las claves del objeto ride
        console.log('🔑 Claves en ride:', Object.keys(data));
        setRide(data);
        setLoading(false);

        // Si hay datos de pago, obtener método
        try {
          // ✅ CORREGIDO: Buscar en paymentStatus (no payment)
          if (data.paymentStatus && data.paymentStatus.method) {
            console.log(`💳 [ActiveRideScreen] Método de pago del viaje: ${data.paymentStatus.method}`);
            setPaymentMethod(data.paymentStatus.method);
          } else if (data.payment && data.payment.method) {
            // Fallback: por si existe en payment (compatibilidad)
            console.log(`💳 [ActiveRideScreen] Método de pago del viaje (fallback): ${data.payment.method}`);
            setPaymentMethod(data.payment.method);
          } else {
            console.log(`💳 [ActiveRideScreen] No hay método de pago, usando default: cash`);
            setPaymentMethod('cash');
          }
        } catch (error) {
          console.error(`❌ [ActiveRideScreen] Error obteniendo método de pago:`, error);
          setPaymentMethod('cash');
        }
        
        // Detectar cuando el cliente confirma el viaje (solo una vez)
        if (!hasShownConfirmation && data.status === 'accepted' && ride?.status === 'pending_confirm') {
          hasShownConfirmation = true;
          alertService.showSuccessAlert(
            '✅ Cliente Confirmó',
            'El cliente aceptó el viaje. Dirígete al punto de recogida.'
          );
        }

        // Si el viaje fue cancelado o completado, volver atrás
        if (data.status === 'canceled' || data.status === 'completed') {
          alertService.showInfoAlert(
            'Viaje Finalizado',
            `El viaje ha sido ${data.status === 'canceled' ? 'cancelado' : 'completado'}`,
            () => navigation.goBack()
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
  }, [rideId]); // Solo depende de rideId, no de ride

  // Timer del viaje
  useEffect(() => {
    if (!rideStartTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - rideStartTime.getTime()) / 1000);
      setRideTimer(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [rideStartTime]);

  // Escuchar ubicación del cliente en tiempo real
  useEffect(() => {
    if (!rideId) return;

    const db = getDatabase();
    const clientLocationRef = ref(db, `rideLocations/${rideId}/client`);

    onValue(clientLocationRef, (snapshot) => {
      const locationData = snapshot.val();
      if (locationData && locationData.latitude && locationData.longitude) {
        setClientLocation({
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          timestamp: locationData.timestamp || Date.now(),
        });
      }
    });

    return () => {
      off(clientLocationRef);
    };
  }, [rideId]);

  // Usar ruta precalculada del backend o calcular si no existe
  useEffect(() => {
    const setupRoute = async () => {
      if (!coords || !ride) {
        console.log('⚠️ No hay coordenadas o ride disponible');
        return;
      }
      
      console.log('🗺️ Configurando ruta...');
      console.log('🚗 ride status:', ride?.status);
      console.log('🎯 isAccepted:', isAccepted, 'isInProgress:', isInProgress);
      console.log('📦 Datos completos del ride:', JSON.stringify(ride, null, 2));
      
      // PRIORIDAD 1: Usar ruta precalculada del backend si existe
      if (ride.routeCoordinates && Array.isArray(ride.routeCoordinates) && ride.routeCoordinates.length > 0) {
        console.log('✅ Usando ruta precalculada del backend:', ride.routeCoordinates.length, 'puntos');
        setRoutePolyline(ride.routeCoordinates);
        setLoadError(null);
        return;
      }
      
      console.log('⚠️ No hay ruta precalculada en ride.routeCoordinates');
      console.log('🔍 Verificando si existe en ride.route:', ride.route);
      
      // Verificar formatos alternativos
      if (ride.route && Array.isArray(ride.route) && ride.route.length > 0) {
        console.log('✅ Encontrada ruta en ride.route:', ride.route.length, 'puntos');
        setRoutePolyline(ride.route);
        setLoadError(null);
        return;
      }
      
      console.log('⚠️ No hay ruta del backend, calculando ruta real...');
      
      // Validar que todas las coordenadas necesarias existan
      const validateCoords = (lat: any, lng: any, label: string): boolean => {
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          console.error(`❌ Coordenadas inválidas para ${label}:`, { lat, lng });
          return false;
        }
        if (isNaN(lat) || isNaN(lng)) {
          console.error(`❌ Coordenadas NaN para ${label}:`, { lat, lng });
          return false;
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.error(`❌ Coordenadas fuera de rango para ${label}:`, { lat, lng });
          return false;
        }
        return true;
      };
      
      // CALCULAR RUTA REAL usando OpenRouteService
      try {
        const originLat = ride.origin?.lat || ride.origin?.latitude;
        const originLng = ride.origin?.lng || ride.origin?.longitude;
        const destLat = ride.destination?.lat || ride.destination?.latitude;
        const destLng = ride.destination?.lng || ride.destination?.longitude;
        
        if (!validateCoords(originLat, originLng, 'Origen') || 
            !validateCoords(destLat, destLng, 'Destino') ||
            !validateCoords(coords.latitude, coords.longitude, 'Conductor')) {
          setLoadError('Coordenadas inválidas');
          return;
        }
        
        // Calcular ruta real
        if (isAccepted) {
          // ✅ MEJORADO: Conductor → Origen → Paradas extras → Destino
          console.log('🗺️ Calculando ruta: Conductor → Origen → Paradas → Destino');
          console.log('📍 Paradas extras:', ride?.extraDestinations?.length || 0);
          
          const routeSegments: any[] = [];
          let currentLat = coords.latitude;
          let currentLng = coords.longitude;
          
          // Segmento 1: Conductor → Origen
          const route1 = await calculateRealRoute(
            currentLat, currentLng,
            originLat, originLng
          );
          routeSegments.push(...route1);
          currentLat = originLat;
          currentLng = originLng;
          
          // ✅ NUEVO: Segmentos a través de paradas extras
          if (ride?.extraDestinations && ride.extraDestinations.length > 0) {
            console.log('📍 Calculando ruta a través de', ride.extraDestinations.length, 'paradas');
            for (const waypoint of ride.extraDestinations) {
              const waypointLat = waypoint.lat || waypoint.latitude;
              const waypointLng = waypoint.lng || waypoint.longitude;
              
              if (validateCoords(waypointLat, waypointLng, `Parada`)) {
                const waypointRoute = await calculateRealRoute(
                  currentLat, currentLng,
                  waypointLat, waypointLng
                );
                routeSegments.push(...waypointRoute);
                currentLat = waypointLat;
                currentLng = waypointLng;
              }
            }
          }
          
          // Segmento final: Última parada (o origen) → Destino
          const finalRoute = await calculateRealRoute(
            currentLat, currentLng,
            destLat, destLng
          );
          routeSegments.push(...finalRoute);
          
          setRoutePolyline(routeSegments);
          console.log('✅ Ruta real calculada:', routeSegments.length, 'puntos con', ride?.extraDestinations?.length || 0, 'paradas');
        } else if (isInProgress) {
          // ✅ MEJORADO: Conductor → Paradas extras → Destino
          console.log('🗺️ Calculando ruta: Conductor → Paradas → Destino');
          console.log('📍 Paradas extras:', ride?.extraDestinations?.length || 0);
          
          const routeSegments: any[] = [];
          let currentLat = coords.latitude;
          let currentLng = coords.longitude;
          
          // ✅ NUEVO: Segmentos a través de paradas extras
          if (ride?.extraDestinations && ride.extraDestinations.length > 0) {
            console.log('📍 Calculando ruta a través de', ride.extraDestinations.length, 'paradas');
            for (const waypoint of ride.extraDestinations) {
              const waypointLat = waypoint.lat || waypoint.latitude;
              const waypointLng = waypoint.lng || waypoint.longitude;
              
              if (validateCoords(waypointLat, waypointLng, `Parada`)) {
                const waypointRoute = await calculateRealRoute(
                  currentLat, currentLng,
                  waypointLat, waypointLng
                );
                routeSegments.push(...waypointRoute);
                currentLat = waypointLat;
                currentLng = waypointLng;
              }
            }
          }
          
          // Segmento final: Última parada (o conductor) → Destino
          const finalRoute = await calculateRealRoute(
            currentLat, currentLng,
            destLat, destLng
          );
          routeSegments.push(...finalRoute);
          
          setRoutePolyline(routeSegments);
          console.log('✅ Ruta real calculada:', routeSegments.length, 'puntos con', ride?.extraDestinations?.length || 0, 'paradas');
        }
        
        setLoadError(null);
      } catch (error: any) {
        console.error('❌ Error calculando ruta:', error);
        
        // FALLBACK: Si falla el cálculo, usar líneas rectas
        console.log('⚠️ Usando líneas rectas como fallback');
        try {
          const originLat = ride.origin?.lat || ride.origin?.latitude;
          const originLng = ride.origin?.lng || ride.origin?.longitude;
          const destLat = ride.destination?.lat || ride.destination?.latitude;
          const destLng = ride.destination?.lng || ride.destination?.longitude;
          
          if (isAccepted) {
            // ✅ MEJORADO: Incluir paradas en fallback
            const straightLineRoute = [
              { latitude: coords.latitude, longitude: coords.longitude },
              { latitude: originLat, longitude: originLng },
            ];
            
            // Agregar paradas extras si existen
            if (ride?.extraDestinations && ride.extraDestinations.length > 0) {
              for (const waypoint of ride.extraDestinations) {
                const waypointLat = waypoint.lat || waypoint.latitude;
                const waypointLng = waypoint.lng || waypoint.longitude;
                if (typeof waypointLat === 'number' && typeof waypointLng === 'number') {
                  straightLineRoute.push({ latitude: waypointLat, longitude: waypointLng });
                }
              }
            }
            
            straightLineRoute.push({ latitude: destLat, longitude: destLng });
            setRoutePolyline(straightLineRoute);
          } else if (isInProgress) {
            // ✅ MEJORADO: Incluir paradas en fallback
            const straightLineRoute = [
              { latitude: coords.latitude, longitude: coords.longitude },
            ];
            
            // Agregar paradas extras si existen
            if (ride?.extraDestinations && ride.extraDestinations.length > 0) {
              for (const waypoint of ride.extraDestinations) {
                const waypointLat = waypoint.lat || waypoint.latitude;
                const waypointLng = waypoint.lng || waypoint.longitude;
                if (typeof waypointLat === 'number' && typeof waypointLng === 'number') {
                  straightLineRoute.push({ latitude: waypointLat, longitude: waypointLng });
                }
              }
            }
            
            straightLineRoute.push({ latitude: destLat, longitude: destLng });
            setRoutePolyline(straightLineRoute);
          }
        } catch (fallbackError) {
          console.error('❌ Error en fallback:', fallbackError);
          setLoadError('Error al crear la ruta');
        }
      }
    };

    setupRoute();
  }, [ride, coords]); // Ejecutar cuando cambie el viaje o las coordenadas

  // Iniciar/detener tracking según estado del viaje
  useEffect(() => {
    if (isInProgress && !isTracking && coords) {
      console.log('🛰️ Iniciando tracking de ubicación en primer plano');
      startTracking(rideId);
      setIsTracking(true);

      // Nota: el tracking en background se maneja internamente en useRouteTracking
    } else if (!isInProgress && isTracking) {
      console.log('🛑 Deteniendo tracking de ubicación');
      stopTracking();
      setIsTracking(false);
      
      // Nota: el tracking en background se detiene automáticamente
    }
  }, [isInProgress, isTracking, coords, startTracking, rideId]); // Quitar stopBackgroundTracking de las dependencias de useEffect

  // Detectar si llegó a la ubicación del cliente
  useEffect(() => {
    if (isAccepted && coords && ride?.origin) {
      // Calcular distancia usando Haversine
      const R = 6371; // Radio de la Tierra en km
      const dLat = (ride.origin.latitude - coords.latitude) * Math.PI / 180;
      const dLon = (ride.origin.longitude - coords.longitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(coords.latitude * Math.PI / 180) * Math.cos(ride.origin.latitude * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      
      // Si está a menos de 100 metros del origen, marcarlo como llegado
      if (distance < 0.1) { // 0.1 km = 100 metros
        setArrivedAtPickup(true);
      } else {
        setArrivedAtPickup(false);
      }
    }
  }, [coords, isAccepted, ride]);

  // Función para verificar si el vehículo necesita inspección
  const needsVehicleInspection = () => {
    return isDesignatedDriver && isInProgress && !designatedDriverConfirmed;
  };

  // Función para abrir inspección del vehículo
  const handleInspectVehicle = () => {
    if (!isDesignatedDriver || !ride) return;
    
    navigation.navigate('VehicleInspection', {
      rideId: rideId,
      clientName: ride.clientName,
      clientVehicleInfo: {
        brand: ride.clientVehicle?.brand,
        model: ride.clientVehicle?.model,
        color: ride.clientVehicle?.color,
        plate: ride.clientVehicle?.plate,
      }
    });
  };

   // Iniciar viaje
   const handleStartRide = async () => {
    try {
      setUpdating(true);
      
      // Verificar si necesita inspección del vehículo (solo para conductores designados)
      if (needsVehicleInspection()) {
        // Navegar a la pantalla de inspección
        navigation.navigate('VehicleInspection', {
          rideId,
          clientName: ride?.client?.name || 'Cliente'
        });
        setUpdating(false);
        return;
      }
      
      // Iniciar viaje normalmente
      await ridesService.updateRideStatus(rideId, 'in_progress');
      setRideStartTime(new Date());
      alertService.showSuccessAlert('¡Viaje Iniciado!', 'El viaje ha comenzado');
      // Firebase listener actualizará automáticamente
    } catch (error) {
      alertService.showErrorAlert('No se pudo iniciar el viaje');
      console.error('Error al iniciar viaje:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleCompleteRide = async () => {
    alertService.showConfirmAlert(
      'Completar Viaje',
      '¿Has llegado al destino?',
      async () => {
        try {
          setUpdating(true);
          console.log('🏁 [ActiveRideScreen] Completando viaje:', rideId);
          
          // Calcular datos del viaje completado
          const finalFare = ride?.finalFare || ride?.estimatedPrice || 0;
          const actualDistance = ride?.estimatedDistance || 0;
          const actualDuration = ride?.estimatedDuration || 0;
          
          console.log('💰 [ActiveRideScreen] Datos del viaje:', { finalFare, actualDistance, actualDuration, paymentMethod });
          
          // ✅ NUEVO: Obtener pgRideId del response
          const result = await ridesService.updateRideStatus(rideId, 'pending_payment', {
            finalFare,
            actualDistance,
            actualDuration,
            completedAt: Date.now(),
          });
          
          const { pgRideId } = result;  // ← Extraer pgRideId
          console.log(`✅ [ActiveRideScreen] Viaje completado. Firebase ID: ${rideId}, PostgreSQL ID: ${pgRideId}`);
          
          // ✅ NUEVO: Guardar ubicaciones con pgRideId
          if (pgRideId && coords) {
            console.log(`📍 [ActiveRideScreen] Guardando ubicaciones con pgRideId: ${pgRideId}`);
            try {
              const functions = await getFirebaseFunctions();
              const saveLocationFn = httpsCallable(functions, 'saveRideLocationWithRetry');
              
              await saveLocationFn({
                rideId: pgRideId,  // ← Usar pgRideId
                latitude: coords.latitude,
                longitude: coords.longitude,
                speed: coords.speed || null,
                heading: coords.heading || null,
                accuracy: coords.accuracy || null,
              });
              
              console.log('✅ [ActiveRideScreen] Ubicaciones guardadas');
            } catch (locError) {
              console.warn('⚠️ [ActiveRideScreen] Error guardando ubicaciones:', locError);
              // No lanzar error - continuar con el flujo
            }
          }
          
          // Navegar a pantalla unificada de confirmación de pago
          console.log(`💳 [ActiveRideScreen] Navegando a PaymentConfirmation con método: ${paymentMethod}`);
          alertService.showSuccessAlert('¡Viaje Completado!', 'Procede con la confirmación del pago');
          navigation.replace('PaymentConfirmation', { 
            rideId,
            pgRideId,  // ← Pasar pgRideId a PaymentConfirmation
            amount: finalFare,
            tip: 0,
            clientName: ride?.clientName || 'Cliente',
            paymentMethod: paymentMethod as 'cash' | 'card'
          }); 
        } catch (error: any) {
          console.error('Error completando viaje:', error);
          alertService.showErrorAlert(error.message || 'No se pudo completar el viaje');
        } finally {
          setUpdating(false);
        }
      }
    );
  };

  const handleCancelRide = () => {
    alertService.showConfirmAlert(
      'Cancelar Viaje',
      '¿Estás seguro que deseas cancelar este viaje?',
      async () => {
        try {
          setUpdating(true);
          await ridesService.cancelRide(rideId, 'Cancelado por el conductor');
          alertService.showSuccessAlert(
            'Viaje Cancelado',
            'El viaje ha sido cancelado',
            () => navigation.goBack()
          );
        } catch (error: any) {
          alertService.showErrorAlert(error.response?.data?.message || 'No se pudo cancelar el viaje');
        } finally {
          setUpdating(false);
        }
      }
    );
  };

  const resolvedClientName = ride?.client?.fullName || ride?.client?.name || ride?.clientName || 'Cliente';
  const resolvedClientPhone = ride?.client?.phone || ride?.client?.phoneNumber || ride?.clientPhone || 'Sin teléfono';

  const handleOpenChat = () => {
    navigation.navigate('Chat', {
      rideId,
      otherUserName: resolvedClientName,
      otherUserPhone: resolvedClientPhone === 'Sin teléfono' ? null : resolvedClientPhone,
    });
  };

  const handleCallClient = () => {
    if (!ride?.client?.phone) {
      alertService.showErrorAlert('No hay número de teléfono disponible');
      return;
    }

    const phoneUrl = `tel:${ride.client.phone}`;
    Linking.canOpenURL(phoneUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(phoneUrl);
        } else {
          alertService.showErrorAlert('No se puede realizar la llamada');
        }
      })
      .catch((err) => console.error('Error al llamar:', err));
  };

  const handleNavigate = () => {
    console.log('🧭 Intentando navegar. Ride object completo:', JSON.stringify(ride, null, 2));

    if (!coords || !coords.latitude || !coords.longitude) {
      console.log('❌ Error: Ubicación actual del conductor no disponible');
      alertService.showErrorAlert('No se puede determinar tu ubicación actual. Verifica que el GPS esté activado.');
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
      alertService.showErrorAlert('El estado del viaje no permite navegación GPS.');
      return;
    }

    // Normalizar coordenadas (puede venir como lat/lng o latitude/longitude)
    const destLat = destination?.latitude || destination?.lat;
    const destLng = destination?.longitude || destination?.lng;

    if (!destination || !destLat || !destLng) {
      console.log('❌ Error: Destino no válido:', destination);
      alertService.showErrorAlert('Información de destino incompleta.');
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
       alertService.showErrorAlert('El estado del viaje no permite navegación GPS.');
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
       alertService.showErrorAlert('Coordenadas inválidas para navegación');
       return;
     }
 
     console.log('✅ Coordenadas válidas, procediendo con navegación');
 
     // ✅ MEJORADO: Agregar paradas adicionales si existen
     if (ride.extraDestinations && ride.extraDestinations.length > 0) {
       const extraWaypoints = ride.extraDestinations
         .map((stop: any) => `${stop.lat || stop.latitude},${stop.lng || stop.longitude}`)
         .join('|');
       waypoints = waypoints ? `${waypoints}|${extraWaypoints}` : extraWaypoints;
     }
 
     const stopsText = ride.extraDestinations && ride.extraDestinations.length > 0
       ? `\n\n📍 Paradas adicionales: ${ride.extraDestinations.length}\n${ride.extraDestinations.map((s: any, i: number) => `  ${i + 1}. ${s.address}`).join('\n')}`
       : '';
 
     // Usar el servicio centralizado para mostrar opciones de navegación
     alertService.showOptionsAlert(
       'Navegar con GPS',
       `${routeDescription}${stopsText}`,
       [
         {
           text: '🗺️ Google Maps',
           onPress: async () => {
             try {
               // Crear URLs para Google Maps
               const navigationUrl = Platform.select({
                 ios: `comgooglemaps://?saddr=${currentLat},${currentLng}&daddr=${finalDestLat},${finalDestLng}${waypoints ? `&waypoints=${waypoints}` : ''}&directionsmode=driving`,
                 android: `google.navigation:q=${finalDestLat},${finalDestLng}${waypoints ? `&waypoints=${waypoints}` : ''}&mode=d`,
               }) || '';
               
               const fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentLat},${currentLng}&destination=${finalDestLat},${finalDestLng}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
               
               // Usar el servicio para guardar estado y mostrar instrucciones
               await alertService.showExternalNavAlert(
                 'Cuando vuelvas a la app, presiona "Ver Viajes Disponibles" y luego "Viajes Activos" para regresar a este viaje.',
                 'ACTIVE_RIDE_ID',
                 rideId,
                 () => {
                   // Navegar a Google Maps
                   console.log('🗺️ Abriendo navegación en Google Maps');
                   Linking.canOpenURL(navigationUrl).then((supported) => {
                     Linking.openURL(supported ? navigationUrl : fallbackUrl);
                   }).catch(() => Linking.openURL(fallbackUrl));
                 }
               );
             } catch (error) {
               console.error('Error iniciando navegación:', error);
             }
           }
         },
         {
           text: '🚗 Waze',
           onPress: () => {
             // Waze no soporta waypoints, solo destino final
             const wazeUrl = `waze://?ll=${finalDestLat},${finalDestLng}&navigate=yes`;
             const wazeFallbackUrl = `https://www.waze.com/ul?ll=${finalDestLat},${finalDestLng}&navigate=yes`;
             
             console.log('🚗 Waze URL:', wazeUrl);
             
             Linking.canOpenURL(wazeUrl).then((supported) => {
               if (supported) {
                 Linking.openURL(wazeUrl);
               } else {
                 Linking.openURL(wazeFallbackUrl);
               }
             });
           }
         },
         { text: 'Cancelar', style: 'cancel' }
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
      <View style={styles.mapContainer}>
        {coords ? (
          <DynamicMap
            // Props según la interfaz DynamicMapProps
            latitude={coords.latitude}
            longitude={coords.longitude}
            showMarker={true}
            markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
            markerType="car"
            clientMarker={clientLocation ? {
              latitude: clientLocation.latitude,
              longitude: clientLocation.longitude
            } : undefined}
            originMarker={isAccepted && ride?.origin ? {
              latitude: ride.origin.lat || ride.origin.latitude,
              longitude: ride.origin.lng || ride.origin.longitude
            } : undefined}
            destinationMarker={ride?.destination ? {
              latitude: ride.destination.lat || ride.destination.latitude,
              longitude: ride.destination.lng || ride.destination.longitude
            } : undefined}
            // ✅ NUEVO: Pasar paradas extras como marcadores
            extraStopMarkers={
              (() => {
                // Debug: verificar si extraDestinations existe
                if (ride?.extraDestinations && ride.extraDestinations.length > 0) {
                  console.log('🟠 [DynamicMap] Renderizando', ride.extraDestinations.length, 'paradas');
                  return ride.extraDestinations.map((stop: any, index: number) => ({
                    latitude: stop.lat || stop.latitude,
                    longitude: stop.lng || stop.longitude,
                    index: index + 1,
                    color: '#FFA500', // Naranja para paradas
                  }));
                } else {
                  console.log('⚠️ [DynamicMap] No hay extraDestinations en ride');
                  return undefined;
                }
              })()
            }
            routeCoordinates={snapToRoute ? routePolyline : []}
          />
        ) : (
          <MapSkeleton />
        )}
        
        {/* Banner de error si la ruta falló */}
        {loadError && routePolyline.length === 0 && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerIcon}>⚠️</Text>
            <View style={styles.errorBannerContent}>
              <Text style={styles.errorBannerTitle}>Sin ruta calculada</Text>
              <Text style={styles.errorBannerText}>
                Usa el botón "Navegar" para abrir Google Maps
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Botón flotante para controlar snap a la ruta */}
      {routePolyline.length > 0 && (
        <TouchableOpacity
          style={[styles.snapButton, snapToRoute ? styles.snapActive : styles.snapInactive]}
          onPress={() => setSnapToRoute(!snapToRoute)}
        >
          <Text style={snapToRoute ? styles.snapActiveText : styles.snapInactiveText}>
            {snapToRoute ? '📌 Ruta Activa' : '📍 Sin Ruta'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Contenido */}
      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabecera con detalles del cliente */}
        <View style={styles.header}>
          <View style={styles.clientInfo}>
            <View style={styles.clientData}>
              <Text style={styles.clientName}>{resolvedClientName}</Text>
              <Text style={styles.clientPhone}>{resolvedClientPhone}</Text>
              
              {clientLocation && (
                <View style={styles.locationStatusContainer}>
                  <View style={[styles.dot, { backgroundColor: '#4CAF50' }]} />
                  <Text style={styles.locationStatus}>
                    Compartiendo ubicación
                  </Text>
                </View>
              )}
            </View>
            {ride?.client?.photoURL ? (
              <Image 
                source={{ uri: ride.client.photoURL }} 
                style={styles.clientPhoto} 
              />
            ) : (
              <View style={[styles.clientPhoto, { backgroundColor: colors.card }]}>
                <Text style={styles.clientInitial}>{resolvedClientName?.[0] || 'C'}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Detalles del viaje */}
        <View style={styles.rideDetails}>
          <View style={styles.addressContainer}>
            <View style={styles.addressIcon}>
              <Text>🚗</Text>
            </View>
            <View style={styles.addressContent}>
              <Text style={styles.addressLabel}>Tu Ubicación</Text>
              <Text style={styles.addressText}>{ride.driverLocationAddress || 'En movimiento'}</Text>
            </View>
          </View>
          
          {isAccepted && (
            <View style={styles.addressContainer}>
              <View style={[styles.addressIcon, styles.pickupIcon]}>
                <Text>📍</Text>
              </View>
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>Punto de Recogida</Text>
                <Text style={styles.addressText}>{ride.origin.address}</Text>
              </View>
            </View>
          )}
          
          {/* ✅ NUEVO: Paradas intermedias */}
          {ride?.extraDestinations && ride.extraDestinations.length > 0 && (
            <>
              {ride.extraDestinations.map((waypoint: any, index: number) => (
                <View key={`waypoint-${index}`} style={styles.addressContainer}>
                  <View style={[styles.addressIcon, styles.waypointIcon]}>
                    <Text>🟠</Text>
                  </View>
                  <View style={styles.addressContent}>
                    <Text style={styles.addressLabel}>Parada {index + 1}</Text>
                    <Text style={styles.addressText}>{waypoint.address || `Parada ${index + 1}`}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
          
          <View style={styles.addressContainer}>
            <View style={[styles.addressIcon, styles.dropoffIcon]}>
              <Text>🏁</Text>
            </View>
            <View style={styles.addressContent}>
              <Text style={styles.addressLabel}>Destino Final</Text>
              <Text style={styles.addressText}>{ride.destination.address}</Text>
            </View>
          </View>

          {/* Información adicional del viaje */}
          <View style={styles.tripInfo}>
            <View style={styles.tripInfoItem}>
              <Text style={styles.tripInfoLabel}>Distancia</Text>
              <Text style={styles.tripInfoValue}>{(ride.estimatedDistance / 1000).toFixed(1)} km</Text>
            </View>
            
            <View style={styles.tripInfoItem}>
              <Text style={styles.tripInfoLabel}>Tiempo est.</Text>
              <Text style={styles.tripInfoValue}>
                {Math.ceil(ride.estimatedDuration / 60)} min
              </Text>
            </View>
            
            <View style={styles.tripInfoItem}>
              <Text style={styles.tripInfoLabel}>Tarifa</Text>
              <Text style={styles.tripInfoValue}>C${ride.finalFare || ride.estimatedPrice}</Text>
            </View>
            
            <View style={styles.tripInfoItem}>
              <Text style={styles.tripInfoLabel}>Pago</Text>
              <Text style={styles.tripInfoValue}>
                {paymentMethod === 'card' ? '💳 Tarjeta' : '💵 Efectivo'}
              </Text>
            </View>
          </View>
          
          {/* Tiempo transcurrido si el viaje está en progreso */}
          {isInProgress && (
            <View style={styles.timeElapsed}>
              <Text style={styles.timeElapsedLabel}>Tiempo Transcurrido</Text>
              <Text style={styles.timeElapsedValue}>{formatTime(rideTimer)}</Text>
            </View>
          )}
          
          {/* ETA si está disponible */}
          {isInProgress && (
            <View style={styles.etaContainer}>
              <ETADisplay 
                rideId={rideId}
                currentLat={coords ? coords.latitude : 0}
                currentLng={coords ? coords.longitude : 0}
                useRealtime={true}
              />
            </View>
          )}

          {/* Alerta de desviación */}
          {showDeviationAlert && (
            <View style={styles.deviationAlert}>
              <DeviationAlert 
                currentLat={coords ? coords.latitude : 0}
                currentLng={coords ? coords.longitude : 0}
                expectedRoute={routePolyline.map(point => ({
                  latitude: point.latitude || 0,
                  longitude: point.longitude || 0
                }))}
                threshold={500}
              />
            </View>
          )}

          {/* Barra de progreso del viaje */}
          <View style={styles.progressIndicator}>
            <RideProgressIndicator 
              progress={isInProgress ? 50 : isAccepted ? 25 : 0} 
              role="driver"
              rideStatus={ride.status}
              paymentMethod={paymentMethod as 'cash' | 'card'}
            />
          </View>
          
          {/* Acciones rápidas: Llamar, Navegar, Chat */}
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

          {isAccepted && arrivedAtPickup && isDesignatedDriver && !vehicleInspectionCompleted && (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#FF9800' }, updating && styles.buttonDisabled]}
              onPress={handleInspectVehicle}
              disabled={updating}
            >
              <Text style={styles.primaryButtonText}>
                📸 Inspeccionar Vehículo del Cliente
              </Text>
            </TouchableOpacity>
          )}

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
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    height: 280,
    width: '100%',
  },
  content: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  header: {
    backgroundColor: colors.card,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  clientInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clientData: {
    flex: 1,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  clientPhoto: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientInitial: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  clientPhone: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  locationStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  locationStatus: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rideDetails: {
    backgroundColor: colors.card,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  addressContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  addressIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  pickupIcon: {
    backgroundColor: '#42A5F5',
  },
  dropoffIcon: {
    backgroundColor: '#66BB6A',
  },
  // ✅ NUEVO: Estilo para paradas intermedias
  waypointIcon: {
    backgroundColor: '#FFA500',
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  addressText: {
    fontSize: 14,
    color: colors.text,
  },
  tripInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 16,
    padding: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tripInfoItem: {
    width: '48%',
    paddingVertical: 8,
  },
  tripInfoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  tripInfoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  timeElapsed: {
    alignItems: 'center',
    marginVertical: 10,
    padding: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeElapsedLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  timeElapsedValue: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  etaContainer: {
    marginTop: 10,
    marginBottom: 16,
  },
  deviationAlert: {
    marginTop: 10,
    marginBottom: 16,
  },
  progressIndicator: {
    marginVertical: 16,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 12,
    marginHorizontal: 16,
  },
  quickActionButton: {
    alignItems: 'center',
    padding: 12,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  quickActionText: {
    fontSize: 12,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f44336',
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  cancelButtonText: {
    color: '#f44336',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  waitingContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingIcon: {
    fontSize: 60,
    marginBottom: 20,
  },
  waitingTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
    color: colors.text,
    textAlign: 'center',
  },
  waitingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 30,
    textAlign: 'center',
    lineHeight: 22,
  },
  waitingCard: {
    backgroundColor: colors.card,
    width: '100%',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  waitingCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: colors.text,
  },
  waitingDetail: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  waitingDetailLabel: {
    width: 70,
    fontSize: 14,
    color: colors.textSecondary,
  },
  waitingDetailValue: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  infoNote: {
    backgroundColor: '#FFF9C4',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FBC02D',
    width: '100%',
  },
  infoNoteText: {
    fontSize: 14,
    color: '#5D4037',
    lineHeight: 20,
  },
  snapButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 10,
  },
  snapActive: {
    backgroundColor: colors.primary + 'F0',
  },
  snapInactive: {
    backgroundColor: colors.card + 'F0',
  },
  snapActiveText: {
    color: '#FFF',
    fontWeight: '600',
  },
  snapInactiveText: {
    color: colors.text,
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
  errorBanner: {
    position: 'absolute',
    top: 80,
    left: 16,
    right: 16,
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#FFE69C',
  },
  errorBannerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  errorBannerContent: {
    flex: 1,
  },
  errorBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 2,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 16,
  },
});
