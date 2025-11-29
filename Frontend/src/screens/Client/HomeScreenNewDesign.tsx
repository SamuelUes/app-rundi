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

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../../config/firebase';
import { haversineKm } from '../../utils/distance';

// Importar servicios optimizados
import alertService from '../../services/alertService';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useFirebaseData, useFirebaseItem } from '../../hooks/useFirebaseData';
import mapsService from '../../services/mapsService';
import { ensureVehicleIconSource, extractVehicleTypeFromInfo } from '../../utils/vehicleIcons';
import { subscribePreflightResult, getPreflightResult, PreflightAction } from '../../state/preflightStore';

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
const COORDS_EPSILON = 0.0002;
const REGION_IDLE_DELAY_MS = 900;

const areCoordsEqual = (
  a?: { latitude: number; longitude: number } | null,
  b?: { latitude: number; longitude: number } | null,
  epsilon: number = COORDS_EPSILON,
) => {
  if (!a || !b) {
    return false;
  }
  return (
    Math.abs(a.latitude - b.latitude) <= epsilon &&
    Math.abs(a.longitude - b.longitude) <= epsilon
  );
};

const PROFILE_ICON_IMAGE = require('../../assets/icons/profile/profile-icon2.png');
const REQUEST_BUTTON_IMAGE = require('../../assets/icons/make_request_button/make_request_button3x.png');
const PENDING_ACTION_IMAGE = require('../../assets/icons/pending_acction/pending_acction2x.png');
const USER_LOCATION_LIGHT_ICON = require('../../assets/icons/actuall-position-white/actuallpositionwhite2x.png');
const USER_LOCATION_DARK_ICON = require('../../assets/icons/actuall-position-black/actuallpositionblack2x.png');
const USER_LOCATION_HOLDING_LIGHT_ICON = require('../../assets/icons/actuall-position-white-holding/actuallpositionwhiteholding2x.png');
const USER_LOCATION_HOLDING_DARK_ICON = require('../../assets/icons/actuall-position-black-holding/actuallpositionblackholding2x.png');

type PendingAction = {
  type: 'pending_payment' | 'active_ride';
  title: string;
  onPress: () => void;
};

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.region;

  const initialCoords =
    initialRegion &&
    typeof initialRegion.latitude === 'number' &&
    typeof initialRegion.longitude === 'number'
      ? {
          latitude: initialRegion.latitude,
          longitude: initialRegion.longitude,
        }
      : null;

  const {
    coords,
    error: locationError,
    refreshLocation,
    loading: locationLoading,
    isUsingMockLocation,
  } = useLocation(initialCoords ? { initialCoords } : {});
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loadingMessage, setLoadingMessage] = useState('Preparando tu experiencia...');
  const [initializing, setInitializing] = useState(true);
  const pendingInitialTasks = useRef(new Set<string>([
    'location',
    'pendingPayments',
    'clientLocation',
    'driversInfo',
    'driverLocations',
    'activeRides',
  ]));

  const markTaskCompleted = useCallback((taskName: string) => {
    if (!pendingInitialTasks.current.has(taskName)) {
      return;
    }

    pendingInitialTasks.current.delete(taskName);
    console.log(`✅ [HomeScreen:init] Tarea completada: ${taskName}. Restantes: ${pendingInitialTasks.current.size}`);

    if (pendingInitialTasks.current.size === 0) {
      console.log('🎉 [HomeScreen:init] Todas las tareas iniciales completadas, mostrando pantalla.');
      setInitializing(false);
    }
  }, []);

  const [activeRide, setActiveRide] = useState<any>(null);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [hasPendingPayments, setHasPendingPayments] = useState(false);
  const [totalDebt, setTotalDebt] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [preflightActions, setPreflightActions] = useState<PreflightAction[]>(() => preflightSummary?.actions ?? []);
  const [isOutsideSupportedArea, setIsOutsideSupportedArea] = useState(
    initialRegion ? !initialRegion.allowed : false,
  );
  const [regionStatus, setRegionStatus] = useState<{
    checked: boolean;
    allowed: boolean;
    areaName?: string;
    message?: string;
    reasonCode?: string;
  }>(() => ({
    checked: !!initialRegion,
    allowed: initialRegion ? initialRegion.allowed : true,
    areaName: initialRegion?.areaName,
    message: initialRegion?.message,
    reasonCode: initialRegion?.reasonCode,
  }));

  const [serviceAreaId, setServiceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);
  const hasShownUnsupportedAlertRef = useRef(false);

  // Verificar pagos pendientes al cargar
  useEffect(() => {
    const checkPendingPayments = async () => {
      if (!user?.id) {
        setPendingPayments([]);
        setHasPendingPayments(false);
        setTotalDebt(0);
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
      }
    };

    checkPendingPayments().finally(() => markTaskCompleted('pendingPayments'));
  }, [user?.id, markTaskCompleted]);

  // Estado para datos
  const [savedAddress, setSavedAddress] = useState('');
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [driverLocationsSnapshot, setDriverLocationsSnapshot] = useState<Record<string, any> | null>(null);
  const [manualOverride, setManualOverride] = useState<ManualOverrideState | null>(null);
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingAddress, setPendingAddress] = useState('Cargando ubicación…');
  const [hasPendingManualSelection, setHasPendingManualSelection] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isHoldingPin, setIsHoldingPin] = useState(false);
  const [isPinLocked, setIsPinLocked] = useState(true);

  const ignoreNextRegionChangeRef = useRef(false);
  const mapGestureActiveRef = useRef(false);
  const lastCommittedCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const initialClientLocationBootstrapRef = useRef(false);
  const regionIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerPinBounce = useRef(new Animated.Value(0)).current;
  const markerBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    ignoreNextRegionChangeRef.current = true;
  }, []);

  useEffect(() => {
    return () => {
      if (regionIdleTimeoutRef.current) {
        clearTimeout(regionIdleTimeoutRef.current);
        regionIdleTimeoutRef.current = null;
      }
    };
  }, []);

  const clearRegionIdleTimeout = useCallback(() => {
    if (regionIdleTimeoutRef.current) {
      clearTimeout(regionIdleTimeoutRef.current);
      regionIdleTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isPinLocked) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(centerPinBounce, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(centerPinBounce, {
            toValue: 0,
            duration: 600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => {
        animation.stop();
      };
    }

    centerPinBounce.stopAnimation(() => {
      centerPinBounce.setValue(0);
    });
  }, [centerPinBounce, isPinLocked]);

  useEffect(() => {
    if (isPinLocked && !isHoldingPin) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(markerBounce, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(markerBounce, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }

    markerBounce.stopAnimation(() => {
      markerBounce.setValue(0);
    });
  }, [isHoldingPin, isPinLocked, markerBounce]);

  const centerPinTranslateY = centerPinBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const markerBounceTranslateY = markerBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  // Ubicación guardada del cliente (useFirebaseItem optimizado)
  const { data: clientLocationData, loading: loadingClientLocation } = useFirebaseItem<any>(
    'clientsLocations',
    user?.id || '',
    { once: false }
  );
  useEffect(() => {
    if (!loadingClientLocation) {
      markTaskCompleted('clientLocation');
    }
  }, [loadingClientLocation, markTaskCompleted]);

  // Datos de conductores disponibles (useFirebaseData optimizado)
  const {
    data: driversInfo,
    loading: loadingDrivers,
  } = useFirebaseData<any>('driversInfo', { maxCacheAge: 10000 }); // Cache 10s

  useEffect(() => {
    if (!loadingDrivers) {
      markTaskCompleted('driversInfo');
    }
  }, [loadingDrivers, markTaskCompleted]);

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

  // Listener para driverLocations en tiempo real (por área cuando sea posible)
  useEffect(() => {
    let isMounted = true;
    let cleanupFn: (() => void) | null = null;

    const startDriverLocationsListener = async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const path = serviceAreaId ? `driverLocationsByArea/${serviceAreaId}` : 'driverLocations';
        const driverLocationsRef = dbRef(db, path);

        console.log('[HomeScreen] Escuchando driverLocations desde:', path);

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

    startDriverLocationsListener().finally(() => markTaskCompleted('driverLocations'));

    return () => {
      isMounted = false;
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [serviceAreaId]);

  // Viajes activos (useFirebaseData optimizado, por área cuando sea posible)
  const activeRidesPath = useMemo(
    () => (serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides'),
    [serviceAreaId],
  );

  const {
    data: activeRidesData,
    loading: loadingRides
  } = useFirebaseData<Record<string, any>>(activeRidesPath, { maxCacheAge: 5000 }); // Cache 5s

  useEffect(() => {
    if (!loadingRides) {
      markTaskCompleted('activeRides');
    }
  }, [loadingRides, markTaskCompleted]);

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

  const saveClientLocation = useCallback(
    async (
      newLocation: { latitude: number; longitude: number },
      address: string,
      options?: { source?: 'manual' | 'gps'; manualOverride?: { active: boolean; updatedAt?: string } },
    ) => {
      if (!user?.id) return;

      try {
        const { getDatabase, ref, set } = await import('firebase/database');
        const db = getDatabase();
        const clientLocationRef = ref(db, `clientsLocations/${user.id}`);

        const now = Date.now();
        await set(clientLocationRef, {
          latitude: newLocation.latitude,
          longitude: newLocation.longitude,
          coords: {
            latitude: newLocation.latitude,
            longitude: newLocation.longitude,
          },
          address,
          source: options?.source || 'manual',
          isManual: (options?.source || 'manual') !== 'gps',
          timestamp: now,
          manualOverride:
            options?.manualOverride || {
              active: options?.source === 'manual',
              updatedAt: new Date(now).toISOString(),
            },
        });

        const locationHistory = {
          user_id: user.id,
          latitude: newLocation.latitude,
          longitude: newLocation.longitude,
          address,
          created_at: new Date().toISOString(),
        };

        // locationTrackingService.saveLocationHistory(locationHistory);
      } catch (error) {
        console.error('❌ Error guardando ubicación:', error);
        alertService.showErrorAlert('No se pudo guardar tu ubicación. Intenta de nuevo.');
        throw error;
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    if (!coords && !clientLocationData?.coords) {
      return;
    }

    if (initialClientLocationBootstrapRef.current) {
      return;
    }

    const hasValidSavedCoords =
      !!clientLocationData?.coords &&
      typeof clientLocationData.coords.latitude === 'number' &&
      typeof clientLocationData.coords.longitude === 'number' &&
      Number.isFinite(clientLocationData.coords.latitude) &&
      Number.isFinite(clientLocationData.coords.longitude);

    if (hasValidSavedCoords) {
      initialClientLocationBootstrapRef.current = true;
      return;
    }

    const sourceCoords = clientLocationData?.coords || coords;
    if (!sourceCoords) {
      return;
    }

    initialClientLocationBootstrapRef.current = true;

    (async () => {
      try {
        const coordsToSave = {
          latitude: sourceCoords.latitude,
          longitude: sourceCoords.longitude,
        };

        const addressToSave =
          clientLocationData?.address ||
          savedAddress ||
          resolveAddressText(coordsToSave.latitude, coordsToSave.longitude, savedAddress);

        await saveClientLocation(coordsToSave, addressToSave, {
          source: 'gps',
          manualOverride: {
            active: false,
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error('❌ [HomeScreen] Error bootstrapping ubicación inicial del cliente:', err);
      }
    })();
  }, [
    user?.id,
    coords?.latitude,
    coords?.longitude,
    clientLocationData?.coords,
    clientLocationData?.address,
    savedAddress,
    saveClientLocation,
  ]);

  const committedCoords = useMemo(() => {
    if (manualOverride?.active) {
      return manualOverride.coords;
    }
    if (clientLocationData?.coords) {
      return {
        latitude: clientLocationData.coords.latitude,
        longitude: clientLocationData.coords.longitude,
      };
    }
    if (coords) {
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
      };
    }
    return DEFAULT_CLIENT_LOCATION;
  }, [
    manualOverride?.active,
    manualOverride?.coords,
    clientLocationData?.coords,
    coords?.latitude,
    coords?.longitude,
  ]);

  useEffect(() => {
    if (committedCoords) {
      lastCommittedCoordsRef.current = committedCoords;
    }

    if (isSavingLocation || hasPendingManualSelection) {
      return;
    }

    if (!mapCenter || !areCoordsEqual(mapCenter, committedCoords)) {
      ignoreNextRegionChangeRef.current = true;
      setMapCenter(committedCoords);
    }

    const baseAddress =
      manualOverride?.address ||
      clientLocationData?.address ||
      savedAddress ||
      resolveAddressText(committedCoords.latitude, committedCoords.longitude, savedAddress);

    setPendingAddress(baseAddress);
    setHasPendingManualSelection(false);
  }, [
    committedCoords.latitude,
    committedCoords.longitude,
    manualOverride?.address,
    clientLocationData?.address,
    savedAddress,
    mapCenter,
    hasPendingManualSelection,
    isSavingLocation,
  ]);

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
              rideData.status === 'accepted' || rideData.status === 'driver_on_route' || rideData.status === 'in_progress' ||
              rideData.status === 'pending_payment' || rideData.status === 'driver_offered' || rideData.status === 'driver_assigned')) {

            console.log('🚗 [HomeScreen] Viaje activo confirmado, mostrando banner...');
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
                ride.status === 'accepted' || ride.status === 'driver_on_route' || ride.status === 'in_progress' ||
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

            setActiveRide({ ...activeRideData, id: activeRideId });
            activeRideFound = true; // ✅ FIX: Marcar como encontrado

            // Guardar en AsyncStorage
            await AsyncStorage.setItem('ACTIVE_RIDE_ID', activeRideId);

            // NOTA: No sincronizar con Supabase aquí porque los IDs de Firebase no son UUIDs
            // La sincronización se hará cuando se confirme el viaje en HomeScreenOffers
            console.log('💾 Viaje guardado en AsyncStorage:', activeRideId);
          } else {
            // No se encontró ningún viaje activo
            console.log('📭 [HomeScreen] No hay viajes activos');
            setActiveRide(null);
          }
        }

        // Si no se encontró ningún viaje activo, limpiar también AsyncStorage
        if (!activeRideFound) {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.removeItem('ACTIVE_RIDE_ID');
          setActiveRide(null);
          console.log('🗑️ [HomeScreen] No hay viajes activos, limpiando estado');
        }

      } catch (error) {
        console.error('❌ Error verificando viajes activos:', error);
      }
    };

    checkActiveRides();
  }, [user?.id, activeRidesData, navigation]);

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

        const normalizedStatus = String(payment.status || '').toLowerCase();

        // ✅ MEJORADO: Excluir pagos completados, cancelados o fallidos
        if (normalizedStatus === 'completed' || normalizedStatus === 'canceled' || normalizedStatus === 'failed') {
          console.log(`✅ [HomeScreen] Pago ${rideId} ya está ${normalizedStatus}, ignorando`);
          continue;
        }

        // Solo pagos realmente pendientes de acción del cliente
        const isPotentialPending =
          normalizedStatus === 'pending' ||
          normalizedStatus === 'pending_confirmation' ||
          normalizedStatus === 'in_progress' ||
          normalizedStatus === 'payment_in_progress';

        if (isPotentialPending) {
          // Obtener datos del viaje
          const { ref: refFunc, get } = require('firebase/database');
          const rideRef = refFunc(db, `activeRides/${rideId}`);
          const rideSnapshot = await get(rideRef);
          const rideData = rideSnapshot.val();

          if (!rideData) {
            console.log(`⚠️ [HomeScreen] Viaje ${rideId} no encontrado en activeRides`);
            continue;
          }

          const rideStatus = String(rideData.status || '').toLowerCase();

          console.log(`🔍 [HomeScreen] Viaje ${rideId} - clientId: ${rideData.clientId}, userId: ${user.id}, status: ${rideStatus}`);

          // Solo considerar pagos pendientes cuando el viaje está en estado pending_payment
          if (rideStatus !== 'pending_payment') {
            console.log(
              `⏭️ [HomeScreen] Pago ${rideId} ignorado porque el viaje no está en pending_payment (status=${rideStatus})`,
            );
            continue;
          }

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
      // ✅ Fallback: derivar flags y total
      try {
        const fallbackTotal = userPendingPayments.reduce((sum: number, item: any) => {
          const amount = Number(
            item?.payment?.finalAmount ??
            item?.ride?.finalFare ??
            item?.ride?.estimatedPrice ??
            0
          );
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);
        setHasPendingPayments(userPendingPayments.length > 0);
        setTotalDebt(Number(fallbackTotal.toFixed(2)));
      } catch (e) {
        console.warn('⚠️ [HomeScreen] No se pudo calcular total de deuda de fallback:', e);
      }
    });

    return () => {
      console.log('🔇 Limpiando listener de pagos pendientes');
      off(paymentStatusRef);
      unsubscribe();
    };
  }, [user?.id]);

  // Efecto para procesar conductores cercanos (mejorado con lógica del archivo viejo)
  useEffect(() => {
    if (!coords && !clientLocationData?.coords && !manualOverride?.active) {
      console.log('⚠️ Sin ubicación disponible para buscar conductores');
      setAvailableDrivers([]);
      return;
    }

    const effectiveLocation =
      (manualOverride?.active && manualOverride.coords) ||
      coords ||
      clientLocationData?.coords;

    if (!effectiveLocation) {
      console.log('⚠️ No hay effectiveLocation, no se puede buscar conductores');
      return;
    }

    console.log('✅ Iniciando búsqueda de conductores con ubicación:', effectiveLocation);

    try {
      const SEARCH_RADIUS_KM = 3;

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

      const driversWithIcons = allDrivers.map((driver) => {
        const infoData = driversInfo?.[driver.id];
        const inferredVehicleType = extractVehicleTypeFromInfo({
          vehicle: driver.vehicle,
          ...(infoData || {}),
        });

        return {
          id: driver.id,
          latitude: driver.latitude,
          longitude: driver.longitude,
          heading: driver.heading,
          vehicleIconSource: ensureVehicleIconSource(inferredVehicleType),
        };
      });

      setAvailableDrivers(driversWithIcons);
    } catch (error) {
      console.error('❌ Error procesando conductores:', error);
      setAvailableDrivers([]);
    }
  }, [
    coords,
    clientLocationData?.coords,
    manualOverride?.active,
    manualOverride?.coords,
    driversInfo,
    driverLocationsSnapshot,
    loadingDrivers,
  ]);

  // Función para calcular distancia entre coordenadas
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    return haversineKm(lat1, lon1, lat2, lon2);
  };

  const resolveAddressText = (lat: number, lng: number, fallback?: string) =>
    fallback || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  useEffect(() => {
    if (!manualOverride?.active || !coords) {
      return;
    }

    if (manualOverride.source === 'local') {
      return;
    }

    if (clientLocationData?.isManual) {
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
  }, [coords, manualOverride, clientLocationData?.isManual, saveClientLocation, savedAddress]);

  // Guardar ubicación del cliente en Firebase
  // Navegar a pantalla de pagos pendientes
  const handleViewPendingPayments = useCallback(() => {
    console.log('💰 Navegando a pantalla de pagos pendientes');
    navigation.replace('PendingPayments');
  }, [navigation]);

  const handleRegionChangeCenter = useCallback((center?: { latitude: number; longitude: number }) => {
    if (!center) {
      return;
    }

    if (ignoreNextRegionChangeRef.current) {
      ignoreNextRegionChangeRef.current = false;
      return;
    }

    clearRegionIdleTimeout();

    if (isPinLocked) {
      return;
    }

    if (!mapGestureActiveRef.current) {
      mapGestureActiveRef.current = true;
      setIsHoldingPin(true);
      setHasPendingManualSelection(true);
    }

    setMapCenter({ latitude: center.latitude, longitude: center.longitude });
  }, [clearRegionIdleTimeout, isPinLocked]);

  const persistManualLocation = useCallback(
    async (coordsToSave: { latitude: number; longitude: number } | null, preferredAddress?: string | null) => {
      if (!coordsToSave || isSavingLocation) {
        return;
      }

      setIsSavingLocation(true);
      setLoadingMessage('Guardando ubicación...');

      try {
        let addressToSave = preferredAddress;
        if (!addressToSave || addressToSave === 'Cargando ubicación…') {
          addressToSave =
            (await mapsService.reverseGeocode({
              latitude: coordsToSave.latitude,
              longitude: coordsToSave.longitude,
            })) || resolveAddressText(coordsToSave.latitude, coordsToSave.longitude, savedAddress);
        }

        await saveClientLocation(coordsToSave, addressToSave, {
          source: 'manual',
          manualOverride: {
            active: true,
            updatedAt: new Date().toISOString(),
          },
        });

        ignoreNextRegionChangeRef.current = true;
        lastCommittedCoordsRef.current = coordsToSave;

        setManualOverride({
          active: true,
          coords: coordsToSave,
          address: addressToSave,
          updatedAt: Date.now(),
          source: 'local',
        });
        setSavedAddress(addressToSave);
        setPendingAddress(addressToSave);
        setHasPendingManualSelection(false);
        setIsPinLocked(true);

        alertService.showSuccessAlert('Ubicación actualizada', 'Tu ubicación actual se ha guardado correctamente.');
      } catch (error) {
        console.error('❌ [HomeScreen] Error guardando nueva ubicación:', error);
        alertService.showErrorAlert('No se pudo guardar tu nueva ubicación. Intenta de nuevo.');
      } finally {
        setIsHoldingPin(false);
        setIsSavingLocation(false);
        setLoadingMessage('Preparando tu experiencia...');
      }
    },
    [alertService, isSavingLocation, mapsService, resolveAddressText, saveClientLocation, savedAddress],
  );

  const updateRegionForCoords = useCallback(
    async (latitude: number, longitude: number) => {
      try {
        const { default: client } = await import('../../api/client');
        const { getFirebaseAuth } = await import('../../config/firebase');

        const auth = await getFirebaseAuth();
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          console.warn('[HomeScreen] No hay sesión Firebase Auth; omitiendo verificación de región para pin');
          return;
        }

        try {
          await firebaseUser.getIdToken(true);
        } catch (tokenError) {
          console.warn('[HomeScreen] No se pudo refrescar token antes de checkRegionAvailability (pin):', tokenError);
        }

        const response = await client.post('/checkRegionAvailabilityHttp', {
          latitude,
          longitude,
          platform: Platform.OS,
        });

        const data = response.data as any;
        const allowed = !!data?.allowed;

        setRegionStatus({
          checked: true,
          allowed,
          areaName: typeof data?.areaName === 'string' ? data.areaName : undefined,
          message: typeof data?.message === 'string' ? data.message : undefined,
          reasonCode: typeof data?.reasonCode === 'string' ? data.reasonCode : undefined,
        });

        const nextServiceAreaId =
          typeof data?.serviceAreaId === 'string' && data.serviceAreaId.trim().length > 0
            ? data.serviceAreaId.trim()
            : null;

        setServiceAreaId(nextServiceAreaId);
        setIsOutsideSupportedArea(!allowed);
      } catch (error: any) {
        console.error(
          '❌ [HomeScreen] Error verificando región para pin (HTTP):',
          (error && (error.response?.data || error.message)) || error,
        );
      }
    }, [],
  );

  const handleRegionChangeCompleteCenter = useCallback((center?: { latitude: number; longitude: number }) => {
    if (!center) {
      return;
        }

    mapGestureActiveRef.current = false;
    setIsHoldingPin(false);

    if (ignoreNextRegionChangeRef.current) {
      ignoreNextRegionChangeRef.current = false;
      return;
    }

    if (isPinLocked) {
      clearRegionIdleTimeout();
      return;
    }

    const normalizedCenter = { latitude: center.latitude, longitude: center.longitude };

    setMapCenter(normalizedCenter);

    const lastCommitted = lastCommittedCoordsRef.current;
    const movedFromCommitted = !lastCommitted || !areCoordsEqual(lastCommitted, normalizedCenter, COORDS_EPSILON);

    if (!movedFromCommitted) {
      setHasPendingManualSelection(false);
      setPendingAddress((prev) =>
        prev && prev !== 'Cargando ubicación…'
          ? prev
          : resolveAddressText(normalizedCenter.latitude, normalizedCenter.longitude, savedAddress)
      );
      setIsResolvingAddress(false);
      setIsHoldingPin(false);
      clearRegionIdleTimeout();
      return;
    }

    setHasPendingManualSelection(true);

    clearRegionIdleTimeout();
    regionIdleTimeoutRef.current = setTimeout(() => {
      (async () => {
        setIsResolvingAddress(true);
        let resolvedAddress: string | null = null;

        try {
          resolvedAddress = await mapsService.reverseGeocode({
            latitude: normalizedCenter.latitude,
            longitude: normalizedCenter.longitude,
          });
        } catch (error) {
          console.error('❌ [HomeScreen] Error resolviendo dirección para selección manual:', error);
        }

        const finalAddress =
          resolvedAddress || resolveAddressText(normalizedCenter.latitude, normalizedCenter.longitude, savedAddress);
        setPendingAddress(finalAddress);
        setIsResolvingAddress(false);

        await updateRegionForCoords(normalizedCenter.latitude, normalizedCenter.longitude);

        await persistManualLocation(normalizedCenter, finalAddress);
      })()
        .catch((error) => {
          console.error('❌ [HomeScreen] Error completando selección manual:', error);
        })
        .finally(() => {
          regionIdleTimeoutRef.current = null;
        });
    }, REGION_IDLE_DELAY_MS);
  }, [
    clearRegionIdleTimeout,
    isPinLocked,
    mapsService,
    persistManualLocation,
    resolveAddressText,
    savedAddress,
    updateRegionForCoords,
  ]);

  const handleMarkerPress = useCallback(async () => {
    if (!mapCenter || isSavingLocation) {
      return;
    }

    if (isPinLocked) {
      setIsPinLocked(false);
      return;
    }

    if (isHoldingPin) {
      return;
    }

    await persistManualLocation(mapCenter, pendingAddress);
  }, [mapCenter, isHoldingPin, isPinLocked, isSavingLocation, pendingAddress, persistManualLocation]);

  // Centrar mapa en la ubicación actual y actualizar ubicación
  const handleCenterMap = useCallback(async () => {
    try {
      await refreshLocation();
      console.log('📍 Solicitud de actualización de ubicación enviada');
    } catch (error) {
      console.error('❌ Error actualizando ubicación:', error);
      alertService.showErrorAlert('No se pudo actualizar la ubicación');
    }
  }, [refreshLocation]);

  // Ir a pantalla de solicitud de viaje
  const handleRequestRide = useCallback(() => {
    if (isOutsideSupportedArea) {
      alertService.showInfoAlert(
        'Región no disponible',
        regionStatus.message || 'Por el momento no puedes solicitar viajes porque te encuentras fuera del área de cobertura activa.',
      );
      return;
    }

    if (hasPendingPayments) {
      handleViewPendingPayments();
      return;
    }

    navigation.navigate('SearchRide');
  }, [handleViewPendingPayments, hasPendingPayments, isOutsideSupportedArea, navigation, regionStatus.message]);

  // Ir a pantalla de viaje activo
  const handleViewActiveRide = useCallback(async () => {
    try {
      if (!activeRide) {
        console.log('❌ No hay viaje activo en el estado');
        return;
      }

      console.log('🚗 Navegando a viaje activo:', activeRide.id, 'Estado:', activeRide.status);

      if (['requested', 'driver_offered', 'pending_confirm', 'driver_assigned'].includes(activeRide.status)) {
        navigation.replace('HomeOffers', { rideId: activeRide.id });
        return;
      }

      if (['accepted', 'driver_on_route', 'in_progress'].includes(activeRide.status)) {
        navigation.replace('RideTracking', {
          rideId: activeRide.id,
          driverId: activeRide.driverId,
          driverName: activeRide.driver?.name || 'Conductor',
          vehiclePlate: activeRide.vehicle?.plate || activeRide.driver?.vehicle?.plate || 'N/A',
          vehicleBrand: activeRide.vehicle?.make || activeRide.vehicle?.brand || activeRide.driver?.vehicle?.brand || 'N/A',
          vehicleModel: activeRide.vehicle?.model || activeRide.driver?.vehicle?.model || 'N/A',
          vehicleColor: activeRide.vehicle?.color || activeRide.driver?.vehicle?.color || 'N/A',
          estimatedFare: activeRide.finalFare || activeRide.estimatedPrice || 0,
        });
        return;
      }

      if (activeRide.status === 'pending_payment') {
        const paymentMethod = activeRide.paymentMethod || activeRide.payment?.method || 'cash';
        const finalAmount = activeRide.finalFare || activeRide.estimatedPrice || 0;
        const driverName = activeRide.driver?.name || 'Conductor';
        const driverPhoto = activeRide.driver?.photoURL || undefined;

        if (paymentMethod === 'card') {
          navigation.replace('Payment', {
            rideId: activeRide.id,
            amount: finalAmount,
            driverId: activeRide.driverId,
            driverName,
            vehiclePlate: activeRide.vehicle?.plate || activeRide.driver?.vehicle?.plate || 'N/A',
            driverPhoto,
            isPendingPayment: true,
          });
        } else {
          navigation.replace('CashPayment', {
            rideId: activeRide.id,
            amount: finalAmount,
            driverName,
            driverPhoto,
          });
        }
        return;
      }

      console.log(`⚠️ [HomeScreen] Estado de viaje no manejado: ${activeRide.status}`);
    } catch (error: any) {
      console.error('❌ Error al navegar a viaje activo:', error);
    }
  }, [activeRide, navigation]);

  const getActiveRideLabel = useCallback((status: string) => {
    switch (status) {
      case 'requested':
        return 'Buscando conductor';
      case 'pending_confirm':
      case 'driver_offered':
      case 'driver_assigned':
        return 'Confirma tu viaje';
      case 'accepted':
        return 'Conductor en camino';
      case 'driver_on_route':
        return 'Conductor en camino';
      case 'in_progress':
        return 'Viaje en curso';
      case 'pending_payment':
        return 'Pago pendiente';
      default:
        return 'Viaje activo';
    }
  }, []);

  // Suscribirse al preflight store
  useEffect(() => {
    const unsubscribePreflight = subscribePreflightResult((summary) => {
      if (!summary || summary.role !== 'client') {
        setPreflightActions([]);
        return;
      }
      setPreflightActions(summary.actions);
    });

    return () => {
      unsubscribePreflight();
    };
  }, []);

  useEffect(() => {
    // Prioridad 1: Viaje activo (incluye estados de búsqueda, en curso o pending_payment)
    if (activeRide) {
      setPendingAction({
        type: 'active_ride',
        title: getActiveRideLabel(activeRide.status),
        onPress: handleViewActiveRide,
      });
      return;
    }

    // Prioridad 2: Pagos pendientes detectados localmente / backend
    if (hasPendingPayments && pendingPayments.length > 0) {
      setPendingAction({
        type: 'pending_payment',
        title: pendingPayments.length === 1 ? 'Pago pendiente' : `${pendingPayments.length} pagos pendientes`,
        onPress: handleViewPendingPayments,
      });
      return;
    }

    // Prioridad 3: Acciones desde preflight (complemento)
    if (preflightActions.length > 0) {
      const nextAction = preflightActions.find(
        (action) => action.type === 'active_ride' || action.type === 'pending_payment'
      );

      if (nextAction) {
        const actionType = nextAction.type === 'pending_payment' ? 'pending_payment' : 'active_ride';

        setPendingAction({
          type: actionType,
          title: nextAction.title,
          onPress: () => {
            if (nextAction.routeName) {
              navigation.navigate(nextAction.routeName as any, nextAction.routeParams);
            }
          },
        });
        return;
      }
    }

    setPendingAction(null);
  }, [hasPendingPayments, pendingPayments, activeRide, preflightActions, getActiveRideLabel, handleViewActiveRide, handleViewPendingPayments, navigation]);

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

  // Mostrar alerta de región no soportada (una sola vez por sesión de Home)
  useEffect(() => {
    if (!isOutsideSupportedArea) return;
    if (hasShownUnsupportedAlertRef.current) return;

    hasShownUnsupportedAlertRef.current = true;
    alertService.showInfoAlert(
      'Región no disponible',
      regionStatus.message ||
        'Por el momento el servicio solo está disponible dentro de las áreas activas (actualmente Managua).',
    );
  }, [isOutsideSupportedArea, regionStatus.message]);

  const waitingForLocation = locationLoading && !coords && !storedCoords;

  const displayCoords = useMemo(() => {
    if (mapCenter) {
      return mapCenter;
    }
    return effectiveCoords;
  }, [mapCenter, effectiveCoords]);

  useEffect(() => {
    if (!locationLoading) {
      markTaskCompleted('location');
    }
  }, [locationLoading, markTaskCompleted]);

  if (initializing) {
    console.log('⏳ [HomeScreen:init] Esperando tareas iniciales:', Array.from(pendingInitialTasks.current));
    return <LoadingOverlay visible message={loadingMessage} />;
  }

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

  const locationStatusHint = isPinLocked
    ? 'Ubicacion seleccionada. Toca el pin para mover en el mapa y seleccionar una nueva ubicación.'
    : hasPendingManualSelection
    ? isSavingLocation
      ? 'Guardando nueva ubicación…'
      : 'Mueve el mapa y suelta o toca el pin para guardar.'
    : 'Toca el pin para bloquear su posición.';

  const markerIcon = isDark ? USER_LOCATION_DARK_ICON : USER_LOCATION_LIGHT_ICON;
  const markerHoldIcon = isDark ? USER_LOCATION_HOLDING_DARK_ICON : USER_LOCATION_HOLDING_LIGHT_ICON;

  const showUserLocationDot = !manualOverride?.active && isPinLocked && !hasPendingManualSelection;
  const showCenterPinOverlay = !isPinLocked;

  return (
    <View style={styles.container}>
      {/* Mapa con ubicación actual */}
      <DynamicMap
        latitude={displayCoords.latitude}
        longitude={displayCoords.longitude}
        style={styles.map}
        showUserLocation={showUserLocationDot}
        userLocation={showUserLocationDot ? coords || undefined : undefined}
        showMarker={isPinLocked}
        markerPosition={displayCoords}
        markerType="manual_origin"
        nearbyDrivers={availableDrivers}
        disableMarkerPress={isSavingLocation}
        onMarkerPress={handleMarkerPress}
        onRegionChangeCenter={handleRegionChangeCenter}
        onRegionChangeCompleteCenter={handleRegionChangeCompleteCenter}
        showPinBubbles
        originLabel={isResolvingAddress ? 'Buscando dirección…' : pendingAddress}
        userLocationLightIcon={USER_LOCATION_LIGHT_ICON}
        userLocationDarkIcon={USER_LOCATION_DARK_ICON}
        userLocationHoldingLightIcon={USER_LOCATION_HOLDING_LIGHT_ICON}
        userLocationHoldingDarkIcon={USER_LOCATION_HOLDING_DARK_ICON}
        manualOriginIcon={isPinLocked ? markerIcon : markerHoldIcon}
        manualOriginHoldIcon={markerHoldIcon}
        manualOriginBounceValue={isPinLocked && !isHoldingPin ? markerBounceTranslateY : undefined}
        autoFitEnabled={false}
      />

      {showCenterPinOverlay && (
        <View pointerEvents="none" style={styles.centerPinOverlay}>
          <Animated.Image
            source={markerHoldIcon}
            style={[styles.centerPinImage, { transform: [{ translateY: centerPinTranslateY }] }]}
            resizeMode="contain"
          />
        </View>
      )}

      <View
        style={[
          styles.locationStatusContainer,
          hasPendingManualSelection ? styles.locationStatusPending : styles.locationStatusIdle,
        ]}
      >
        {/*<Text style={styles.locationStatusAddress} numberOfLines={2}>
          {pendingAddress}
        </Text>*/}
        <Text style={styles.locationStatusHint}>{locationStatusHint}</Text>
        {isSavingLocation && (
          <Text style={styles.locationStatusSaving}>Guardando ubicación…</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.profileContainer}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.profileName}>{user?.name || 'Usuario'}</Text>
        <Image source={PROFILE_ICON_IMAGE} style={styles.profileAvatar} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.centerMapButton}
        onPress={handleCenterMap}
        activeOpacity={0.85}
      >
        <Text style={styles.centerMapIcon}>↻</Text>
      </TouchableOpacity>

      {pendingAction ? (
        <TouchableOpacity
          style={styles.pendingActionButton}
          activeOpacity={0.9}
          onPress={pendingAction.onPress}
        >
          <ImageBackground
            source={PENDING_ACTION_IMAGE}
            style={styles.pendingActionBackground}
            imageStyle={styles.pendingActionBackgroundInner}
            resizeMode="stretch"
          >
            <Text style={styles.pendingActionLabel}>{pendingAction.title}</Text>
          </ImageBackground>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity
            style={[
              styles.requestButtonWrapper,
              isOutsideSupportedArea && styles.requestButtonDisabled,
            ]}
            activeOpacity={0.9}
            onPress={handleRequestRide}
            disabled={isOutsideSupportedArea}
          >
            <ImageBackground
              source={REQUEST_BUTTON_IMAGE}
              style={styles.requestButtonBackground}
              imageStyle={styles.requestButtonBackgroundInner}
              resizeMode="stretch"
            />
          </TouchableOpacity>
          <View style={styles.regionHintContainer}>
            <Text style={styles.regionHintText} numberOfLines={2}>
              {!regionStatus.checked
                ? 'Verificando área de cobertura...'
                : regionStatus.allowed
                ? regionStatus.areaName
                  ? `Servicio disponible en ${regionStatus.areaName}`
                  : 'Servicio disponible en tu zona actual'
                : regionStatus.message ||
                  'Por el momento el servicio solo está disponible dentro de las áreas activas.'}
            </Text>
          </View>
        </>
      )}
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
  centerPinOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -32 }, { translateY: -64 }],
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  centerPinImage: {
    width: 64,
    height: 64,
  },
  locationStatusContainer: {
    position: 'absolute',
    top: 96,
    left: 45,
    right: 45,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(219, 193, 160, 0.9)',
    shadowColor: '#949393ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
  locationStatusPending: {
    borderColor: colors.primary,
  },
  locationStatusIdle: {
    borderColor: colors.border,
  },
  locationStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  locationStatusAddress: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    marginBottom: 6,
  },
  locationStatusHint: {
    fontSize: 16,
    color: 'rgba(131, 98, 66, 1)',
  },
  locationStatusSaving: {
    marginTop: 4,
    fontSize: 16,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  profileContainer: {
    position: 'absolute',
    top: 32,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background + 'CC',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    shadowColor: '#00000055',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  profileName: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
    marginRight: 10,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  centerMapButton: {
    position: 'absolute',
    bottom: 130,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card + 'F2',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00000055',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  centerMapIcon: {
    fontSize: 20,
    color: colors.text,
  },
  requestButtonWrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 32,
    height: 64,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#00000055',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonBackground: {
    width: '100%',
    height: '100%',
  },
  requestButtonBackgroundInner: {
    borderRadius: 24,
  },
  regionHintContainer: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 104,
    alignItems: 'center',
  },
  regionHintText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pendingActionButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 32,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#00000055',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  pendingActionBackground: {
    width: '100%',
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingActionBackgroundInner: {
    borderRadius: 24,
  },
  pendingActionLabel: {
    color: '#FFFFFF',
    fontSize: 16,
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