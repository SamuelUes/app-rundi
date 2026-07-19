import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
  ScrollView,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/LoadingIcon';
import alertService from '../../services/alertService';
import { useTheme } from '../../context/ThemeContext';
import { MapSkeleton } from '../../components/SkeletonLoader';
import DynamicMap from '../../components/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { useLocation, DRIVER_LOCATION_OPTIONS } from '../../hooks/shared/location/useLocation';
import { useChat } from '../../hooks/shared/chat/useChat';
import { RideProgressIndicator } from '../../components/RideProgressIndicator';
import ridesService from '../../services/ridesService';
import { getDatabase, ref, onValue, off, update, serverTimestamp } from 'firebase/database';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/vehicleIcons';
import { fetchClientProfile, ClientProfile } from '../../services/clientProfilesService';
import notificationService from '../../services/notificationService';
import { useTranslation } from 'react-i18next';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const { ORIGIN_PIN, MULTI_STOP_LIST_PIN, DESTINATION_PIN } = MAP_ICONS;

interface RouteParams {
  rideId: string;
}

export default function ActiveRideScreen({ route, navigation }: any) {
  const { rideId } = route.params as RouteParams;
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopVoiceCategory } = useVoiceAssistant();
  const { coords } = useLocation(DRIVER_LOCATION_OPTIONS);
  const driverDisplayName = useMemo(
    () =>
      (typeof user?.name === 'string' && user.name?.trim().length ? user.name.trim() : null) ||
      (typeof user?.email === 'string' ? user.email : null) ||
      t('driver.activeRide.labels.driverFallback'),
    [user?.name, user?.email, t]
  );
  const { messages } = useChat(rideId, user?.id || '', driverDisplayName);
  const [ride, setRide] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [isCancellingRide, setIsCancellingRide] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [routePolyline, setRoutePolyline] = useState<any[]>([]);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [voicePaused, setVoicePaused] = useState(false);
  const [progressNow, setProgressNow] = useState(() => Date.now());
  const lastStatusSpokenRef = useRef<string | null>(null);
  const lastRideAnnouncedRef = useRef<string | null>(null);
  const handledCancellationRef = useRef(false);
  const lastMessageIdSpokenRef = useRef<string | null>(null);
  const messagesInitializedRef = useRef(false);

  const formatCurrency = useCallback(
    (value?: number | null) =>
      t('driver.activeRide.labels.currency', { amount: Math.round(value ?? 0) }),
    [t],
  );

  const formatEstimatedMinutes = useCallback(
    (minutes?: number | null) =>
      t('driver.activeRide.labels.estimatedMinutes', { minutes: Math.max(0, Math.ceil(minutes ?? 0)) }),
    [t],
  );

  const formatEstimatedDistance = useCallback(
    (kilometers?: number | null) =>
      t('driver.activeRide.labels.estimatedDistance', {
        distance: (kilometers ?? 0).toFixed(1),
      }),
    [t],
  );

  const resolvedClientName = useMemo(
    () => clientProfile?.fullName || ride?.clientName || t('driver.activeRide.labels.clientFallback'),
    [clientProfile?.fullName, ride?.clientName, t],
  );

  const resolvedClientInitial = useMemo(() => {
    const value = resolvedClientName?.trim?.();
    return value && value.length > 0
      ? value.charAt(0).toUpperCase()
      : t('driver.activeRide.labels.initialFallback');
  }, [resolvedClientName, t]);

  // Bottom sheet state - Alturas ajustadas
  const COLLAPSED_HEIGHT = 250; // Solo header + botones (más alto para ver ambos botónes)
  const EXPANDED_HEIGHT = 480; // Más espacio para direcciones
  const [panelExpanded, setPanelExpanded] = useState(true);
  const panelHeight = useRef(new Animated.Value(EXPANDED_HEIGHT)).current;

  // Estado legible del viaje
  const getStatusLabel = useCallback(
    (status: string): string =>
      t(`driver.activeRide.status.${status}`, {
        defaultValue: t('driver.activeRide.status.default'),
      }),
    [t],
  );

  // Marcar 'driver_on_route' (Ir en camino)
  const handleGoOnRoute = async () => {
    try {
      setUpdating(true);
      await ridesService.markDriverOnRoute(rideId);
      // Optimistic/local update
      setRide((prev: any) => (prev ? { ...prev, status: 'driver_on_route', driverOnRouteAt: Date.now() } : prev));
    } catch (error: any) {
      try {
        // Fallback directo a RTDB
        const db = getDatabase();
        await update(ref(db, `activeRides/${rideId}`), {
          status: 'driver_on_route',
          driverOnRouteAt: serverTimestamp(),
        });
        setRide((prev: any) => (prev ? { ...prev, status: 'driver_on_route' } : prev));
      } catch (dbErr: any) {
        alertService.showErrorAlert(
          dbErr?.message || error?.message || t('driver.activeRide.alerts.goOnRouteError'),
        );
      }
    } finally {
      setUpdating(false);
    }
  };

  const togglePanel = () => {
    const next = !panelExpanded;
    setPanelExpanded(next);
    Animated.timing(panelHeight, {
      toValue: next ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };
  // Estado derivado (normalizado)
  const normalizedStatus = useMemo(() => {
    const raw = (ride?.status ?? ride?.offers?.status ?? ride?.state ?? '').toString();
    return raw.trim().toLowerCase();
  }, [ride?.status, ride?.offers?.status, ride?.state]);

  const isAccepted = normalizedStatus === 'accepted';
  const isDriverOnRoute = normalizedStatus === 'driver_on_route';
  const isInProgress = normalizedStatus === 'in_progress';
  const isCompleted = normalizedStatus === 'completed';
  const isCanceled = normalizedStatus === 'canceled';

  useEffect(() => {
    if (!isInProgress) {
      return;
    }
    const id = setInterval(() => {
      setProgressNow(Date.now());
    }, 20000);
    return () => {
      clearInterval(id);
    };
  }, [isInProgress]);

  useEffect(() => {
    if (!ride) return;

    const rawMethod =
      (ride.payment && (ride.payment.method || ride.payment.paymentMethod)) ||
      ride.paymentMethod ||
      ride.payment_type ||
      ride.paymentType;

    if (rawMethod === 'cash' || rawMethod === 'card') {
      setPaymentMethod(rawMethod);
    }
  }, [ride]);

  const haversineDistanceMeters = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Cargar datos del viaje
  useEffect(() => {
    setLoading(true);
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);

    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRide(data);
        setLoading(false);
      } else {
        setLoadError(t('driver.activeRide.alerts.rideNotFound'));
        setLoading(false);
      }
    });

    return () => off(rideRef);
  }, [rideId]);

  // Notificación de retorno rápido: visible mientras el viaje está activo
  useEffect(() => {
    // Mostrar una notificación local que permita volver a la app con un toque
    notificationService.showQuickReturnActiveRide(rideId);
    return () => {
      // Limpiar al salir de la pantalla o cambiar de viaje
      void notificationService.clearQuickReturn();
    };
  }, [rideId]);

  useEffect(() => {
    return () => {
      stopVoiceCategory('navigation');
      stopVoiceCategory('status');
    };
  }, [stopVoiceCategory]);

  // Cargar perfil del cliente
  useEffect(() => {
    if (!ride?.clientId) return;

    let cancelled = false;

    const loadProfile = async () => {
      try {
        const profile = await fetchClientProfile(ride.clientId);
        if (!cancelled && profile) {
          setClientProfile(profile);
        }
      } catch (error) {
        console.warn(t('driver.activeRide.alerts.clientProfileError'), error);
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [ride?.clientId]);

  const getAddressForSpeech = useCallback(
    (
      source?: {
        address?: string;
        lat?: number;
        lng?: number;
        latitude?: number;
        longitude?: number;
      },
    ) => {
      if (!source) return null;
      if (source.address && typeof source.address === 'string') {
        return source.address;
      }
      const lat = source.lat ?? source.latitude;
      const lng = source.lng ?? source.longitude;
      if (typeof lat === 'number' && typeof lng === 'number') {
        return t('driver.activeRide.voice.coords', {
          lat: lat.toFixed(4),
          lng: lng.toFixed(4),
        });
      }
      return null;
    },
    [t],
  );

  // Helper: distancia total en km usando puntos secuenciales
  const computeTotalDistanceKm = useCallback((data: any): number | null => {
    const points: Array<{ lat: number; lng: number }> = [];
    if (data?.origin) points.push({ lat: data.origin.lat || data.origin.latitude, lng: data.origin.lng || data.origin.longitude });
    if (Array.isArray(data?.extraDestinations)) {
      for (const stop of data.extraDestinations) {
        const lat = stop?.lat || stop?.latitude;
        const lng = stop?.lng || stop?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') points.push({ lat, lng });
      }
    }
    if (data?.destination) points.push({ lat: data.destination.lat || data.destination.latitude, lng: data.destination.lng || data.destination.longitude });
    if (points.length < 2) return null;
    const R = 6371; // km
    const toRad = (d: number) => (d * Math.PI) / 180;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dLat = toRad(b.lat - a.lat);
      const dLon = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      total += R * c;
    }
    return total;
  }, []);

  const dynamicProgress = useMemo(() => {
    if (!isInProgress || !ride) {
      return 0;
    }

    let estimatedDistanceM: number | null = null;
    if (typeof ride.estimatedDistance === 'number' && Number.isFinite(ride.estimatedDistance) && ride.estimatedDistance > 0) {
      estimatedDistanceM = ride.estimatedDistance;
    } else {
      const totalKm = computeTotalDistanceKm(ride);
      if (typeof totalKm === 'number' && Number.isFinite(totalKm) && totalKm > 0) {
        estimatedDistanceM = totalKm * 1000;
      }
    }

    const destLat = ride?.destination?.lat ?? ride?.destination?.latitude;
    const destLng = ride?.destination?.lng ?? ride?.destination?.longitude;

    let remainingDistanceM: number | null = null;
    if (
      coords &&
      typeof coords.latitude === 'number' &&
      typeof coords.longitude === 'number' &&
      typeof destLat === 'number' &&
      typeof destLng === 'number'
    ) {
      remainingDistanceM = haversineDistanceMeters(
        coords.latitude,
        coords.longitude,
        destLat,
        destLng,
      );
    }

    let distanceProgress: number | null = null;
    if (estimatedDistanceM && remainingDistanceM !== null) {
      distanceProgress = 1 - remainingDistanceM / estimatedDistanceM;
    }

    let estimatedDurationSec: number | null = null;
    if (typeof ride.estimatedDuration === 'number' && Number.isFinite(ride.estimatedDuration) && ride.estimatedDuration > 0) {
      estimatedDurationSec = ride.estimatedDuration;
    }

    let startedAtMs: number | null = null;
    const startedAtValue = ride.startedAt;
    if (typeof startedAtValue === 'number' && Number.isFinite(startedAtValue)) {
      startedAtMs = startedAtValue;
    } else if (startedAtValue && typeof startedAtValue === 'object') {
      if (typeof startedAtValue._seconds === 'number') {
        startedAtMs = startedAtValue._seconds * 1000;
      } else if (typeof startedAtValue.seconds === 'number') {
        startedAtMs = startedAtValue.seconds * 1000;
      }
    }

    let durationProgress: number | null = null;
    if (estimatedDurationSec && startedAtMs) {
      const elapsedSec = Math.max(0, (progressNow - startedAtMs) / 1000);
      durationProgress = elapsedSec / estimatedDurationSec;
    }

    let combined = 0;
    if (distanceProgress !== null && durationProgress !== null) {
      combined = (distanceProgress + durationProgress) / 2;
    } else if (distanceProgress !== null) {
      combined = distanceProgress;
    } else if (durationProgress !== null) {
      combined = durationProgress;
    }

    let percent = Math.min(Math.max(combined * 100, 0), 100);

    if (
      percent >= 95 &&
      remainingDistanceM !== null &&
      remainingDistanceM > 2000 &&
      estimatedDurationSec &&
      startedAtMs
    ) {
      const elapsedSec = Math.max(0, (progressNow - startedAtMs) / 1000);
      if (elapsedSec > estimatedDurationSec) {
        percent = Math.max(percent - 10, 0);
      }
    }

    return percent;
  }, [isInProgress, ride, coords?.latitude, coords?.longitude, haversineDistanceMeters, computeTotalDistanceKm, progressNow]);

  const announceRideSummary = useCallback(
    (force = false) => {
      if (!voiceSettings.enabled || !ride) return;
      if (voicePaused && !force) return;

      const originSpeech =
        getAddressForSpeech(ride.origin) || t('driver.activeRide.voice.originFallback');
      const destinationSpeech =
        getAddressForSpeech(ride.destination) ||
        t('driver.activeRide.voice.destinationFallback');
      const netPrice = Math.round(Number(ride?.finalFare || ride?.estimatedPrice || 0));
      const totalKm = computeTotalDistanceKm(ride);
      const distanceSpeech =
        typeof totalKm === 'number' && Number.isFinite(totalKm)
          ? t('driver.activeRide.voice.totalDistance', { distance: totalKm.toFixed(1) })
          : null;
      const signature = `${rideId}|${netPrice}|${distanceSpeech ?? 'na'}`;

      if (!force && lastRideAnnouncedRef.current === signature) {
        return;
      }

      lastRideAnnouncedRef.current = signature;

      const parts: string[] = [];
      parts.push(t('driver.activeRide.voice.origin', { origin: originSpeech }));
      parts.push(t('driver.activeRide.voice.destination', { destination: destinationSpeech }));
      parts.push(t('driver.activeRide.voice.netFare', { amount: netPrice }));
      if (distanceSpeech) parts.push(distanceSpeech);
      speakVoice(`${parts.join('. ')}.`, 'navigation', undefined, true);
    },
    [
      voiceSettings.enabled,
      ride,
      voicePaused,
      getAddressForSpeech,
      computeTotalDistanceKm,
      rideId,
      speakVoice,
      t,
    ],
  );

  useEffect(() => {
    if (!voiceSettings.enabled || !ride) {
      if (!voiceSettings.enabled) {
        lastRideAnnouncedRef.current = null;
        lastStatusSpokenRef.current = null;
      }
      return;
    }

    if (voicePaused) {
      return;
    }

    announceRideSummary();
  }, [voiceSettings.enabled, ride, voicePaused, announceRideSummary]);

  const handleVoiceToggle = useCallback(() => {
    if (voicePaused) {
      setVoicePaused(false);
      lastStatusSpokenRef.current = null;
      announceRideSummary(true);
      return;
    }

    setVoicePaused(true);
    stopVoiceCategory('navigation');
    stopVoiceCategory('status');
  }, [voicePaused, stopVoiceCategory, announceRideSummary]);

  useEffect(() => {
    if (!voiceSettings.enabled || !ride) {
      if (!voiceSettings.enabled) {
        lastStatusSpokenRef.current = null;
      }
      return;
    }

    if (voicePaused) return;

    const currentStatus = normalizedStatus;
    if (!currentStatus || lastStatusSpokenRef.current === currentStatus) return;

    lastStatusSpokenRef.current = currentStatus;

    const originSpeech =
      getAddressForSpeech(ride.origin) || t('driver.activeRide.voice.originFallback');
    const destinationSpeech =
      getAddressForSpeech(ride.destination) ||
      t('driver.activeRide.voice.destinationFallback');
    const netPrice = Math.round(Number(ride?.finalFare || ride?.estimatedPrice || 0));
    const totalKm = computeTotalDistanceKm(ride);
    const distanceSpeech =
      typeof totalKm === 'number' && Number.isFinite(totalKm)
        ? t('driver.activeRide.voice.totalDistance', { distance: totalKm.toFixed(1) })
        : null;

    const parts: string[] = [];
    parts.push(t('driver.activeRide.voice.origin', { origin: originSpeech }));
    parts.push(t('driver.activeRide.voice.destination', { destination: destinationSpeech }));
    parts.push(t('driver.activeRide.voice.netFare', { amount: netPrice }));
    if (distanceSpeech) parts.push(distanceSpeech);
    speakVoice(`${parts.join('. ')}.`, 'status');
  }, [
    voiceSettings.enabled,
    ride,
    normalizedStatus,
    voicePaused,
    speakVoice,
    getAddressForSpeech,
    computeTotalDistanceKm,
    t,
  ]);

  useEffect(() => {
    if (!messages || messages.length === 0) {
      return;
    }

    const latestMessage = messages[messages.length - 1];

    if (!messagesInitializedRef.current) {
      messagesInitializedRef.current = true;
      lastMessageIdSpokenRef.current = latestMessage?.id ?? null;
      return;
    }

    if (!latestMessage || latestMessage.isOwn) {
      return;
    }

    if (lastMessageIdSpokenRef.current === latestMessage.id) {
      return;
    }

    lastMessageIdSpokenRef.current = latestMessage.id;

    const trimmedMessage = typeof latestMessage.message === 'string' ? latestMessage.message.trim() : '';
    if (trimmedMessage.length === 0) {
      return;
    }

    void notificationService.showLocalNotification(
      t('driver.activeRide.notifications.newMessageTitle'),
      trimmedMessage,
      {
        type: 'chat_message',
        rideId,
        senderId: latestMessage.senderId,
      },
    );

    if (!voiceSettings.enabled || voicePaused) {
      return;
    }

    speakVoice(
      t('driver.activeRide.voice.messagePrefix', { message: trimmedMessage }),
      'status',
      undefined,
      true,
    );
  }, [messages, rideId, voiceSettings.enabled, voicePaused, speakVoice, t]);

  // Construir ruta real (OSRM) y fallback simple (conductor → origen → paradas → destino)
  useEffect(() => {
    if (!ride) return;

    const points: Array<{ latitude: number; longitude: number }> = [];
    const pushPoint = (lat?: number, lng?: number) => {
      if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        points.push({ latitude: lat, longitude: lng });
      }
    };

    if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
      pushPoint(coords.latitude, coords.longitude);
    }

    if (normalizedStatus === 'accepted' || normalizedStatus === 'driver_on_route') {
      pushPoint(ride.origin?.lat || ride.origin?.latitude, ride.origin?.lng || ride.origin?.longitude);
    }

    if (Array.isArray(ride?.extraDestinations)) {
      for (const stop of ride.extraDestinations) {
        pushPoint(stop?.lat || stop?.latitude, stop?.lng || stop?.longitude);
      }
    }

    pushPoint(ride.destination?.lat || ride.destination?.latitude, ride.destination?.lng || ride.destination?.longitude);

    // Intentar ruta real con OSRM si hay al menos 2 puntos
    const buildOsrmUrl = (pts: Array<{ latitude: number; longitude: number }>) => {
      const coordsStr = pts
        .map((p) => `${p.longitude},${p.latitude}`)
        .join(';');
      return `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
    };

    const fetchRoute = async () => {
      try {
        if (points.length < 2) {
          setRoutePolyline([]);
          return;
        }
        const url = buildOsrmUrl(points);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`OSRM ${res.status}`);
        const data = await res.json();
        const coords = data?.routes?.[0]?.geometry?.coordinates as Array<[number, number]> | undefined;
        if (!coords || coords.length === 0) throw new Error('No geometry');
        const poly = coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
        setRoutePolyline(poly);
      } catch (err) {
        // Fallback a líneas rectas
        setRoutePolyline(points);
      }
    };

    fetchRoute();
  }, [ride, coords?.latitude, coords?.longitude, normalizedStatus]);

  // Handlers
  const handleCallClient = () => {
    if (ride?.clientPhone) {
      Linking.openURL(`tel:${ride.clientPhone}`);
    }
  };

  const handleOpenChat = () => {
    navigation.navigate('Chat', {
      rideId,
      otherUserName: resolvedClientName,
    });
  };

  const handleNavigate = () => {
    alertService.showOptionsAlert(
      t('driver.activeRide.navigation.title'),
      t('driver.activeRide.navigation.subtitle'),
      [
        {
          text: t('driver.activeRide.navigation.googleMaps'),
          onPress: () => {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${ride?.destination?.lat},${ride?.destination?.lng}`;
            Linking.openURL(url);
          },
        },
        {
          text: t('driver.activeRide.navigation.waze'),
          onPress: () => {
            const url = `waze://?ll=${ride?.destination?.lat},${ride?.destination?.lng}&navigate=yes`;
            Linking.canOpenURL(url).then((supported) => {
              Linking.openURL(supported ? url : `https://www.waze.com/ul?ll=${ride?.destination?.lat},${ride?.destination?.lng}`);
            });
          },
        },
        { text: t('driver.activeRide.navigation.cancel'), style: 'cancel' },
      ]
    );
  };

  const handleStartRide = async () => {
    try {
      setUpdating(true);
      await ridesService.updateRideStatus(rideId, 'in_progress');
    } catch (error) {
      alertService.showErrorAlert(t('driver.activeRide.alerts.startRideError'));
    } finally {
      setUpdating(false);
    }
  };

  const handleCompleteRide = async () => {
    try {
      setUpdating(true);
      await notificationService.clearQuickReturn();
      await ridesService.updateRideStatus(rideId, 'pending_payment', {
        finalFare: ride?.finalFare || ride?.estimatedPrice,
        completedAt: Date.now(),
      });
      navigation.replace('PaymentConfirmation', {
        rideId,
        amount: ride?.finalFare || ride?.estimatedPrice,
        clientName: ride?.clientName || t('driver.activeRide.labels.clientFallback'),
        paymentMethod: paymentMethod as 'cash' | 'card',
      });
    } catch (error: any) {
      alertService.showErrorAlert(error.message || t('driver.activeRide.alerts.completeRideError'));
    } finally {
      setUpdating(false);
    }
  };

  const cancelButtonScale = useRef(new Animated.Value(1)).current;

  const resetCancelAnimation = useCallback(() => {
    Animated.timing(cancelButtonScale, {
      toValue: 1,
      duration: 170,
      useNativeDriver: true,
    }).start();
    setIsCancellingRide(false);
  }, [cancelButtonScale]);

  const handleCancelRide = useCallback(() => {
    if (isCancellingRide || updating) {
      return;
    }

    setIsCancellingRide(true);
    Animated.timing(cancelButtonScale, {
      toValue: 0.95,
      duration: 120,
      useNativeDriver: true,
    }).start();

    alertService.showConfirmAlert(
      t('driver.activeRide.alerts.cancelRideTitle'),
      t('driver.activeRide.alerts.cancelRideMessage'),
      async () => {
        try {
          setUpdating(true);
          await ridesService.cancelRide(rideId, t('driver.activeRide.notifications.canceledByDriver'), {
            canceledBy: 'driver',
          });
          await notificationService.clearQuickReturn();
          handledCancellationRef.current = true;
          navigation.reset({
            index: 0,
            routes: [{ name: 'DriverHome' }],
          });
        } catch (error: any) {
          alertService.showErrorAlert(error.message || t('driver.activeRide.alerts.cancelRideError'));
        } finally {
          setUpdating(false);
          resetCancelAnimation();
        }
      },
      () => {
        resetCancelAnimation();
      },
      t('driver.activeRide.alerts.cancelRideConfirm'),
      t('driver.activeRide.alerts.cancelRideKeep'),
      true,
    );
  }, [cancelButtonScale, isCancellingRide, navigation, resetCancelAnimation, rideId, updating]);

  useEffect(() => {
    if (!ride || handledCancellationRef.current || isCancellingRide) {
      return;
    }

    const status = (ride?.status ?? ride?.state ?? '').toString().toLowerCase();
    if (status !== 'canceled') {
      return;
    }

    const canceledBy = (ride?.canceledBy ?? ride?.cancelledBy ?? '').toString().toLowerCase();
    handledCancellationRef.current = true;
    const canceledTitle = t('driver.activeRide.alerts.canceledTitle');
    const message =
      canceledBy === 'driver'
        ? t('driver.activeRide.alerts.canceledByDriverMessage')
        : t('driver.activeRide.alerts.canceledByClientMessage');

    alertService.showInfoAlert(canceledTitle, message, () => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'DriverHome' }],
      });
    });
  }, [ride, isCancellingRide, navigation]);

  if (loading || !ride) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>
          {loading
            ? t('driver.activeRide.loader.loadingDetails')
            : t('driver.activeRide.loader.waitingData')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mapa a pantalla completa */}
      <View style={styles.mapContainer}>
        {coords ? (
          <DynamicMap
            latitude={coords.latitude}
            longitude={coords.longitude}
            showMarker={true}
            markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
            markerType="car"
            markerVehicleIconSource={ensureVehicleIconSource(extractVehicleTypeFromInfo(user))}
            markerVehicleHeading={typeof coords.heading === 'number' && Number.isFinite(coords.heading) ? coords.heading : undefined}
            originMarker={(isAccepted || isDriverOnRoute) && ride?.origin ? {
              latitude: ride.origin.lat || ride.origin.latitude,
              longitude: ride.origin.lng || ride.origin.longitude,
            } : undefined}
            destinationMarker={ride?.destination ? {
              latitude: ride.destination.lat || ride.destination.latitude,
              longitude: ride.destination.lng || ride.destination.longitude,
            } : undefined}
            extraStopMarkers={
              Array.isArray(ride?.extraDestinations)
                ? ride!.extraDestinations.map((stop: any, idx: number) => ({
                    latitude: stop?.lat || stop?.latitude,
                    longitude: stop?.lng || stop?.longitude,
                    index: idx + 1,
                    label:
                      stop?.address ||
                      t('driver.activeRide.labels.stopLabel', { index: idx + 1 }),
                  }))
                : []
            }
            originLabel={ride?.origin?.address}
            destinationLabel={ride?.destination?.address}
            showPinBubbles={true}
            routeCoordinates={routePolyline}
          />
        ) : (
          <MapSkeleton />
        )}
      </View>

      {/* Bottom Sheet Colapsable */}
      <Animated.View style={[styles.bottomSheet, { height: panelHeight }]}>
        {/* Grabber */}
        <TouchableOpacity style={styles.grabber} onPress={togglePanel} activeOpacity={0.8}>
          <View style={styles.grabberBar} />
        </TouchableOpacity>

        {/* Header Compacto */}
        <View style={styles.sheetHeader}>
          <View style={styles.headerLeft}>
            {clientProfile?.photoUrl ? (
              <Image source={{ uri: clientProfile.photoUrl as string }} style={styles.clientPhoto} />
            ) : (
              <View style={[styles.clientPhoto, { backgroundColor: colors.card }]}>
                <Text style={styles.clientInitial}>{resolvedClientInitial}</Text>
              </View>
            )}
            <View style={styles.headerText}>
              <Text style={[styles.clientName, { color: colors.text }]}>{resolvedClientName}</Text>
              <Text style={[styles.priceRow, { color: colors.textSecondary }]}>
                {t('driver.activeRide.labels.fare', {
                  amount: formatCurrency(ride?.finalFare || ride?.estimatedPrice || 0),
                })}
              </Text>
              <Text style={[styles.statusPill, { color: colors.textSecondary }]}>{getStatusLabel(normalizedStatus)}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleOpenChat} style={styles.headerAction}>
              <MaterialIcons name="chat" size={24} color={colors.textSecondary || '#666'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCallClient} style={styles.headerAction}>
              <MaterialIcons name="call" size={24} color={colors.textSecondary || '#666'} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleVoiceToggle}
              style={[styles.headerAction, styles.headerActionSmall, voicePaused && styles.headerActionActive]}
              accessibilityLabel={
                voicePaused
                  ? t('driver.activeRide.accessibility.resumeVoice')
                  : t('driver.activeRide.accessibility.muteVoice')
              }
              accessibilityRole="button"
            >
              <MaterialIcons name={voicePaused ? 'volume-up' : 'volume-off'} size={24} color={colors.textSecondary || '#666'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Contenido expandible */}
        {panelExpanded && (
          <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {/* Addresses Card */}
            <View style={[styles.addressesCard, { backgroundColor: colors.card }]}>
              <View style={styles.addressesLeftCol}>
                <Image source={ORIGIN_PIN} style={styles.listPinImage} />
                {ride?.extraDestinations?.map?.((stop: any, idx: number) => (
                  <Image key={`pin-${idx}`} source={MULTI_STOP_LIST_PIN} style={styles.listPinImage} />
                ))}
                <Image source={DESTINATION_PIN} style={styles.listPinImage} />
              </View>
              <View style={styles.addressesRightCol}>
                <View style={styles.addressRow}>
                  <Text numberOfLines={2} style={[styles.addressRowText, { color: colors.text }]}>
                    {ride?.origin?.address || t('driver.activeRide.labels.originFallback')}
                  </Text>
                </View>
                {ride?.extraDestinations?.map?.((w: any, i: number) => (
                  <View key={`addr-${i}`} style={styles.addressRow}>
                    <Text numberOfLines={2} style={[styles.addressRowText, { color: colors.text }]}>
                      {w?.address ||
                        t('driver.activeRide.labels.stopLabel', { index: i + 1 })}
                    </Text>
                  </View>
                ))}
                <View style={styles.addressRow}>
                  <Text numberOfLines={2} style={[styles.addressRowText, { color: colors.text }]}>
                    {ride?.destination?.address ||
                      t('driver.activeRide.labels.destinationFallback')}
                  </Text>
                </View>
              </View>
              <View style={styles.addressesSideActions}>
                <TouchableOpacity style={[styles.navButtonGreen, { backgroundColor: '#4CAF50' }]} onPress={handleNavigate}>
                  <Text style={styles.navButtonText}>
                    {t('driver.activeRide.navigation.button')}
                  </Text>
                </TouchableOpacity>
                <View style={[styles.etaMiniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.etaTitle, { color: colors.textSecondary }]}>
                    {t('driver.activeRide.labels.estimatedTitle')}
                  </Text>
                  <Text style={[styles.etaValue, { color: colors.text }]}>
                    {formatEstimatedMinutes((ride?.estimatedDuration || 0) / 60)}
                  </Text>
                  <Text style={[styles.etaMeta, { color: colors.textSecondary }]}>
                    {formatEstimatedDistance((ride?.estimatedDistance || 0) / 1000)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Progreso */}
            <View style={styles.progressIndicator}>
              <RideProgressIndicator 
                progress={dynamicProgress}
                role="driver"
                rideStatus={ride.status}
                paymentMethod={paymentMethod as 'cash' | 'card'}
              />
            </View>

            {/* CTA Dinámico */}
            {(() => {
              const show = (isAccepted || isDriverOnRoute || isInProgress) && !isCompleted && !isCanceled;
              const label = isInProgress
                ? (updating
                    ? t('driver.activeRide.cta.completeRidePending')
                    : t('driver.activeRide.cta.completeRide'))
                : isDriverOnRoute
                  ? (updating
                      ? t('driver.activeRide.cta.startRidePending')
                      : t('driver.activeRide.cta.startRide'))
                  : (updating
                      ? t('driver.activeRide.cta.goOnRoutePending')
                      : t('driver.activeRide.cta.goOnRoute'));
              const onPress = isInProgress
                ? handleCompleteRide
                : isDriverOnRoute
                ? handleStartRide
                : handleGoOnRoute;
              return show ? (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#D4AF37' }, updating && styles.buttonDisabled]}
                  onPress={onPress}
                  disabled={updating}
                >
                  <Text style={styles.primaryButtonText}>{label}</Text>
                </TouchableOpacity>
              ) : null;
            })()}

            <AnimatedTouchableOpacity
              style={[
                styles.cancelButton,
                updating && styles.buttonDisabled,
                {
                  transform: [{ scale: cancelButtonScale }],
                  opacity: isCancellingRide ? 0.7 : 1,
                },
              ]}
              onPress={handleCancelRide}
              disabled={updating || isCancellingRide}
              activeOpacity={0.85}
            >
              {isCancellingRide ? (
                <LoadingIcon size={20} color="#f44336" />
              ) : (
                <Text style={[styles.cancelButtonText, { color: '#f44336' }]}>
                  {t('driver.activeRide.buttons.cancelRide')}
                </Text>
              )}
            </AnimatedTouchableOpacity>
          </ScrollView>
        )}

        {/* Acciones visibles en modo colapsado */}
        {!panelExpanded && (
          <View style={styles.collapsedActions}>
            {(() => {
              const show = (isAccepted || isDriverOnRoute || isInProgress) && !isCompleted && !isCanceled;
              const label = isInProgress
                ? (updating
                    ? t('driver.activeRide.cta.completeRidePending')
                    : t('driver.activeRide.cta.completeRide'))
                : isDriverOnRoute
                  ? (updating
                      ? t('driver.activeRide.cta.startRidePending')
                      : t('driver.activeRide.cta.startRide'))
                  : (updating
                      ? t('driver.activeRide.cta.goOnRoutePending')
                      : t('driver.activeRide.cta.goOnRoute'));
              const onPress = isInProgress
                ? handleCompleteRide
                : isDriverOnRoute
                ? handleStartRide
                : handleGoOnRoute;
              return show ? (
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#D4AF37' }, updating && styles.buttonDisabled]}
                  onPress={onPress}
                  disabled={updating}
                >
                  <Text style={styles.primaryButtonText}>{label}</Text>
                </TouchableOpacity>
              ) : null;
            })()}

            <AnimatedTouchableOpacity
              style={[
                styles.cancelButton,
                updating && styles.buttonDisabled,
                {
                  transform: [{ scale: cancelButtonScale }],
                  opacity: isCancellingRide ? 0.7 : 1,
                },
              ]}
              onPress={handleCancelRide}
              disabled={updating || isCancellingRide}
              activeOpacity={0.85}
            >
              {isCancellingRide ? (
                <LoadingIcon size={20} color="#f44336" />
              ) : (
                <Text style={[styles.cancelButtonText, { color: '#f44336' }]}>
                  {t('driver.activeRide.buttons.cancelRide')}
                </Text>
              )}
            </AnimatedTouchableOpacity>
          </View>
        )}
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
    width: '100%',
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
    textAlign: 'center',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  grabber: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  grabberBar: {
    width: 50,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  clientPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clientInitial: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerText: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  priceRow: {
    fontSize: 13,
    marginBottom: 2,
  },
  statusPill: {
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActionSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerActionActive: {
    backgroundColor: colors.primary,
  },
  headerActionText: {
    fontSize: 18,
  },
  sheetContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  addressesCard: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 0,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressesLeftCol: {
    justifyContent: 'space-around',
    alignItems: 'center',
    marginRight: 12,
    width: 32,
  },
  listPin: {
    fontSize: 20,
  },
  listPinImage: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  addressesRightCol: {
    flex: 1,
    justifyContent: 'space-around',
    paddingRight: 12,
  },
  addressRow: {
    paddingVertical: 8,
  },
  addressRowText: {
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  collapsedActions: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addressesSideActions: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: 12,
    gap: 8,
    width: 100,
  },
  navButtonGreen: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  navButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  etaMiniCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    minWidth: 60,
  },
  etaTitle: {
    fontSize: 15,
    marginBottom: 2,
  },
  etaValue: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  etaMeta: {
    fontSize: 15,
  },
  progressIndicator: {
    marginBottom: 12,
    marginHorizontal: 8,
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
    marginHorizontal: 8,
  },
  primaryButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f44336',
    marginBottom: 16,
    marginHorizontal: 8,
  },
  cancelButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
