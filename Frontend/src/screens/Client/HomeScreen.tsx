/**
 * HomeScreen - Versión mejorada para clientes
 * 
 * Esta pantalla permite al cliente ver su ubicación, conductores cercanos,
 * y acceder a la funcionalidad de solicitar viajes.
 * 
 * Mejoras:
 * - Implementación de useFirebaseData para consultas optimizadas a Firebase
 * - Utilización de LoadingOverlay para estados de carga
 * - Alertas consistentes con alertService
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Image,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/Button';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../config/firebase';
import { MapSkeleton } from '../../components/SkeletonLoader';
import { NoConnectionEmptyState } from '../../components/EmptyState';
import { AnimatedButton } from '../../components/AnimatedButton';

// Importar servicios optimizados
import alertService from '../../services/alertService';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useFirebaseData, useFirebaseItem } from '../../hooks/useFirebaseData';
import locationTrackingService from '../../services/locationTrackingService';
import mapsService from '../../services/mapsService';


// Importaciones para Firebase

type ManualOverrideState = {
  active: boolean;
  coords: { latitude: number; longitude: number };
  address?: string;
  updatedAt: number;
  source: 'local' | 'remote';
};

const MANUAL_OVERRIDE_RELEASE_DISTANCE_KM = 0.2; // ~200 metros
const DEFAULT_CLIENT_LOCATION = {
  latitude: 12.1364,
  longitude: -86.2514,
};

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const {
    coords,
    error: locationError,
    refreshLocation,
    loading: locationLoading,
    isUsingMockLocation,
  } = useLocation();
  const mapRef = useRef(null);
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  // Estado para UI
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [loadingNearbyDrivers, setLoadingNearbyDrivers] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Obteniendo ubicación...');
  const [hasRideRequest, setHasRideRequest] = useState(false);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [hasPendingPayments, setHasPendingPayments] = useState(false);
  const [totalDebt, setTotalDebt] = useState(0);
  const [checkingPayments, setCheckingPayments] = useState(true);
  
  // Log para debug
  useEffect(() => {
    console.log('🔔 [HomeScreen] Estado de pendingPayments actualizado:', pendingPayments.length);
  }, [pendingPayments]);

  // Verificar pagos pendientes al cargar
  useEffect(() => {
    const checkPendingPayments = async () => {
      if (!user?.id) {
        setCheckingPayments(false);
        return;
      }

      try {
        console.log('💰 [HomeScreen] Verificando pagos pendientes...');
        const functions = await getFirebaseFunctions();
        const getPendingPaymentsFn = httpsCallable(functions, 'getPendingPayments');
        
        const result = await getPendingPaymentsFn();
        const data = result.data as any;

        console.log('💰 [HomeScreen] Resultado:', data);

        if (data.success) {
          setPendingPayments(data.payments || []);
          setHasPendingPayments(data.hasPendingPayments);
          setTotalDebt(data.totalDebt || 0);

          if (data.hasPendingPayments) {
            console.log(`⚠️ [HomeScreen] Cliente tiene ${data.count} pagos pendientes, Total: C$${data.totalDebt}`);
          }
        }
      } catch (error) {
        console.error('❌ Error verificando pagos pendientes:', error);
      } finally {
        setCheckingPayments(false);
      }
    };

    checkPendingPayments();
  }, [user?.id]);
  
  // Estado para datos
  const [savedAddress, setSavedAddress] = useState('');
  const [favoriteLocations, setFavoriteLocations] = useState<any[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [driverLocationsSnapshot, setDriverLocationsSnapshot] = useState<Record<string, any> | null>(null);
  const [manualOverride, setManualOverride] = useState<ManualOverrideState | null>(null);
  
  // Ubicación guardada del cliente (useFirebaseItem optimizado)
  const { data: clientLocationData } = useFirebaseItem<any>(
    'clientLocations',
    user?.id || '',
    { once: false }
  );
  
  // Datos de conductores disponibles (useFirebaseData optimizado)
  const { 
    data: driversInfo,
    loading: loadingDrivers,
    error: driversError
  } = useFirebaseData<any>('driversInfo', { maxCacheAge: 10000 }); // Cache 10s

  const driverLocationsSignatureRef = useRef<string>('');

  const parseCoordinate = (value: any): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  // Listener para driverLocations en tiempo real
  useEffect(() => {
    let isMounted = true;
    let cleanupFn: (() => void) | null = null;

    const startDriverLocationsListener = async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const driverLocationsRef = dbRef(db, 'driverLocations');

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) {
            return;
          }

          const data = snapshot.val();
          if (!data || typeof data !== 'object') {
            if (driverLocationsSignatureRef.current !== '') {
              driverLocationsSignatureRef.current = '';
              setDriverLocationsSnapshot(null);
            }
            return;
          }

          const entries = Object.entries<any>(data)
            .map(([driverId, payload]) => {
              const latitude = payload?.lat ?? payload?.latitude ?? payload?.coords?.latitude ?? null;
              const longitude = payload?.lng ?? payload?.longitude ?? payload?.coords?.longitude ?? null;

              if (latitude === null || longitude === null) {
                return null;
              }

              const heading = typeof payload?.heading === 'number' ? payload.heading : null;
              const status = payload?.status ?? payload?.driverStatus ?? payload?.availability;

              return {
                driverId,
                latitude: typeof latitude === 'number' ? latitude : parseFloat(latitude),
                longitude: typeof longitude === 'number' ? longitude : parseFloat(longitude),
                heading,
                status,
                raw: payload,
              };
            })
            .filter((entry): entry is NonNullable<typeof entry> => {
              return (
                entry !== null &&
                typeof entry.latitude === 'number' &&
                Number.isFinite(entry.latitude) &&
                typeof entry.longitude === 'number' &&
                Number.isFinite(entry.longitude)
              );
            })
            .sort((a, b) => a.driverId.localeCompare(b.driverId));

          const signature = entries
            .map((entry) =>
              `${entry.driverId}:${entry.latitude.toFixed(6)}:${entry.longitude.toFixed(6)}:${(entry.heading ?? 0).toFixed(2)}:${entry.status ?? ''}`,
            )
            .join('|');

          if (signature !== driverLocationsSignatureRef.current) {
            driverLocationsSignatureRef.current = signature;
            const snapshotRecord: Record<string, any> = {};
            entries.forEach((entry) => {
              snapshotRecord[entry.driverId] = entry.raw;
            });
            setDriverLocationsSnapshot(snapshotRecord);
          }
        };

        const handleError = (error: any) => {
          console.error('❌ [HomeScreen] Error escuchando driverLocations:', error);
          if (!isMounted) {
            return;
          }
          driverLocationsSignatureRef.current = '';
          setDriverLocationsSnapshot(null);
        };

        onValue(driverLocationsRef, handleSnapshot, handleError);
        cleanupFn = () => {
          off(driverLocationsRef, 'value', handleSnapshot);
        };
      } catch (error) {
        console.error('❌ [HomeScreen] Error iniciando listener de driverLocations:', error);
      }
    };

    startDriverLocationsListener();

    return () => {
      isMounted = false;
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, []);
  
  // Viajes activos (useFirebaseData optimizado)
  const { 
    data: activeRidesData,
    loading: loadingRides
  } = useFirebaseData<Record<string, any>>('activeRides', { maxCacheAge: 5000 }); // Cache 5s
  
  // Reconocer override manual proveniente de Firebase
  useEffect(() => {
    if (!clientLocationData?.coords) {
      return;
    }

    if (clientLocationData?.manualOverride?.active) {
      setManualOverride((prev) => {
        if (prev && prev.active && prev.source === 'local') {
          return prev;
        }
        return {
          active: true,
          coords: {
            latitude: clientLocationData.coords.latitude,
            longitude: clientLocationData.coords.longitude,
          },
          address: clientLocationData.address,
          updatedAt: Date.now(),
          source: 'remote',
        };
      });
    } else {
      setManualOverride((prev) => {
        if (!prev || prev.source === 'local') {
          return prev;
        }
        return null;
      });
    }
  }, [clientLocationData?.coords, clientLocationData?.manualOverride?.active, clientLocationData?.address]);

  // Efecto para cargar ubicación guardada
  useEffect(() => {
    const loadSavedLocation = async () => {
      if (!user?.id || !clientLocationData) return;
      
      try {
        if (clientLocationData.address) {
          setSavedAddress(clientLocationData.address);
        }
      } catch (error) {
        console.error('❌ Error cargando ubicación guardada:', error);
      }
    };
    loadSavedLocation();
  }, [user?.id, clientLocationData]);
  
  // Efecto para verificar viajes activos
  useEffect(() => {
    if (!user?.id || !activeRidesData) {
      console.log('⚠️ [HomeScreen] No se puede verificar viajes:', { userId: user?.id, hasData: !!activeRidesData });
      return;
    }
    
    const checkActiveRides = async () => {
      try {
        console.log('🔍 [HomeScreen] Verificando viajes activos para usuario:', user.id);
        let activeRideFound = false;
        
        // Primero verificar si hay un viaje guardado en AsyncStorage
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const savedRideId = await AsyncStorage.getItem('ACTIVE_RIDE_ID');
        
        console.log('💾 [HomeScreen] Viaje guardado en AsyncStorage:', savedRideId);
        
        if (savedRideId && activeRidesData[savedRideId]) {
          console.log('💾 [HomeScreen] Encontrado viaje guardado en AsyncStorage:', savedRideId);
          
          const rideData = activeRidesData[savedRideId];
          console.log('📊 [HomeScreen] Datos del viaje:', { status: rideData.status, clientId: rideData.clientId });
          
          // Verificar si el viaje sigue activo para este cliente
          if (rideData.clientId === user.id && 
              (rideData.status === 'requested' || rideData.status === 'pending_confirm' || 
               rideData.status === 'accepted' || rideData.status === 'in_progress' || 
               rideData.status === 'pending_payment' || rideData.status === 'driver_offered' || rideData.status === 'driver_assigned')) {
            
            console.log('🚗 [HomeScreen] Viaje activo confirmado, mostrando banner...');
            setHasRideRequest(true);
            setActiveRide({ ...rideData, id: savedRideId });
            activeRideFound = true;
          } else {
            // Limpiar el AsyncStorage si el viaje ya no está activo
            await AsyncStorage.removeItem('ACTIVE_RIDE_ID');
            console.log('🗑️ Viaje guardado ya no está activo, limpiando AsyncStorage');
          }
        } else {
          console.log('⚠️ [HomeScreen] No hay viaje guardado o no existe en Firebase');
        }
        
        // Si no se encontró en AsyncStorage, buscar en todos los viajes activos
        if (!activeRideFound) {
          // Filtrar viajes del cliente actual
          const clientRides = Object.entries(activeRidesData)
            .filter(([_, ride]: [string, any]) => 
              ride.clientId === user.id && 
              (ride.status === 'requested' || ride.status === 'pending_confirm' || 
               ride.status === 'accepted' || ride.status === 'in_progress' || 
               ride.status === 'driver_assigned' || ride.status === 'driver_offered' || ride.status === 'pending_payment')
            );
          
          if (clientRides.length > 0) {
            const [activeRideId, activeRideData] = clientRides[0];
            console.log('✅ [HomeScreen] Encontrado viaje activo:', activeRideId);
            
            // Si el viaje está en pending_payment, navegar a pantalla de pago
            if (activeRideData.status === 'pending_payment') {
              const paymentMethod = activeRideData.paymentMethod || activeRideData.payment?.method || 'cash';
              const finalAmount = activeRideData.finalFare || activeRideData.estimatedPrice || 0;
              const driverName = activeRideData.driver?.name || 'Conductor';
              const driverPhoto = activeRideData.driver?.photoURL || undefined;

              if (paymentMethod === 'card') {
                console.log('💳 [HomeScreen] Viaje en pending_payment con tarjeta, navegando a PaymentScreen');
                navigation.navigate('Payment', {
                  rideId: activeRideId,
                  amount: finalAmount,
                  driverId: activeRideData.driverId,
                  driverName,
                  vehiclePlate: activeRideData.vehicle?.plate || activeRideData.driver?.vehicle?.plate || 'N/A',
                  driverPhoto,
                  isPendingPayment: true,
                });
              } else {
                console.log('💵 [HomeScreen] Viaje en pending_payment con efectivo, navegando a CashPaymentScreen');
                navigation.navigate('CashPayment', {
                  rideId: activeRideId,
                  amount: finalAmount,
                  driverName,
                  driverPhoto,
                });
              }
              activeRideFound = true;
              return; // Salir temprano
            }
            
            setHasRideRequest(true);
            setActiveRide({ ...activeRideData, id: activeRideId });
            activeRideFound = true; // ✅ FIX: Marcar como encontrado
            
            // Guardar en AsyncStorage
            await AsyncStorage.setItem('ACTIVE_RIDE_ID', activeRideId);
            
            // NOTA: No sincronizar con Supabase aquí porque los IDs de Firebase no son UUIDs
            // La sincronización se hará cuando se confirme el viaje en pantalla de ofertas (HomeScreenOffers)
            console.log('💾 Viaje guardado en AsyncStorage:', activeRideId);
          } else {
            // No se encontró ningún viaje activo
            console.log('📭 [HomeScreen] No hay viajes activos');
            setHasRideRequest(false);
            setActiveRide(null);
          }
        }
        
        // Si no se encontró ningún viaje activo, limpiar también AsyncStorage
        if (!activeRideFound) {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.removeItem('ACTIVE_RIDE_ID');
          setHasRideRequest(false);
          setActiveRide(null);
          console.log('🗑️ [HomeScreen] No hay viajes activos, limpiando estado');
        }
        
      } catch (error) {
        console.error('❌ Error verificando viajes activos:', error);
      }
    };
    
    checkActiveRides();
  }, [user?.id, activeRidesData]);
  
  // Listener para pagos pendientes
  useEffect(() => {
    if (!user?.id) {
      console.log('⚠️ [HomeScreen] No hay userId, no se puede escuchar pagos');
      return;
    }
    
    const { getDatabase, ref, onValue, off } = require('firebase/database');
    const db = getDatabase();
    const paymentStatusRef = ref(db, 'paymentStatus');
    
    console.log('👂 [HomeScreen] Escuchando pagos pendientes para usuario:', user.id);
    
    const unsubscribe = onValue(paymentStatusRef, async (snapshot: any) => {
      const paymentsData = snapshot.val();
      
      console.log('📦 [HomeScreen] Snapshot de paymentStatus recibido');
      
      if (!paymentsData) {
        console.log('📭 [HomeScreen] No hay pagos en paymentStatus');
        setPendingPayments([]);
        return;
      }
      
      console.log('📋 [HomeScreen] Pagos en Firebase:', Object.keys(paymentsData).length);
      
      // Filtrar pagos pendientes del usuario
      const userPendingPayments = [];
      
      for (const [rideId, paymentInfo] of Object.entries(paymentsData)) {
        const payment = paymentInfo as any;
        
        console.log(`🔍 [HomeScreen] Revisando pago ${rideId}:`, {
          status: payment.status,
          method: payment.method,
        });
        
        // ✅ MEJORADO: Excluir pagos completados, cancelados o fallidos
        if (payment.status === 'completed' || payment.status === 'canceled' || payment.status === 'failed') {
          console.log(`✅ [HomeScreen] Pago ${rideId} ya está ${payment.status}, ignorando`);
          continue;
        }
        
        // Solo pagos pendientes o pending_confirmation
        if (payment.status === 'pending' || payment.status === 'pending_confirmation' || payment.status === 'in_progress') {
          // Obtener datos del viaje
          const { ref: refFunc, get } = require('firebase/database');
          const rideRef = refFunc(db, `activeRides/${rideId}`);
          const rideSnapshot = await get(rideRef);
          const rideData = rideSnapshot.val();
          
          if (!rideData) {
            console.log(`⚠️ [HomeScreen] Viaje ${rideId} no encontrado en activeRides`);
            continue;
          }
          
          console.log(`🔍 [HomeScreen] Viaje ${rideId} - clientId: ${rideData.clientId}, userId: ${user.id}`);
          
          // Verificar que el viaje pertenece al usuario
          if (rideData.clientId === user.id) {
            console.log(`💰 [HomeScreen] ✅ Pago pendiente encontrado: ${rideId}`);
            userPendingPayments.push({
              rideId,
              payment,
              ride: rideData,
            });
          } else {
            console.log(`⏭️ [HomeScreen] Pago ${rideId} no es del usuario actual`);
          }
        }
      }
      
      console.log(`📊 [HomeScreen] Total pagos pendientes del usuario: ${userPendingPayments.length}`);
      setPendingPayments(userPendingPayments);
    });
    
    return () => {
      console.log('🔇 Limpiando listener de pagos pendientes');
      off(paymentStatusRef);
    };
  }, [user?.id]);
  
  // Efecto para procesar conductores cercanos (mejorado con lógica del archivo viejo)
  useEffect(() => {
    if (!coords && !clientLocationData?.coords) {
      console.log('⚠️ Sin ubicación disponible para buscar conductores');
      setAvailableDrivers([]);
      return;
    }

    const effectiveLocation = coords || clientLocationData?.coords;
    if (!effectiveLocation) {
      console.log('⚠️ No hay effectiveLocation, no se puede buscar conductores');
      return;
    }

    console.log('✅ Iniciando búsqueda de conductores con ubicación:', effectiveLocation);
    setLoadingNearbyDrivers(true);

    try {
      const SEARCH_RADIUS_KM = 12;

      const driverIds = new Set<string>();
      if (driversInfo) {
        Object.keys(driversInfo).forEach((id) => driverIds.add(id));
      }
      if (driverLocationsSnapshot) {
        Object.keys(driverLocationsSnapshot).forEach((id) => driverIds.add(id));
      }

      const allDrivers = Array.from(driverIds).map((driverId) => {
        const infoData = driversInfo?.[driverId];
        const realtimeData = driverLocationsSnapshot?.[driverId];

        const latitude =
          parseCoordinate(realtimeData?.lat ?? realtimeData?.latitude ?? realtimeData?.coords?.latitude) ??
          parseCoordinate(infoData?.coords?.latitude ?? infoData?.lat ?? infoData?.latitude);

        const longitude =
          parseCoordinate(realtimeData?.lng ?? realtimeData?.longitude ?? realtimeData?.coords?.longitude) ??
          parseCoordinate(infoData?.coords?.longitude ?? infoData?.lng ?? infoData?.longitude);

        if (latitude === null || longitude === null) {
          return null;
        }

        const statusCandidate =
          realtimeData?.status ??
          realtimeData?.driverStatus ??
          realtimeData?.availability ??
          infoData?.status ??
          (infoData?.isAvailable ? 'available' : undefined);

        const normalizedStatus = typeof statusCandidate === 'string' ? statusCandidate.toLowerCase() : '';
        const isAvailable = normalizedStatus === '' || normalizedStatus.includes('available');

        const heading =
          (typeof realtimeData?.heading === 'number' && Number.isFinite(realtimeData.heading)
            ? realtimeData.heading
            : undefined) ??
          (typeof infoData?.heading === 'number' ? infoData.heading : undefined) ??
          0;

        const driverRecord = {
          id: driverId,
          latitude,
          longitude,
          heading,
          isAvailable,
          name: infoData?.name || realtimeData?.name || 'Conductor',
          vehicle: infoData?.vehicle || {},
          lastUpdate: realtimeData?.lastUpdate || infoData?.timestamp || infoData?.updatedAt,
        };

        return driverRecord;
      })
        .filter((driver): driver is NonNullable<typeof driver> => driver !== null)
        .filter((driver) => {
          if (!driver.isAvailable) {
            return false;
          }

          const distance = calculateDistance(
            effectiveLocation.latitude,
            effectiveLocation.longitude,
            driver.latitude,
            driver.longitude,
          );

          return Number.isFinite(distance) && distance <= SEARCH_RADIUS_KM;
        })
        .map((driver) => {
          const distance = calculateDistance(
            effectiveLocation.latitude,
            effectiveLocation.longitude,
            driver.latitude,
            driver.longitude,
          );

          return {
            ...driver,
            distance,
          };
        });

      allDrivers.sort((a, b) => a.distance - b.distance);

      console.log(`🚗 ${allDrivers.length} conductores disponibles dentro de ${SEARCH_RADIUS_KM}km`);

      setAvailableDrivers(allDrivers);
    } catch (error) {
      console.error('❌ Error procesando conductores:', error);
      setAvailableDrivers([]);
    } finally {
      setLoadingNearbyDrivers(false);
    }
  }, [
    coords,
    clientLocationData?.coords,
    driversInfo,
    driverLocationsSnapshot,
    loadingDrivers,
  ]);
  
  // Función para calcular distancia entre coordenadas
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    // Radio de la tierra en km
    const R = 6371;
    
    // Convertir a radianes
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    // Fórmula haversine
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distancia en km

    return distance;
  };

  const resolveAddressText = (lat: number, lng: number, fallback?: string) =>
    fallback || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  useEffect(() => {
    if (!manualOverride?.active || !coords) {
      return;
    }

    const distance = calculateDistance(
      manualOverride.coords.latitude,
      manualOverride.coords.longitude,
      coords.latitude,
      coords.longitude,
    );

    if (distance < MANUAL_OVERRIDE_RELEASE_DISTANCE_KM) {
      return;
    }

    console.log(
      '🚶‍♂️ [HomeScreen] Movimiento detectado, liberando override manual. Distancia (km):',
      distance.toFixed(3),
    );

    setManualOverride(null);

    (async () => {
      const address =
        (await mapsService.reverseGeocode({ latitude: coords.latitude, longitude: coords.longitude })) ||
        resolveAddressText(coords.latitude, coords.longitude, savedAddress);

      setSavedAddress(address);

      await saveClientLocation(
        { latitude: coords.latitude, longitude: coords.longitude },
        address,
        {
          source: 'gps',
          manualOverride: {
            active: false,
            updatedAt: new Date().toISOString(),
          },
        },
      );
    })().catch((error) =>
      console.error('❌ [HomeScreen] Error sincronizando ubicación tras liberar override manual:', error),
    );
  }, [coords, manualOverride]);

  // Guardar ubicación del cliente en Firebase
  const saveClientLocation = async (
    newLocation: { latitude: number; longitude: number },
    address: string,
    options?: { source?: 'manual' | 'gps'; manualOverride?: { active: boolean; updatedAt?: string } },
  ) => {
    if (!user?.id) return;

    try {
      // Usar Firebase database de forma manual
      const { getDatabase, ref, update } = await import('firebase/database');
      const db = getDatabase();
      const clientLocationRef = ref(db, `clientLocations/${user.id}`);

      const nowIso = new Date().toISOString();

      await update(clientLocationRef, {
        coords: {
          latitude: newLocation.latitude,
          longitude: newLocation.longitude,
        },
        address,
        updatedAt: nowIso,
        source: options?.source || 'manual',
        manualOverride:
          options?.manualOverride ||
          {
            active: options?.source === 'manual',
            updatedAt: nowIso,
          },
      });

      // También guardar en Supabase para histórico
      const locationHistory = {
        user_id: user.id,
        latitude: newLocation.latitude,
        longitude: newLocation.longitude,
        address,
        created_at: new Date().toISOString(),
      };

      // Esta función debería implementarse en locationTrackingService
      // locationTrackingService.saveLocationHistory(locationHistory);
    } catch (error) {
      console.error('❌ Error guardando ubicación:', error);
      alertService.showErrorAlert('No se pudo guardar tu ubicación. Intenta de nuevo.');
    }
  };
  
  // Navegar a pantalla de pagos pendientes
  const handleViewPendingPayments = () => {
    console.log('💰 Navegando a pantalla de pagos pendientes');
    navigation.navigate('PendingPayments');
  };

  const handleManualLocationUpdate = async (newCoords: { latitude: number; longitude: number }) => {
    try {
      console.log('🗺️ [HomeScreen] Actualizando ubicación manualmente:', newCoords);
      setLoadingMessage('Actualizando ubicación...');

      const address =
        (await mapsService.reverseGeocode({ latitude: newCoords.latitude, longitude: newCoords.longitude })) ||
        resolveAddressText(newCoords.latitude, newCoords.longitude, savedAddress);

      setSavedAddress(address);
      setManualOverride({
        active: true,
        coords: newCoords,
        address,
        updatedAt: Date.now(),
        source: 'local',
      });

      await saveClientLocation(newCoords, address, {
        source: 'manual',
        manualOverride: {
          active: true,
          updatedAt: new Date().toISOString(),
        },
      });

      console.log('✅ [HomeScreen] Ubicación manual guardada en Realtime DB');
      alertService.showSuccessAlert('Ubicación actualizada', 'Tu ubicación actual se actualizó correctamente.');
    } catch (error) {
      console.error('❌ [HomeScreen] Error actualizando ubicación manual:', error);
      alertService.showErrorAlert('No se pudo actualizar tu ubicación. Intenta de nuevo.');
    }
  };

  // Centrar mapa en la ubicación actual y actualizar ubicación
  const handleCenterMap = async () => {
    try {
      // Actualizar la ubicación
      await refreshLocation();
      
      if (!coords || !mapRef.current) {
        alertService.showInfoAlert('Ubicación', 'Actualizando ubicación...');
        return;
      }
      
      // Centrar el mapa
      // @ts-ignore
      mapRef.current.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
      
      console.log('📍 Ubicación actualizada y mapa centrado');
    } catch (error) {
      console.error('❌ Error actualizando ubicación:', error);
      alertService.showErrorAlert('No se pudo actualizar la ubicación');
    }
  };
  
  // Ir a pantalla de solicitud de viaje
  const handleRequestRide = () => {
    // Bloquear si hay pagos pendientes
    if (hasPendingPayments) {
      alertService.showInfoAlert(
        '⚠️ Pagos Pendientes',
        `Tienes ${pendingPayments.length} pago(s) pendiente(s) por un total de C$${totalDebt.toFixed(2)}. Por favor, paga tus deudas antes de solicitar un nuevo viaje.`,
        () => {
          navigation.navigate('PendingPayments');
        }
      );
      return;
    }

    navigation.navigate('SearchRide');
  };
  
  // Ir a pantalla de viaje activo
  const handleViewActiveRide = async () => {
    try {
      // Usar el activeRide del estado si está disponible
      if (!activeRide) {
        console.log('❌ No hay viaje activo en el estado');
        return;
      }
      
      console.log('🚗 Navegando a viaje activo:', activeRide.id, 'Estado:', activeRide.status);
      
      // Navegar según el estado del viaje
      if (activeRide.status === 'requested' || 
        activeRide.status === 'driver_offered' ||
        activeRide.status === 'pending_confirm' || 
          activeRide.status === 'driver_assigned') {
        // Viaje esperando confirmación
        navigation.navigate('HomeOffers', { rideId: activeRide.id });
      } else if (activeRide.status === 'accepted' || activeRide.status === 'in_progress') {
        // Viaje confirmado o en progreso
        navigation.navigate('RideTracking', {
          rideId: activeRide.id,
          driverId: activeRide.driverId,
          driverName: activeRide.driver?.name || 'Conductor',
          vehiclePlate: activeRide.vehicle?.plate || activeRide.driver?.vehicle?.plate || 'N/A',
          vehicleBrand: activeRide.vehicle?.make || activeRide.vehicle?.brand || activeRide.driver?.vehicle?.brand || 'N/A',
          vehicleModel: activeRide.vehicle?.model || activeRide.driver?.vehicle?.model || 'N/A',
          vehicleColor: activeRide.vehicle?.color || activeRide.driver?.vehicle?.color || 'N/A',
          estimatedFare: activeRide.finalFare || activeRide.estimatedPrice || 0,
        });
      } else {
        if (activeRide.status === 'pending_payment') {
          const paymentMethod = activeRide.paymentMethod || activeRide.payment?.method || 'cash';
          const finalAmount = activeRide.finalFare || activeRide.estimatedPrice || 0;
          const driverName = activeRide.driver?.name || 'Conductor';
          const driverPhoto = activeRide.driver?.photoURL || undefined;

          if (paymentMethod === 'card') {
            console.log('💳 [HomeScreen] Viaje pendiente de pago con tarjeta. Navegando a PaymentScreen...');
            navigation.navigate('Payment', {
              rideId: activeRide.id,
              amount: finalAmount,
              driverId: activeRide.driverId,
              driverName,
              vehiclePlate: activeRide.vehicle?.plate || activeRide.driver?.vehicle?.plate || 'N/A',
              driverPhoto,
              isPendingPayment: true,
            });
          } else {
            console.log('💵 [HomeScreen] Viaje pendiente de pago en efectivo. Navegando a CashPaymentScreen...');
            navigation.navigate('CashPayment', {
              rideId: activeRide.id,
              amount: finalAmount,
              driverName,
              driverPhoto,
            });
          }
        } else if (activeRide.status === 'pending_confirm' || activeRide.status === 'driver_offered' || activeRide.status === 'driver_assigned') {
          console.log('🚗 [HomeScreen] Viaje pendiente de confirmación. Navegando a HomeScreenOffers...');
          navigation.navigate('HomeOffers', { rideId: activeRide.id });
        } else {
          console.log(`⚠️ [HomeScreen] Estado de viaje no manejado: ${activeRide.status}`);
        }
        setActiveRide(activeRide);
        setHasRideRequest(true);
      }
    } catch (error: any) {
      console.error('❌ Error al navegar a viaje activo:', error);
    }
  };
  
  const storedCoords = clientLocationData?.coords || null;
  const effectiveCoords = useMemo(() => {
    if (manualOverride?.active) {
      return manualOverride.coords;
    }
    if (coords) {
      return coords;
    }
    if (storedCoords) {
      return storedCoords;
    }
    return DEFAULT_CLIENT_LOCATION;
  }, [manualOverride?.active, manualOverride?.coords, coords, storedCoords]);

  const waitingForLocation = locationLoading && !coords && !storedCoords;
  const showLocationWarning = isUsingMockLocation || (!coords && !!storedCoords);

  if (waitingForLocation) {
    console.log('⏳ Esperando coordenadas del cliente...');
    return <LoadingOverlay visible={true} message={loadingMessage} />;
  }

  if (locationError && !coords && !storedCoords) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No se pudo acceder a tu ubicación</Text>
        <Text style={styles.errorDescription}>
          Verifica los permisos de ubicación y asegúrate de tener el GPS activado
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setLoadingMessage('Obteniendo ubicación...');
            refreshLocation();
          }}
        >
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mapa con ubicación actual */}
      <DynamicMap
        latitude={effectiveCoords.latitude}
        longitude={effectiveCoords.longitude}
        style={styles.map}
        showMarker={true}
        markerPosition={{ latitude: effectiveCoords.latitude, longitude: effectiveCoords.longitude }}
        markerType="origin"
        nearbyDrivers={availableDrivers}
        draggableMarker
        onMarkerDragEnd={handleManualLocationUpdate}
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
        onPress={handleRequestRide}
      >
        <View style={styles.searchIcon}>
          <Text style={styles.searchIconText}>🔍</Text>
        </View>
        <Text style={styles.searchText}>Buscar destino...</Text>
      </TouchableOpacity>
      
      {/* Botón para centrar mapa */}
      <TouchableOpacity 
        style={styles.centerMapButton}
        onPress={handleCenterMap}
      >
        <Text style={styles.centerMapIcon}>📍</Text>
      </TouchableOpacity>

      {showLocationWarning && (
        <View style={styles.locationWarning}>
          <Text style={styles.locationWarningText}>
            🚧 Usamos tu última ubicación conocida o una ubicación aproximada. Activa el GPS para mayor precisión.
          </Text>
          <TouchableOpacity
            onPress={() => {
              setLoadingMessage('Actualizando ubicación...');
              refreshLocation();
            }}
          >
            <Text style={styles.locationWarningAction}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Panel inferior */}
      <View style={styles.bottomPanel}>
        {/* Banner de pagos pendientes */}
        {pendingPayments.length > 0 && !hasRideRequest && (
          <TouchableOpacity 
            style={[styles.activeRideBanner, { backgroundColor: '#FF9800' }]}
            onPress={handleViewPendingPayments}
          >
            <View style={styles.activeRideContent}>
              <Text style={styles.activeRideIcon}>💰</Text>
              <View style={styles.activeRideInfo}>
                <Text style={styles.activeRideText}>Pago pendiente</Text>
                <Text style={styles.activeRideSubtext}>
                  {pendingPayments.length === 1 
                    ? 'Tienes 1 pago pendiente' 
                    : `Tienes ${pendingPayments.length} pagos pendientes`}
                </Text>
              </View>
              <Text style={styles.activeRideArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}
        
        {/* Banner de viaje activo con estados dinámicos */}
        {hasRideRequest && activeRide && (
          <TouchableOpacity 
            style={styles.activeRideBanner}
            onPress={handleViewActiveRide}
          >
            <View style={styles.activeRideContent}>
              <Text style={styles.activeRideIcon}>🚗</Text>
              <View style={styles.activeRideInfo}>
                <Text style={styles.activeRideText}>Viaje activo</Text>
                <Text style={styles.activeRideSubtext}>
                  {activeRide.status === 'requested' ? '🔍 Buscando conductor...' :
                   activeRide.status === 'pending_confirm' || activeRide.status === 'driver_offered' ||activeRide.status === 'driver_assigned' ? '✅ Confirma tu conductor' :
                   activeRide.status === 'accepted' ? '🚗 Conductor en camino' : 
                   '🛣️ Viaje en progreso'}
                </Text>
              </View>
              <Text style={styles.activeRideArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Banner de pagos pendientes */}
        {hasPendingPayments && (
          <TouchableOpacity
            style={styles.pendingPaymentsBanner}
            onPress={() => navigation.navigate('PendingPayments')}
          >
            <View style={styles.pendingPaymentsContent}>
              <Text style={styles.pendingPaymentsIcon}>⚠️</Text>
              <View style={styles.pendingPaymentsInfo}>
                <Text style={styles.pendingPaymentsTitle}>Pagos Pendientes</Text>
                <Text style={styles.pendingPaymentsSubtext}>
                  {pendingPayments.length} pago(s) • C${totalDebt.toFixed(2)}
                </Text>
              </View>
              <Text style={styles.pendingPaymentsArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}
        
        {/* Botón de solicitar viaje */}
        <View style={styles.requestButtonContainer}>
          <TouchableOpacity
            onPress={handleRequestRide}
            style={[
              styles.requestButton, 
              { 
                backgroundColor: hasPendingPayments ? '#BDBDBD' : colors.primary,
                opacity: hasPendingPayments ? 0.6 : 1
              }
            ]}
            disabled={hasPendingPayments}
          >
            <Text style={styles.requestButtonText}>
              {hasPendingPayments ? '🔒 Paga tus deudas primero' : 'Solicitar Viaje'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Estilos
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: colors.background + '95',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  headerContent: {
    flex: 1,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  headerButtonIcon: {
    fontSize: 20,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  profileIcon: {
    fontSize: 22,
    color: '#fff',
  },
  searchBar: {
    position: 'absolute',
    top: 130,
    left: 16,
    right: 16,
    backgroundColor: colors.card + 'F5',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
    borderWidth: 1,
    borderColor: colors.border + '40',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchIconText: {
    fontSize: 20,
  },
  searchText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
    opacity: 0.7,
  },
  bottomPanel: {
    backgroundColor: colors.card + 'F0',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border + '20',
  },
  requestButtonContainer: {
    alignItems: 'center',
  },
  requestButton: {
    width: '100%',
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#D4AF37' + '40',
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  centerMapButton: {
    position: 'absolute',
    bottom: 180,
    right: 16,
    backgroundColor: colors.card,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  centerMapIcon: {
    fontSize: 24,
  },
  locationWarning: {
    position: 'absolute',
    top: 190,
    left: 16,
    right: 16,
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FFB74D',
    zIndex: 15,
  },
  locationWarningText: {
    flex: 1,
    color: '#BF360C',
    fontSize: 13,
    marginRight: 12,
  },
  locationWarningAction: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  activeRideBanner: {
    backgroundColor: '#D4AF37',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
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
    fontSize: 28,
    marginRight: 12,
  },
  activeRideInfo: {
    flex: 1,
  },
  activeRideText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  activeRideSubtext: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.95,
    fontWeight: '500',
  },
  activeRideArrow: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
  },
  pendingPaymentsBanner: {
    backgroundColor: '#FF9800',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  pendingPaymentsContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingPaymentsIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  pendingPaymentsInfo: {
    flex: 1,
  },
  pendingPaymentsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  pendingPaymentsSubtext: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.95,
    fontWeight: '500',
  },
  pendingPaymentsArrow: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  retryText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
