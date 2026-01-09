import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLocation } from '../../hooks/useLocation';
import DynamicMap from '../../components/DynamicMap';
import alertService from '../../services/alertService';
import ridesService from '../../services/ridesService';
import PriceNegotiationModal from '../../components/PriceNegotiationModal';
import priceNegotiationService from '../../services/priceNegotiationService';
import { useFirebaseData } from '../../hooks/useFirebaseData';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/vehicleIcons';
import mapsService from '../../services/mapsService';
import { clearClientActiveRideState } from '../../utils/clientRideState';
import { getPreflightResult } from '../../state/preflightStore';

const USER_LOCATION_LIGHT_ICON = require('../../assets/icons/actuall-position-white/actuallpositionwhite2x.png');
const USER_LOCATION_DARK_ICON = require('../../assets/icons/actuall-position-black/actuallpositionblack2x.png');

interface Props {
  navigation: any;
  route?: { params?: { rideId?: string } };
}

interface OfferItem {
  driverId: string;
  offeredPrice?: number;
  status?: 'pending' | 'accepted' | 'rejected';
  estimatedArrivalTime?: string;
  driver: {
    name: string;
    rating: number | null;
    photoURL: string | null;
    vehicle?: any;
  };
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const preferNonEmpty = (...candidates: Array<string | null | undefined>): string | null => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
};

const extractNameFromSource = (source: any): string | null => {
  if (!source || typeof source !== 'object') return null;
  return preferNonEmpty(
    source.fullName,
    source.displayName,
    source.name,
    [source.firstName, source.lastName].filter(Boolean).join(' '),
    source.driverName,
    source.username
  );
};

const mergeName = (fallback: string, ...sources: Array<any | null | undefined>): string => {
  for (const source of sources) {
    const candidate = extractNameFromSource(source);
    if (candidate) {
      return candidate;
    }
  }
  return fallback;
};

const extractRatingValue = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    return (
      extractRatingValue(value.value) ??
      extractRatingValue(value.average) ??
      extractRatingValue(value.avg) ??
      extractRatingValue(value.rating) ??
      extractRatingValue(value.score)
    );
  }
  return null;
};

const mergeRating = (...sources: Array<any | null | undefined>): number | null => {
  const ratingCandidates: any[] = [];

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    ratingCandidates.push(
      source.rating,
      source.averageRating,
      source.avgRating,
      source?.stats?.rating,
      source?.stats?.averageRating,
      source?.stats?.avgRating
    );
  }

  for (const candidate of ratingCandidates) {
    const parsed = extractRatingValue(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
};

export default function HomeScreenOffers({ navigation, route }: Props) {
  const { t } = useTranslation();
  const driverFallbackName = t('common.roles.driver');
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords } = useLocation();
  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.region;
  const [serviceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);
  const [rideId, setRideId] = useState<string | null>(route?.params?.rideId || null);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rideSnapshot, setRideSnapshot] = useState<any | null>(null);
  const [driverLocations, setDriverLocations] = useState<Record<string, any> | null>(null);
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // driversInfo: datos públicos agregados (nombre, foto, rating, vehículo). Evita leer /drivers (permiso denegado para clientes)
  const { data: driversInfo } = useFirebaseData<any>('driversInfo', { maxCacheAge: 10000 });
  const { data: driversRaw } = useFirebaseData<any>('drivers', { maxCacheAge: 10000 });

  // Resolve current rideId if not provided (find requested or driver_offered for this user)
  useEffect(() => {
    if (rideId) return;
    if (!user?.id) return;

    let mounted = true;
    (async () => {
      const { getDatabase, ref, onValue, off } = await import('firebase/database');
      const db = getDatabase();
      const path = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
      const activeRidesRef = ref(db, path);
      const unsub = onValue(activeRidesRef, (snap) => {
        if (!mounted) return;
        const all = snap.val() || {};
        const mine = Object.entries<any>(all).find(([, r]) => r?.clientId === user.id && (
          r?.status === 'requested' || r?.status === 'driver_offered' || r?.status === 'pending_confirm' || r?.status === 'driver_assigned'
        ));
        if (mine) {
          setRideId(mine[0]);
        }
        setTimeout(() => off(activeRidesRef), 0);
      });
      return () => { try { off(activeRidesRef); } catch {} };
    })();
  }, [rideId, user?.id, serviceAreaId]);

  // Listen to active ride and its offers
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;
    (async () => {
      if (!rideId) return;
      const { getDatabase, ref, onValue, off, get } = await import('firebase/database');
      const db = getDatabase();
      const basePath = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
      const rideRef = ref(db, `${basePath}/${rideId}`);

      const onRide = async (snapshot: any) => {
        if (!mounted) return;
        const ride = snapshot.val();
        setRideSnapshot(ride);

        // read offers from data or nested path
        let offersData = ride?.offers || ride?.driverOffers;
        if (!offersData) {
          const offersRef = ref(db, `${basePath}/${rideId}/offers`);
          const offersSnap = await get(offersRef);
          if (offersSnap.exists()) offersData = offersSnap.val();
        }
        if (!offersData) {
          const offersRef = ref(db, `activeRides/${rideId}/offers`);
          const offersSnap = await get(offersRef);
          if (offersSnap.exists()) offersData = offersSnap.val();
        }

        // transform offers to array and enrich with driversInfo
        if (offersData && typeof offersData === 'object') {
          const arr: OfferItem[] = Object.entries<any>(offersData).map(([driverId, offer]) => {
            const info = driversInfo?.[driverId] || {};
            const raw = driversRaw?.[driverId] || {};
            const fullName = mergeName(driverFallbackName, info, raw, offer?.driver);
            const rating = mergeRating(info, raw, offer?.driver ?? offer);
            const photoURL = info?.profilePhoto || info?.photoURL || info?.photoUrl || raw?.profilePhoto || raw?.photoURL || raw?.photoUrl || offer?.driver?.photoURL || null;
            const vehicle = info?.vehicle || info?.activeVehicle || info?.currentVehicle || raw?.vehicle || raw?.activeVehicle || offer?.driver?.vehicle || undefined;
            return {
              driverId,
              offeredPrice: offer?.offeredPrice,
              status: offer?.status || 'pending',
              estimatedArrivalTime: offer?.estimatedArrivalTime,
              driver: {
                name: fullName,
                rating,
                photoURL,
                vehicle,
              },
            };
          });
          // order by accepted first, then ETA/price
          arr.sort((a, b) => {
            const sa = a.status === 'accepted' ? 0 : 1;
            const sb = b.status === 'accepted' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return (a.offeredPrice ?? 0) - (b.offeredPrice ?? 0);
          });
          setOffers(arr);
          setSelectedDriverId((prev) => {
            if (prev && arr.some((offer) => offer.driverId === prev)) {
              return prev;
            }

            const acceptedOffer = arr.find((offer) => offer.status === 'accepted');
            if (acceptedOffer) {
              return acceptedOffer.driverId;
            }

            return null;
          });
        } else {
          setOffers([]);
        }
        setLoading(false);
      };

      onValue(rideRef, onRide);
      cleanup = () => { try { off(rideRef); } catch {} };
    })();

    return () => { mounted = false; if (cleanup) cleanup(); };
  }, [rideId, driversInfo, driversRaw, serviceAreaId]);

  // Listen driverLocations for marker positions
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;
    (async () => {
      const { getDatabase, ref, onValue, off } = await import('firebase/database');
      const db = getDatabase();
      const path = serviceAreaId ? `driverLocationsByArea/${serviceAreaId}` : 'driverLocations';
      const locRef = ref(db, path);
      onValue(locRef, (snap) => {
        if (!mounted) return;
        const val = snap.val();
        setDriverLocations(val && typeof val === 'object' ? val : null);
      });
      cleanup = () => { try { off(locRef); } catch {} };
    })();
    return () => { mounted = false; if (cleanup) cleanup(); };
  }, [serviceAreaId]);

  const nearbyDrivers = useMemo(() => {
    if (!offers || offers.length === 0) return [] as any[];

    return offers
      .map((o) => {
        const loc = driverLocations?.[o.driverId] || {};
        const rawLat = loc?.lat ?? loc?.latitude ?? loc?.coords?.latitude;
        const rawLng = loc?.lng ?? loc?.longitude ?? loc?.coords?.longitude;

        const latitude =
          typeof rawLat === 'number'
            ? rawLat
            : typeof rawLat === 'string'
            ? parseFloat(rawLat)
            : NaN;

        const longitude =
          typeof rawLng === 'number'
            ? rawLng
            : typeof rawLng === 'string'
            ? parseFloat(rawLng)
            : NaN;

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }

        const info = driversInfo?.[o.driverId] || {};
        const raw = driversRaw?.[o.driverId] || {};
        const type = extractVehicleTypeFromInfo(info) || extractVehicleTypeFromInfo(raw);
        const ratingParsed = mergeRating(info, raw, o.driver);

        return {
          id: o.driverId,
          latitude,
          longitude,
          heading: typeof loc?.heading === 'number' && Number.isFinite(loc.heading) ? loc.heading : undefined,
          vehicleIconSource: ensureVehicleIconSource(type),
          isSelected: o.driverId === selectedDriverId,
          rating: (ratingParsed !== null && Number.isFinite(ratingParsed) ? ratingParsed : null) as number | null,
          photoURL: (info?.profilePhoto || info?.photoURL || info?.photoUrl || raw?.profilePhoto || raw?.photoURL || raw?.photoUrl || o.driver?.photoURL || null) as string | null,
        };
      })
      .filter((d): d is NonNullable<typeof d> => !!d);
  }, [offers, driverLocations, selectedDriverId, driversInfo, driversRaw]);

  // Calcular ETA aproximada y hora de llegada (basado en distancia y velocidad promedio)
  const etasByDriver = useMemo(() => {
    const map: Record<string, { etaMins: number; arrivalLabel: string }> = {};
    const originLat = rideSnapshot?.origin?.lat ?? rideSnapshot?.origin?.latitude;
    const originLng = rideSnapshot?.origin?.lng ?? rideSnapshot?.origin?.longitude;
    if (!originLat || !originLng) return map;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    (offers || []).forEach((o) => {
      const loc = driverLocations?.[o.driverId];
      const lat = loc?.lat ?? loc?.latitude ?? loc?.coords?.latitude;
      const lng = loc?.lng ?? loc?.longitude ?? loc?.coords?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const distKm = haversineKm(originLat, originLng, lat, lng);
      const avgSpeedKmH = 24; // velocidad promedio urbana
      const mins = Math.max(1, Math.round((distKm / avgSpeedKmH) * 60));
      const arrival = new Date(Date.now() + mins * 60000);
      const hours = arrival.getHours();
      const minutes = arrival.getMinutes();
      const h12 = ((hours + 11) % 12) + 1;
      const ampm = hours >= 12 ? 'pm' : 'am';
      const arrivalLabel = `${h12}:${minutes.toString().padStart(2, '0')}${ampm}`;
      map[o.driverId] = { etaMins: mins, arrivalLabel };
    });
    return map;
  }, [offers, driverLocations, rideSnapshot?.origin?.lat, rideSnapshot?.origin?.lng]);

  const handleSelectFromList = (driverId: string) => {
    setSelectedDriverId((current) => (current === driverId ? null : driverId));
  };
  const handleDriverPressOnMap = (driverId: string) => {
    setSelectedDriverId((current) => (current === driverId ? null : driverId));
  };

  const handleMessageDriver = useCallback(
    (offer: OfferItem) => {
      if (!rideId) return;
      const info = driversInfo?.[offer.driverId] || {};
      const raw = driversRaw?.[offer.driverId] || {};
      const name = mergeName(driverFallbackName, info, raw, offer.driver);
      navigation.navigate('Chat', {
        rideId,
        otherUserId: offer.driverId,
        otherUserName: name,
      });
    },
    [driversInfo, driversRaw, navigation, rideId],
  );

  const selectedOffer: OfferItem | undefined = useMemo(
    () => offers.find(o => o.driverId === selectedDriverId),
    [offers, selectedDriverId],
  );

  const primaryActionLabel = useMemo(() => {
    if (!selectedOffer) {
      return t('client.homeOffers.primaryAction.select');
    }

    if (selectedOffer.status === 'accepted') {
      return t('client.homeOffers.primaryAction.confirmDriver');
    }

    const negotiationStatus = rideSnapshot?.negotiationStatus;
    const hasDriverPrice =
      typeof rideSnapshot?.driverOfferedPrice === 'number' && rideSnapshot.driverOfferedPrice > 0;
    const hasClientPrice =
      typeof rideSnapshot?.clientSuggestedPrice === 'number' && rideSnapshot.clientSuggestedPrice > 0;
    const hasEstimatedPrice =
      typeof (rideSnapshot?.estimatedPrice ?? rideSnapshot?.estimatedFare) === 'number';

    if (hasDriverPrice && negotiationStatus === 'driver_offered') {
      return t('client.homeOffers.primaryAction.confirmDriverPrice');
    }

    if (
      hasClientPrice &&
      (!hasDriverPrice ||
        negotiationStatus === 'client_suggested' ||
        negotiationStatus === 'client_accepted')
    ) {
      return t('client.homeOffers.primaryAction.confirmClientPrice');
    }

    if (hasEstimatedPrice && !hasDriverPrice && !hasClientPrice) {
      return t('client.homeOffers.primaryAction.confirmEstimate');
    }

    return t('client.homeOffers.primaryAction.select');
  }, [
    selectedOffer,
    rideSnapshot?.negotiationStatus,
    rideSnapshot?.driverOfferedPrice,
    rideSnapshot?.clientSuggestedPrice,
    rideSnapshot?.estimatedPrice,
    rideSnapshot?.estimatedFare,
    t,
  ]);

  const acceptedAnim = useRef(new Animated.Value(0)).current;
  const confirmBtnAnim = useRef(new Animated.Value(1)).current;
  const cancelBtnAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!selectedOffer) {
      acceptedAnim.setValue(0);
      return;
    }

    if (selectedOffer.status === 'accepted') {
      Animated.spring(acceptedAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 80,
      }).start();
    } else {
      Animated.timing(acceptedAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedOffer?.status, acceptedAnim, selectedOffer]);

  const openNegotiation = useCallback(() => {
    if (!selectedOffer) return;
    setShowNegotiation(true);
  }, [selectedOffer]);

  const confirmSelectedDriver = useCallback(async () => {
    if (!rideId || !selectedDriverId || isConfirming) return;
    setIsConfirming(true);
    Animated.timing(confirmBtnAnim, {
      toValue: 0.95,
      duration: 120,
      useNativeDriver: true,
    }).start();
    try {
      await ridesService.confirmDriver(rideId, selectedDriverId);
      alertService.showSuccessAlert(
        t('client.homeOffers.alerts.confirmSuccessTitle'),
        t('client.homeOffers.alerts.confirmSuccessMessage'),
      );
      setShowNegotiation(false);
      if (navigation?.replace) {
        navigation.replace('RideTracking', {
          rideId,
          driverId: selectedDriverId,
          driverName: offers.find(o => o.driverId === selectedDriverId)?.driver?.name || driverFallbackName,
        });
      } else {
        navigation?.navigate?.('RideTracking', {
          rideId,
          driverId: selectedDriverId,
          driverName: offers.find(o => o.driverId === selectedDriverId)?.driver?.name || driverFallbackName,
        });
      }
    } catch (e: any) {
      console.error('Error confirming driver', e);
      alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.confirmError'));
    } finally {
      Animated.timing(confirmBtnAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      setIsConfirming(false);
    }
  }, [confirmBtnAnim, driverFallbackName, isConfirming, navigation, offers, rideId, selectedDriverId, t]);

  const cancelSearch = useCallback(async () => {
    if (!rideId || isCancelling) return;
    setIsCancelling(true);
    Animated.timing(cancelBtnAnim, {
      toValue: 0.95,
      duration: 120,
      useNativeDriver: true,
    }).start();
    try {
      await ridesService.cancelRide(rideId, t('client.homeOffers.cancelReason'));
      await clearClientActiveRideState();
      setRideId(null);
      setRideSnapshot(null);
      setOffers([]);
      setSelectedDriverId(null);
      alertService.showSuccessAlert(
        t('client.homeOffers.alerts.cancelSuccessTitle'),
        t('client.homeOffers.alerts.cancelSuccessMessage'),
      );
      navigation.replace('ClientHome');
    } catch (e: any) {
      alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.cancelError'));
    } finally {
      Animated.timing(cancelBtnAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      setIsCancelling(false);
    }
  }, [rideId, navigation, isCancelling, cancelBtnAnim]);

  // Location to center map
  const centerLat = coords?.latitude ?? rideSnapshot?.origin?.lat ?? 12.1364;
  const centerLng = coords?.longitude ?? rideSnapshot?.origin?.lng ?? -86.2514;

  // Coordinates for map pins
  const originCoords = useMemo(() => {
    const origin = rideSnapshot?.origin || rideSnapshot?.originLocation;
    if (!origin) return null;
    const latitude = origin.lat ?? origin.latitude;
    const longitude = origin.lng ?? origin.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
    return null;
  }, [rideSnapshot?.origin, rideSnapshot?.originLocation]);

  const destinationCoords = useMemo(() => {
    const destination = rideSnapshot?.destination || rideSnapshot?.destinationLocation;
    if (!destination) return null;
    const latitude = destination.lat ?? destination.latitude;
    const longitude = destination.lng ?? destination.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
    return null;
  }, [rideSnapshot?.destination, rideSnapshot?.destinationLocation]);

  const extraStopMarkers = useMemo(() => {
    if (!Array.isArray(rideSnapshot?.extraDestinations)) return [];

    return rideSnapshot.extraDestinations
      .map((stop: any, index: number) => {
        const latitude = stop?.lat ?? stop?.latitude;
        const longitude = stop?.lng ?? stop?.longitude;
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
          return null;
        }
        return {
          latitude,
          longitude,
          index: index + 1,
          label: stop?.address || t('client.homeOffers.extraStopLabel', { index: index + 1 }),
        };
      })
      .filter(Boolean) as Array<{ latitude: number; longitude: number; index: number; label?: string }>;
  }, [rideSnapshot?.extraDestinations, t]);

  useEffect(() => {
    let cancelled = false;

    const normalizePoint = (point: any) => {
      if (!point) return null;
      const latitude = typeof point.lat === 'number' ? point.lat : typeof point.latitude === 'number' ? point.latitude : Number(point.lat ?? point.latitude);
      const longitude = typeof point.lng === 'number' ? point.lng : typeof point.longitude === 'number' ? point.longitude : Number(point.lng ?? point.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { latitude, longitude };
    };

    const computeRoute = async () => {
      const originPoint = normalizePoint(rideSnapshot?.origin || rideSnapshot?.originLocation);
      const destinationPoint = normalizePoint(rideSnapshot?.destination || rideSnapshot?.destinationLocation);
      if (!originPoint || !destinationPoint) {
        setRouteCoordinates([]);
        setLoadingRoute(false);
        return;
      }

      setLoadingRoute(true);
      try {
        const segments: Array<{ latitude: number; longitude: number }> = [];
        let currentPoint = originPoint;
        const targets: Array<{ latitude: number; longitude: number }> = [];

        if (Array.isArray(rideSnapshot?.extraDestinations) && rideSnapshot.extraDestinations.length > 0) {
          rideSnapshot.extraDestinations.forEach((stop: any) => {
            const normalized = normalizePoint(stop);
            if (normalized) targets.push(normalized);
          });
        }
        targets.push(destinationPoint);

        for (const target of targets) {
          const segment = await mapsService.getDirections(currentPoint, target);
          if (cancelled) return;
          if (segment?.polyline?.length) {
            if (segments.length > 0) {
              const last = segments[segments.length - 1];
              const first = segment.polyline[0];
              if (
                Math.abs(last.latitude - first.latitude) < 1e-6 &&
                Math.abs(last.longitude - first.longitude) < 1e-6
              ) {
                segments.push(...segment.polyline.slice(1));
              } else {
                segments.push(...segment.polyline);
              }
            } else {
              segments.push(...segment.polyline);
            }
          } else {
            segments.push(currentPoint, target);
          }
          currentPoint = target;
        }

        if (!cancelled) {
          setRouteCoordinates(segments);
        }
      } catch (error) {
        console.error('[HomeScreenOffers] Error calculando ruta:', error);
        if (!cancelled) {
          setRouteCoordinates([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingRoute(false);
        }
      }
    };

    computeRoute();

    return () => {
      cancelled = true;
    };
  }, [rideSnapshot?.destination, rideSnapshot?.destinationLocation, rideSnapshot?.extraDestinations, rideSnapshot?.origin, rideSnapshot?.originLocation]);

  const negotiationStatusLabel = useCallback(
    (status?: string) => {
      switch (status) {
        case 'client_suggested':
          return t('client.homeOffers.negotiation.status.clientSuggested');
        case 'driver_offered':
          return t('client.homeOffers.negotiation.status.driverOffered');
        case 'driver_accepted':
          return t('client.homeOffers.negotiation.status.driverAccepted');
        case 'client_accepted':
          return t('client.homeOffers.negotiation.status.clientAccepted');
        default:
          return null;
      }
    },
    [t],
  );

  const renderOffer = ({ item }: { item: OfferItem }) => {
    const selected = item.driverId === selectedDriverId;
    const eta = etasByDriver[item.driverId];
    const etaValueText = eta
      ? t('client.homeOffers.list.etaMinutes', { count: eta.etaMins })
      : t('client.homeOffers.list.etaFallback');
    const arrivalLabel = eta
      ? t('client.homeOffers.list.arrivalLabel', { arrival: eta.arrivalLabel, eta: etaValueText })
      : t('client.homeOffers.list.arrivalFallback');
    const plate = item.driver?.vehicle?.plate || '—';
    const clientPrice =
      typeof rideSnapshot?.clientSuggestedPrice === 'number' && rideSnapshot.clientSuggestedPrice > 0
        ? rideSnapshot.clientSuggestedPrice
        : rideSnapshot?.estimatedPrice || rideSnapshot?.estimatedFare || null;
    const driverPrice = typeof item.offeredPrice === 'number' && item.offeredPrice > 0 ? item.offeredPrice : null;
    const info = driversInfo?.[item.driverId] || {};
    const raw = driversRaw?.[item.driverId] || {};
    const vehicleType = extractVehicleTypeFromInfo(info) || extractVehicleTypeFromInfo(raw);
    const ratingNumber = mergeRating(info, raw, item.driver);
    const ratingLabel = ratingNumber !== null && Number.isFinite(ratingNumber) ? ratingNumber.toFixed(1) : null;
    const ratingPrefix = ratingLabel ? t('client.homeOffers.list.ratingPrefix', { rating: ratingLabel }) : '';
    const displayName = mergeName(driverFallbackName, info, raw, item.driver);
    const vehicleIconSource = ensureVehicleIconSource(vehicleType);
    const priceTextColor = selected ? '#ddddddff' : colors.text;
    const priceLabelColor = selected ? 'rgba(255, 255, 255, 1)' : colors.textSecondary;
    const driverPriceLabel = driverPrice
      ? `C$${Number(driverPrice).toFixed(2)}`
      : t('client.homeOffers.list.driverPricePending');
    const clientPriceLabel =
      clientPrice != null ? `C$${Number(clientPrice).toFixed(2)}` : t('client.homeOffers.list.clientPriceMissing');
    const negotiationLabel = negotiationStatusLabel(rideSnapshot?.negotiationStatus);
    return (
      <TouchableOpacity
        onPress={() => handleSelectFromList(item.driverId)}
        style={[styles.offerRow, selected ? styles.offerRowSelected : styles.offerRowDefault]}
        activeOpacity={0.8}
      >
        <View style={styles.offerAvatarWrap}>
          <View style={styles.offerAvatarFrame}>
            {(() => {
              const photoUri = info?.profilePhoto || info?.photoURL || info?.photoUrl || raw?.profilePhoto || raw?.photoURL || raw?.photoUrl || item.driver?.photoURL || null;
              if (photoUri) {
                return (
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.offerAvatarPhoto}
                  />
                );
              }
              return (
                <View style={styles.offerAvatarFallback}> 
                  <Text style={styles.offerAvatarFallbackText}>{(displayName || 'C').charAt(0).toUpperCase()}</Text>
                </View>
              );
            })()}
          </View>
          <Image source={vehicleIconSource} style={styles.offerVehicleOverlay} />
        </View>
        <View style={styles.offerInfo}>
          <Text
            style={[
              styles.offerTitle,
              selected ? styles.offerTitleSelected : styles.offerTitleDefault,
            ]}
            numberOfLines={selected ? 2 : 1}
          >
            {displayName} - {plate}
          </Text>
          <Text
            style={[
              styles.offerSubtitle,
              selected ? styles.offerSubtitleSelected : styles.offerSubtitleDefault,
            ]}
            numberOfLines={2}
          >
            {ratingLabel ? `${ratingPrefix} • ` : ''}
            {arrivalLabel}
          </Text>
          {selected && (
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: priceLabelColor }]}>{t('client.homeOffers.list.priceLabel')}</Text>
              <View style={styles.priceValues}>
                <View style={styles.priceValueGroup}>
                  <Text style={[styles.priceValueLabel, { color: priceLabelColor }]}>
                    {t('client.homeOffers.list.clientPriceLabel')}{' '}
                  </Text>
                  <Text style={[styles.priceValueText, { color: priceTextColor }]}>{clientPriceLabel}</Text>
                </View>
                {/*<Text style={[styles.priceDivider, { color: priceLabelColor }]}>•••</Text>*/}
                <View style={styles.priceValueGroup}>
                  <Text style={[styles.priceValueLabel, { color: priceLabelColor }]}>
                    {t('client.homeOffers.list.driverPriceLabel')}{' '}
                  </Text>
                  <Text style={[styles.priceValueText, { color: priceTextColor }]}>{driverPriceLabel}</Text>
                </View>
              </View>
            </View>
          )}
        </View>
        {selected ? (
          <View style={styles.selectedActions}>
            <TouchableOpacity
              onPress={() => handleMessageDriver(item)}
              style={styles.messageButton}
              activeOpacity={0.9}
            >
              <Text style={styles.iconText}>💬</Text>
            </TouchableOpacity>
            {item.status === 'accepted' ? (
              <Animated.View
                style={[
                  styles.acceptedStatusChip,
                  {
                    transform: [
                      {
                        scale: acceptedAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 1],
                        }),
                      },
                    ],
                    opacity: acceptedAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1],
                    }),
                  },
                ]}
              >
                <Text style={styles.acceptedStatusText}>{t('client.homeOffers.list.acceptedPrimary')}</Text>
              </Animated.View>
            ) : (
              <TouchableOpacity onPress={openNegotiation} style={styles.negotiatePill} activeOpacity={0.9}>
                <Text style={styles.negotiateText}>{t('client.homeOffers.negotiation.pill')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : item.status === 'accepted' ? (
          <View style={styles.acceptedStatusChipSecondary}>
            <Text style={styles.acceptedStatusTextSecondary}>{t('client.homeOffers.list.acceptedSecondary')}</Text>
          </View>
        ) : (
          <Text style={styles.offerEtaText}>{negotiationLabel ?? etaValueText}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={centerLat}
          longitude={centerLng}
          nearbyDrivers={nearbyDrivers}
          onDriverPress={handleDriverPressOnMap}
          showUserLocation
          userLocation={{ latitude: centerLat, longitude: centerLng }}
          userLocationLightIcon={USER_LOCATION_LIGHT_ICON}
          userLocationDarkIcon={USER_LOCATION_DARK_ICON}
          originMarker={originCoords || undefined}
          destinationMarker={destinationCoords || undefined}
          originLabel={rideSnapshot?.origin?.address || rideSnapshot?.originAddress || undefined}
          destinationLabel={rideSnapshot?.destination?.address || rideSnapshot?.destinationAddress || undefined}
          extraStopMarkers={extraStopMarkers}
          showPinBubbles
          autoFitEnabled
          provider="google"
        />
      </View>

      <View style={[styles.sheet, { backgroundColor: colors.card }] }>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{t('client.homeOffers.title')}</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
          </View>
        ) : offers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{t('client.homeOffers.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={offers}
            keyExtractor={(it) => it.driverId}
            renderItem={renderOffer}
            contentContainerStyle={{ paddingBottom: 12 }}
          />
        )}

        <AnimatedTouchableOpacity
          style={[
            styles.primaryBtn,
            {
              backgroundColor: selectedDriverId ? '#D39838' : '#BDBDBD',
              transform: [{ scale: confirmBtnAnim }],
            },
          ]}
          onPress={confirmSelectedDriver}
          disabled={!selectedDriverId || isConfirming}
          activeOpacity={0.85}
        >
          {isConfirming ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>{primaryActionLabel}</Text>
          )}
        </AnimatedTouchableOpacity>

        <AnimatedTouchableOpacity
          style={[
            styles.cancelBtn,
            {
              backgroundColor: '#E53935',
              transform: [{ scale: cancelBtnAnim }],
              opacity: isCancelling ? 0.7 : 1,
            },
          ]}
          onPress={cancelSearch}
          disabled={isCancelling}
          activeOpacity={0.85}
        >
          {isCancelling ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.cancelBtnText}>{t('client.homeOffers.buttons.cancelSearch')}</Text>
          )}
        </AnimatedTouchableOpacity>
      </View>

      {/* Modal de Negociación */}
      <PriceNegotiationModal
        visible={showNegotiation}
        onClose={() => setShowNegotiation(false)}
        driver={{
          id: selectedOffer?.driverId,
          name: selectedOffer?.driver?.name,
          rating: typeof selectedOffer?.driver?.rating === 'number' ? selectedOffer?.driver?.rating as number : undefined,
        }}
        estimatedPrice={rideSnapshot?.estimatedPrice || rideSnapshot?.estimatedFare || 0}
        clientSuggestedPrice={rideSnapshot?.clientSuggestedPrice}
        driverOfferedPrice={selectedOffer?.offeredPrice || 0}
        negotiationStatus={rideSnapshot?.negotiationStatus}
        acceptedClientPrice={rideSnapshot?.acceptedClientPrice}
        onAcceptDriverOffer={async () => {
          if (!rideId || !selectedOffer) return;
          try {
            await priceNegotiationService.acceptDriverOffer(
              rideId,
              selectedOffer.driverId,
              selectedOffer.offeredPrice || 0,
            );
            // Confirm driver after accepting price
            await ridesService.confirmDriver(rideId, selectedOffer.driverId);
            setShowNegotiation(false);
            if (navigation?.replace) {
              navigation.replace('RideTracking', {
                rideId,
                driverId: selectedOffer.driverId,
                driverName: selectedOffer.driver?.name || driverFallbackName,
              });
            } else {
              navigation?.navigate?.('RideTracking', {
                rideId,
                driverId: selectedOffer.driverId,
                driverName: selectedOffer.driver?.name || driverFallbackName,
              });
            }
          } catch (e: any) {
            alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.acceptOfferError'));
          }
        }}
        onSendCounterOffer={async (price: number) => {
          if (!rideId || !selectedOffer) return;
          try {
            await priceNegotiationService.negotiatePrice(
              rideId,
              price,
              'client',
              rideSnapshot?.estimatedPrice || rideSnapshot?.estimatedFare || 0,
            );
          } catch (e: any) {
            alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.counterOfferError'));
          }
        }}
        onAcceptAndStartRide={async () => {
          if (!rideId || !selectedOffer) return;
          try {
            await ridesService.confirmDriver(rideId, selectedOffer.driverId);
            setShowNegotiation(false);
            navigation.navigate('RideTracking', {
              rideId,
              driverId: selectedOffer.driverId,
              driverName: selectedOffer?.driver?.name || 'Conductor',
            });
          } catch (e: any) {
            alertService.showErrorAlert(e?.message || t('client.homeOffers.alerts.confirmFromModalError'));
          }
        }}
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapContainer: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 15,
    paddingBottom: 6,
  },
  loadingBox: { paddingVertical: 20, alignItems: 'center', borderRadius: 22 },
  emptyBox: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { color: colors.textSecondary, borderRadius: 42 },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 20,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  offerRowDefault: {
    backgroundColor: colors.surface,
    borderColor: '#EFBC06',
  },
  offerRowSelected: {
    backgroundColor: '#D39838',
    borderColor: 'rgba(185, 121, 37, 0.12)',
  },
  offerAvatarWrap: {
    width: 70,
    height: 70,
    marginRight: 10,
    position: 'relative',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  offerAvatarFrame: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#D1D5DB',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  offerAvatarPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  offerAvatarFallback: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#E5E7EB' },
  offerAvatarFallbackText: { color: '#64748B', fontWeight: '700', fontSize: 18 },
  offerVehicleOverlay: {
    position: 'absolute',
    bottom: -25,
    left: '50%',
    transform: [{ translateX: -25 }, { rotate: '90deg' }],
    width: 52,
    height: 52,
    resizeMode: 'contain',
  },
  offerInfo: { flex: 1, paddingRight: 8 },
  offerTitle: { fontSize: 18, fontWeight: '800' },
  offerTitleDefault: { color: colors.text },
  offerTitleSelected: { color: '#FFFFFFFF' },
  offerSubtitle: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  offerSubtitleDefault: { color: colors.textSecondary },
  offerSubtitleSelected: { color: '#E5E7EB' },
  offerEtaText: { fontSize: 13, fontWeight: '700', color: colors.text, marginLeft: 8 },
  priceRow: { marginTop: 4 },
  priceLabel: { fontSize: 16, fontWeight: '700' },
  priceValues: {
    flexDirection: 'row',
    //alignItems: 'center',
    marginLeft: -70,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  priceValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
  },
  priceValueLabel: { fontSize: 16, fontWeight: '600' },
  priceValueText: { fontSize: 16, fontWeight: '800' },
  priceDivider: { fontSize: 12, fontWeight: '600' },
  negotiatePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#8330c7ff',
    paddingBottom: 8,
  },
  negotiateText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13},
  selectedActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginTop: 8,
    gap: 8,
  },
  messageButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 10,
  },
  iconText: {
    fontSize: 20,
  },
  messageButtonText: {
    color: '#00000060',
    fontWeight: '700',
    fontSize: 13,
  },
  routeLoadingBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeLoadingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  acceptedStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(33, 150, 83, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 83, 0.45)',
    marginVertical: '10%',
  },
  acceptedStatusText: { color: '#166534', fontWeight: '700', fontSize: 13 },
  acceptedStatusChipSecondary: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(33, 150, 83, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 83, 0.35)',
    marginVertical: 20,
  },
  acceptedStatusTextSecondary: { 
    color: '#166534', 
    fontWeight: '600', 
    fontSize: 11
  },

  primaryBtn: {
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 28,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 28,
  },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 18 },
});
