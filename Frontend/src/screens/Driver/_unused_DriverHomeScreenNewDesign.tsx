import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { ImageSourcePropType } from 'react-native';
import type { DriverStackParamList } from '../../navigation/DriverStack';
import type { TFunction } from 'i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  ImageBackground,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
// Contextos y hooks
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { useLocation, DRIVER_LOCATION_OPTIONS } from '../../hooks/shared/location/useLocation';
import useDriverProximityTracking from '../../hooks/driver/DriverHomeScreen/useDriverProximityTracking';
import { subscribePreflightResult, getPreflightResult, PreflightAction } from '../../stores/preflightStore';
import { useTranslation } from 'react-i18next';

// Componentes
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import DynamicMap from '../../components/map/DynamicMap';
import EmergencyButton from '../../components/shared/EmergencyButton';

// Servicios
import alertService from '../../services/alertService';
import mapsService from '../../services/mapsService';
import driversService from '../../services/driversService';
import driverAvailabilityService from '../../services/driverAvailabilityService';
import earningsService from '../../services/earningsService';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/vehicleIcons';
import { useAcceptedRideListener } from '../../hooks/driver/DriverHomeScreen/useAcceptedRideListener';
import proximityService from '../../services/proximityService';
import penaltiesService from '../../services/penaltiesService';
import { haversineKm } from '../../utils/distance';
import driverOfferCacheService, {
  DriverOfferCacheEntry,
} from '../../services/driverOfferCacheService';

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
    }
  | {
      type: 'pending_offer';
      title: string;
      subtitle: string;
      onPress: () => void;
    };

type PendingOfferTarget = {
  entry: DriverOfferCacheEntry;
  ridePayload: Record<string, any> | null;
};

type RawRideStop = {
  lat?: number | string;
  lng?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  address?: string;
};

const ACTIVE_RIDE_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
const PENALTIES_LIMIT_CORDOBAS = 150;

const getActiveRidePendingCopy = (ride: any, t: TFunction) => {
  const status: string = ride?.status || '';
  const clientName = ride?.client?.name || ride?.clientName || t('driver.home.ride.clientFallback');
  const destinationText =
    ride?.destinationAddress ||
    ride?.destination?.address ||
    t('driver.home.ride.destinationFallback');

  switch (status) {
    case 'driver_on_route':
      return {
        title: t('driver.home.activeRideStatus.driverOnRoute.title'),
        subtitle: t('driver.home.activeRideStatus.driverOnRoute.subtitle', { client: clientName }),
      };
    case 'driver_arrived':
      return {
        title: t('driver.home.activeRideStatus.driverArrived.title'),
        subtitle: t('driver.home.activeRideStatus.driverArrived.subtitle', { client: clientName }),
      };
    case 'in_progress':
      return {
        title: t('driver.home.activeRideStatus.inProgress.title'),
        subtitle: destinationText,
      };
    case 'accepted':
    default:
      return {
        title: t('driver.home.activeRideStatus.accepted.title'),
        subtitle: t('driver.home.activeRideStatus.accepted.subtitle', { client: clientName }),
      };
  }
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  return haversineKm(lat1, lon1, lat2, lon2);
};

const parseCoordinate = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getDriverOfferFromRide = (ridePayload: any, driverId: string) => {
  if (!ridePayload || !driverId) return null;
  const sources = [
    ridePayload?.offers,
    ridePayload?.driverOffers,
    ridePayload?.offersByDriver,
    ridePayload?.negotiation?.offers,
  ];

  for (const source of sources) {
    if (source && typeof source === 'object' && source[driverId]) {
      return source[driverId];
    }
  }

  return null;
};

const hasDriverOfferInRide = (ridePayload: any, driverId: string) => {
  if (!ridePayload || !driverId) return false;
  const offer = getDriverOfferFromRide(ridePayload, driverId);
  if (!offer) return false;

  const status = String(offer?.status || offer?.state || '').toLowerCase();
  if (status && ['rejected', 'declined', 'cancelled', 'canceled', 'expired'].includes(status)) {
    return false;
  }

  return true;
};

const normalizeRidePreviewPayload = (
  ridePayload: any,
  cacheEntry: DriverOfferCacheEntry,
  driverId: string,
): DriverStackParamList['RidePreview']['ride'] => {
  const fallbackOriginLat = cacheEntry.origin?.lat ?? 0;
  const fallbackOriginLng = cacheEntry.origin?.lng ?? 0;
  const fallbackDestinationLat = cacheEntry.destination?.lat ?? 0;
  const fallbackDestinationLng = cacheEntry.destination?.lng ?? 0;

  const originLat =
    parseCoordinate(
      ridePayload?.origin?.lat ??
        ridePayload?.originLatitude ??
        ridePayload?.origin?.latitude ??
        ridePayload?.pickup?.lat,
    ) ?? fallbackOriginLat;
  const originLng =
    parseCoordinate(
      ridePayload?.origin?.lng ??
        ridePayload?.originLongitude ??
        ridePayload?.origin?.longitude ??
        ridePayload?.pickup?.lng,
    ) ?? fallbackOriginLng;
  const destinationLat =
    parseCoordinate(
      ridePayload?.destination?.lat ??
        ridePayload?.destinationLatitude ??
        ridePayload?.destination?.latitude,
    ) ?? fallbackDestinationLat;
  const destinationLng =
    parseCoordinate(
      ridePayload?.destination?.lng ??
        ridePayload?.destinationLongitude ??
        ridePayload?.destination?.longitude,
    ) ?? fallbackDestinationLng;

  const extraStopsFromRide =
    Array.isArray(ridePayload?.extraDestinations) && ridePayload.extraDestinations.length > 0
      ? ridePayload.extraDestinations
      : Array.isArray(ridePayload?.extra_destinations)
        ? ridePayload.extra_destinations
        : null;

  const normalizedStops =
    extraStopsFromRide && extraStopsFromRide.length > 0
      ? extraStopsFromRide
          .map((stop: RawRideStop) => {
            const lat = parseCoordinate(stop?.lat ?? stop?.latitude);
            const lng = parseCoordinate(stop?.lng ?? stop?.longitude);
            if (lat === null || lng === null) {
              return null;
            }
            return {
              lat,
              lng,
              address: stop?.address,
            };
          })
          .filter(
            (
              stop: { lat: number; lng: number; address?: string } | null,
            ): stop is {
              lat: number;
              lng: number;
              address?: string;
            } => Boolean(stop),
          )
      : cacheEntry.extraDestinations;

  const driverOffer = getDriverOfferFromRide(ridePayload, driverId);

  const estimatedPrice =
    typeof ridePayload?.estimatedPrice === 'number' && Number.isFinite(ridePayload.estimatedPrice)
      ? ridePayload.estimatedPrice
      : typeof cacheEntry.estimatedPrice === 'number'
        ? cacheEntry.estimatedPrice
        : 0;

  return {
    id: ridePayload?.id || cacheEntry.rideId,
    clientId: ridePayload?.clientId || cacheEntry.clientId,
    clientName:
      ridePayload?.client?.name || ridePayload?.clientName || cacheEntry.clientName || undefined,
    clientPhone:
      ridePayload?.client?.phone ||
      ridePayload?.clientPhone ||
      ridePayload?.client?.phoneNumber ||
      undefined,
    origin: {
      lat: originLat,
      lng: originLng,
      address:
        ridePayload?.origin?.address ||
        ridePayload?.originAddress ||
        cacheEntry.origin?.address ||
        undefined,
    },
    destination: {
      lat: destinationLat,
      lng: destinationLng,
      address:
        ridePayload?.destination?.address ||
        ridePayload?.destinationAddress ||
        cacheEntry.destination?.address ||
        undefined,
    },
    extraDestinations: normalizedStops || undefined,
    estimatedPrice,
    estimatedDistance:
      typeof ridePayload?.estimatedDistance === 'number'
        ? ridePayload.estimatedDistance
        : cacheEntry.estimatedDistance ?? undefined,
    estimatedDuration:
      typeof ridePayload?.estimatedDuration === 'number'
        ? ridePayload.estimatedDuration
        : cacheEntry.estimatedDuration ?? undefined,
    clientSuggestedPrice:
      typeof ridePayload?.clientSuggestedPrice === 'number'
        ? ridePayload.clientSuggestedPrice
        : cacheEntry.clientSuggestedPrice ?? undefined,
    driverOfferedPrice:
      typeof ridePayload?.driverOfferedPrice === 'number'
        ? ridePayload.driverOfferedPrice
        : typeof cacheEntry.offeredPrice === 'number'
          ? cacheEntry.offeredPrice
          : typeof driverOffer?.offeredPrice === 'number'
            ? driverOffer.offeredPrice
            : null,
    paymentMethod:
      (ridePayload?.paymentMethod as 'cash' | 'card' | undefined) ??
      cacheEntry.paymentMethod ??
      undefined,
  };
};

export default function DriverHomeScreenNewDesign({ navigation }: any) {
  const { t } = useTranslation();
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

  const [loadingMessage, setLoadingMessage] = useState(t('driver.home.loading.initializing'));
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
  const [pendingNegotiationRide, setPendingNegotiationRide] = useState<any | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [clientNamesCache, setClientNamesCache] = useState<Record<string, string>>({});
  const [menuVisible, setMenuVisible] = useState(false);
  const [offerCacheEntries, setOfferCacheEntries] = useState<DriverOfferCacheEntry[]>([]);
  const [pendingOfferTarget, setPendingOfferTarget] = useState<PendingOfferTarget | null>(null);
  const [rideSnapshotsVersion, setRideSnapshotsVersion] = useState(0);
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
    setLoadingMessage(t('driver.home.loading.locating'));
    refreshLocation();
  }, [refreshLocation, t]);

  const notifiedRides = useRef<Set<string>>(new Set());
  const announcedRideIdsRef = useRef<Set<string>>(new Set());
  const rideStatusCacheRef = useRef<Record<string, string>>({});
  const driverLocationsSignatureRef = useRef<string>('');
  const driverInfoCacheRef = useRef<Record<string, any>>({});
  const activeRideSnapshotsRef = useRef<Record<string, Record<string, any> | null | undefined>>({});
  const lastPendingActionRef = useRef<string | null>(null);
  const lastAvailabilityAnnouncementRef = useRef<boolean | null>(null);
  const lastActiveRideIdRef = useRef<string | null>(null);
  const initialVoiceWelcomeRef = useRef<boolean>(false);
  const penaltyAlertShownRef = useRef<boolean>(false);
  const enforcingAvailabilityRef = useRef<boolean>(false);

  const [currentVehicleType, setCurrentVehicleType] = useState<string | null>(null);
  const [currentVehicleIconSource, setCurrentVehicleIconSource] = useState<ImageSourcePropType | undefined>(undefined);

  const formatCurrency = (value: number = 0) => `C$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;

  const hasActiveRideEntries = (data: Record<string, any> | null | undefined) =>
    Boolean(data && typeof data === 'object' && Object.keys(data).length > 0);

  const refreshOfferCache = useCallback(async () => {
    if (!user?.id) {
      setOfferCacheEntries([]);
      return;
    }
    try {
      const entries = await driverOfferCacheService.getAll(user.id);
      console.log('[DriverHome] Loaded offer cache entries', {
        count: entries.length,
        rideIds: entries.map((entry) => entry.rideId),
      });
      setOfferCacheEntries(entries);
    } catch (error) {
      console.warn('[DriverHome] Failed to load offer cache', error);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      refreshOfferCache();
      return () => {};
    }, [refreshOfferCache]),
  );

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
      speakVoice(t('driver.home.voice.ready'), 'status', undefined, true);
    }
  }, [voiceSettings.enabled, speakVoice, stopVoiceCategory, t]);

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
        speakVoice(t('driver.home.voice.availabilityOn'), 'status');
      }
      return;
    }

    if (lastAvailabilityAnnouncementRef.current !== isAvailable) {
      lastAvailabilityAnnouncementRef.current = isAvailable;
      speakVoice(
        isAvailable ? t('driver.home.voice.availabilityOn') : t('driver.home.voice.availabilityOff'),
        'status',
      );
    }
  }, [isAvailable, voiceSettings.enabled, speakVoice, t]);

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
      const distanceText = Number.isFinite(distanceKm as number)
        ? t('driver.home.voice.nearbyRideDistance', {
            distance: (distanceKm as number).toFixed(1),
          })
        : t('driver.home.voice.nearbyRideDistanceFallback');

      const phrase = t('driver.home.voice.nearbyRide', {
        distance: distanceText,
        price: roundedPrice,
      });
      speakVoice(phrase, 'navigation');
    });
  }, [availableRideRequests, voiceSettings.enabled, isAvailable, activeRide, speakVoice, coords?.latitude, coords?.longitude, t]);

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

    const clientName = activeRide.client?.name || activeRide.clientName || t('driver.home.voice.clientFallback');
    const destinationText =
      activeRide.destinationAddress ||
      activeRide.destination?.address ||
      t('driver.home.voice.destinationFallback');

    speakVoice(
      t('driver.home.voice.activeRide', {
        client: clientName,
        destination: destinationText,
      }),
      'status',
    );
  }, [activeRide, voiceSettings.enabled, speakVoice, t]);

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

    if (pendingAmount >= PENALTIES_LIMIT_CORDOBAS) {
      if (!penaltyAlertShownRef.current) {
        penaltyAlertShownRef.current = true;
        alertService.showInfoAlert(
          t('driver.home.alerts.penaltiesTitle'),
          t('driver.home.alerts.penaltiesAutoDisabled', {
            limit: PENALTIES_LIMIT_CORDOBAS.toFixed(2),
          }),
          () => navigation.navigate('PendingPayments'),
        );
      }
      void enforceOfflineDueToPenalties();
    } else {
      penaltyAlertShownRef.current = false;
    }
  }, [penaltySummary?.pendingAmount, enforceOfflineDueToPenalties, navigation, t]);

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
      const baseAmount =
        typeof firstPayment.finalAmount === 'number'
          ? firstPayment.finalAmount
          : typeof firstPayment.amount === 'number'
            ? firstPayment.amount
            : 0;

      setPendingAction({
        type: 'pending_payment',
        title: t('driver.home.pendingAction.paymentTitle'),
        subtitle:
          pendingPayments.length === 1
            ? t('driver.home.pendingAction.paymentSingleSubtitle')
            : t('driver.home.pendingAction.paymentMultipleSubtitle', {
                count: pendingPayments.length,
              }),
        onPress: () => {
          navigation.replace('PaymentConfirmation', {
            rideId: firstPayment.rideId,
            amount: baseAmount,
            paymentMethod: firstPayment.method || firstPayment.paymentMethod || 'cash',
            clientName: t('driver.home.ride.clientFallback'),
            fromHome: true,
          });
        },
      });
      return;
    }

    // Prioridad 2: Oferta pendiente (caso solicitado)
    if (pendingOfferTarget && user?.id) {
      const normalizedRide = normalizeRidePreviewPayload(
        pendingOfferTarget.ridePayload,
        pendingOfferTarget.entry,
        user.id,
      );
      setPendingAction({
        type: 'pending_offer',
        title: t('driver.home.activeRideStatus.offerMade.title'),
        subtitle: t('driver.home.activeRideStatus.offerMade.subtitle'),
        onPress: () => {
          navigation.replace('RidePreview', {
            ride: normalizedRide,
            proximity: true,
          });
        },
      });
      return;
    }

    // Prioridad 3: Viaje en negociación (esperando confirmación del cliente)
    if (pendingNegotiationRide) {
      const ride = pendingNegotiationRide;

      const originLat =
        parseCoordinate(ride?.origin?.lat ?? ride?.origin?.latitude ?? ride?.originLatitude) ?? 0;
      const originLng =
        parseCoordinate(ride?.origin?.lng ?? ride?.origin?.longitude ?? ride?.originLongitude) ?? 0;
      const destinationLat =
        parseCoordinate(
          ride?.destination?.lat ?? ride?.destination?.latitude ?? ride?.destinationLatitude,
        ) ?? 0;
      const destinationLng =
        parseCoordinate(
          ride?.destination?.lng ?? ride?.destination?.longitude ?? ride?.destinationLongitude,
        ) ?? 0;

      const originAddress =
        ride?.origin?.address ?? ride?.originAddress ?? t('driver.home.ride.originFallback');
      const destinationAddress =
        ride?.destination?.address ?? ride?.destinationAddress ?? t('driver.home.ride.destinationFallback');

      const extraDestinations = Array.isArray(ride?.extraDestinations)
        ? ride.extraDestinations.map((stop: RawRideStop) => ({
            lat: parseCoordinate(stop?.lat ?? stop?.latitude) ?? 0,
            lng: parseCoordinate(stop?.lng ?? stop?.longitude) ?? 0,
            address: stop?.address,
          }))
        : [];

      const estimatedFare = Number.isFinite(ride?.finalFare)
        ? Number(ride.finalFare)
        : Number.isFinite(ride?.clientSuggestedPrice)
          ? Number(ride.clientSuggestedPrice)
          : Number.isFinite(ride?.estimatedPrice)
            ? Number(ride.estimatedPrice)
            : 0;

      setPendingAction({
        type: 'active_ride',
        title: t('driver.home.pendingAction.negotiationTitle'),
        subtitle: t('driver.home.pendingAction.negotiationSubtitle'),
        onPress: () => {
          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: {
              lat: originLat,
              lng: originLng,
              address: originAddress,
            },
            destination: {
              lat: destinationLat,
              lng: destinationLng,
              address: destinationAddress,
            },
            estimatedFare,
            extraDestinations,
          });
        },
      });
      return;
    }

    // Prioridad 4: Viaje activo
    if (activeRide) {
      const copy = getActiveRidePendingCopy(activeRide, t);
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

    // Prioridad 5: Acciones desde preflight (complemento)
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
          if (action.type === 'pending_payment' && pendingPayments.length === 0) {
            return false;
          }
          return true;
        });

      if (nextAction) {
        const actionType = nextAction.type === 'pending_payment' ? 'pending_payment' : 'active_ride';
        const subtitle = nextAction.subtitle || t('driver.home.pendingAction.genericSubtitle');

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
  }, [pendingPayments, pendingNegotiationRide, activeRide, preflightActions, navigation]);

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
    if (!user?.id) {
      setAvailableRideRequests([]);
      setActiveRide(null);
      setPendingNegotiationRide(null);
      return;
    }

    rideStatusCacheRef.current = {};
    activeRideSnapshotsRef.current = {};

    let cleanupFns: Array<() => void> = [];
    let isMounted = true;

    (async () => {
      try {
        const { getDatabase, ref, onValue } = await import('firebase/database');
        const db = getDatabase();
        const { RIDES_RADIUS_KM } = await import('../../constants/rideRadius');
        const SEARCH_RADIUS_KM = RIDES_RADIUS_KM;

        const pathConfigs = serviceAreaId
          ? [
              { key: `area:${serviceAreaId}`, path: `activeRidesByArea/${serviceAreaId}` },
              { key: 'global', path: 'activeRides' },
            ]
          : [{ key: 'global', path: 'activeRides' }];

        const selectSnapshotData = (): Record<string, any> | null => {
          if (serviceAreaId) {
            const areaKey = `area:${serviceAreaId}`;
            const areaData = activeRideSnapshotsRef.current[areaKey];
            if (hasActiveRideEntries(areaData)) {
              return areaData!;
            }
            const globalData = activeRideSnapshotsRef.current.global;
            if (hasActiveRideEntries(globalData)) {
              return globalData!;
            }
            if (areaData !== undefined) {
              return areaData ?? null;
            }
            return globalData ?? null;
          }
          return activeRideSnapshotsRef.current.global ?? null;
        };

        const processSnapshot = (data: Record<string, any> | null) => {
          if (!isMounted) return;

          if (!data || typeof data !== 'object') {
            setAvailableRideRequests([]);
            setActiveRide(null);
            setPendingNegotiationRide(null);
            return;
          }

          const availableRides: any[] = [];
          let myActiveRide: any = null;
          let myPendingNegotiationRide: any = null;

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
            if (isRepeated) {
              return;
            }

            const driverIdMatch = ridePayload?.driverId === user?.id;
            const rideStatus = ridePayload?.status || ridePayload?.driverStatus || ridePayload?.rideStatus;
            if (driverIdMatch && ACTIVE_RIDE_STATUSES.includes(rideStatus)) {
              myActiveRide = { id: rideId, ...ridePayload };
            }

            const statusRaw = typeof ridePayload?.status === 'string' ? ridePayload.status.toLowerCase() : '';

            const negotiationStatusValue =
              ridePayload?.negotiationStatus ?? ridePayload?.negotiation?.negotiationStatus ?? null;
            const negotiationStatusRaw =
              typeof negotiationStatusValue === 'string' ? negotiationStatusValue.toLowerCase() : '';

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

            const isWaitingClientConfirmation =
              ridePayload?.driverId === user?.id &&
              negotiationStatusRaw === 'driver_accepted' &&
              (statusRaw === 'pending_confirm' || statusRaw === 'driver_assigned');

            if (isWaitingClientConfirmation && !myPendingNegotiationRide) {
              myPendingNegotiationRide = {
                id: rideId,
                ...ridePayload,
                clientId,
              };
              return;
            }

            const isNegotiatingWithMe =
              ridePayload?.driverId === user?.id &&
              (statusRaw === 'pending_confirm' || statusRaw === 'driver_assigned');

            if (!(isRequested || isNegotiatingWithMe)) {
              return;
            }

            if (!coords || !isAvailable) {
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

              const destinationLat =
                parseCoordinate(
                  ride?.destinationLatitude ??
                    ride?.destinationLat ??
                    ride?.destination?.latitude ??
                    ride?.destination?.lat,
                ) ?? undefined;

              const destinationLng =
                parseCoordinate(
                  ride?.destinationLongitude ??
                    ride?.destinationLng ??
                    ride?.destination?.longitude ??
                    ride?.destination?.lng,
                ) ?? undefined;

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
                destinationLat,
                destinationLng,
              };
            })
            .filter((item): item is any => Boolean(item));

          const finalAvailable = myPendingNegotiationRide ? [] : formatted;

          setAvailableRideRequests(finalAvailable);
          setActiveRide(myActiveRide);
          setPendingNegotiationRide(myPendingNegotiationRide);
          setRideSnapshotsVersion((prev) => prev + 1);
        };

        pathConfigs.forEach(({ key, path }) => {
          const dbRef = ref(db, path);
          const unsubscribe = onValue(
            dbRef,
            (snapshot) => {
              const raw = snapshot.val();
              const normalized = raw && typeof raw === 'object' ? raw : null;
              activeRideSnapshotsRef.current[key] = normalized;
              processSnapshot(selectSnapshotData());
            },
            (err) => {
              console.error(`❌ [DriverHomeScreenNewDesign] Error escuchando ${path}:`, err);
              activeRideSnapshotsRef.current[key] = null;
              processSnapshot(selectSnapshotData());
            },
          );
          cleanupFns.push(() => unsubscribe());
        });
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error configurando listeners de activeRides:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanupFns.forEach((fn) => fn?.());
    };
  }, [coords?.latitude, coords?.longitude, isAvailable, user?.id, serviceAreaId, clientNamesCache, formatCurrency]);

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

                const rawDriverId =
                  payment.driverId ??
                  payment.driver_id ??
                  (payment.ride && (payment.ride.driverId || payment.ride.driver_id)) ??
                  null;
                const normalizedDriverId =
                  rawDriverId != null ? String(rawDriverId).trim() : '';
                if (normalizedDriverId !== user.id) return false;

                const status = String(payment.status || '').toLowerCase();
                const isPendingStatus = ['pending', 'pending_confirmation', 'in_progress', 'processing', 'pending_capture'].includes(status);
                if (!isPendingStatus) return false;

                const chargeTargetRaw = payment.chargeTarget || payment.charge_target || null;
                const requiresClientPaymentFlag =
                  payment.requiresClientPayment ?? payment.requires_client_payment;

                if (requiresClientPaymentFlag === false) return false;
                if (chargeTargetRaw === 'driver') return false;

                return true;
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
              console.log('ℹ️ [DriverHomeScreenNewDesign] paymentStatus no accesible por reglas de Firebase RTDB, saltando verificación');
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
          console.log('ℹ️ [DriverHomeScreenNewDesign] paymentStatus no accesible por reglas de Firebase RTDB');
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
      alertService.showErrorAlert(t('driver.home.alerts.availabilityUpdateFailed'));
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
      Number(penaltySummary.pendingAmount) >= PENALTIES_LIMIT_CORDOBAS
    ) {
      alertService.showInfoAlert(
        t('driver.home.alerts.penaltiesTitle'),
        t('driver.home.alerts.penaltiesBlockActivation', {
          amount: Number(penaltySummary.pendingAmount).toFixed(2),
          limit: PENALTIES_LIMIT_CORDOBAS.toFixed(2),
        }),
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
      alertService.showErrorAlert(
        err?.message || t('driver.home.alerts.availabilityUpdateFailed'),
      );
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
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const savedState = await driverAvailabilityService.getAvailabilityState();
      const coordsSnapshot = coords ? { latitude: coords.latitude, longitude: coords.longitude } : savedState?.coords;
      await driverAvailabilityService.saveAvailabilityState({
        isAvailable: savedState?.isAvailable ?? isAvailable,
        isDesignatedDriverMode: next,
        lastUpdate: new Date().toISOString(),
        coords: coordsSnapshot,
      });
      if (next) {
        console.log('✅ [DriverHomeScreenNewDesign] Modo Conductor Designado activado', {
          driverId: user.id,
          timestamp: new Date().toISOString(),
        });
      }
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
    return <LoadingOverlay visible message={t('driver.home.loading.locating')} />;
  }

  if (error || !coords) {
    return (
      <View style={[styles.fallbackContainer, { backgroundColor: colors.background }]}> 
        <Text style={[styles.fallbackText, { color: colors.text }]}>
          <MaterialIcons name="error-outline" size={18} color={colors.error || '#F44336'} /> {
            error || t('driver.home.errors.location')
          }
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={handleRefreshLocation}
        >
          <Text style={styles.retryButtonLabel}>{t('driver.home.buttons.retry')}</Text>
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
          onRideRequestPress={(ride: any) => {
            if (activeRide) {
              navigation.navigate('ActiveRide', { rideId: activeRide.id });
              return;
            }

            const origin = {
              lat: ride.latitude,
              lng: ride.longitude,
              address: ride.originAddress || t('driver.home.ride.originFallback'),
            };

            const destination = {
              lat: ride.destinationLat ?? ride.destination?.lat ?? ride.latitude,
              lng: ride.destinationLng ?? ride.destination?.lng ?? ride.longitude,
              address:
                ride.finalDestination ||
                ride.destinationAddress ||
                ride.destination?.address ||
                t('driver.home.ride.destinationFallback'),
            };

            const ridePreview = {
              id: String(ride.id),
              clientId: String(ride.clientId || ''),
              clientName: ride.clientName,
              origin,
              destination,
              estimatedPrice: Number.isFinite(ride.priceAmount) ? Number(ride.priceAmount) : 0,
              estimatedDistance: typeof ride.distanceKm === 'number' ? ride.distanceKm : undefined,
              clientSuggestedPrice: Number.isFinite(ride.clientSuggestedPrice) ? Number(ride.clientSuggestedPrice) : undefined,
              driverOfferedPrice: null,
              paymentMethod: ride.paymentMethod,
            };

            navigation.navigate('RidePreview', {
              ride: ridePreview,
              proximity: true,
            });
          }}
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
                {user?.name || t('driver.home.header.profileFallback')}
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
            <MaterialIcons name="directions-car" size={28} color={colors.primary} />
          </View>
          <View style={styles.activeRideContent}>
            <Text style={styles.activeRideTitle}>
              {t('driver.home.banners.activeRideTitle')}
            </Text>
            <Text style={styles.activeRideSubtitle} numberOfLines={1}>
              {activeRide?.client?.name || activeRide?.clientName || t('driver.home.ride.clientFallback')} ·{' '}
              {activeRide?.destinationAddress || t('driver.home.ride.destinationFallback')}
            </Text>
          </View>
          <Text style={styles.activeRideArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* ✅ Banner de comisiones pendientes */}
      {penaltySummary && penaltySummary.pendingAmount >= PENALTIES_LIMIT_CORDOBAS && (
        <TouchableOpacity
          style={[styles.pendingBanner, { backgroundColor: '#E53935' }]}
          onPress={() => {
            navigation.navigate('PendingPayments');
          }}
        >
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerTitle}>
              {t('driver.home.banners.penaltiesTitle')}
            </Text>
            <Text style={styles.pendingBannerSubtitle}>
              {t('driver.home.banners.penaltiesSubtitle', {
                count: penaltySummary.pendingCount,
                amount: Number(penaltySummary.pendingAmount).toFixed(2),
              })}
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
            <Text style={styles.pendingBannerTitle}>
              {t('driver.home.banners.paymentsTitle')}
            </Text>
            <Text style={styles.pendingBannerSubtitle}>
              {pendingPayments.length === 1
                ? t('driver.home.banners.paymentsSubtitleSingle')
                : t('driver.home.banners.paymentsSubtitleOther', { count: pendingPayments.length })}
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
              <Text style={styles.menuHeader}>{t('driver.home.menu.title')}</Text>
              <TouchableOpacity onPress={closeMenu} style={styles.menuCloseBtn}>
                <Text style={styles.menuCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuSection}>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Earnings')}>
                <Text style={styles.menuEmoji}>💵</Text>
                <Text style={styles.menuLabel}>{t('driver.home.menu.earnings')}</Text>
              </TouchableOpacity>
              {(user?.role === 'driver' || user?.role === 'designated_driver') && (
                <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('PayCommissions')}>
                  <Text style={styles.menuEmoji}>💼</Text>
                  <Text style={styles.menuLabel}>{t('driver.home.menu.commissions')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('RideHistory')}>
                <Text style={styles.menuEmoji}>📜</Text>
                <Text style={styles.menuLabel}>{t('driver.home.menu.history')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('PaymentMethods')}>
                <MaterialIcons name="credit-card" size={24} color={colors.primary} />
                <Text style={styles.menuLabel}>{t('driver.home.menu.paymentMethods')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Settings')}>
                <MaterialIcons name="settings" size={24} color={colors.primary} />
                <Text style={styles.menuLabel}>{t('driver.home.menu.settings')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigate('Help')}>
                <MaterialIcons name="help-outline" size={24} color={colors.primary} />
                <Text style={styles.menuLabel}>{t('driver.home.menu.help')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
              <MaterialIcons name="logout" size={24} color={colors.error || '#F44336'} />
              <Text style={styles.logoutLabel}>{t('driver.home.menu.logout')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      <View style={styles.bottomBar} pointerEvents="box-none">
        {user?.role === 'designated_driver' && (
          <View style={styles.designatedToggleContainer}>
            <View style={styles.iconButtonWrapper}>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={!isAvailable}
                onPress={handleDesignatedToggle}
              >
                <View style={styles.designatedButton}>
                  <Image
                    source={
                      isDesignatedDriverMode
                      
                        ? require('../../assets/icons/ready_status/readydesignado3x.png' )
                        : require('../../assets/icons/ready_status/unready3x.png')
                    }
                    style={[styles.statusImage, !isAvailable && styles.disabledImage]}
                  />
                  {isDesignatedDriverMode && (
                    <Text style={styles.designatedStatusLabel}>{t('driver.home.designated.activeLabel')}</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
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
                      ? require('../../assets/icons/ready_status/ready3x.png')
                      : require('../../assets/icons/ready_status/unready3x.png')
                  }
                  style={[styles.statusImage, updatingStatus && styles.statusImageDim]}
                />
                {updatingStatus && (
                  <View style={styles.statusLoadingOverlay}>
                    <LoadingIcon icon="refresh" size={20} color="#FFFFFF" animation="spin" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {!hasPendingAction && (
            <View style={styles.earningsSplitContainer}>
              <View style={[styles.earningsButton, styles.earningsStatsCard]}>
                <ImageBackground
                  source={require('../../assets/icons/driver_home_bar/driver_home_net2x.png')}
                  style={styles.earningsImage}
                  imageStyle={styles.earningsImageInner}
                  resizeMode="stretch"
                >
                  <View style={styles.earningsLeft}>
                    <View style={styles.earningsBadge}>
                      <Text style={styles.earningsBadgeLabel}>{t('driver.home.stats.totalToday')}</Text>
                    </View>
                    <Text style={styles.earningsValue}>{formatCurrency(todayStats.earnings)}</Text>
                  </View>
                </ImageBackground>
              </View>

              <TouchableOpacity
                style={[styles.earningsButton, styles.requestsButton]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('AvailableRides')}
              >
                <ImageBackground
                  source={require('../../assets/icons/driver_home_bar/driver_requests2x.png')}
                  style={styles.earningsImage}
                  imageStyle={styles.earningsImageInner}
                  resizeMode="stretch"
                >
                  <View style={styles.earningsRequestsContent}>
                    <Text style={styles.earningsCta}>{t('driver.home.cta.viewRequests')}</Text>
                  </View>
                </ImageBackground>
              </TouchableOpacity>
            </View>
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
      height: '100%',
      justifyContent: 'center',
    },
    pendingActionImageInner: {
      borderRadius: 18,
    },
    pendingActionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 12,
      paddingRight: 20,
      paddingVertical: 10,
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
      gap: 6, 
      zIndex: 30,
      //pointerEvents: 'box-none',
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
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
      //borderRadius: 20,
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
    designatedToggleContainer: {
      gap: 8,
    },
    designatedButton: {
      backgroundColor: 'transparent',
      borderRadius: 0,
      paddingVertical: 0,
    },
    designatedStatusLabel: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartSans',
      fontSize: 10,
      fontWeight: '600',
      alignItems: 'center',
      letterSpacing: 0.3,
      top: -56,
    },
    earningsSplitContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 12,
    },
    earningsStatsCard: {
      flexBasis: '100%',
      maxWidth: 80,
    },
    earningsButton: {
      flex: 1,
      borderRadius: 1,
      overflow: 'hidden',
      shadowColor: 'rgba(15,23,42,0.38)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 16,
      minHeight: 56,
    },
    requestsButton: {
      flexBasis: 'auto',
    },
    earningsImage: {
      flex: 1,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
    },
    earningsImageInner: {
      borderRadius: 1,
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
    earningsRequestsContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 25,
      paddingVertical: 12,
      gap: 16,
    },
    earningsBadge: {
      backgroundColor: 'transparent',
      borderRadius: 0,
      paddingHorizontal: 7,
      paddingVertical: 0,
      alignItems: 'center',
    },
    earningsBadgeLabel: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartSans',
      fontSize: 11,
      fontWeight: '600',
      alignItems: 'center',
      letterSpacing: 0.3,
    },
    earningsValue: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartSans',
      fontSize: 16,
      fontWeight: '800',
      paddingHorizontal: 10,
    },
    earningsRight: {
      alignItems: 'flex-end',
      gap: 4,
    },
    earningsCta: {
      color: '#FFFFFF',
      fontFamily: 'PlusJakartSans',
      fontSize: 17,
      paddingVertical: 6,
      fontWeight: '800',
    },
    chipDisabled: {
      opacity: 0.4,
    },
  });

