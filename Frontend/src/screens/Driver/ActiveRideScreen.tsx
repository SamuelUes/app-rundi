import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  Animated,
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import alertService from '../../services/alertService';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { MapSkeleton } from '../../components/ui/SkeletonLoader';
import DynamicMap from '../../components/map/DynamicMap';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { useLocation, DRIVER_LOCATION_OPTIONS } from '../../hooks/shared/location/useLocation';
import { useChat } from '../../hooks/shared/chat/useChat';
import { RideProgressIndicator } from '../../components/shared/RideProgressIndicator';
import ridesService from '../../services/ridesService';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/vehicleIcons';
import { fetchClientProfile, ClientProfile } from '../../services/clientProfilesService';
import notificationService from '../../services/notificationService';
import { useTranslation } from 'react-i18next';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import {
  haversineDistanceMeters,
  computeTotalDistanceKm,
  fetchOsrmRoute,
} from '../../utils/rideTrackingHelpers';
import { useRideData } from '../../hooks/shared/ride/useRideData';
import { useCollapsiblePanel } from '../../hooks/shared/ride/useCollapsiblePanel';
import { useRideCancellation } from '../../hooks/shared/ride/useRideCancellation';
import backgroundLocationService from '../../services/backgroundLocationService';
import firebaseTrackingService from '../../services/firebaseTrackingService';
import { ActiveRideSheetHeader } from '../../components/driver/ActiveRide/ActiveRideSheetHeader';
import { ActiveRideAddressesCard } from '../../components/driver/ActiveRide/ActiveRideAddressesCard';
import { ActiveRideCTAButtons } from '../../components/driver/ActiveRide/ActiveRideCTAButtons';

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
  const {
    ride,
    loading,
    loadError,
    normalizedStatus,
    paymentMethod,
    finalFare,
    isAccepted,
    isDriverOnRoute,
    isDriverArrived,
    isInProgress,
    isCompleted,
    isCanceled,
    isPendingPayment,
  } = useRideData(rideId, t('driver.activeRide.alerts.rideNotFound'));
  const [updating, setUpdating] = useState(false);
  const [routePolyline, setRoutePolyline] = useState<any[]>([]);
  const [pickupLegPolyline, setPickupLegPolyline] = useState<any[]>([]);
  const [stopsLegPolyline, setStopsLegPolyline] = useState<any[]>([]);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [voicePaused, setVoicePaused] = useState(false);
  const [progressNow, setProgressNow] = useState(() => Date.now());
  const lastStatusSpokenRef = useRef<string | null>(null);
  const lastRideAnnouncedRef = useRef<string | null>(null);
  const handledCancellationRef = useRef(false);
  const lastMessageIdSpokenRef = useRef<string | null>(null);
  const messagesInitializedRef = useRef(false);
  const lastRouteFetchRef = useRef<{ signature: string; time: number; point: { lat: number; lng: number } | null } | null>(null);
  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

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

  // Bottom sheet state
  const { isPanelExpanded: panelExpanded, togglePanel, panelHeight } = useCollapsiblePanel({
    initialExpanded: true,
    minHeight: 280,
    maxHeight: 540,
    useAnimatedHeight: true,
  });

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
    } catch (error: any) {
      // Sin fallback de escritura directa: el estado del viaje es propiedad del
      // backend (callable). Si falla, mostramos el error.
      alertService.showErrorAlert(
        error?.message || t('driver.activeRide.alerts.goOnRouteError'),
      );
    } finally {
      setUpdating(false);
    }
  };

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

  // Notificación de retorno rápido: visible mientras el viaje está activo
  useEffect(() => {
    // Mostrar una notificación local que permita volver a la app con un toque
    notificationService.showQuickReturnActiveRide(rideId);
    return () => {
      // Limpiar al salir de la pantalla o cambiar de viaje
      void notificationService.clearQuickReturn();
    };
  }, [rideId]);

  // Tracking por viaje: mientras el viaje está vivo la app debe publicar la
  // posición en activeRides/{rideId}/driverLocation además del shard global
  // (driverLocationsByArea). Si el tracking global ya venía corriendo desde
  // DriverHome solo vinculamos el rideId — sin reiniciar la tarea.
  const rideLive = isAccepted || isDriverOnRoute || isDriverArrived || isInProgress || isPendingPayment;
  useEffect(() => {
    if (!rideId || !rideLive || !user?.id) return;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    (async () => {
      try {
        const active = await backgroundLocationService.isTrackingActive();
        if (active) {
          await backgroundLocationService.updateTrackingRideId(rideId);
          return;
        }
        const started = await backgroundLocationService.startBackgroundLocationTracking(
          user.id,
          'driver',
          rideId,
        );
        if (!started) {
          // Fallback foreground: sin permiso de ubicación en segundo plano la
          // posición del conductor quedaría congelada para el cliente durante
          // todo el viaje. Solo escribe cuando el background task no arrancó.
          fallbackInterval = setInterval(() => {
            const c = coordsRef.current;
            if (!c) return;
            void firebaseTrackingService
              .updateDriverLocation(user.id, {
                latitude: c.latitude,
                longitude: c.longitude,
                speed: c.speed ?? undefined,
                heading: c.heading ?? undefined,
                accuracy: c.accuracy ?? undefined,
              })
              .catch(() => {});
            void firebaseTrackingService
              .updateRideTracking(rideId, {
                driverLocation: {
                  latitude: c.latitude,
                  longitude: c.longitude,
                  speed: c.speed ?? undefined,
                  heading: c.heading ?? undefined,
                  accuracy: c.accuracy ?? undefined,
                  timestamp: c.timestamp ?? Date.now(),
                },
              })
              .catch(() => {});
          }, 8000);
        }
      } catch (error) {
        console.warn('[ActiveRide] No se pudo vincular el viaje al tracking:', error);
      }
    })();
    return () => {
      if (fallbackInterval) clearInterval(fallbackInterval);
      // No detenemos el tracking global (proximidad/disponibilidad del
      // conductor): solo desvinculamos el rideId para que deje de escribir en
      // el nodo del viaje y evitar permission_denied tras el archivado.
      void backgroundLocationService.updateTrackingRideId(null);
    };
  }, [rideId, rideLive, user?.id]);

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
        const profile = await fetchClientProfile(ride.clientId, rideId);
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

  // Construir ruta real (OSRM) en tramos:
  // conductor → recogida (morado, solo mientras va al punto),
  // recogida/conductor → paradas (naranja, solo si hay destinos extra),
  // última parada/recogida → destino (azul)
  useEffect(() => {
    if (!ride) return;

    const toPoint = (lat?: number, lng?: number) =>
      typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)
        ? { latitude: lat, longitude: lng }
        : null;

    const headingToPickup =
      normalizedStatus === 'accepted' ||
      normalizedStatus === 'driver_on_route' ||
      normalizedStatus === 'driver_arrived';

    const driverPoint =
      coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number'
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : null;

    const originPoint = toPoint(
      ride.origin?.lat || ride.origin?.latitude,
      ride.origin?.lng || ride.origin?.longitude,
    );
    const destinationPoint = toPoint(
      ride.destination?.lat || ride.destination?.latitude,
      ride.destination?.lng || ride.destination?.longitude,
    );
    const stopPoints: Array<{ latitude: number; longitude: number }> = (
      Array.isArray(ride?.extraDestinations) ? ride.extraDestinations : []
    )
      .map((stop: any) => toPoint(stop?.lat || stop?.latitude, stop?.lng || stop?.longitude))
      .filter(Boolean);

    // Punto donde arranca la porción "viaje del cliente": la recogida mientras
    // va al punto, el conductor una vez el viaje está en progreso.
    const anchorPoint = headingToPickup ? originPoint : driverPoint;
    const hasStops = stopPoints.length > 0;

    // Tramo de paradas: ancla → parada 1 → … → parada N (naranja)
    const stopsLegPoints =
      hasStops && anchorPoint ? [anchorPoint, ...stopPoints] : [];

    // Tramo final: última parada (o ancla sin paradas) → destino (azul)
    const tripStart = hasStops ? stopPoints[stopPoints.length - 1] : anchorPoint;
    const tripPoints =
      tripStart && destinationPoint ? [tripStart, destinationPoint] : [];

    // Throttle: el GPS emite cada ~2.5s/5m — 3 llamadas OSRM por tick serían
    // ruido puro. Solo refetcheamos si cambió la ruta (estado/paradas/extremos),
    // el conductor se movió ≥40 m desde el último fetch, o pasaron ≥60 s.
    const signature = JSON.stringify({
      s: normalizedStatus,
      o: originPoint,
      d: destinationPoint,
      stops: stopPoints,
      hasDriver: !!driverPoint,
    });
    const prevFetch = lastRouteFetchRef.current;
    const now = Date.now();
    const movedM =
      driverPoint && prevFetch?.point
        ? haversineDistanceMeters(
            prevFetch.point.lat,
            prevFetch.point.lng,
            driverPoint.latitude,
            driverPoint.longitude,
          )
        : Number.POSITIVE_INFINITY;
    if (
      prevFetch &&
      prevFetch.signature === signature &&
      movedM < 40 &&
      now - prevFetch.time < 60_000
    ) {
      return;
    }
    lastRouteFetchRef.current = {
      signature,
      time: now,
      point: driverPoint ? { lat: driverPoint.latitude, lng: driverPoint.longitude } : null,
    };

    let cancelled = false;
    const loadRoutes = async () => {
      const [pickupPoly, stopsPoly, tripPoly] = await Promise.all([
        headingToPickup && driverPoint && originPoint
          ? fetchOsrmRoute([driverPoint, originPoint])
          : Promise.resolve([]),
        stopsLegPoints.length >= 2 ? fetchOsrmRoute(stopsLegPoints) : Promise.resolve([]),
        fetchOsrmRoute(tripPoints),
      ]);
      if (cancelled) return;
      setPickupLegPolyline(pickupPoly);
      setStopsLegPolyline(stopsPoly);
      setRoutePolyline(tripPoly);
    };

    loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [ride, coords?.latitude, coords?.longitude, normalizedStatus]);

  // Punto de navegación actual: hacia la recogida mientras va por el cliente,
  // hacia la primera parada/destino una vez iniciado el viaje.
  const navTarget = useMemo(() => {
    const toPoint = (p: any) =>
      p && typeof (p.lat ?? p.latitude) === 'number' && typeof (p.lng ?? p.longitude) === 'number'
        ? { lat: (p.lat ?? p.latitude) as number, lng: (p.lng ?? p.longitude) as number }
        : null;
    const destination = toPoint(ride?.destination);
    if (isAccepted || isDriverOnRoute || isDriverArrived) {
      return toPoint(ride?.origin) ?? destination;
    }
    if (isInProgress) {
      const stops = Array.isArray(ride?.extraDestinations) ? ride.extraDestinations : [];
      const firstStop = stops.map(toPoint).find(Boolean) ?? null;
      return firstStop ?? destination;
    }
    return destination;
  }, [
    ride?.origin,
    ride?.destination,
    ride?.extraDestinations,
    isAccepted,
    isDriverOnRoute,
    isDriverArrived,
    isInProgress,
  ]);

  // Handlers
  const handleCallClient = () => {
    if (ride?.clientPhone) {
      Linking.openURL(`tel:${ride.clientPhone}`);
    }
  };

  const handleOpenChat = () => {
    navigation.navigate('Chat', {
      rideId,
      otherUserId: ride?.clientId,
      otherUserName: resolvedClientName,
    });
  };

  const handleNavigate = () => {
    if (!navTarget) return;
    const { lat, lng } = navTarget;
    alertService.showOptionsAlert(
      t('driver.activeRide.navigation.title'),
      t('driver.activeRide.navigation.subtitle'),
      [
        {
          text: t('driver.activeRide.navigation.googleMaps'),
          onPress: () => {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
            Linking.openURL(url);
          },
        },
        {
          text: t('driver.activeRide.navigation.waze'),
          onPress: () => {
            const url = `waze://?ll=${lat},${lng}&navigate=yes`;
            Linking.canOpenURL(url).then((supported) => {
              Linking.openURL(supported ? url : `https://www.waze.com/ul?ll=${lat},${lng}`);
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
      const startedAtValue = ride?.startedAt;
      const startedAtMs =
        typeof startedAtValue === 'number'
          ? startedAtValue
          : typeof startedAtValue?._seconds === 'number'
            ? startedAtValue._seconds * 1000
            : typeof startedAtValue?.seconds === 'number'
              ? startedAtValue.seconds * 1000
              : null;
      const totalKm = computeTotalDistanceKm(ride);
      await ridesService.updateRideStatus(rideId, 'pending_payment', {
        finalFare: ride?.finalFare || ride?.estimatedPrice,
        // Métricas reales del viaje para el registro en PostgreSQL (best-effort)
        actualDistance:
          typeof totalKm === 'number' && Number.isFinite(totalKm) && totalKm > 0
            ? Math.round(totalKm * 1000)
            : undefined,
        actualDuration: startedAtMs ? Math.max(0, Date.now() - startedAtMs) : undefined,
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

  const { isCancellingRide, cancelButtonScale, handleCancelRide } = useRideCancellation({
    rideId,
    cancelReason: t('driver.activeRide.notifications.canceledByDriver'),
    cancelOptions: { canceledBy: 'driver' },
    canCancel: !isCompleted && !isCanceled,
    cannotCancelTitle: t('driver.activeRide.alerts.cannotCancelTitle'),
    cannotCancelMessage: t('driver.activeRide.alerts.cannotCancelMessage'),
    confirmTitle: t('driver.activeRide.alerts.cancelRideTitle'),
    confirmMessage: t('driver.activeRide.alerts.cancelRideMessage'),
    confirmLabel: t('driver.activeRide.alerts.cancelRideConfirm'),
    continueLabel: t('driver.activeRide.alerts.cancelRideKeep'),
    cancelErrorLabel: t('driver.activeRide.alerts.cancelRideError'),
    onSuccess: async () => {
      setUpdating(true);
      await notificationService.clearQuickReturn();
      handledCancellationRef.current = true;
      navigation.reset({
        index: 0,
        routes: [{ name: 'DriverHome' }],
      });
      setUpdating(false);
    },
  });

  const statusAccent = useMemo(() => {
    switch (normalizedStatus) {
      case 'accepted':
      case 'driver_on_route':
        return colors.secondary;
      case 'driver_arrived':
        return colors.warning;
      case 'in_progress':
        return colors.success;
      case 'pending_payment':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  }, [normalizedStatus, colors]);

  const paymentLabel = useMemo(() => {
    if (paymentMethod === 'cash') return t('driver.activeRide.labels.paymentCash');
    if (paymentMethod === 'card') return t('driver.activeRide.labels.paymentCard');
    return null;
  }, [paymentMethod, t]);

  // Solo el monto: la tarifa es lo único que nunca debe truncarse en el meta row
  // (el estado lo refuerza el CTA, el método lo dice el chip de pago).
  const fareDisplay = useMemo(
    () => formatCurrency(ride?.finalFare || ride?.estimatedPrice || 0),
    [ride?.finalFare, ride?.estimatedPrice, formatCurrency],
  );

  const ctaMeta = useMemo(() => {
    const show =
      (isAccepted || isDriverOnRoute || isDriverArrived || isInProgress) &&
      !isCompleted &&
      !isCanceled;

    let key = 'goOnRoute';
    let icon: 'near-me' | 'flag' | 'check-circle' = 'near-me';
    let onPress = handleGoOnRoute;
    if (isInProgress) {
      key = 'completeRide';
      icon = 'check-circle';
      onPress = handleCompleteRide;
    } else if (isDriverOnRoute || isDriverArrived) {
      key = 'startRide';
      icon = 'flag';
      onPress = handleStartRide;
    }

    return {
      show,
      label: t(`driver.activeRide.cta.${key}${updating ? 'Pending' : ''}`),
      icon,
      onPress,
    };
  }, [
    isAccepted,
    isDriverOnRoute,
    isDriverArrived,
    isInProgress,
    isCompleted,
    isCanceled,
    updating,
    ride,
    t,
  ]);

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
            originMarker={(isAccepted || isDriverOnRoute || isDriverArrived) && ride?.origin ? {
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
                    title: t('common.mapPins.extraStop', { index: idx + 1 }),
                    label: stop?.address || undefined,
                  }))
                : []
            }
            originTitle={t('common.mapPins.origin')}
            destinationTitle={t('common.mapPins.destination')}
            originLabel={ride?.origin?.address}
            destinationLabel={ride?.destination?.address}
            showPinBubbles={true}
            routeCoordinates={routePolyline}
            secondaryRouteCoordinates={pickupLegPolyline}
            secondaryRouteColor={colors.SecondBorder}
            tertiaryRouteCoordinates={stopsLegPolyline}
            tertiaryRouteColor={colors.warning}
          />
        ) : (
          <MapSkeleton />
        )}
      </View>

      {/* Bottom Sheet Colapsable */}
      <Animated.View style={[styles.bottomSheet, { height: panelHeight }]}>
        {/* Grabber */}
        <TouchableOpacity
          style={styles.grabber}
          onPress={togglePanel}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('driver.activeRide.accessibility.togglePanel')}
        >
          <View style={styles.grabberBar} />
        </TouchableOpacity>

        {/* Header Compacto */}
        <ActiveRideSheetHeader
          clientPhotoUrl={clientProfile?.photoUrl}
          clientInitial={resolvedClientInitial}
          clientName={resolvedClientName}
          fareLabel={fareDisplay}
          statusLabel={getStatusLabel(normalizedStatus)}
          statusColor={statusAccent}
          paymentMethod={paymentMethod as 'cash' | 'card' | null}
          paymentLabel={paymentLabel}
          canCall={!!ride?.clientPhone}
          voicePaused={voicePaused}
          colors={colors}
          onOpenChat={handleOpenChat}
          onCallClient={handleCallClient}
          onToggleVoice={handleVoiceToggle}
          styles={styles}
          t={t}
        />

        {/* Contenido expandible */}
        {panelExpanded && (
          <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {/* Addresses Card */}
            <ActiveRideAddressesCard
              pickupLabel={t('driver.activeRide.labels.pickupLabel')}
              destinationLabel={t('driver.activeRide.labels.destinationLabel')}
              origin={ride?.origin}
              destination={ride?.destination}
              extraDestinations={ride?.extraDestinations}
              etaMinutesLabel={formatEstimatedMinutes((ride?.estimatedDuration || 0) / 60)}
              etaDistanceLabel={formatEstimatedDistance((ride?.estimatedDistance || 0) / 1000)}
              colors={colors}
              onNavigate={handleNavigate}
              styles={styles}
              t={t}
            />

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
            <ActiveRideCTAButtons
              show={ctaMeta.show}
              ctaLabel={ctaMeta.label}
              ctaIcon={ctaMeta.icon}
              updating={updating}
              isCancellingRide={isCancellingRide}
              cancelButtonScale={cancelButtonScale}
              colors={colors}
              onCTAPress={ctaMeta.onPress}
              onCancelRide={handleCancelRide}
              styles={styles}
              t={t}
            />

            <SupportChatShortcut
              style={{ marginTop: 16, marginHorizontal: 0 }}
              rideId={rideId}
              initialCategory="service"
              initialTitle={t('driver.activeRide.support.title')}
              label={t('driver.activeRide.support.label')}
              description={t('driver.activeRide.support.description')}
            />
          </ScrollView>
        )}

        {/* Acciones visibles en modo colapsado */}
        {!panelExpanded && (
          <View style={styles.collapsedActions}>
            <ActiveRideCTAButtons
              show={ctaMeta.show}
              ctaLabel={ctaMeta.label}
              ctaIcon={ctaMeta.icon}
              updating={updating}
              isCancellingRide={isCancellingRide}
              cancelButtonScale={cancelButtonScale}
              colors={colors}
              onCTAPress={ctaMeta.onPress}
              onCancelRide={handleCancelRide}
              styles={styles}
              t={t}
            />
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
    marginTop: 16,
    fontSize: 15,
    textAlign: 'center',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 12,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  },
  grabber: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  grabberBar: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  sheetHeader: {
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  clientPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${colors.primary}33`,
  },
  clientInitial: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActionActive: {
    backgroundColor: `${colors.primary}1F`,
    borderColor: `${colors.primary}4D`,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
    paddingLeft: 56,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  fareText: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  paymentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  paymentChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sheetContent: {
    flex: 1,
    paddingTop: 14,
  },
  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 44,
  },
  routeIconCol: {
    width: 24,
    alignItems: 'center',
  },
  routeLine: {
    width: 2,
    flex: 1,
    minHeight: 6,
    backgroundColor: colors.border,
  },
  routeLineHidden: {
    backgroundColor: 'transparent',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeTextCol: {
    flex: 1,
    paddingLeft: 14,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    color: colors.text,
  },
  routeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  etaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  etaCaption: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  etaValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.success,
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  navigateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  progressIndicator: {
    marginBottom: 10,
    marginHorizontal: 2,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    marginBottom: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  primaryButtonText: {
    color: '#1C1917',
    fontWeight: '700',
    fontSize: 16,
  },
  cancelGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    gap: 6,
    height: 46,
    borderRadius: 12,
    marginBottom: 8,
  },
  cancelGhostText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  collapsedActions: {
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
