import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert, // Mantenemos Alert temporalmente para migraci├│n gradual
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
// Γ£à NUEVO: Imports para guardar ubicaciones con pgRideId
import { getFirebaseFunctions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';

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
    console.log(`≡ƒù║∩╕Å Calculando ruta de [${startLat}, ${startLng}] a [${endLat}, ${endLng}]`);
    
    // Usar OpenRouteService (gratuito, sin API key para uso b├ísico)
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
      throw new Error('No se encontr├│ ninguna ruta');
    }
    
    // Extraer coordenadas de la geometr├¡a
    const coordinates = data.routes[0].geometry.coordinates;
    
    // Convertir de [lng, lat] a { latitude, longitude }
    const route = coordinates.map((coord: [number, number]) => ({
      longitude: coord[0],
      latitude: coord[1],
    }));
    
    console.log(`Γ£à Ruta calculada con ${route.length} puntos`);
    return route;
  } catch (error) {
    console.error('Γ¥î Error calculando ruta:', error);
    
    // Fallback: l├¡nea recta
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

  // Estado para cliente compartiendo ubicaci├│n
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

  // Estado para detectar si lleg├│ a la ubicaci├│n del cliente
  const [arrivedAtPickup, setArrivedAtPickup] = useState(false);
  const [vehicleInspectionCompleted, setVehicleInspectionCompleted] = useState(false);

  // Inicializamos el tracking con false, lo actualizaremos cuando tengamos el estado del viaje
  const { startTracking, stopTracking, isBackgroundTracking } = useRouteTracking({
    rideId,
    isActive: false, // Se actualizar├í despu├⌐s cuando tengamos el estado del viaje
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
        console.log(`≡ƒÜò Datos del viaje ${rideId} actualizados:`, data.status);
        console.log('≡ƒôª RIDE COMPLETO:', JSON.stringify(data, null, 2));
        console.log('≡ƒù║∩╕Å routeCoordinates?', data.routeCoordinates?.length || 0, 'puntos');
        console.log('≡ƒù║∩╕Å route?', data.route?.length || 0, 'puntos');
        // Γ£à NUEVO: Log para verificar extraDestinations
        console.log('≡ƒôì extraDestinations?', data.extraDestinations?.length || 0, 'paradas');
        console.log('≡ƒôì hasMultipleDestinations?', data.hasMultipleDestinations);
        console.log('≡ƒôì waypointsCount?', data.waypointsCount);
        if (data.extraDestinations && data.extraDestinations.length > 0) {
          console.log('≡ƒôì Paradas encontradas:', JSON.stringify(data.extraDestinations, null, 2));
        }
        // Log de todas las claves del objeto ride
        console.log('≡ƒöæ Claves en ride:', Object.keys(data));
        setRide(data);
        setLoading(false);

        // Si hay datos de pago, obtener m├⌐todo
        try {
          // Γ£à CORREGIDO: Buscar en paymentStatus (no payment)
          if (data.paymentStatus && data.paymentStatus.method) {
            console.log(`≡ƒÆ│ [ActiveRideScreen] M├⌐todo de pago del viaje: ${data.paymentStatus.method}`);
            setPaymentMethod(data.paymentStatus.method);
          } else if (data.payment && data.payment.method) {
            // Fallback: por si existe en payment (compatibilidad)
            console.log(`≡ƒÆ│ [ActiveRideScreen] M├⌐todo de pago del viaje (fallback): ${data.payment.method}`);
            setPaymentMethod(data.payment.method);
          } else {
            console.log(`≡ƒÆ│ [ActiveRideScreen] No hay m├⌐todo de pago, usando default: cash`);
            setPaymentMethod('cash');
          }
        } catch (error) {
          console.error(`Γ¥î [ActiveRideScreen] Error obteniendo m├⌐todo de pago:`, error);
          setPaymentMethod('cash');
        }
        
        // Detectar cuando el cliente confirma el viaje (solo una vez)
        if (!hasShownConfirmation && data.status === 'accepted' && ride?.status === 'pending_confirm') {
          hasShownConfirmation = true;
          alertService.showSuccessAlert(
            'Γ£à Cliente Confirm├│',
            'El cliente acept├│ el viaje. Dir├¡gete al punto de recogida.'
          );
        }

        // Si el viaje fue cancelado o completado, volver atr├ís
        if (data.status === 'canceled' || data.status === 'completed') {
          alertService.showInfoAlert(
            'Viaje Finalizado',
            `El viaje ha sido ${data.status === 'canceled' ? 'cancelado' : 'completado'}`,
            () => navigation.goBack()
          );
        }
      } else {
        console.log('Γ¥î No hay datos del viaje en Firebase');
        setLoadError('No se encontr├│ el viaje');
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

  // Escuchar ubicaci├│n del cliente en tiempo real
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
        console.log('ΓÜá∩╕Å No hay coordenadas o ride disponible');
        return;
      }
      
      console.log('≡ƒù║∩╕Å Configurando ruta...');
      console.log('≡ƒÜù ride status:', ride?.status);
      console.log('≡ƒÄ» isAccepted:', isAccepted, 'isInProgress:', isInProgress);
      console.log('≡ƒôª Datos completos del ride:', JSON.stringify(ride, null, 2));
      
      // PRIORIDAD 1: Usar ruta precalculada del backend si existe
      if (ride.routeCoordinates && Array.isArray(ride.routeCoordinates) && ride.routeCoordinates.length > 0) {
        console.log('Γ£à Usando ruta precalculada del backend:', ride.routeCoordinates.length, 'puntos');
        setRoutePolyline(ride.routeCoordinates);
        setLoadError(null);
        return;
      }
      
      console.log('ΓÜá∩╕Å No hay ruta precalculada en ride.routeCoordinates');
      console.log('≡ƒöì Verificando si existe en ride.route:', ride.route);
      
      // Verificar formatos alternativos
      if (ride.route && Array.isArray(ride.route) && ride.route.length > 0) {
        console.log('Γ£à Encontrada ruta en ride.route:', ride.route.length, 'puntos');
        setRoutePolyline(ride.route);
        setLoadError(null);
        return;
      }
      
      console.log('ΓÜá∩╕Å No hay ruta del backend, calculando ruta real...');
      
      // Validar que todas las coordenadas necesarias existan
      const validateCoords = (lat: any, lng: any, label: string): boolean => {
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          console.error(`Γ¥î Coordenadas inv├ílidas para ${label}:`, { lat, lng });
          return false;
        }
        if (isNaN(lat) || isNaN(lng)) {
          console.error(`Γ¥î Coordenadas NaN para ${label}:`, { lat, lng });
          return false;
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          console.error(`Γ¥î Coordenadas fuera de rango para ${label}:`, { lat, lng });
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
          setLoadError('Coordenadas inv├ílidas');
          return;
        }
        
        // Calcular ruta real
        if (isAccepted) {
          // Γ£à MEJORADO: Conductor ΓåÆ Origen ΓåÆ Paradas extras ΓåÆ Destino
          console.log('≡ƒù║∩╕Å Calculando ruta: Conductor ΓåÆ Origen ΓåÆ Paradas ΓåÆ Destino');
          console.log('≡ƒôì Paradas extras:', ride?.extraDestinations?.length || 0);
          
          const routeSegments: any[] = [];
          let currentLat = coords.latitude;
          let currentLng = coords.longitude;
          
          // Segmento 1: Conductor ΓåÆ Origen
          const route1 = await calculateRealRoute(
            currentLat, currentLng,
            originLat, originLng
          );
          routeSegments.push(...route1);
          currentLat = originLat;
          currentLng = originLng;
          
          // Γ£à NUEVO: Segmentos a trav├⌐s de paradas extras
          if (ride?.extraDestinations && ride.extraDestinations.length > 0) {
            console.log('≡ƒôì Calculando ruta a trav├⌐s de', ride.extraDestinations.length, 'paradas');
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
          
          // Segmento final: ├Ültima parada (o origen) ΓåÆ Destino
          const finalRoute = await calculateRealRoute(
            currentLat, currentLng,
            destLat, destLng
          );
          routeSegments.push(...finalRoute);
          
          setRoutePolyline(routeSegments);
          console.log('Γ£à Ruta real calculada:', routeSegments.length, 'puntos con', ride?.extraDestinations?.length || 0, 'paradas');
        } else if (isInProgress) {
          // Γ£à MEJORADO: Conductor ΓåÆ Paradas extras ΓåÆ Destino
          console.log('≡ƒù║∩╕Å Calculando ruta: Conductor ΓåÆ Paradas ΓåÆ Destino');
          console.log('≡ƒôì Paradas extras:', ride?.extraDestinations?.length || 0);
          
          const routeSegments: any[] = [];
          let currentLat = coords.latitude;
          let currentLng = coords.longitude;
          
          // Γ£à NUEVO: Segmentos a trav├⌐s de paradas extras
          if (ride?.extraDestinations && ride.extraDestinations.length > 0) {
            console.log('≡ƒôì Calculando ruta a trav├⌐s de', ride.extraDestinations.length, 'paradas');
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
          
          // Segmento final: ├Ültima parada (o conductor) ΓåÆ Destino
          const finalRoute = await calculateRealRoute(
            currentLat, currentLng,
            destLat, destLng
          );
          routeSegments.push(...finalRoute);
          
          setRoutePolyline(routeSegments);
          console.log('Γ£à Ruta real calculada:', routeSegments.length, 'puntos con', ride?.extraDestinations?.length || 0, 'paradas');
        }
        
        setLoadError(null);
      } catch (error: any) {
        console.error('Γ¥î Error calculando ruta:', error);
        
        // FALLBACK: Si falla el c├ílculo, usar l├¡neas rectas
        console.log('ΓÜá∩╕Å Usando l├¡neas rectas como fallback');
        try {
          const originLat = ride.origin?.lat || ride.origin?.latitude;
          const originLng = ride.origin?.lng || ride.origin?.longitude;
          const destLat = ride.destination?.lat || ride.destination?.latitude;
          const destLng = ride.destination?.lng || ride.destination?.longitude;
          
          if (isAccepted) {
            // Γ£à MEJORADO: Incluir paradas en fallback
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
            // Γ£à MEJORADO: Incluir paradas en fallback
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
          console.error('Γ¥î Error en fallback:', fallbackError);
          setLoadError('Error al crear la ruta');
        }
      }
    };

    setupRoute();
  }, [ride, coords]); // Ejecutar cuando cambie el viaje o las coordenadas

  // Iniciar/detener tracking seg├║n estado del viaje
  useEffect(() => {
    if (isInProgress && !isTracking && coords) {
      console.log('≡ƒ¢░∩╕Å Iniciando tracking de ubicaci├│n en primer plano');
      startTracking(rideId);
      setIsTracking(true);

      // Nota: el tracking en background se maneja internamente en useRouteTracking
    } else if (!isInProgress && isTracking) {
      console.log('≡ƒ¢æ Deteniendo tracking de ubicaci├│n');
      stopTracking();
      setIsTracking(false);
      
      // Nota: el tracking en background se detiene autom├íticamente
    }
  }, [isInProgress, isTracking, coords, startTracking, rideId]); // Quitar stopBackgroundTracking de las dependencias de useEffect

  // Detectar si lleg├│ a la ubicaci├│n del cliente
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
      
      // Si est├í a menos de 100 metros del origen, marcarlo como llegado
      if (distance < 0.1) { // 0.1 km = 100 metros
        setArrivedAtPickup(true);
      } else {
        setArrivedAtPickup(false);
      }
    }
  }, [coords, isAccepted, ride]);

  // Funci├│n para verificar si el veh├¡culo necesita inspecci├│n
  const needsVehicleInspection = () => {
    return isDesignatedDriver && isInProgress && !designatedDriverConfirmed;
  };

  // Funci├│n para abrir inspecci├│n del veh├¡culo
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
      
      // Verificar si necesita inspecci├│n del veh├¡culo (solo para conductores designados)
      if (needsVehicleInspection()) {
        // Navegar a la pantalla de inspecci├│n
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
      alertService.showSuccessAlert('┬íViaje Iniciado!', 'El viaje ha comenzado');
      // Firebase listener actualizar├í autom├íticamente
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
      '┬┐Has llegado al destino?',
      async () => {
        try {
          setUpdating(true);
          console.log('≡ƒÅü [ActiveRideScreen] Completando viaje:', rideId);
          
          // Calcular datos del viaje completado
          const finalFare = ride?.finalFare || ride?.estimatedPrice || 0;
          const actualDistance = ride?.estimatedDistance || 0;
          const actualDuration = ride?.estimatedDuration || 0;
          
          console.log('≡ƒÆ░ [ActiveRideScreen] Datos del viaje:', { finalFare, actualDistance, actualDuration, paymentMethod });
          
          // Γ£à NUEVO: Obtener pgRideId del response
          const result = await ridesService.updateRideStatus(rideId, 'pending_payment', {
            finalFare,
            actualDistance,
            actualDuration,
            completedAt: Date.now(),
          });
          
          const { pgRideId } = result;  // ΓåÉ Extraer pgRideId
          console.log(`Γ£à [ActiveRideScreen] Viaje completado. Firebase ID: ${rideId}, PostgreSQL ID: ${pgRideId}`);
          
          // Γ£à NUEVO: Guardar ubicaciones con pgRideId
          if (pgRideId && coords) {
            console.log(`≡ƒôì [ActiveRideScreen] Guardando ubicaciones con pgRideId: ${pgRideId}`);
            try {
              const functions = await getFirebaseFunctions();
              const saveLocationFn = httpsCallable(functions, 'saveRideLocationWithRetry');
              
              await saveLocationFn({
                rideId: pgRideId,  // ΓåÉ Usar pgRideId
                latitude: coords.latitude,
                longitude: coords.longitude,
                speed: coords.speed || null,
                heading: coords.heading || null,
                accuracy: coords.accuracy || null,
              });
              
              console.log('Γ£à [ActiveRideScreen] Ubicaciones guardadas');
            } catch (locError) {
              console.warn('ΓÜá∩╕Å [ActiveRideScreen] Error guardando ubicaciones:', locError);
              // No lanzar error - continuar con el flujo
            }
          }
          
          // Navegar a pantalla unificada de confirmaci├│n de pago
          console.log(`≡ƒÆ│ [ActiveRideScreen] Navegando a PaymentConfirmation con m├⌐todo: ${paymentMethod}`);
          alertService.showSuccessAlert('┬íViaje Completado!', 'Procede con la confirmaci├│n del pago');
          navigation.replace('PaymentConfirmation', { 
            rideId,
            pgRideId,  // ΓåÉ Pasar pgRideId a PaymentConfirmation
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
      '┬┐Est├ís seguro que deseas cancelar este viaje?',
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
  const resolvedClientPhone = ride?.client?.phone || ride?.client?.phoneNumber || ride?.clientPhone || 'Sin tel├⌐fono';

  const handleOpenChat = () => {
    navigation.navigate('Chat', {
      rideId,
      otherUserName: resolvedClientName,
      otherUserPhone: resolvedClientPhone === 'Sin tel├⌐fono' ? null : resolvedClientPhone,
    });
  };

  const handleCallClient = () => {
    if (!ride?.client?.phone) {
      alertService.showErrorAlert('No hay n├║mero de tel├⌐fono disponible');
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
    console.log('≡ƒº¡ Intentando navegar. Ride object completo:', JSON.stringify(ride, null, 2));

    if (!coords || !coords.latitude || !coords.longitude) {
      console.log('Γ¥î Error: Ubicaci├│n actual del conductor no disponible');
      alertService.showErrorAlert('No se puede determinar tu ubicaci├│n actual. Verifica que el GPS est├⌐ activado.');
      return;
    }

    // Determinar el destino basado en el estado del viaje
    let destination;
    let navigationMessage;

    if (isAccepted) {
      // Viaje aceptado pero no iniciado: navegar al ORIGEN del viaje
      destination = ride.origin;
      navigationMessage = 'Ruta desde tu ubicaci├│n actual hasta el punto de recogida del cliente';
    } else if (isInProgress) {
      // Viaje en progreso: navegar al DESTINO del viaje
      destination = ride.destination;
      navigationMessage = 'Ruta desde tu ubicaci├│n actual hasta el destino final';
    } else {
      console.log('Γ¥î Error: Estado del viaje inv├ílido para navegaci├│n');
      alertService.showErrorAlert('El estado del viaje no permite navegaci├│n GPS.');
      return;
    }

    // Normalizar coordenadas (puede venir como lat/lng o latitude/longitude)
    const destLat = destination?.latitude || destination?.lat;
    const destLng = destination?.longitude || destination?.lng;

    if (!destination || !destLat || !destLng) {
      console.log('Γ¥î Error: Destino no v├ílido:', destination);
      alertService.showErrorAlert('Informaci├│n de destino incompleta.');
      return;
    }

    const currentLat = coords.latitude;
    const currentLng = coords.longitude;

     // Determinar el destino final y waypoints basado en el estado del viaje
     let finalDestination;
     let waypoints = '';
     let routeDescription = '';
 
     if (isAccepted) {
       // Viaje aceptado: ruta desde ubicaci├│n actual ΓåÆ origen del viaje ΓåÆ destino del viaje
       finalDestination = ride.destination; // Destino final del viaje
       waypoints = `${destLat},${destLng}`; // Origen del viaje como waypoint
       routeDescription = `Ruta completa: Tu ubicaci├│n ΓåÆ Punto de recogida ΓåÆ Destino final`;
     } else if (isInProgress) {
       // Viaje en progreso: ruta desde ubicaci├│n actual ΓåÆ destino del viaje
       finalDestination = ride.destination;
       waypoints = '';
       routeDescription = `Ruta desde tu ubicaci├│n actual hasta el destino final`;
     } else {
       console.log('Γ¥î Error: Estado del viaje inv├ílido para navegaci├│n');
       alertService.showErrorAlert('El estado del viaje no permite navegaci├│n GPS.');
       return;
     }
 
     // Normalizar coordenadas del destino final
     const finalDestLat = finalDestination?.latitude || finalDestination?.lat;
     const finalDestLng = finalDestination?.longitude || finalDestination?.lng;
 
     console.log('≡ƒôì Coordenadas finales:', {
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
       console.log('Γ¥î Coordenadas inv├ílidas:', { currentLat, currentLng, finalDestLat, finalDestLng });
       alertService.showErrorAlert('Coordenadas inv├ílidas para navegaci├│n');
       return;
     }
 
     console.log('Γ£à Coordenadas v├ílidas, procediendo con navegaci├│n');
 
     // Γ£à MEJORADO: Agregar paradas adicionales si existen
     if (ride.extraDestinations && ride.extraDestinations.length > 0) {
       const extraWaypoints = ride.extraDestinations
         .map((stop: any) => `${stop.lat || stop.latitude},${stop.lng || stop.longitude}`)
         .join('|');
       waypoints = waypoints ? `${waypoints}|${extraWaypoints}` : extraWaypoints;
     }
 
     const stopsText = ride.extraDestinations && ride.extraDestinations.length > 0
       ? `\n\n≡ƒôì Paradas adicionales: ${ride.extraDestinations.length}\n${ride.extraDestinations.map((s: any, i: number) => `  ${i + 1}. ${s.address}`).join('\n')}`
       : '';
 
     // Usar el servicio centralizado para mostrar opciones de navegaci├│n
     alertService.showOptionsAlert(
       'Navegar con GPS',
       `${routeDescription}${stopsText}`,
       [
         {
           text: '≡ƒù║∩╕Å Google Maps',
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
                   console.log('≡ƒù║∩╕Å Abriendo navegaci├│n en Google Maps');
                   Linking.canOpenURL(navigationUrl).then((supported) => {
                     Linking.openURL(supported ? navigationUrl : fallbackUrl);
                   }).catch(() => Linking.openURL(fallbackUrl));
                 }
               );
             } catch (error) {
               console.error('Error iniciando navegaci├│n:', error);
             }
           }
         },
         {
           text: '≡ƒÜù Waze',
           onPress: () => {
             // Waze no soporta waypoints, solo destino final
             const wazeUrl = `waze://?ll=${finalDestLat},${finalDestLng}&navigate=yes`;
             const wazeFallbackUrl = `https://www.waze.com/ul?ll=${finalDestLat},${finalDestLng}&navigate=yes`;
             
             console.log('≡ƒÜù Waze URL:', wazeUrl);
             
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
           Error: El viaje no tiene informaci├│n completa de origen o destino.
         </Text>
         <TouchableOpacity
           style={[styles.primaryButton, { marginTop: 20 }]}
           onPress={() => {
             setLoadError(null);
             setLoading(true);
             // Firebase listener reintentar├í autom├íticamente
           }}
         >
           <Text style={styles.primaryButtonText}>Reintentar</Text>
         </TouchableOpacity>
       </View>
     );
   }
 
   // Pantalla de espera cuando est├í pending_confirm
   if (isPendingConfirm) {
     return (
       <View style={styles.container}>
         <View style={styles.waitingContainer}>
           <Text style={styles.waitingIcon}>ΓÅ│</Text>
           <Text style={styles.waitingTitle}>Esperando Confirmaci├│n</Text>
           <Text style={styles.waitingText}>
             El cliente est├í revisando tu oferta.{'\n'}
             Te notificaremos cuando confirme el viaje.
           </Text>
           
           <View style={styles.waitingCard}>
             <Text style={styles.waitingCardTitle}>≡ƒôì Detalles del Viaje</Text>
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
 
           {/* Nota informativa en lugar del bot├│n */}
           <View style={styles.infoNote}>
             <Text style={styles.infoNoteText}>
               ≡ƒÆí Permanece en esta pantalla hasta que el cliente confirme o rechace tu oferta.
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
            // Props seg├║n la interfaz DynamicMapProps
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
            // Γ£à NUEVO: Pasar paradas extras como marcadores
            extraStopMarkers={
              (() => {
                // Debug: verificar si extraDestinations existe
                if (ride?.extraDestinations && ride.extraDestinations.length > 0) {
                  console.log('≡ƒƒá [DynamicMap] Renderizando', ride.extraDestinations.length, 'paradas');
                  return ride.extraDestinations.map((stop: any, index: number) => ({
                    latitude: stop.lat || stop.latitude,
                    longitude: stop.lng || stop.longitude,
                    index: index + 1,
                    color: '#FFA500', // Naranja para paradas
                  }));
                } else {
                  console.log('ΓÜá∩╕Å [DynamicMap] No hay extraDestinations en ride');
                  return undefined;
                }
              })()
            }
            routeCoordinates={snapToRoute ? routePolyline : []}
          />
        ) : (
          <MapSkeleton />
        )}
        
        {/* Banner de error si la ruta fall├│ */}
        {loadError && routePolyline.length === 0 && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerIcon}>ΓÜá∩╕Å</Text>
            <View style={styles.errorBannerContent}>
              <Text style={styles.errorBannerTitle}>Sin ruta calculada</Text>
              <Text style={styles.errorBannerText}>
                Usa el bot├│n "Navegar" para abrir Google Maps
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Bot├│n flotante para controlar snap a la ruta */}
      {routePolyline.length > 0 && (
        <TouchableOpacity
          style={[styles.snapButton, snapToRoute ? styles.snapActive : styles.snapInactive]}
          onPress={() => setSnapToRoute(!snapToRoute)}
        >
          <Text style={snapToRoute ? styles.snapActiveText : styles.snapInactiveText}>
            {snapToRoute ? '≡ƒôî Ruta Activa' : '≡ƒôì Sin Ruta'}
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
                    Compartiendo ubicaci├│n
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
              <Text>≡ƒÜù</Text>
            </View>
            <View style={styles.addressContent}>
              <Text style={styles.addressLabel}>Tu Ubicaci├│n</Text>
              <Text style={styles.addressText}>{ride.driverLocationAddress || 'En movimiento'}</Text>
            </View>
          </View>
          
          {isAccepted && (
            <View style={styles.addressContainer}>
              <View style={[styles.addressIcon, styles.pickupIcon]}>
                <Text>≡ƒôì</Text>
              </View>
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>Punto de Recogida</Text>
                <Text style={styles.addressText}>{ride.origin.address}</Text>
              </View>
            </View>
          )}
          
          {/* Γ£à NUEVO: Paradas intermedias */}
          {ride?.extraDestinations && ride.extraDestinations.length > 0 && (
            <>
              {ride.extraDestinations.map((waypoint: any, index: number) => (
                <View key={`waypoint-${index}`} style={styles.addressContainer}>
                  <View style={[styles.addressIcon, styles.waypointIcon]}>
                    <Text>≡ƒƒá</Text>
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
              <Text>≡ƒÅü</Text>
            </View>
            <View style={styles.addressContent}>
              <Text style={styles.addressLabel}>Destino Final</Text>
              <Text style={styles.addressText}>{ride.destination.address}</Text>
            </View>
          </View>

          {/* Informaci├│n adicional del viaje */}
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
                {paymentMethod === 'card' ? '≡ƒÆ│ Tarjeta' : '≡ƒÆ╡ Efectivo'}
              </Text>
            </View>
          </View>
          
          {/* Tiempo transcurrido si el viaje est├í en progreso */}
          {isInProgress && (
            <View style={styles.timeElapsed}>
              <Text style={styles.timeElapsedLabel}>Tiempo Transcurrido</Text>
              <Text style={styles.timeElapsedValue}>{formatTime(rideTimer)}</Text>
            </View>
          )}
          
          {/* ETA si est├í disponible */}
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

          {/* Alerta de desviaci├│n */}
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
          
          {/* Acciones r├ípidas: Llamar, Navegar, Chat */}
          <View style={styles.quickActions}>
            <TouchableOpacity 
              style={styles.quickActionButton}
              onPress={handleCallClient}
            >
              <Text style={styles.quickActionIcon}>≡ƒô₧</Text>
              <Text style={styles.quickActionText}>Llamar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.quickActionButton}
              onPress={handleNavigate}
            >
              <Text style={styles.quickActionIcon}>≡ƒº¡</Text>
              <Text style={styles.quickActionText}>Navegar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={handleOpenChat}
            >
              <Text style={styles.quickActionIcon}>≡ƒÆ¼</Text>
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
                ≡ƒô╕ Inspeccionar Veh├¡culo del Cliente
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
                {updating ? 'Iniciando...' : '≡ƒÜù Iniciar Viaje'}
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
                {updating ? 'Completando...' : 'Γ£à Completar Viaje'}
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
  // Γ£à NUEVO: Estilo para paradas intermedias
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
