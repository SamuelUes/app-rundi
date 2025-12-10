import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Image,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { getDatabase, ref, onValue, get } from 'firebase/database';
import priceNegotiationService from '../../services/priceNegotiationService';
import ridesService from '../../services/ridesService';
import { RideListSkeleton } from '../../components/SkeletonLoader';
import { NoRidesEmptyState } from '../../components/EmptyState';
import alertService from '../../services/alertService';
import { fetchClientProfile, ClientProfile } from '../../services/clientProfilesService';
import { hasSavedCard } from '../../utils/cardUtils';
import { useLocation } from '../../hooks/useLocation';
import { useAcceptedRideListener } from '../../hooks/useAcceptedRideListener';
import penaltiesService from '../../services/penaltiesService';
import penaltiesRealtimeService from '../../services/realtime/penaltiesRealtimeService';
import { getPreflightResult } from '../../state/preflightStore';
import { RIDES_RADIUS_KM } from '../../constants/rideRadius';

const SCREEN_ENTRY_WINDOW_MS = 3000;
let screenEntryCountInWindow = 0;
let screenEntryWindowStartTs = 0;

const DEFAULT_COORDINATE: { lat: number; lng: number } = { lat: 0, lng: 0 };

type RawLocation =
  | { lat?: number; lng?: number; address?: string }
  | { latitude?: number; longitude?: number; address?: string }
  | { coords?: { latitude?: number; longitude?: number; address?: string }; address?: string }
  | undefined
  | null;

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

const normalizeLocation = (
  raw: RawLocation,
  fallbackLatValues: any[] = [],
  fallbackLngValues: any[] = [],
  fallbackAddress?: string,
): { lat: number; lng: number; address?: string } => {
  let lat: number | null = null;
  let lng: number | null = null;
  let address: string | undefined = fallbackAddress;

  if (raw && typeof raw === 'object') {
    if ('coords' in raw && raw.coords) {
      lat = parseCoordinate(raw.coords?.latitude);
      lng = parseCoordinate(raw.coords?.longitude);
      address = raw.address ?? address;
    } else {
      lat = parseCoordinate((raw as any).lat ?? (raw as any).latitude);
      lng = parseCoordinate((raw as any).lng ?? (raw as any).longitude);
      address = (raw as any).address ?? address;
    }
  }

  if (lat === null) {
    for (const candidate of fallbackLatValues) {
      const parsed = parseCoordinate(candidate);
      if (parsed !== null) {
        lat = parsed;
        break;
      }
    }
  }

  if (lng === null) {
    for (const candidate of fallbackLngValues) {
      const parsed = parseCoordinate(candidate);
      if (parsed !== null) {
        lng = parsed;
        break;
      }
    }
  }

  return {
    lat: lat ?? DEFAULT_COORDINATE.lat,
    lng: lng ?? DEFAULT_COORDINATE.lng,
    address,
  };
};

const normalizeStops = (stops: any[] | undefined | null): Array<{ lat: number; lng: number; address?: string }> => {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [];
  }

  return stops
    .map((stop) =>
      normalizeLocation(stop as RawLocation, [stop?.lat, stop?.latitude], [stop?.lng, stop?.longitude], stop?.address),
    )
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
};
const BACK_ICON = require('../../assets/icons/back_button/back_button2x.png');

interface Ride {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  status: string;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  driverOfferStatus?: string | null;
  passengers?: number;
  rideType?: string;
  paymentMethod?: 'cash' | 'card';
  requestedAt: number;
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  waypointsCount?: number;
  hasMultipleDestinations?: boolean;
}

export default function AvailableRidesScreeNewDesign({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { coords } = useLocation();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopCategory } = useVoiceAssistant();

  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.role === 'driver' ? preflightSummary.region : undefined;
  const [serviceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile | null>>({});
  const [penaltySummary, setPenaltySummary] = useState<{ pendingCount: number; pendingAmount: number } | null>(null);
  const [activeRideGuard, setActiveRideGuard] = useState<{ id: string } | null>(null);
  const isScreenFocusedRef = useRef(false);

  useEffect(() => {
    const focusUnsubscribe = navigation.addListener('focus', () => {
      isScreenFocusedRef.current = true;

      const now = Date.now();
      if (!screenEntryWindowStartTs || now - screenEntryWindowStartTs > SCREEN_ENTRY_WINDOW_MS) {
        screenEntryWindowStartTs = now;
        screenEntryCountInWindow = 1;
      } else {
        screenEntryCountInWindow += 1;
      }

      console.log('🟣 [AvailableRidesScreeNewDesign] ENTRADAS AL SCREEN EN VENTANA DE 3s', {
        countInWindow: screenEntryCountInWindow,
        windowStartedAt: screenEntryWindowStartTs,
        now,
        elapsedMsSinceWindowStart: now - screenEntryWindowStartTs,
      });
    });
    const blurUnsubscribe = navigation.addListener('blur', () => {
      isScreenFocusedRef.current = false;
    });

    return () => {
      focusUnsubscribe();
      blurUnsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    if (!voiceSettings.enabled) return;
    if (!isScreenFocusedRef.current) return;
    if (loading) return;

    const count = rides.length;
    speakVoice(`Hay ${count} viajes disponibles.`, 'status', undefined, true);
  }, [rides.length, loading, voiceSettings.enabled, speakVoice]);

  useEffect(() => {
    return () => {
      stopCategory('navigation');
      stopCategory('status');
    };
  }, [stopCategory]);

  // Monitorear rides aceptados globalmente
  useAcceptedRideListener(navigation);

  // 🔒 Guard: Si ya tengo un viaje activo (accepted/driver_on_route/in_progress), redirigir y bloquear esta pantalla
  useEffect(() => {
    if (!user?.id) return;

    const db = getDatabase();
    const path = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
    const activeRef = ref(db, path);

    const unsubscribe = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setActiveRideGuard(null);
        return;
      }

      let found: string | null = null;
      for (const [id, ride] of Object.entries<any>(data)) {
        const status = String(ride?.status || '').toLowerCase();
        if (ride?.driverId === user.id && ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)) {
          found = id;
          break;
        }
      }

      if (found) {
        setActiveRideGuard({ id: found });
        navigation.replace('ActiveRide', { rideId: found });
      } else {
        setActiveRideGuard(null);
      }
    });

    return () => unsubscribe();
  }, [user?.id, navigation, serviceAreaId]);

  const applySnapshot = useCallback(
    (data: Record<string, any> | null | undefined) => {
      const rideKeys = data ? Object.keys(data) : [];
      console.log('📦 [AvailableRides] Snapshot recibido', {
        totalKeys: rideKeys.length,
        keysPreview: rideKeys.slice(0, 5),
      });

      if (!data) {
        setRides([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const availableRides: Ride[] = [];

      Object.entries(data).forEach(([rideId, rideData]: [string, any]) => {
        const statusRaw = typeof rideData?.status === 'string' ? rideData.status.trim().toLowerCase() : '';
        const driverId = rideData?.driverId ?? rideData?.driver_id ?? null;

        const isCancelled =
          statusRaw.startsWith('cancel') ||
          statusRaw === 'cancelled' ||
          Boolean(rideData?.cancelReason) ||
          rideData?.paymentCanceled === true ||
          rideData?.cancelled === true ||
          rideData?.canceled === true;
        if (isCancelled) {
          console.log('⏭️ [AvailableRides] Ride omitido (cancelado)', rideId, {
            statusRaw,
            driverId,
            cancelReason: rideData?.cancelReason,
            paymentCanceled: rideData?.paymentCanceled,
          });
          return;
        }

        const isRequested = statusRaw === 'requested' && !driverId;
        const isNegotiatingWithMe = Boolean(user?.id) && driverId === user?.id && ['pending_confirm', 'driver_assigned'].includes(statusRaw);

        if (!(isRequested || isNegotiatingWithMe)) {
          console.log('⏭️ [AvailableRides] Ride omitido (no elegible)', rideId, {
            statusRaw,
            driverId,
            userId: user?.id,
            isRequested,
            isNegotiatingWithMe,
          });
          return;
        }

        const offers = rideData.offers || {};
        const myOffer = user?.id ? offers[user.id] : null;

        const origin = normalizeLocation(
          rideData.origin as RawLocation,
          [rideData.originLat, rideData.originLatitude, rideData.pickupLat, rideData.pickupLatitude],
          [rideData.originLng, rideData.originLongitude, rideData.pickupLng, rideData.pickupLongitude],
          rideData.originAddress,
        );
        const destination = normalizeLocation(
          rideData.destination as RawLocation,
          [rideData.destinationLat, rideData.destinationLatitude, rideData.dropoffLat, rideData.dropoffLatitude],
          [rideData.destinationLng, rideData.destinationLongitude, rideData.dropoffLng, rideData.dropoffLongitude],
          rideData.destinationAddress,
        );

        const extraStops = normalizeStops(rideData.extraDestinations || rideData.extra_stops || rideData.additionalStops);

        const requestedAtRaw = rideData.requestedAt ?? rideData.createdAt ?? rideData.created_at ?? Date.now();
        const requestedAt = typeof requestedAtRaw === 'number' ? requestedAtRaw : parseInt(requestedAtRaw, 10) || 0;

        // Filtrar por radio de búsqueda del conductor si tenemos coordenadas válidas
        const driverLat = coords?.latitude ?? null;
        const driverLng = coords?.longitude ?? null;

        if (
          driverLat !== null &&
          driverLng !== null &&
          Number.isFinite(origin.lat) &&
          Number.isFinite(origin.lng)
        ) {
          const distanceKm = haversineKm(driverLat, driverLng, origin.lat, origin.lng);
          if (!Number.isFinite(distanceKm) || distanceKm > RIDES_RADIUS_KM) {
            console.log('⏭️ [AvailableRides] Ride omitido (fuera de radio)', rideId, {
              distanceKm,
              RIDES_RADIUS_KM,
            });
            return;
          }
        }

        availableRides.push({
          id: rideId,
          clientId: rideData.clientId || '',
          clientName: rideData.clientName || rideData.client?.name || rideData.clientInfo?.name,
          clientPhone: rideData.clientPhone || rideData.client?.phone || rideData.clientInfo?.phone,
          origin,
          destination,
          estimatedDistance: rideData.estimatedDistance || 0,
          estimatedDuration: rideData.estimatedDuration || 0,
          estimatedPrice: rideData.estimatedPrice || 0,
          status: statusRaw || 'requested',
          clientSuggestedPrice: rideData.clientSuggestedPrice,
          driverOfferedPrice: myOffer?.offeredPrice ?? null,
          driverOfferStatus: myOffer?.status ?? null,
          passengers: rideData.passengers || 1,
          rideType: rideData.rideType || 'normal',
          paymentMethod: rideData.paymentMethod,
          requestedAt,
          extraDestinations: extraStops,
          waypointsCount: rideData.waypointsCount || extraStops.length || 0,
          hasMultipleDestinations: rideData.hasMultipleDestinations || extraStops.length > 0,
        });
        console.log('✅ [AvailableRides] Ride agregado a lista', rideId, {
          statusRaw,
          driverId,
          isRequested,
          isNegotiatingWithMe,
          negotiationStatus: rideData?.negotiationStatus,
        });
      });

      availableRides.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));

      setRides(availableRides);
      setSelectedRideId((current) => (current && availableRides.some((ride) => ride.id === current) ? current : null));
      setLoading(false);
      setRefreshing(false);
    },
    [user?.id, coords?.latitude, coords?.longitude],
  );

  useEffect(() => {
    const db = getDatabase();
    const path = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
    const ridesRef = ref(db, path);

    const unsubscribe = onValue(
      ridesRef,
      (snapshot) => {
        applySnapshot(snapshot.val());
      },
      (error) => {
        console.error('❌ Error en listener:', error);
        setLoading(false);
        setRefreshing(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [navigation, user?.id, serviceAreaId, applySnapshot]);

  // ✅ Supabase Realtime: resumen de penalizaciones
  useEffect(() => {
    if (!user?.id) return;
    let unsubscribe: (() => void) | null = null;
    let isActive = true;

    const fetchSummary = async () => {
      try {
        const res = await penaltiesService.getDriverPenaltySummary();
        if (!isActive || !res?.success) return;
        setPenaltySummary({
          pendingCount: Number(res.pendingCount || 0),
          pendingAmount: Number(res.pendingAmount || 0),
        });
      } catch (e) {
        console.error('❌ [AvailableRidesScreeNewDesign] Error obteniendo resumen de penalizaciones:', e);
      }
    };

    penaltiesRealtimeService
      .subscribeToDriverPenaltyChanges(user.id, fetchSummary)
      .then((unsubscribeFn) => {
        unsubscribe = unsubscribeFn;
      })
      .catch((err) => {
        console.error('❌ [AvailableRidesScreeNewDesign] Error suscribiendo a penalizaciones:', err);
        void fetchSummary();
      });

    const navUnsubscribe = navigation?.addListener?.('focus', fetchSummary);

    return () => {
      isActive = false;
      unsubscribe?.();
      navUnsubscribe?.();
    };
  }, [navigation, user?.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const db = getDatabase();
      const path = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
      const ridesRef = ref(db, path);
      const snapshot = await get(ridesRef);
      applySnapshot(snapshot.val());
    } catch (error) {
      console.error('❌ [AvailableRides] Error refrescando manualmente:', error);
    } finally {
      setRefreshing(false);
    }
  }, [applySnapshot, serviceAreaId]);

  const ensureCardForCardPayments = async (ride: Ride): Promise<boolean> => {
    const ridePaymentMethod = ride?.paymentMethod || ride?.rideType;
    if ((ridePaymentMethod || '').toLowerCase() !== 'card') {
      return true;
    }

    if (await hasSavedCard()) {
      return true;
    }

    alertService.showConfirmAlert(
      'Tarjeta requerida',
      'Para aceptar viajes con pago por tarjeta necesitas registrar al menos una tarjeta bancaria. Agrega una tarjeta antes de continuar.',
      () => navigation.navigate('PaymentMethods'),
      undefined,
      'Ir a métodos',
      'Cancelar',
    );

    return false;
  };

  const handleAcceptRide = async (ride: Ride) => {
    try {
      // 🔒 Bloquear aceptar si ya tengo un viaje activo
      if (activeRideGuard) {
        alertService.showInfoAlert(
          'Tienes un viaje activo',
          'Debes completar tu viaje actual antes de aceptar uno nuevo.',
          () => navigation.replace('ActiveRide', { rideId: activeRideGuard.id })
        );
        return;
      }

      // ✅ Bloquear aceptar si hay comisiones pendientes
      if (penaltySummary && Number(penaltySummary.pendingAmount) > 0) {
        alertService.showInfoAlert(
          'Comisiones pendientes',
          `Tienes C$${Number(penaltySummary.pendingAmount).toFixed(2)} en comisiones pendientes. Debes pagarlas para aceptar viajes.`,
          () => navigation.navigate('PayCommissions'),
        );
        return;
      }

      if (!(await ensureCardForCardPayments(ride))) {
        return;
      }

      if (
        (typeof ride.clientSuggestedPrice === 'number' &&
          Number.isFinite(ride.clientSuggestedPrice) &&
          ride.clientSuggestedPrice > 0) ||
        (typeof ride.estimatedPrice === 'number' &&
          Number.isFinite(ride.estimatedPrice) &&
          ride.estimatedPrice > 0)
      ) {
        try {
          const priceToShow =
            typeof ride.clientSuggestedPrice === 'number' &&
            Number.isFinite(ride.clientSuggestedPrice) &&
            ride.clientSuggestedPrice > 0
              ? ride.clientSuggestedPrice
              : ride.estimatedPrice;

          await priceNegotiationService.acceptClientPrice(ride.id);

          alertService.showSuccessAlert(
            'Oferta enviada',
            `Aceptaste el viaje por ${priceToShow} Cordobas. Esperando confirmación del cliente...`,
          );

          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: ride.origin,
            destination: ride.destination,
            estimatedFare: ride.clientSuggestedPrice,
            extraDestinations: (ride.extraDestinations || []).map((stop) => ({
              lat: stop.lat,
              lng: stop.lng,
              address: stop.address,
            })),
          });
        } catch (error: any) {
          console.error('❌ Error completo:', error);
          alertService.showErrorAlert(error.message || 'No se pudo enviar la oferta');
        }
      } else {
        try {
          const acceptData = {
            driverId: user?.id || '',
            vehicleId: 'temp-vehicle-id',
            currentLocation: { lat: 0, lng: 0 },
          };

          await ridesService.acceptRide(ride.id, acceptData);

          alertService.showSuccessAlert(
            'Oferta enviada',
            'Hemos notificado al cliente. Esperando confirmación...',
          );

          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: ride.origin,
            destination: ride.destination,
            estimatedFare: ride.estimatedPrice,
            extraDestinations: (ride.extraDestinations || []).map((stop) => ({
              lat: stop.lat,
              lng: stop.lng,
              address: stop.address,
            })),
          });
        } catch (error: any) {
          alertService.showErrorAlert(error.message || 'No se pudo aceptar el viaje');
        }
      }
    } catch (error: any) {
      alertService.showErrorAlert(error.message || 'No se pudo aceptar el viaje');
    }
  };

  const groupedRides = useMemo(() => {
    const designated: Ride[] = [];
    const standard: Ride[] = [];

    rides.forEach((ride) => {
      if ((ride.rideType || '').toLowerCase() === 'designated_driver') {
        designated.push(ride);
      } else {
        standard.push(ride);
      }
    });

    return { designated, standard };
  }, [rides]);

  type SectionItem = { id: string; type: 'section' };
  type RideListItem = Ride | SectionItem;

  const listData = useMemo<RideListItem[]>(() => {
    const items: RideListItem[] = [...groupedRides.standard];
    if (groupedRides.designated.length > 0) {
      items.push({ id: 'section-designated', type: 'section' });
      items.push(...groupedRides.designated);
    }
    return items;
  }, [groupedRides]);

  useEffect(() => {
    const missingClientIds = rides
      .map((ride) => ride.clientId)
      .filter((id): id is string => Boolean(id) && !(id in clientProfiles));

    if (missingClientIds.length === 0) {
      return;
    }

    let cancelled = false;

    const loadProfiles = async () => {
      const entries: Array<[string, ClientProfile | null]> = await Promise.all(
        missingClientIds.map(async (clientId) => {
          try {
            const profile = await fetchClientProfile(clientId);
            return [clientId, profile ?? null];
          } catch (error) {
            console.warn('[AvailableRides] Error cargando perfil de cliente', clientId, error);
            return [clientId, null];
          }
        })
      );

      if (!cancelled && entries.length) {
        setClientProfiles((prev) => {
          const next = { ...prev };
          entries.forEach(([id, profile]) => {
            next[id] = profile;
          });
          return next;
        });
      }
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [rides, clientProfiles]);

  const handleSelectRide = (rideId: string) => {
    setSelectedRideId((current) => (current === rideId ? null : rideId));
  };

  const handleViewRideDetails = (ride: Ride) => {
    if (typeof navigation?.navigate !== 'function') {
      return;
    }

    const originLat = ride.origin?.lat ?? 0;
    const originLng = ride.origin?.lng ?? 0;
    const destinationLat = ride.destination?.lat ?? 0;
    const destinationLng = ride.destination?.lng ?? 0;

    const payload = {
      id: ride.id,
      clientId: ride.clientId,
      clientName: ride.clientName,
      clientPhone: ride.clientPhone,
      origin: {
        lat: originLat,
        lng: originLng,
        address: ride.origin?.address || 'Origen',
      },
      destination: {
        lat: destinationLat,
        lng: destinationLng,
        address: ride.destination?.address || 'Destino',
      },
      extraDestinations: (ride.extraDestinations || []).map((stop) => ({
        lat: stop.lat,
        lng: stop.lng,
        address: stop.address,
      })),
      estimatedPrice: ride.estimatedPrice || 0,
      estimatedDistance: ride.estimatedDistance,
      estimatedDuration: ride.estimatedDuration,
      clientSuggestedPrice: ride.clientSuggestedPrice,
      driverOfferedPrice: ride.driverOfferedPrice,
      paymentMethod: ride.paymentMethod,
    };

    navigation.navigate('RidePreview', { ride: payload });
  };

  const getInitials = (name?: string) => {
    if (!name) return 'CL';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const haversineKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371; // km
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const renderRideItem = ({ item }: { item: RideListItem }) => {
    if ((item as any).type === 'section') {
      return (
        <Text style={styles.sectionLabel}>Viajes de Conductor Designado</Text>
      );
    }

    const ride = item as Ride;
    const profile = ride.clientId ? clientProfiles[ride.clientId] : undefined;
    const name = profile?.fullName || ride.clientName || 'Cliente';
    const photoUrl = profile?.photoUrl || null;

    const originLat = ride?.origin?.lat ?? 0;
    const originLng = ride?.origin?.lng ?? 0;
    const destLat = ride?.destination?.lat ?? 0;
    const destLng = ride?.destination?.lng ?? 0;

    const originAddress = ride?.origin?.address || `${originLat.toFixed(4)}, ${originLng.toFixed(4)}`;
    const destinationAddress = ride?.destination?.address || `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`;

    const price = ride.clientSuggestedPrice ?? ride.estimatedPrice ?? 0;
    const stopsCount = (ride.extraDestinations || []).length;

    // Distancia y ETA del conductor al origen del viaje
    const driverLat = coords?.latitude ?? null;
    const driverLng = coords?.longitude ?? null;
    const distanceToOriginKm =
      driverLat !== null && driverLng !== null
        ? haversineKm(driverLat, driverLng, originLat, originLng)
        : 0;
    const AVERAGE_SPEED_KMH = 28; // velocidad urbana estimada
    const etaToOriginMin = distanceToOriginKm > 0 ? Math.max(1, Math.round((distanceToOriginKm / AVERAGE_SPEED_KMH) * 60)) : 0;

    const isSelected = selectedRideId === ride.id;

    return (
      <Pressable
        style={[
          styles.rideCard,
          isDark ? styles.rideCardDark : styles.rideCardLight,
          isSelected && { borderColor: '#D4AF37', borderWidth: 1.5, shadowColor: '#D4AF37', shadowOpacity: 0.25, elevation: 2 },
        ]}
        onPress={() => handleSelectRide(ride.id)}
      >
        <View style={styles.cardRow}>
          <View
            style={[
              styles.avatarPlaceholder,
              isDark ? styles.avatarPlaceholderDark : styles.avatarPlaceholderLight,
            ]}
          >
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitials, { color: colors.text }]}>
                {getInitials(name)}
              </Text>
            )}
          </View>

          <View style={styles.detailsColumn}>
            <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              Origen: {originAddress}
            </Text>
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              Destino: {destinationAddress}
            </Text>
            {stopsCount > 0 ? (
              <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
                Paradas: {stopsCount}
              </Text>
            ) : null}
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              Precio: C${price}
            </Text>
          </View>

          <View style={styles.metaColumn}>
            <Text style={[styles.distanceLabel, { color: colors.text }]}>
              {distanceToOriginKm > 0 ? `${distanceToOriginKm.toFixed(1)} km al origen` : 'Calculando distancia...'}
            </Text>
            <Text style={[styles.distanceLabel, { color: colors.text + '99' }]}>
              {distanceToOriginKm > 0 ? `~${etaToOriginMin} min para llegar` : ''}
            </Text>
            {isSelected && (
              <TouchableOpacity
                onPress={() => handleViewRideDetails(ride)}
                style={[styles.viewButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={styles.viewButtonText}>Ver</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <TouchableOpacity
          style={[styles.backButton, isDark ? styles.backButtonDark : styles.backButtonLight]}
          onPress={() => navigation.goBack?.()}
          activeOpacity={0.8}
        > 
          <Image source={BACK_ICON} style={[styles.backIconImage, { tintColor: isDark ? '#FFFFFF' : colors.text }]} resizeMode="contain" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Viajes Disponibles</Text>
      </View>

      <FlatList
        data={listData}
        renderItem={renderRideItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={loading ? (
          <RideListSkeleton />
        ) : (
          <NoRidesEmptyState onAction={handleRefresh} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  backButtonLight: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  backButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backIconImage: {
    width: 18,
    height: 18,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 40,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D18A1B',
    marginVertical: 12,
  },
  rideCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rideCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
  },
  rideCardDark: {
    backgroundColor: '#1F1F1F',
    borderColor: '#303030',
    shadowOpacity: 0.2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  avatarPlaceholderLight: {
    backgroundColor: '#F2F2F2',
  },
  avatarPlaceholderDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
  },
  detailsColumn: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  detailLine: {
    fontSize: 13,
  },
  metaColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    paddingLeft: 12,
  },
  distanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  viewButton: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderWidth: 1,
  },
  viewButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
