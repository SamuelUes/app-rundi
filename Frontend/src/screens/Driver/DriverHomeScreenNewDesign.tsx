import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { DriverStackParamList } from '../../navigation/DriverStack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Image,
  ImageBackground,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';

// Contextos y hooks
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { useLocation, DRIVER_LOCATION_OPTIONS } from '../../hooks/useLocation';
import useDriverProximityTracking from '../../hooks/useDriverProximityTracking';
import { subscribePreflightResult, getPreflightResult, PreflightAction } from '../../state/preflightStore';

// Componentes
import LoadingOverlay from '../../components/LoadingOverlay';
import DynamicMap from '../../components/DynamicMap';
import EmergencyButton from '../../components/EmergencyButton';

// Servicios
import alertService from '../../services/alertService';
import mapsService from '../../services/mapsService';
import driversService from '../../services/driversService';
import driverAvailabilityService from '../../services/driverAvailabilityService';
import earningsService from '../../services/earningsService';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/vehicleIcons';
import { useAcceptedRideListener } from '../../hooks/useAcceptedRideListener';
import proximityService from '../../services/proximityService';
import penaltiesService from '../../services/penaltiesService';
import { haversineKm } from '../../utils/distance';

type NearbyDriverMarker = {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  vehicleType?: string | null;
  vehicleIconSource?: ImageSourcePropType;
};

type PendingAction =
  | {
      type: 'pending_payment';
      title: string;
      subtitle: string;
      onPress: () => void;
    }
  | {
      type: 'active_ride';
      title: string;
      subtitle: string;
      onPress: () => void;
    };

const ACTIVE_RIDE_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
const PENALTIES_LIMIT_CORDOBAS = 150;

const getActiveRidePendingCopy = (ride: any) => {
  const status: string = ride?.status || '';
  const clientName = ride?.client?.name || ride?.clientName || 'Cliente';

  switch (status) {
    case 'driver_on_route':
      return {
        title: 'En camino al cliente',
        subtitle: `Dirígete a ${clientName}`,
      };
    case 'driver_arrived':
      return {
        title: 'Cliente esperando',
        subtitle: `Confirma la recogida de ${clientName}`,
      };
    case 'in_progress':
      return {
        title: 'Viaje en curso',
        subtitle: ride?.destinationAddress || ride?.destination?.address || 'Continúa el viaje',
      };
    case 'accepted':
    default:
      return {
        title: 'Viaje aceptado',
        subtitle: `Abre el viaje con ${clientName}`,
      };
  }
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  return haversineKm(lat1, lon1, lat2, lon2);
};

export default function DriverHomeScreenNewDesign({ navigation }: any) {
  const { user, logout, logoutInProgress } = useAuth();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopVoiceCategory } = useVoiceAssistant();
  const { colors } = useTheme();

  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.role === 'driver' ? preflightSummary.region : undefined;

  const initialCoords =
    initialRegion &&
    typeof initialRegion.latitude === 'number' &&
    typeof initialRegion.longitude === 'number'
      ? {
          latitude: initialRegion.latitude,
          longitude: initialRegion.longitude,
        }
      : null;

  const { coords, loading: locationLoading, error, refreshLocation } = useLocation(
    initialCoords
      ? {
          ...DRIVER_LOCATION_OPTIONS,
          initialCoords,
        }
      : DRIVER_LOCATION_OPTIONS,
  );
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loadingMessage, setLoadingMessage] = useState('Preparando tu panel de conductor...');
  const [initializing, setInitializing] = useState(true);
  const pendingInitialTasks = useRef(new Set<string>([
    'location',
    'pendingPayments',
    'penaltySummary',
    'driverInfo',
    'availabilityState',
    'todayStats',
  ]));

  const markTaskCompleted = useCallback((taskName: string) => {
    if (!pendingInitialTasks.current.has(taskName)) {
      return;
    }

    pendingInitialTasks.current.delete(taskName);
    console.log(`✅ [DriverHome:init] Tarea completada: ${taskName}. Restantes: ${pendingInitialTasks.current.size}`);

    if (pendingInitialTasks.current.size === 0) {
      console.log('🎉 [DriverHome:init] Todas las tareas iniciales completadas, mostrando pantalla.');
      setInitializing(false);
    }
  }, []);

  // Monitorear rides aceptados y navegar automáticamente
  useAcceptedRideListener(navigation);

  // 🚀 Iniciar tracking de background para proximity
  useEffect(() => {
    console.log('🏠 [DriverHomeScreen] Componente montado - iniciando proximity tracking');
  }, []);
  
  useDriverProximityTracking();

  const [isAvailable, setIsAvailable] = useState(false);
  const [isDesignatedDriverMode, setIsDesignatedDriverMode] = useState(false);
  const [todayStats, setTodayStats] = useState({ trips: 0, earnings: 0 });
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [penaltySummary, setPenaltySummary] = useState<{ pendingCount: number; pendingAmount: number } | null>(null);
  const [preflightActions, setPreflightActions] = useState<PreflightAction[]>(() => preflightSummary?.actions ?? []);
  const [serviceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);
  const [nearbyDriversMarkers, setNearbyDriversMarkers] = useState<NearbyDriverMarker[]>([]);
  const [availableRideRequests, setAvailableRideRequests] = useState<any[]>([]);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [clientNamesCache, setClientNamesCache] = useState<Record<string, string>>({});
  const [menuVisible, setMenuVisible] = useState(false);
  const panelWidthRef = useRef(Math.min(Dimensions.get('window').width * 0.8, 340));
  const panelWidth = panelWidthRef.current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuTranslate = useRef(new Animated.Value(panelWidth)).current;

  const closeMenu = useCallback(() => {
    if (!menuVisible) return;
    Animated.parallel([
      Animated.timing(menuOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(menuTranslate, {
        toValue: panelWidth,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMenuVisible(false);
      }
    });
  }, [menuOpacity, menuTranslate, menuVisible, panelWidth]);

  const openMenu = useCallback(() => {
    menuOpacity.setValue(0);
    menuTranslate.setValue(panelWidth);
    setMenuVisible(true);
    Animated.parallel([
      Animated.timing(menuOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(menuTranslate, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [menuOpacity, menuTranslate, panelWidth]);

  const toggleMenu = () => {
    if (menuVisible) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  const handleNavigate = (route: keyof DriverStackParamList) => {
    closeMenu();
    navigation.navigate(route);
  };

  const handleLogout = async () => {
    if (logoutInProgress) {
      return;
    }
    try {
      await logout();
      closeMenu();
    } catch (error) {
      console.error('❌ Error cerrando sesión:', error);
    }
  };

  const handleRefreshLocation = useCallback(() => {
    setLoadingMessage('Obteniendo tu ubicación...');
    refreshLocation();
  }, [refreshLocation]);

  const notifiedRides = useRef<Set<string>>(new Set());
  const announcedRideIdsRef = useRef<Set<string>>(new Set());
  const rideStatusCacheRef = useRef<Record<string, string>>({});
  const driverLocationsSignatureRef = useRef<string>('');
  const driverInfoCacheRef = useRef<Record<string, any>>({});
  const lastPendingActionRef = useRef<string | null>(null);
  const lastAvailabilityAnnouncementRef = useRef<boolean | null>(null);
  const lastActiveRideIdRef = useRef<string | null>(null);
  const initialVoiceWelcomeRef = useRef<boolean>(false);
  const penaltyAlertShownRef = useRef<boolean>(false);
  const enforcingAvailabilityRef = useRef<boolean>(false);

  const [currentVehicleType, setCurrentVehicleType] = useState<string | null>(null);
  const [currentVehicleIconSource, setCurrentVehicleIconSource] = useState<ImageSourcePropType | undefined>(undefined);

  const formatCurrency = (value: number = 0) => `C$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;

  const parseCoordinate = (value: any): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  useEffect(() => {
    mapsService.fetchProviderFromBackend();
  }, []);

  useEffect(() => {
    const unsubscribePreflight = subscribePreflightResult((summary) => {
      if (!summary || summary.role !== 'driver') {
        setPreflightActions([]);
        return;
      }
      setPreflightActions(summary.actions);
    });

    return () => {
      unsubscribePreflight();
      stopVoiceCategory('navigation');
      stopVoiceCategory('status');
    };
  }, [stopVoiceCategory]);

  useEffect(() => {
    if (!voiceSettings.enabled) {
      announcedRideIdsRef.current.clear();
      lastPendingActionRef.current = null;
      initialVoiceWelcomeRef.current = false;
      stopVoiceCategory('navigation');
      stopVoiceCategory('status');
      return;
    }

    if (!initialVoiceWelcomeRef.current) {
      initialVoiceWelcomeRef.current = true;
      speakVoice(
        'Asistente de voz listo. Te avisaré de viajes cercanos y cambios importantes.',
        'status',
        undefined,
        true,
      );
    }
  }, [voiceSettings.enabled, speakVoice, stopVoiceCategory]);

  // 🚀 Proximidad en foreground: si está disponible y NO hay viaje activo, abrir preview
  useEffect(() => {
    if (!user?.id || !coords || !isAvailable) return;
    if (activeRide) return;
    
    // Ejecutar inmediatamente
    proximityService.handleLocationForProximity(user.id, coords.latitude, coords.longitude);
    
    // Ejecutar cada 10 segundos para detectar nuevos viajes
    const interval = setInterval(() => {
      if (!activeRide) {
        proximityService.handleLocationForProximity(user.id, coords.latitude, coords.longitude);
      }
    }, 10000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, coords?.latitude, coords?.longitude, isAvailable, activeRide?.id]);

  useEffect(() => {
    if (!voiceSettings.enabled) return;

    if (lastAvailabilityAnnouncementRef.current === null) {
      lastAvailabilityAnnouncementRef.current = isAvailable;
      if (isAvailable) {
        speakVoice('Disponibilidad activada. Esperando nuevos viajes.', 'status');
      }
      return;
    }

    if (lastAvailabilityAnnouncementRef.current !== isAvailable) {
      lastAvailabilityAnnouncementRef.current = isAvailable;
      speakVoice(
        isAvailable ? 'Disponibilidad activada. Esperando nuevos viajes.' : 'Disponibilidad desactivada.',
        'status',
      );
    }
  }, [isAvailable, voiceSettings.enabled, speakVoice]);

  useEffect(() => {
    if (!voiceSettings.enabled || !isAvailable || activeRide) {
      return;
    }

    const currentIds = new Set(availableRideRequests.map((ride) => ride.id));
    announcedRideIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        announcedRideIdsRef.current.delete(id);
      }
    });

    const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371; // km
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    availableRideRequests.forEach((ride) => {
      if (announcedRideIdsRef.current.has(ride.id)) return;
      announcedRideIdsRef.current.add(ride.id);

      let distanceKm: number | null = typeof ride.distanceKm === 'number' ? ride.distanceKm : null;
      if ((distanceKm === null || !Number.isFinite(distanceKm)) && coords) {
        distanceKm = haversineKm(coords.latitude, coords.longitude, ride.latitude, ride.longitude);
      }

      const priceAmount: number = typeof ride.priceAmount === 'number' ? ride.priceAmount : 0;
      const roundedPrice = Math.round(priceAmount);
      const distanceText = Number.isFinite(distanceKm as number) ? `${(distanceKm as number).toFixed(1)} kilómetros` : 'distancia cercana';

      const phrase = `Viaje cercano a ${distanceText}. Precio neto ${roundedPrice} Cordobas.`;
      speakVoice(phrase, 'navigation');
    });
  }, [availableRideRequests, voiceSettings.enabled, isAvailable, activeRide, speakVoice, coords?.latitude, coords?.longitude]);

  useEffect(() => {
    if (!voiceSettings.enabled || !pendingAction) {
      if (!pendingAction) {
        lastPendingActionRef.current = null;
      }
      return;
    }

    const signature = `${pendingAction.type}:${pendingAction.title}:${pendingAction.subtitle}`;
    if (lastPendingActionRef.current === signature) {
      return;
    }
    lastPendingActionRef.current = signature;
    speakVoice(`${pendingAction.title}. ${pendingAction.subtitle}`, 'status');
  }, [pendingAction, voiceSettings.enabled, speakVoice]);

  useEffect(() => {
    if (!voiceSettings.enabled || !activeRide) {
      if (!activeRide) {
        lastActiveRideIdRef.current = null;
      }
      return;
    }

    if (lastActiveRideIdRef.current === activeRide.id) {
      return;
    }

    lastActiveRideIdRef.current = activeRide.id;

    const clientName = activeRide.client?.name || activeRide.clientName || 'el cliente';
    const destinationText =
      activeRide.destinationAddress ||
      activeRide.destination?.address ||
      'el destino asignado';

    speakVoice(
      `Tienes un viaje activo con ${clientName}. Destino ${destinationText}.`,
      'status',
    );
  }, [activeRide, voiceSettings.enabled, speakVoice]);

  const enforceOfflineDueToPenalties = useCallback(async () => {
    if (!user?.id || !coords) {
      return;
    }
    if (!isAvailable) {
      return;
    }
    if (enforcingAvailabilityRef.current) {
      return;
    }

    enforcingAvailabilityRef.current = true;
    const shouldManageUpdatingState = !updatingStatus;
    if (shouldManageUpdatingState) {
      setUpdatingStatus(true);
    }

    try {
      console.log('⚠️ [DriverHomeScreenNewDesign] Forzando estado offline por comisiones pendientes');
      await driversService.updateStatus('offline', coords);
      setIsAvailable(false);

      if (isDesignatedDriverMode && user.role === 'designated_driver') {
        setIsDesignatedDriverMode(false);
        try {
          await driversService.updateDesignatedDriverMode(user.id, false);
        } catch (modeErr) {
          console.warn('⚠️ [DriverHomeScreenNewDesign] Error desactivando modo designado al forzar offline:', modeErr);
        }
      }

      driverAvailabilityService.stopHeartbeat();
      try {
        await driverAvailabilityService.clearAvailabilityState();
      } catch (storageErr) {
        console.warn('⚠️ [DriverHomeScreenNewDesign] No se pudo limpiar estado de disponibilidad:', storageErr);
      }
    } catch (err) {
      console.error('❌ [DriverHomeScreenNewDesign] Error forzando offline por comisiones:', err);
    } finally {
      if (shouldManageUpdatingState) {
        setUpdatingStatus(false);
      }
      enforcingAvailabilityRef.current = false;
    }
  }, [coords, isAvailable, isDesignatedDriverMode, updatingStatus, user?.id, user?.role]);

  // ✅ Resumen de penalizaciones desde Realtime DB
  useEffect(() => {
    if (!user?.id) {
      markTaskCompleted('penaltySummary');
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { initializeFirebase } = await import('../../config/firebase');
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');

        const { app } = await initializeFirebase();
        if (!app) {
          console.error('❌ [DriverHomeScreenNewDesign] Firebase no inicializado');
          markTaskCompleted('penaltySummary');
          return;
        }

        const db = getDatabase(app);
        const summaryRef = dbRef(db, `driverPenalties/${user.id}/summary`);

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;
          const data = snapshot.val();

          if (!data) {
            setPenaltySummary({ pendingCount: 0, pendingAmount: 0 });
            markTaskCompleted('penaltySummary');
            return;
          }

          const pendingAmount = Number(
            data.pendingAmount ??
              data.paymentCommissionPendingAmount ??
              data.paymentPendingAmount ??
              data.penaltyPendingAmount ??
              0,
          );

          const pendingCount = Number(
            data.pendingCount ??
              data.paymentCommissionPendingCount ??
              data.paymentPendingCount ??
              data.penaltyPendingCount ??
              0,
          );

          setPenaltySummary({
            pendingCount,
            pendingAmount,
          });
          markTaskCompleted('penaltySummary');
        };

        onValue(summaryRef, handleSnapshot, (err) => {
          console.error('❌ [DriverHomeScreenNewDesign] Error escuchando driverPenalties summary:', err);
          if (isMounted) {
            setPenaltySummary({ pendingCount: 0, pendingAmount: 0 });
          }
          markTaskCompleted('penaltySummary');
        });

        cleanup = () => off(summaryRef, 'value', handleSnapshot);
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error iniciando listener de penalizaciones:', err);
        if (isMounted) {
          setPenaltySummary({ pendingCount: 0, pendingAmount: 0 });
        }
        markTaskCompleted('penaltySummary');
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [user?.id, markTaskCompleted]);

  useEffect(() => {
    const pendingAmount = Number(penaltySummary?.pendingAmount ?? 0);
    if (!Number.isFinite(pendingAmount)) {
      return;
    }

    if (pendingAmount > PENALTIES_LIMIT_CORDOBAS) {
      if (!penaltyAlertShownRef.current) {
        penaltyAlertShownRef.current = true;
        alertService.showInfoAlert(
          'Comisiones pendientes',
          `Tu disponibilidad se desactivó automáticamente porque superaste C$${PENALTIES_LIMIT_CORDOBAS.toFixed(
            2,
          )} en comisiones pendientes. Debes pagarlas antes de volver a conectarte.`,
          () => navigation.navigate('PendingPayments'),
        );
      }
      void enforceOfflineDueToPenalties();
    } else {
      penaltyAlertShownRef.current = false;
    }
  }, [penaltySummary?.pendingAmount, enforceOfflineDueToPenalties, navigation]);

  useEffect(() => {
    if (!user?.id) {
      markTaskCompleted('driverInfo');
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const driversInfoRef = dbRef(db, 'driversInfo');

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;
          const data = snapshot.val() || {};
          driverInfoCacheRef.current = data;

          if (user?.id) {
            const myInfo = data[user.id];
            const vehicleType = extractVehicleTypeFromInfo(myInfo);
            setCurrentVehicleType(vehicleType);
            setCurrentVehicleIconSource(vehicleType ? ensureVehicleIconSource(vehicleType) : undefined);
          }

          markTaskCompleted('driverInfo');
        };

        onValue(driversInfoRef, handleSnapshot, (err) => {
          console.error('❌ [DriverHomeScreenNewDesign] Error escuchando driversInfo:', err);
          markTaskCompleted('driverInfo');
        });

        cleanup = () => off(driversInfoRef, 'value', handleSnapshot);
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error iniciando listener de driversInfo:', err);
        markTaskCompleted('driverInfo');
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [user?.id, markTaskCompleted]);

  useEffect(() => {
    // Prioridad 1: Pagos pendientes detectados localmente
    if (pendingPayments.length > 0) {
      const firstPayment = pendingPayments[0];
      setPendingAction({
        type: 'pending_payment',
        title: 'Pago pendiente',
        subtitle: pendingPayments.length === 1 ? 'Confirma el pago pendiente' : `${pendingPayments.length} pagos pendientes`,
        onPress: () => {
          navigation.replace('PaymentConfirmation', {
            rideId: firstPayment.rideId,
            amount: firstPayment.finalAmount,
            method: firstPayment.method,
            fromHome: true,
          });
        },
      });
      return;
    }

    // Prioridad 2: Viaje activo
    if (activeRide) {
      const copy = getActiveRidePendingCopy(activeRide);
      setPendingAction({
        type: 'active_ride',
        title: copy.title,
        subtitle: copy.subtitle,
        onPress: () => {
          navigation.replace('ActiveRide', {
            rideId: activeRide.id,
            clientId: activeRide.clientId,
            origin: activeRide.origin,
            destination: activeRide.destination,
            estimatedFare: activeRide.finalFare || activeRide.estimatedPrice,
          });
        },
      });
      return;
    }

    // Prioridad 3: Acciones desde preflight (complemento)
    if (preflightActions.length > 0) {
      const priority = ['active_ride', 'penalties', 'pending_payment'] as const;
      const nextAction = priority
        .map((type) => preflightActions.find((action) => action.type === type))
        .find((action) => {
          if (!action) return false;
          // Si la acción es de viaje activo pero YA no hay activeRide en tiempo real,
          // la ignoramos para no mostrar banners obsoletos.
          if (action.type === 'active_ride' && !activeRide) {
            return false;
          }
          return true;
        });

      if (nextAction) {
        const actionType = nextAction.type === 'pending_payment' ? 'pending_payment' : 'active_ride';
        const subtitle = nextAction.subtitle || 'Revisa esta acción pendiente';
        
        setPendingAction({
          type: actionType,
          title: nextAction.title,
          subtitle,
          onPress: () => {
            if (nextAction.routeName) {
              navigation.replace(nextAction.routeName as any, nextAction.routeParams);
            }
          },
        });
        return;
      }
    }

    setPendingAction(null);
  }, [pendingPayments, activeRide, preflightActions, navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', (e: any) => {
      if (e?.data?.state?.routeNames?.[e.data.state.index] === 'DriverHome') {
        setPendingAction((prev) => (prev?.type === 'pending_payment' ? null : prev));
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;

    const loadTodayStats = async () => {
      try {
        const response = await earningsService.getDriverEarnings('today');
        if (isMounted && response?.summary) {
          setTodayStats({
            trips: response.summary.totalRides ?? 0,
            earnings:
              response.summary.netEarnings ??
              response.summary.totalEarnings ??
              0,
          });
        }
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error cargando ganancias:', err);
      }
    };

    loadTodayStats().finally(() => markTaskCompleted('todayStats'));
    const unsubscribe = navigation.addListener('focus', loadTodayStats);

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [navigation, markTaskCompleted]);

  useEffect(() => {
    let isActive = true;

    const finalize = () => {
      if (isActive) {
        markTaskCompleted('availabilityState');
      }
    };

    if (!coords) {
      finalize();
      return;
    }

    const restoreAvailabilityState = async () => {
      try {
        const savedState = await driverAvailabilityService.getAvailabilityState();
        if (!savedState) return;

        setIsAvailable(savedState.isAvailable);
        setIsDesignatedDriverMode(savedState.isDesignatedDriverMode);

        if (savedState.isAvailable) {
          try {
            await driversService.updateStatus('available', coords);
          } catch (err) {
            console.error('❌ Error restaurando estado de disponibilidad:', err);
          }
        }
      } catch (err) {
        console.error('❌ Error restaurando estado de disponibilidad:', err);
      }
    };

    restoreAvailabilityState().finally(finalize);

    return () => {
      isActive = false;
    };
  }, [coords, markTaskCompleted]);

  useEffect(() => {
    if (!coords) return;

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
    if (!coords || !isAvailable) {
      driverLocationsSignatureRef.current = '';
      setNearbyDriversMarkers([]);
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const path = serviceAreaId ? `driverLocationsByArea/${serviceAreaId}` : 'driverLocations';
        const driverLocationsRef = dbRef(db, path);

        console.log('[DriverHome] Escuchando driverLocations desde:', path);

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;

          const data = snapshot.val();
          if (!data || typeof data !== 'object') {
            if (driverLocationsSignatureRef.current !== '') {
              driverLocationsSignatureRef.current = '';
              setNearbyDriversMarkers([]);
            }
            return;
          }

          const markers: NearbyDriverMarker[] = [];

          Object.entries<any>(data).forEach(([driverId, payload]) => {
            if (!payload || driverId === user?.id) return;

            const lat = parseCoordinate(payload?.lat ?? payload?.latitude ?? payload?.coords?.latitude);
            const lng = parseCoordinate(payload?.lng ?? payload?.longitude ?? payload?.coords?.longitude);
            if (lat === null || lng === null) return;

            const distance = calculateDistance(coords.latitude, coords.longitude, lat, lng);
            if (!Number.isFinite(distance) || distance > 15) return;

            const status = payload?.status ?? payload?.driverStatus ?? payload?.availability;
            if (status && String(status).toLowerCase().includes('offline')) return;

            const heading = typeof payload?.heading === 'number' ? payload.heading : undefined;
            const driverInfo = driverInfoCacheRef.current?.[driverId];
            const vehicleType = extractVehicleTypeFromInfo(driverInfo);
            const vehicleIconSource = ensureVehicleIconSource(vehicleType);

            markers.push({ id: driverId, latitude: lat, longitude: lng, heading, vehicleType, vehicleIconSource });
          });

          markers.sort((a, b) => a.id.localeCompare(b.id));

          const signature = markers
            .map((marker) =>
              `${marker.id}:${marker.latitude.toFixed(5)}:${marker.longitude.toFixed(5)}:${(marker.heading ?? 0).toFixed(2)}:${marker.vehicleType ?? 'na'}`,
            )
            .join('|');

          if (signature !== driverLocationsSignatureRef.current) {
            driverLocationsSignatureRef.current = signature;
            setNearbyDriversMarkers(markers);
          }
        };

        onValue(driverLocationsRef, handleSnapshot, (err) => {
          console.error('❌ [DriverHomeScreenNewDesign] Error escuchando driverLocations:', err);
          setNearbyDriversMarkers([]);
        });

        cleanup = () => off(driverLocationsRef, 'value', handleSnapshot);
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error iniciando listener de driverLocations:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [coords?.latitude, coords?.longitude, isAvailable, user?.id, serviceAreaId]);

  useEffect(() => {
    if (!coords || !isAvailable) {
      setAvailableRideRequests([]);
      setActiveRide(null);
      return;
    }

    rideStatusCacheRef.current = {};

    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const path = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
        const activeRidesRef = ref(db, path);
        const { RIDES_RADIUS_KM } = await import('../../constants/rideRadius');
        const SEARCH_RADIUS_KM = RIDES_RADIUS_KM;

        const unsubscribe = onValue(activeRidesRef, (snapshot) => {
          const data = snapshot.val();
          if (!data || typeof data !== 'object') {
            setAvailableRideRequests([]);
            setActiveRide(null);
            return;
          }

          const availableRides: any[] = [];
          let myActiveRide: any = null;

          Object.entries<any>(data).forEach(([rideId, ridePayload]) => {
            const clientIdRaw =
              ridePayload?.clientId ??
              ridePayload?.client_id ??
              ridePayload?.clientUID ??
              ridePayload?.clientUid ??
              ridePayload?.client?.id ??
              ridePayload?.client?.uid ??
              ridePayload?.clientInfo?.id ??
              ridePayload?.clientInfo?.uid ??
              ridePayload?.userId ??
              ridePayload?.user_id ??
              null;

            const clientId =
              typeof clientIdRaw === 'string'
                ? clientIdRaw.trim()
                : clientIdRaw != null
                  ? String(clientIdRaw).trim()
                  : '';

            if (!clientId) {
              return;
            }

            const originLat = parseCoordinate(
              ridePayload?.originLatitude ?? ridePayload?.origin?.latitude ?? ridePayload?.origin?.lat,
            );
            const originLng = parseCoordinate(
              ridePayload?.originLongitude ?? ridePayload?.origin?.longitude ?? ridePayload?.origin?.lng,
            );

            const statusSignature = [
              ridePayload?.status ?? 'unknown',
              originLat !== null ? originLat.toFixed(6) : 'na',
              originLng !== null ? originLng.toFixed(6) : 'na',
              ridePayload?.driverId ?? 'no-driver',
              ridePayload?.updatedAt ?? ridePayload?.updated_at ?? '',
            ].join('|');

            const isRepeated = rideStatusCacheRef.current[rideId] === statusSignature;
            rideStatusCacheRef.current[rideId] = statusSignature;

            const driverIdMatch = ridePayload?.driverId === user?.id;
            const rideStatus = ridePayload?.status || ridePayload?.driverStatus || ridePayload?.rideStatus;
            if (driverIdMatch && ACTIVE_RIDE_STATUSES.includes(rideStatus)) {
              myActiveRide = { id: rideId, ...ridePayload };
            }

            const statusRaw = typeof ridePayload?.status === 'string' ? ridePayload.status.toLowerCase() : '';
            const isCancelled =
              statusRaw.startsWith('cancel') ||
              statusRaw === 'cancelled' ||
              ridePayload?.cancelled === true ||
              ridePayload?.canceled === true ||
              ridePayload?.paymentCanceled === true;
            if (isCancelled) {
              return;
            }

            const isRequested = statusRaw === 'requested' && !ridePayload?.driverId;
            const isNegotiatingWithMe = ridePayload?.driverId === user?.id &&
              (statusRaw === 'pending_confirm' || statusRaw === 'driver_assigned');

            if (!(isRequested || isNegotiatingWithMe)) {
              return;
            }

            if (originLat === null || originLng === null) {
              return;
            }

            const distance = calculateDistance(coords.latitude, coords.longitude, originLat, originLng);
            if (!Number.isFinite(distance) || distance > SEARCH_RADIUS_KM) {
              return;
            }

            availableRides.push({
              id: rideId,
              ...ridePayload,
              clientId,
              distance,
              originLatitude: originLat,
              originLongitude: originLng,
            });
          });

          availableRides.sort((a, b) => a.distance - b.distance);

          const formatted = availableRides
            .map((ride) => {
              const latitude = typeof ride.originLatitude === 'number' ? ride.originLatitude : null;
              const longitude = typeof ride.originLongitude === 'number' ? ride.originLongitude : null;

              if (latitude === null || longitude === null) {
                return null;
              }

              const price = Number.isFinite(ride.clientSuggestedPrice)
                ? Number(ride.clientSuggestedPrice)
                : Number.isFinite(ride.estimatedPrice)
                  ? Number(ride.estimatedPrice)
                  : 0;

              return {
                id: ride.id,
                latitude,
                longitude,
                clientId: ride.clientId,
                clientName:
                  (typeof ride.clientId === 'string' && ride.clientId && clientNamesCache[ride.clientId]) ||
                  ride.client?.name ||
                  ride.clientName ||
                  'Cliente',
                originAddress: ride.originAddress || ride.origin?.address || 'Origen',
                finalDestination: ride.destinationAddress || ride.destination?.address || 'Destino',
                priceLabel: formatCurrency(price),
                priceAmount: price,
                passengers: ride.passengers ?? 1,
                distanceKm: Number.isFinite(ride.distance) ? Number(ride.distance) : null,
              };
            })
            .filter((item): item is any => Boolean(item));

          setAvailableRideRequests(formatted);
          setActiveRide(myActiveRide);
        });

        cleanup = () => {
          off(activeRidesRef);
          unsubscribe();
        };
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error escuchando activeRides:', err);
      }
    })();

    return () => {
      cleanup?.();
    };
  }, [coords, isAvailable, user?.id]);

  // Resolver nombres de clientes desde clientsInfo en Realtime DB
  useEffect(() => {
    const clientIds = availableRideRequests
      .map((ride) => ride.clientId)
      .filter((id): id is string => Boolean(id) && !(id in clientNamesCache));

    if (clientIds.length === 0) return;

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();

        const unsubscribes: Array<() => void> = [];

        clientIds.forEach((clientId) => {
          const clientInfoRef = dbRef(db, `clientsInfo/${clientId}`);
          const unsub = onValue(
            clientInfoRef,
            (snapshot) => {
              if (!isMounted) return;
              const data = snapshot.val();
              const fullName = data?.fullName || 'Cliente';
              setClientNamesCache((prev) => ({
                ...prev,
                [clientId]: fullName,
              }));
            },
            (err) => {
              console.warn(`[DriverHomeScreen] Error leyendo clientsInfo/${clientId}:`, err);
              // Fallback: marcar como cargado para no reintentar
              if (isMounted) {
                setClientNamesCache((prev) => ({
                  ...prev,
                  [clientId]: 'Cliente',
                }));
              }
            }
          );
          unsubscribes.push(() => off(clientInfoRef, 'value', unsub));
        });

        cleanup = () => {
          unsubscribes.forEach((unsub) => unsub());
        };
      } catch (err) {
        console.error('[DriverHomeScreen] Error configurando listeners de clientsInfo:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [availableRideRequests, clientNamesCache]);

  // Actualizar clientName en availableRideRequests cuando se resuelven los nombres
  useEffect(() => {
    setAvailableRideRequests((prev) =>
      prev.map((ride) => ({
        ...ride,
        clientName: ride.clientId && clientNamesCache[ride.clientId] ? clientNamesCache[ride.clientId] : ride.clientName,
      }))
    );
  }, [clientNamesCache]);

  useEffect(() => {
    if (!user?.id) {
      setPendingPayments([]);
      markTaskCompleted('pendingPayments');
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    (async () => {
      try {
        const { initializeFirebase } = await import('../../config/firebase');
        const { getDatabase, ref: dbRef, onValue } = await import('firebase/database');
        const { app } = await initializeFirebase();
        if (!app) {
          console.warn('⚠️ [DriverHomeScreenNewDesign] Firebase no inicializado');
          if (isMounted) {
            markTaskCompleted('pendingPayments');
          }
          return;
        }

        const db = getDatabase(app);
        const paymentStatusRef = dbRef(db, 'paymentStatus');

        unsubscribe = onValue(
          paymentStatusRef,
          (snapshot) => {
            if (!isMounted) return;
            
            const data = snapshot.val();
            if (!data) {
              setPendingPayments([]);
              markTaskCompleted('pendingPayments');
              return;
            }

            const pending = Object.entries<any>(data)
              .filter(([, payment]) => {
                if (!payment) return false;

                const belongsToDriver = payment.driverId === user.id;
                if (!belongsToDriver) return false;

                const status = String(payment.status || '').toLowerCase();
                const isPendingStatus = ['pending', 'pending_confirmation', 'in_progress'].includes(status);
                if (!isPendingStatus) return false;

                const requiresClientPayment = payment.requiresClientPayment === true || payment.chargeTarget === 'client';
                return requiresClientPayment;
              })
              .map(([rideId, payment]) => ({ rideId, ...payment }));

            setPendingPayments(pending);
            markTaskCompleted('pendingPayments');
          },
          (err: any) => {
            if (!isMounted) return;
            
            // Manejar errores de permisos de forma silenciosa
            const errorMsg = err?.message || String(err);
            if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
              console.warn('⚠️ [DriverHomeScreenNewDesign] Sin permisos para leer paymentStatus, saltando verificación');
            } else {
              console.warn('⚠️ [DriverHomeScreenNewDesign] Error escuchando pagos pendientes:', errorMsg);
            }
            
            setPendingPayments([]);
            markTaskCompleted('pendingPayments');
          },
        );
      } catch (err: any) {
        if (!isMounted) return;
        
        const errorMsg = err?.message || String(err);
        if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
          console.warn('⚠️ [DriverHomeScreenNewDesign] Sin permisos para configurar listener de pagos');
        } else {
          console.warn('⚠️ [DriverHomeScreenNewDesign] Error configurando listener de pagos:', errorMsg);
        }
        
        markTaskCompleted('pendingPayments');
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [user?.id, markTaskCompleted]);

  const handleAvailabilityToggle = async (nextValue: boolean) => {
    if (!user || !coords) {
      alertService.showErrorAlert('No se pudo actualizar tu estado');
      return;
    }

    // Evitar doble tap mientras se está actualizando
    if (updatingStatus) {
      return;
    }

    // ✅ Bloquear activar disponibilidad si supera el umbral de comisiones pendientes
    if (
      nextValue &&
      penaltySummary &&
      Number(penaltySummary.pendingAmount) > PENALTIES_LIMIT_CORDOBAS
    ) {
      alertService.showInfoAlert(
        'Comisiones pendientes',
        `Tienes C$${Number(penaltySummary.pendingAmount).toFixed(2)} en comisiones pendientes. Debes bajar de C$${PENALTIES_LIMIT_CORDOBAS.toFixed(
          2,
        )} para activar disponibilidad.`,
        () => navigation.navigate('PendingPayments')
      );
      return;
    }

    if (nextValue === isAvailable) {
      return;
    }

    setUpdatingStatus(true);
    try {
      const status = nextValue ? 'available' : 'offline';
      await driversService.updateStatus(status, coords);
      setIsAvailable(nextValue);

      if (!nextValue && isDesignatedDriverMode && user?.role === 'designated_driver') {
        setIsDesignatedDriverMode(false);
        await driversService.updateDesignatedDriverMode(user.id, false);
      }

      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await driverAvailabilityService.saveAvailabilityState({
        isAvailable: nextValue,
        isDesignatedDriverMode: nextValue ? isDesignatedDriverMode : false,
        lastUpdate: new Date().toISOString(),
        coords: { latitude: coords.latitude, longitude: coords.longitude },
      });

      if (nextValue) {
        driverAvailabilityService.startHeartbeat(coords);
      } else {
        driverAvailabilityService.stopHeartbeat();
        await driverAvailabilityService.clearAvailabilityState();
      }
    } catch (err: any) {
      alertService.showErrorAlert(err?.message || 'Error actualizando estado');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDesignatedToggle = async () => {
    if (user?.role !== 'designated_driver' || !isAvailable || !user?.id) {
      return;
    }

    try {
      const next = !isDesignatedDriverMode;
      setIsDesignatedDriverMode(next);
      await driversService.updateDesignatedDriverMode(user.id, next);
    } catch (err) {
      console.error('❌ Error actualizando modo designado:', err);
    }
  };

  useEffect(() => {
    if (!locationLoading) {
      markTaskCompleted('location');
    }
  }, [locationLoading, markTaskCompleted]);

  const hasPendingAction = Boolean(pendingAction);

  if (initializing) {
    console.log('⏳ [DriverHome:init] Esperando tareas iniciales:', Array.from(pendingInitialTasks.current));
    return <LoadingOverlay visible message={loadingMessage} />;
  }

  if (locationLoading) {
    return <LoadingOverlay visible message="Obteniendo tu ubicación..." />;
  }

  if (error || !coords) {
    return (
      <View style={[styles.fallbackContainer, { backgroundColor: colors.background }]}> 
        <Text style={[styles.fallbackText, { color: colors.text }]}>{`❌ ${error || 'No se pudo obtener la ubicación'}`}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={handleRefreshLocation}
        >
          <Text style={styles.retryButtonLabel}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={coords.latitude}
          longitude={coords.longitude}
          markerType="car"
          markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
          rideRequests={availableRideRequests}
          markerVehicleType={currentVehicleType ?? undefined}
          markerVehicleIconSource={currentVehicleIconSource}
          markerVehicleHeading={typeof coords.heading === 'number' && Number.isFinite(coords.heading) ? coords.heading : undefined}
          onRideRequestPress={(ride: any) =>
            activeRide
              ? navigation.navigate('ActiveRide', { rideId: activeRide.id })
              : navigation.navigate('AvailableRides', {
                  preselectedRideId: ride.id,
                })
          }
        />

        <View style={styles.overlayHeader}>
          <View style={styles.leftHeaderGroup}>
            <TouchableOpacity
              style={styles.menuButton}
              activeOpacity={0.85}
              onPress={toggleMenu}
            >
              <Image source={require('../../assets/icons/menuicon/menuicon_2x.png')} style={styles.menuIcon} />
            </TouchableOpacity>

            <EmergencyButton
              rideId={activeRide?.id}
              style={styles.emergencyHeaderButton}
              onOpen={closeMenu}
            />
          </View>

          <TouchableOpacity
            style={styles.rightHeaderGroup}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('DriverProfile')}
          >
            <View style={styles.headerNameBubble}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {user?.name || 'Conductor'}
              </Text>
              <Image
                source={require('../../assets/icons/profile/profile-icon2.png')}
                style={styles.profileBubbleIcon}
              />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {activeRide && !hasPendingAction && (
        <TouchableOpacity
          style={styles.activeRideCard}
          onPress={() =>
            navigation.replace('ActiveRide', {
              rideId: activeRide.id,
              clientId: activeRide.clientId,
              origin: activeRide.origin,
              destination: activeRide.destination,
              estimatedFare: activeRide.finalFare || activeRide.estimatedPrice,
            })
          }
        >
          <View style={styles.activeRideIconWrapper}>
            <Text style={styles.activeRideEmoji}>🚗</Text>
          </View>
          <View style={styles.activeRideContent}>
            <Text style={styles.activeRideTitle}>Viaje en curso</Text>
            <Text style={styles.activeRideSubtitle} numberOfLines={1}>
              {activeRide?.client?.name || activeRide?.clientName || 'Cliente'} ·{' '}
              {activeRide?.destinationAddress || 'Destino'}
            </Text>
          </View>
          <Text style={styles.activeRideArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* ✅ Banner de comisiones pendientes */}
      {penaltySummary && penaltySummary.pendingAmount > PENALTIES_LIMIT_CORDOBAS && (
        <TouchableOpacity
          style={[styles.pendingBanner, { backgroundColor: '#E53935' }]}
          onPress={() => {
            navigation.navigate('PendingPayments');
          }}
        >
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerTitle}>Comisiones pendientes</Text>
            <Text style={styles.pendingBannerSubtitle}>
              {penaltySummary.pendingCount} por C${Number(penaltySummary.pendingAmount).toFixed(2)}
            </Text>
          </View>
          <Text style={styles.pendingBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingPayments.length > 0 && !hasPendingAction && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() => {
            const firstPayment = pendingPayments[0];
            navigation.navigate('PaymentConfirmation', {
              rideId: firstPayment.rideId,
              amount: firstPayment.finalAmount,
              method: firstPayment.method,
            });
          }}
        >
          <View style={styles.pendingBannerIcon}>
            <Text style={styles.pendingBannerEmoji}>💳</Text>
          </View>
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerTitle}>Pagos pendientes</Text>
            <Text style={styles.pendingBannerSubtitle}>
              {pendingPayments.length} {pendingPayments.length === 1 ? 'pago por confirmar' : 'pagos por confirmar'}
            </Text>
          </View>
          <Text style={styles.pendingBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingAction && (
        <TouchableOpacity
          style={styles.pendingActionButton}
          activeOpacity={0.85}
          onPress={pendingAction.onPress}
        >
          <ImageBackground
            source={require('../../assets/icons/pending_acction/pending_acction2x.png')}
            style={styles.pendingActionImage}
            imageStyle={styles.pendingActionImageInner}
            resizeMode="stretch"
          >
            <View style={styles.pendingActionContent}>
              <View style={styles.pendingActionTextBlock}>
                <Text style={styles.pendingActionTitle}>{pendingAction.title}</Text>
                <Text style={styles.pendingActionSubtitle} numberOfLines={1}>
                  {pendingAction.subtitle}
                </Text>
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      )}

      {menuVisible && (
        <Animated.View style={[styles.menuOverlay, { opacity: menuOpacity }]}> 
          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu} />
          <Animated.View
            style={[
              styles.menuContainer,
              {
                transform: [{ translateX: menuTranslate }],
                width: panelWidth,
              },
            ]}
          >
            <View style={styles.menuHeaderRow}>
              <Text style={styles.menuHeader}>Menú rápido</Text>
              <TouchableOpacity onPress={closeMenu} style={styles.menuCloseBtn}>
                <Text style={styles.menuCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuSection}>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Earnings')}>
                <Text style={styles.menuEmoji}>💵</Text>
                <Text style={styles.menuLabel}>Ver Ganancias Detalladas</Text>
              </TouchableOpacity>
              {(user?.role === 'driver' || user?.role === 'designated_driver') && (
                <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('PayCommissions')}>
                  <Text style={styles.menuEmoji}>💼</Text>
                  <Text style={styles.menuLabel}>Pagar Comisiones</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('RideHistory')}>
                <Text style={styles.menuEmoji}>📜</Text>
                <Text style={styles.menuLabel}>Historial de Viajes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('PaymentMethods')}>
                <Text style={styles.menuEmoji}>💳</Text>
                <Text style={styles.menuLabel}>Métodos de Pago</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Settings')}>
                <Text style={styles.menuEmoji}>⚙️</Text>
                <Text style={styles.menuLabel}>Configuración</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Help')}>
                <Text style={styles.menuEmoji}>❓</Text>
                <Text style={styles.menuLabel}>Ayuda</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
              <Text style={styles.logoutEmoji}>🚪</Text>
              <Text style={styles.logoutLabel}>Cerrar sesión</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      <View style={styles.bottomBar} pointerEvents="box-none">
        {user?.role === 'designated_driver' && (
          <View style={styles.iconButtonWrapper}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!isAvailable}
              onPress={handleDesignatedToggle}
            >
              <Image
                source={
                  isDesignatedDriverMode
                    ? require('../../assets/icons/status/active_designado.png')
                    : require('../../assets/icons/status/desactive_status_button.png')
                }
                style={[styles.statusImage, !isAvailable && styles.disabledImage]}
              />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.controlsRow} pointerEvents="box-none">
          <View style={styles.iconButtonWrapper}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleAvailabilityToggle(!isAvailable)}
              disabled={updatingStatus}
            >
              <View style={styles.statusButtonContainer}>
                <Image
                  source={
                    isAvailable
                      ? require('../../assets/icons/status/active_status_button2.png')
                      : require('../../assets/icons/status/desactive_status_button2.png')
                  }
                  style={[styles.statusImage, updatingStatus && styles.statusImageDim]}
                />
                {updatingStatus && (
                  <View style={styles.statusLoadingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {!hasPendingAction && (
            <TouchableOpacity
              style={styles.earningsButton}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('AvailableRides')}
            >
              <ImageBackground
                source={require('../../assets/icons/requests_button/solicitudes_button2.png')}
                style={styles.earningsImage}
                imageStyle={styles.earningsImageInner}
                resizeMode="stretch"
              >
                <View style={styles.earningsRow}>
                  <View style={styles.earningsLeft}>
                    <View style={styles.earningsBadge}>
                      <Text style={styles.earningsBadgeLabel}>Total hoy</Text>
                    </View>
                    <Text style={styles.earningsValue}>{formatCurrency(todayStats.earnings)}</Text>
                  </View>
                  <View style={styles.earningsRight}>
                  </View>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    mapContainer: {
      flex: 1,
    },
    overlayHeader: {
      position: 'absolute',
      top: Platform.select({ ios: 16, android: 24 }),
      left: 20,
      right: 20,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    leftHeaderGroup: {
      top: 10,
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 8,
    },
    menuButton: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(233, 193, 118, 0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    //  shadowColor: '#000',
    //  shadowOffset: { width: 0, height: 4 },
    //  shadowOpacity: 0.3,
    //  shadowRadius: 8,
      elevation: 2,

    },
    menuIcon: {
      width: 22,
      height: 22,
      resizeMode: 'contain',
    },
    emergencyHeaderButton: {
      width: 52,
      height: 52,
    },
    rightHeaderGroup: {
      top: 10,
    },
    headerNameBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: colors.isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.92)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: colors.isDark ? 0.4 : 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    headerGreeting: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.isDark ? '#F8FAFC' : '#111827',
      maxWidth: 140,
    },
    profileBubbleIcon: {
      width: 26,
      height: 26,
      resizeMode: 'contain',
      tintColor: colors.isDark ? '#F8FAFC' : '#111827',
    },
    fallbackContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    fallbackText: {
      fontSize: 16,
      marginBottom: 16,
      textAlign: 'center',
    },
    retryButton: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 14,
    },
    retryButtonLabel: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
    mapWrapper: {
      // removed: map now full bleed
    },
    activeRideCard: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: 220,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#20263A',
      borderRadius: 18,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 12,
    },
    activeRideIconWrapper: {
      width: 48,
      height: 48,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      marginRight: 12,
    },
    activeRideEmoji: {
      fontSize: 24,
    },
    activeRideContent: {
      flex: 1,
    },
    activeRideTitle: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 16,
    },
    activeRideSubtitle: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 13,
      marginTop: 4,
    },
    activeRideArrow: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      marginLeft: 12,
    },
    pendingBanner: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 160,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FF6B6B',
      borderRadius: 18,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 10,
    },
    pendingBannerIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
      marginRight: 14,
    },
    pendingBannerEmoji: {
      fontSize: 24,
    },
    pendingBannerContent: {
      flex: 1,
    },
    pendingBannerTitle: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 16,
    },
    pendingBannerSubtitle: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 13,
      marginTop: 2,
    },
    pendingBannerArrow: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      marginLeft: 16,
    },
    pendingActionButton: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 120,
      borderRadius: 20,
      overflow: 'hidden',
      shadowColor: 'rgba(15,23,42,0.38)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 14,
      elevation: 18,
    },
    pendingActionImage: {
      width: '100%',
      minHeight: 68,
      justifyContent: 'center',
    },
    pendingActionImageInner: {
      borderRadius: 20,
    },
    pendingActionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 14,
      gap: 16,
    },
    pendingActionTextBlock: {
      flex: 1,
    },
    pendingActionTitle: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 4,
    },
    pendingActionSubtitle: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: 13,
      fontWeight: '500',
    },
    pendingActionArrow: {
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: '700',
    },
    menuOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 50,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    menuContainer: {
      marginTop: Platform.select({ ios: 70, android: 80 }),
      marginBottom: Platform.select({ ios: 24, android: 20 }),
      marginRight: 16,
      backgroundColor: colors.card,
      borderRadius: 18,
      paddingVertical: 18,
      paddingHorizontal: 20,
      shadowColor: 'rgba(15,23,42,0.4)',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 20,
    },
    menuHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    menuHeader: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    menuCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15,23,42,0.08)',
    },
    menuCloseIcon: {
      fontSize: 18,
      color: colors.text,
      fontWeight: '700',
    },
    menuSection: {
      gap: 10,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuEmoji: {
      fontSize: 18,
    },
    menuLabel: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    menuDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 18,
    },
    logoutItem: {
      backgroundColor: 'rgba(239,68,68,0.2)',
      borderColor: 'rgba(239,68,68,0.35)',
    },
    logoutEmoji: {
      fontSize: 18,
    },
    logoutLabel: {
      flex: 1,
      color: '#EF4444',
      fontSize: 15,
      fontWeight: '700',
    },
    bottomBar: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: Platform.select({ ios: 24, android: 20 }),
      gap: 12,
      zIndex: 30,
      pointerEvents: 'box-none',
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      pointerEvents: 'box-none',
    },
    iconButtonWrapper: {
      shadowColor: 'rgba(15,23,42,0.4)',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 14,
      borderRadius: 20,
      overflow: 'hidden',
    },
    statusImage: {
      width: 60,
      height: 60,
      resizeMode: 'cover',
    },
    statusButtonContainer: {
      width: 60,
      height: 60,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusImageDim: {
      opacity: 0.6,
    },
    statusLoadingOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderRadius: 20,
    },
    disabledImage: {
      opacity: 0.55,
    },
    earningsButton: {
      flex: 1,
      borderRadius: 18,
      overflow: 'hidden',
      shadowColor: 'rgba(15,23,42,0.38)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 16,
      minHeight: 40,
    },
    earningsImage: {
      flex: 1,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
    },
    earningsImageInner: {
      borderRadius: 18,
    },
    earningsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 12,
      paddingRight: 20,
      paddingVertical: 10,
      gap: 16,
    },
    earningsLeft: {
      alignItems: 'flex-start',
      gap: 2,
    },
    earningsBadge: {
      backgroundColor: 'transparent',
      borderRadius: 0,
      paddingHorizontal: 2,
      paddingVertical: 0,
    },
    earningsBadgeLabel: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '400',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    earningsValue: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '500',
    },
    earningsRight: {
      alignItems: 'flex-end',
      gap: 4,
    },
    earningsCta: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    earningsArrow: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
    },
    chipDisabled: {
      opacity: 0.4,
    },
  });

