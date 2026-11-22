import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useLocation } from '../../hooks/shared/location/useLocation';
import DynamicMap from '../../components/map/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';
import PriceNegotiationModal from '../../components/client/HomeScreenOffers/PriceNegotiationModal';
import DriverReviewsModal from '../../components/client/HomeScreenOffers/DriverReviewsModal';
import { useRideOffers, type OfferItem } from '../../hooks/client/HomeScreenOffers/useRideOffers';
import { useDriverLocations } from '../../hooks/client/HomeScreenOffers/useDriverLocations';
import { useDriverPublicInsights } from '../../hooks/client/HomeScreenOffers/useDriverPublicInsights';
import { useOfferETAs } from '../../hooks/client/HomeScreenOffers/useOfferETAs';
import { usePriceNegotiationClient } from '../../hooks/client/HomeScreenOffers/usePriceNegotiationClient';
import { useProgrammedRideLive } from '../../hooks/client/HomeScreenOffers/useProgrammedRideLive';
import { useFirebaseItem } from '../../hooks/shared/firebase/useFirebaseData';
import { FS_COL } from '../../constants/firestore';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/driver/vehicleIcons';
import { getPreflightResult } from '../../stores/preflightStore';
import { RIDES_RADIUS_KM } from '../../constants/rideRadius';
import {
  extractCoordinateFromSource,
  type LatLngPoint,
} from '../../utils/geo/coordinates';
import { mergeName } from '../../utils/driver/driverInfo';
import { mergeRating } from '../../utils/ride/rating';
import {
  firstPositivePrice,
  resolveNegotiationBasePrice,
} from '../../utils/ride/pricing';
import { haversineKm } from '../../utils/geo/distance';
import notificationService from '../../services/notification/notificationService';
import { HomeScreenOffersOfferCard } from '../../components/client/HomeScreenOffers/HomeScreenOffersOfferCard';
import { HomeScreenOffersBottomSheet } from '../../components/client/HomeScreenOffers/HomeScreenOffersBottomSheet';
import { HomeScreenOffersHint } from '../../components/client/HomeScreenOffers/HomeScreenOffersHint';
import { CancelSearchSheet } from '../../components/client/HomeScreenOffers/CancelSearchSheet';
import { useRideFlowTransition } from '../../hooks/client/useRideFlowTransition';
import { isDesignatedRideRequest } from '../../utils/ride/availableRidesHelpers';

const { USER_LOCATION_LIGHT, USER_LOCATION_DARK } = MAP_ICONS;
const MAX_DRIVER_RADIUS_KM = typeof RIDES_RADIUS_KM === 'number' ? RIDES_RADIUS_KM : 6;

interface ProgrammedRideParams {
  driverId?: string;
  driver?: any;
  scheduledAt?: number;
  origin?: { lat?: number; lng?: number; address?: string };
  destination?: { lat?: number; lng?: number; address?: string };
}

interface Props {
  navigation: any;
  route?: { params?: { rideId?: string; programmedRide?: ProgrammedRideParams } };
}

export default function HomeScreenOffers({ navigation, route }: Props) {
  const rideTransition = useRideFlowTransition();
  const { t } = useTranslation();
  const driverFallbackName = t('common.roles.driver');
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords } = useLocation();
  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.region;
  const [serviceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);
  const { driverLocations } = useDriverLocations(serviceAreaId);
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [showDriverReviews, setShowDriverReviews] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [driverCameraTarget, setDriverCameraTarget] = useState<LatLngPoint | null>(null);
  const [bottomSheetHeight, setBottomSheetHeight] = useState(0);

  const {
    rideId,
    offers,
    selectedDriverId,
    setSelectedDriverId,
    loading,
    error: offersError,
    retry: retryOffers,
    rideSnapshot,
    driversInfo: offerDriversInfo,
    driversRaw,
    reset: resetRideOffers,
  } = useRideOffers(route?.params?.rideId || null, user?.id, serviceAreaId, driverFallbackName);

  useEffect(() => {
    if (offersError || !rideSnapshot?.id || offers.length === 0) return;
    if (offers.some((offer) => offer.lastOfferBy !== 'client')) return;
    void notificationService.dismissRideOfferNotification(rideSnapshot.id);
  }, [offers, offersError, rideSnapshot?.id]);

  useEffect(() => {
    setDriverCameraTarget(null);
  }, [rideId]);

  const programmedRide = route?.params?.programmedRide;

  // Listener en vivo del viaje programado: los params de navegación son
  // estáticos, así que driverConfirmed/status/driver solo se actualizan si
  // escuchamos programmedRides/{rideId} directamente. Al promoverse (o al
  // cancelarse) el nodo desaparece y rideSnapshot (activeRides) toma el control.
  const programmedRideLive = useProgrammedRideLive(rideId, user?.id, !!programmedRide);

  const effectiveProgrammedRide = useMemo(() => {
    if (!programmedRide && !programmedRideLive) return null;
    return { ...(programmedRide || {}), ...(programmedRideLive || {}) };
  }, [programmedRide, programmedRideLive]);
  useEffect(() => {
    if (programmedRideLive?.status === 'promoted' && programmedRideLive?.rideId) retryOffers();
  }, [programmedRideLive?.status, programmedRideLive?.rideId, retryOffers]);
  const showOffersError = !!offersError && (!programmedRide || effectiveProgrammedRide?.status === 'promoted');
  const assignedDriverId = effectiveProgrammedRide?.driverId;
  const { data: assignedProfile } = useFirebaseItem<any>(FS_COL.driverPublic, assignedDriverId, {
    enabled: !!user?.id && !!assignedDriverId && !offerDriversInfo?.[assignedDriverId],
  });
  const driversInfo = useMemo(() => assignedDriverId && assignedProfile
    ? { ...offerDriversInfo, [assignedDriverId]: assignedProfile }
    : offerDriversInfo, [offerDriversInfo, assignedDriverId, assignedProfile]);

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

  // Si el conductor se puso offline, su oferta deja de ser válida al instante
  // (el trigger backend la marca 'rejected'; esto la oculta sin esperarlo).
  // Solo se descarta cuando el status es explícitamente 'offline' — si el
  // driver no está en el shard o el dato no cargó, la oferta se conserva.
  const visibleOffers = useMemo(() => {
    if (!driverLocations || typeof driverLocations !== 'object') return offers;
    return offers.filter((offer) => {
      const status = driverLocations?.[offer.driverId]?.status;
      return typeof status !== 'string' || status.toLowerCase() !== 'offline';
    });
  }, [offers, driverLocations]);

  useEffect(() => {
    if (selectedDriverId && !visibleOffers.some((o) => o.driverId === selectedDriverId)) {
      setSelectedDriverId(null);
      setDriverCameraTarget(null);
    }
  }, [visibleOffers, selectedDriverId, setSelectedDriverId]);

  const selectedOffer: OfferItem | undefined = useMemo(
    () => visibleOffers.find(o => o.driverId === selectedDriverId),
    [visibleOffers, selectedDriverId],
  );

  const { insights: driverPublicInsights, reviewsData: selectedDriverReviewsData } =
    useDriverPublicInsights(
      selectedOffer?.driverId,
      driversInfo,
      driversRaw,
      null,
      t,
    );

  const selectedDriverPhotoUri = useMemo(() => {
    if (!selectedOffer) return null;
    const info = driversInfo?.[selectedOffer.driverId] || {};
    const raw = driversRaw?.[selectedOffer.driverId] || {};
    return (
      info?.profilePhoto ||
      info?.photoURL ||
      info?.photoUrl ||
      raw?.profilePhoto ||
      raw?.photoURL ||
      raw?.photoUrl ||
      selectedOffer.driver?.photoURL ||
      null
    );
  }, [selectedOffer, driversInfo, driversRaw]);

  const negotiationBasePrice = useMemo(
    () => resolveNegotiationBasePrice(rideSnapshot, selectedOffer),
    [rideSnapshot, selectedOffer],
  );

  const primaryActionLabel = useMemo(() => {
    if (!selectedOffer) {
      return t('client.homeOffers.primaryAction.select');
    }

    if (selectedOffer.status === 'accepted') {
      return t('client.homeOffers.primaryAction.confirmDriver');
    }

    // El precio del conductor vive en SU oferta (pending hasta que el
    // cliente confirme — 'accepted' solo llega post-confirmación).
    const hasDriverPrice =
      typeof selectedOffer.offeredPrice === 'number' && selectedOffer.offeredPrice > 0;
    const clientPrice = firstPositivePrice(
      selectedOffer.clientSuggestedPrice,
      rideSnapshot?.clientSuggestedPrice,
      rideSnapshot?.negotiation?.clientSuggestedPrice,
    );
    const hasEstimatedPrice =
      typeof (rideSnapshot?.estimatedPrice ?? rideSnapshot?.estimatedFare) === 'number';

    if (hasDriverPrice) {
      return t('client.homeOffers.primaryAction.confirmDriverPrice');
    }

    if (clientPrice != null) {
      return t('client.homeOffers.primaryAction.confirmClientPrice');
    }

    if (hasEstimatedPrice) {
      return t('client.homeOffers.primaryAction.confirmEstimate');
    }

    return t('client.homeOffers.primaryAction.select');
  }, [
    selectedOffer,
    rideSnapshot?.clientSuggestedPrice,
    rideSnapshot?.negotiation,
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

  const {
    onAcceptDriverOffer,
    onSendCounterOffer,
    onAcceptAndStartRide,
    cancelSearch: cancelSearchBase,
    confirmSelectedDriver: confirmSelectedDriverBase,
  } = usePriceNegotiationClient(
    rideId,
    selectedOffer,
    rideSnapshot,
    negotiationBasePrice,
    driverFallbackName,
    navigation,
    t,
    resetRideOffers,
  );

  const proposalStepper = useMemo(() => {
    if (programmedRide || !rideId || negotiationBasePrice == null) return null;
    return {
      currentPrice: firstPositivePrice(
        selectedOffer?.clientSuggestedPrice,
        rideSnapshot?.clientSuggestedPrice,
        rideSnapshot?.negotiation?.clientSuggestedPrice,
      ) ?? negotiationBasePrice,
      minPrice: Math.max(1, negotiationBasePrice),
      maxPrice: 100000,
      step: 5,
      onSend: onSendCounterOffer,
    };
  }, [
    programmedRide,
    rideId,
    negotiationBasePrice,
    selectedOffer?.clientSuggestedPrice,
    rideSnapshot?.clientSuggestedPrice,
    rideSnapshot?.negotiation?.clientSuggestedPrice,
    onSendCounterOffer,
  ]);

  const confirmSelectedDriver = useCallback(async () => {
    if (!rideId || !selectedDriverId || isConfirming) return;
    setIsConfirming(true);
    Animated.timing(confirmBtnAnim, {
      toValue: 0.95,
      duration: 120,
      useNativeDriver: true,
    }).start();
    try {
      await confirmSelectedDriverBase(selectedDriverId);
      setShowNegotiation(false);
    } catch (e: any) {
      console.error('Error confirming driver', e);
    } finally {
      Animated.timing(confirmBtnAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      setIsConfirming(false);
    }
  }, [confirmBtnAnim, isConfirming, rideId, selectedDriverId, confirmSelectedDriverBase]);

  const cancelSearch = useCallback(async (reason: string) => {
    if (!rideId || isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);
    Animated.timing(cancelBtnAnim, {
      toValue: 0.95,
      duration: 120,
      useNativeDriver: true,
    }).start();
    try {
      await cancelSearchBase(reason);
    } catch (error: any) {
      setCancelError(error?.message || t('client.homeOffers.alerts.cancelError'));
    } finally {
      Animated.timing(cancelBtnAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      setIsCancelling(false);
    }
  }, [rideId, isCancelling, cancelBtnAnim, cancelSearchBase, t]);

  // Location to center map
  const centerLat = coords?.latitude ?? rideSnapshot?.origin?.lat ?? programmedRide?.origin?.lat ?? 12.1364;
  const centerLng = coords?.longitude ?? rideSnapshot?.origin?.lng ?? programmedRide?.origin?.lng ?? -86.2514;

  // Coordinates for map pins (caen en programmedRide mientras el viaje no se
  // haya promovido a activeRides y rideSnapshot siga vacío)
  const originCoords = useMemo(() => {
    const origin = rideSnapshot?.origin || rideSnapshot?.originLocation || programmedRide?.origin;
    if (!origin) return null;
    const latitude = origin.lat ?? origin.latitude;
    const longitude = origin.lng ?? origin.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
    return null;
  }, [rideSnapshot?.origin, rideSnapshot?.originLocation, programmedRide?.origin]);

  const destinationCoords = useMemo(() => {
    const destination = rideSnapshot?.destination || rideSnapshot?.destinationLocation || programmedRide?.destination;
    if (!destination) return null;
    const latitude = destination.lat ?? destination.latitude;
    const longitude = destination.lng ?? destination.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
    return null;
  }, [rideSnapshot?.destination, rideSnapshot?.destinationLocation, programmedRide?.destination]);

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
          title: t('common.mapPins.extraStop', { index: index + 1 }),
          label: stop?.address || undefined,
        };
      })
      .filter(Boolean) as Array<{ latitude: number; longitude: number; index: number; title?: string; label?: string }>;
  }, [rideSnapshot?.extraDestinations, t]);

  const mapCenterPoint = useMemo<LatLngPoint | null>(() => {
    if (originCoords) {
      return originCoords;
    }
    if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      return { latitude: centerLat, longitude: centerLng };
    }
    return null;
  }, [originCoords, centerLat, centerLng]);

  const filteredDriverLocations = useMemo(() => {
    if (!driverLocations || typeof driverLocations !== 'object') {
      return driverLocations;
    }

    const allowedOfferIds = new Set(visibleOffers?.map((offer) => offer.driverId) ?? []);
    const center = mapCenterPoint;
    const includeByRadius = !!center;

    const trimmed = Object.entries(driverLocations).reduce<Record<string, any>>((acc, [driverId, location]) => {
      // Un conductor offline no es una opción real: ni en el mapa ni en ofertas.
      const status = typeof location?.status === 'string' ? location.status.toLowerCase() : null;
      if (status === 'offline') {
        return acc;
      }
      if (allowedOfferIds.has(driverId)) {
        acc[driverId] = location;
        return acc;
      }
      if (!includeByRadius) {
        return acc;
      }
      const lat = extractCoordinateFromSource(location, 'lat');
      const lng = extractCoordinateFromSource(location, 'lng');
      if (lat === null || lng === null) {
        return acc;
      }
      const distanceKm = haversineKm(center!.latitude, center!.longitude, lat, lng);
      if (distanceKm <= MAX_DRIVER_RADIUS_KM) {
        acc[driverId] = location;
      }
      return acc;
    }, {});

    return Object.keys(trimmed).length > 0 ? trimmed : null;
  }, [driverLocations, mapCenterPoint, visibleOffers]);

  const getDriverCoordinate = useCallback(
    (driverId: string, axis: 'lat' | 'lng'): number | null => {
      if (!driverId) return null;
      const sources = [
        filteredDriverLocations?.[driverId],
        driverLocations?.[driverId],
        driversInfo?.[driverId],
        driversRaw?.[driverId],
      ];
      for (const source of sources) {
        const parsed = extractCoordinateFromSource(source, axis);
        if (parsed !== null) return parsed;
      }
      return null;
    },
    [filteredDriverLocations, driverLocations, driversInfo, driversRaw],
  );

  const nearbyDrivers = useMemo(() => {
    if (!visibleOffers || visibleOffers.length === 0) return [];

    return visibleOffers
      .map((offer) => {
        const latitude = getDriverCoordinate(offer.driverId, 'lat');
        const longitude = getDriverCoordinate(offer.driverId, 'lng');
        if (latitude === null || longitude === null) {
          return null;
        }
        const locationSource = filteredDriverLocations?.[offer.driverId] || driverLocations?.[offer.driverId];

        const info = driversInfo?.[offer.driverId] || {};
        const raw = driversRaw?.[offer.driverId] || {};
        const type = extractVehicleTypeFromInfo(info) || extractVehicleTypeFromInfo(raw);
        const ratingParsed = mergeRating(info, raw, offer.driver);
        const isSelected = offer.driverId === selectedDriverId;

        return {
          id: offer.driverId,
          latitude,
          longitude,
          heading:
            typeof locationSource?.heading === 'number' && Number.isFinite(locationSource.heading)
              ? locationSource.heading
              : undefined,
          vehicleIconSource: ensureVehicleIconSource(type),
          isSelected,
          rating: (ratingParsed !== null && Number.isFinite(ratingParsed) ? ratingParsed : null) as number | null,
          photoURL:
            (info?.profilePhoto ||
              info?.photoURL ||
              info?.photoUrl ||
              raw?.profilePhoto ||
              raw?.photoURL ||
              raw?.photoUrl ||
              offer.driver?.photoURL ||
              null) as string | null,
        };
      })
      .filter((driver): driver is NonNullable<typeof driver> => !!driver);
  }, [
    visibleOffers,
    getDriverCoordinate,
    filteredDriverLocations,
    driverLocations,
    driversInfo,
    driversRaw,
    selectedDriverId,
  ]);

  const etasByDriver = useOfferETAs(visibleOffers, getDriverCoordinate, originCoords);

  const handleSelectFromList = (driverId: string) => {
    if (selectedDriverId === driverId) {
      setSelectedDriverId(null);
      setDriverCameraTarget(null);
      return;
    }

    setSelectedDriverId(driverId);
    const latitude = getDriverCoordinate(driverId, 'lat');
    const longitude = getDriverCoordinate(driverId, 'lng');
    if (latitude !== null && longitude !== null) {
      setDriverCameraTarget({ latitude, longitude });
    } else {
      setDriverCameraTarget(null);
    }
  };

  const driverDistanceLine = useMemo(() => {
    if (!originCoords || !driverCameraTarget) return [];
    if (
      haversineKm(
        originCoords.latitude,
        originCoords.longitude,
        driverCameraTarget.latitude,
        driverCameraTarget.longitude,
      ) < 0.03
    ) {
      return [];
    }
    return [originCoords, driverCameraTarget];
  }, [originCoords, driverCameraTarget]);

  const cameraFitCoordinates = useMemo(() => {
    if (!driverCameraTarget) return undefined;
    return originCoords ? [originCoords, driverCameraTarget] : [driverCameraTarget];
  }, [originCoords, driverCameraTarget]);

  // Conductor ya asignado al viaje programado (aún no promovido a activeRides
  // o sin oferta registrada): se muestra como card fija sobre la lista.
  const assignedDriver = useMemo(() => {
    const driverId = effectiveProgrammedRide?.driverId;
    if (!driverId) return null;
    if (visibleOffers.some((offer) => offer.driverId === driverId)) return null;
    const info = driversInfo?.[driverId] || {};
    const raw = driversRaw?.[driverId] || {};
    const driverData = effectiveProgrammedRide?.driver;
    const name = mergeName(driverFallbackName, info, raw, driverData);
    const rating = mergeRating(info, raw, driverData);
    const photoUri =
      info?.profilePhoto || info?.photoURL || info?.photoUrl ||
      raw?.profilePhoto || raw?.photoURL || raw?.photoUrl ||
      driverData?.profilePhoto || driverData?.photoURL || driverData?.photoUrl || null;
    const plate =
      info?.vehicle?.plate || info?.activeVehicle?.plate || info?.currentVehicle?.plate ||
      raw?.vehicle?.plate || driverData?.vehicle?.plate || null;
    const driverConfirmed = Boolean(
      effectiveProgrammedRide?.driverConfirmed ||
        effectiveProgrammedRide?.driverConfirmedAt ||
        effectiveProgrammedRide?.status === 'driver_confirmed',
    );
    return {
      driverId,
      name,
      rating: rating !== null && Number.isFinite(rating) ? rating : null,
      photoUri,
      plate,
      driverConfirmed,
      scheduledAt: effectiveProgrammedRide?.scheduledAt ?? null,
    };
  }, [effectiveProgrammedRide, visibleOffers, driversInfo, driversRaw, driverFallbackName]);

  // Cuando el viaje programado se promueve a activeRides como accepted (driver
  // confirmado), el cliente debe pasar a la pantalla de tracking — igual que
  // handleViewActiveRide en Home. Solo aplica cuando esta pantalla se abrió
  // para un viaje programado.
  useEffect(() => {
    if (!programmedRide) return;
    const status = String(rideSnapshot?.status || '').toLowerCase();
    if (!['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)) return;
    if (!rideSnapshot?.driverId && !rideSnapshot?.driver?.id) return;

    navigation.replace('RideTracking', {
      rideId,
      driverId: rideSnapshot.driverId ?? rideSnapshot.driver?.id,
      driverName: rideSnapshot.driver?.name || rideSnapshot.driverName || assignedDriver?.name || 'Conductor',
      vehiclePlate:
        rideSnapshot.vehicle?.plate ||
        rideSnapshot.driver?.vehicle?.plate ||
        assignedDriver?.plate ||
        'N/A',
      vehicleBrand: rideSnapshot.vehicle?.make || rideSnapshot.vehicle?.brand || 'N/A',
      vehicleModel: rideSnapshot.vehicle?.model || 'N/A',
      vehicleColor: rideSnapshot.vehicle?.color || 'N/A',
      estimatedFare: rideSnapshot.finalFare || rideSnapshot.estimatedPrice || 0,
      showDesignatedDriverEvidenceNotice:
        String(rideSnapshot.rideType || effectiveProgrammedRide?.rideType || '').toLowerCase() === 'designated_driver' ||
        String(rideSnapshot.vehicleType || effectiveProgrammedRide?.vehicleType || '').toLowerCase() === 'designated_driver',
    });
  }, [programmedRide, rideSnapshot, rideId, navigation, assignedDriver, effectiveProgrammedRide]);

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
      ? t('client.homeOffers.list.arrivalTimeLabel', { arrival: eta.arrivalLabel })
      : t('client.homeOffers.list.arrivalFallback');
    const plate = item.driver?.vehicle?.plate || '—';
    const clientPrice = firstPositivePrice(
      item.clientSuggestedPrice,
      rideSnapshot?.clientSuggestedPrice,
      rideSnapshot?.negotiation?.clientSuggestedPrice,
      rideSnapshot?.estimatedPrice,
      rideSnapshot?.estimatedFare,
    );
    const driverPrice = firstPositivePrice(
      item.offeredPrice,
      rideSnapshot?.driverOfferedPrice,
      rideSnapshot?.negotiation?.driverOfferedPrice,
    );
    // 'accepted' del doc de oferta = cliente confirmó (backend solo proyecta
    // 'accepted' tras asignación). Contraoferta al precio exacto del cliente
    // = el conductor aceptó su oferta — pendiente de confirmación.
    // Se compara contra clientPrice (con fallback al estimado): cuando el
    // cliente nunca sugirió precio, el doc de oferta omite
    // clientSuggestedPrice y el conductor que acepta el estimado debe verse
    // igualmente como "aceptó tu oferta".
    const driverAcceptedMyPrice =
      item.status !== 'accepted' &&
      driverPrice != null &&
      clientPrice != null &&
      Math.abs(driverPrice - clientPrice) < 0.01;
    const info = driversInfo?.[item.driverId] || {};
    const raw = driversRaw?.[item.driverId] || {};
    const vehicleType = extractVehicleTypeFromInfo(info) || extractVehicleTypeFromInfo(raw);
    const ratingNumber = mergeRating(info, raw, item.driver);
    const ratingLabel = ratingNumber !== null && Number.isFinite(ratingNumber) ? ratingNumber.toFixed(1) : null;
    const displayName = mergeName(driverFallbackName, info, raw, item.driver);
    const photoUri = info?.profilePhoto || info?.photoURL || info?.photoUrl || raw?.profilePhoto || raw?.photoURL || raw?.photoUrl || item.driver?.photoURL || null;
    const clientPriceLabel =
      clientPrice != null ? `C$${clientPrice.toFixed(2)}` : t('client.homeOffers.list.clientPriceMissing');
    const driverPriceLabel = driverPrice
      ? `C$${driverPrice.toFixed(2)}`
      : t('client.homeOffers.list.driverPricePending');
    const clientWasLastToOffer = item.lastOfferBy === 'client';
    const currentHeaderPrice = clientWasLastToOffer ? clientPrice : driverPrice ?? clientPrice;
    const previousHeaderPrice = clientWasLastToOffer ? driverPrice : driverPrice != null ? clientPrice : null;
    const currentPriceLabel = currentHeaderPrice != null
      ? `C$${currentHeaderPrice.toFixed(2)}`
      : t('client.homeOffers.list.driverPricePending');
    const previousPriceLabel =
      previousHeaderPrice != null &&
      currentHeaderPrice != null &&
      Math.abs(previousHeaderPrice - currentHeaderPrice) >= 0.01
        ? `C$${previousHeaderPrice.toFixed(2)}`
        : null;
    const offerCaption = clientWasLastToOffer
      ? t('client.homeOffers.list.clientCounterofferCaption')
      : driverPrice != null
        ? t('client.homeOffers.list.driverOfferCaption')
        : t('client.homeOffers.list.priceLabel');
    const negotiationLabel = item.status === 'accepted'
      ? null
      : driverAcceptedMyPrice
        ? negotiationStatusLabel('driver_accepted')
        : driverPrice != null
          ? negotiationStatusLabel('driver_offered')
          : negotiationStatusLabel(rideSnapshot?.negotiationStatus);

    return (
      <HomeScreenOffersOfferCard
        item={item}
        selected={selected}
        isDark={isDark}
        colors={colors}
        arrivalLabel={arrivalLabel}
        etaLabel={etaValueText}
        plate={plate}
        clientPriceLabel={clientPriceLabel}
        driverPriceLabel={driverPriceLabel}
        currentPriceLabel={currentPriceLabel}
        currentPricePending={currentHeaderPrice == null}
        previousPriceLabel={previousPriceLabel}
        offerCaption={offerCaption}
        hasDriverPrice={driverPrice != null}
        negotiationLabel={negotiationLabel}
        driverAcceptedMyPrice={driverAcceptedMyPrice}
        confirming={isConfirming}
        displayName={displayName}
        vehicleType={vehicleType}
        ratingLabel={ratingLabel}
        photoUri={photoUri}
        isDesignatedRide={isDesignatedRideRequest(rideSnapshot) || isDesignatedRideRequest(effectiveProgrammedRide)}
        acceptedAnim={acceptedAnim}
        onSelect={() => handleSelectFromList(item.driverId)}
        onMessageDriver={() => handleMessageDriver(item)}
        onOpenNegotiation={openNegotiation}
        onConfirmDriver={confirmSelectedDriver}
        styles={styles}
        t={t}
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={centerLat}
          longitude={centerLng}
          nearbyDrivers={nearbyDrivers}
          driverRadar
          onDriverPress={handleSelectFromList}
          showUserLocation={false}
          userLocationLightIcon={USER_LOCATION_LIGHT}
          userLocationDarkIcon={USER_LOCATION_DARK}
          originMarker={originCoords || undefined}
          destinationMarker={destinationCoords || undefined}
          distanceLineCoordinates={driverDistanceLine}
          cameraFitCoordinates={cameraFitCoordinates}
          allowRouteZoomOut
          fitEdgePadding={{
            top: 120,
            right: 48,
            bottom: bottomSheetHeight ? bottomSheetHeight + 16 : 260,
            left: 48,
          }}
          originTitle={t('common.mapPins.origin')}
          destinationTitle={t('common.mapPins.destination')}
          originLabel={rideSnapshot?.origin?.address || rideSnapshot?.originAddress || programmedRide?.origin?.address || undefined}
          destinationLabel={rideSnapshot?.destination?.address || rideSnapshot?.destinationAddress || programmedRide?.destination?.address || undefined}
          extraStopMarkers={extraStopMarkers}
          showPinBubbles
          autoFitEnabled
        />
      </View>

      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, rideTransition.topStyle]}>
      {!showOffersError && (
        <HomeScreenOffersHint
          hasOffers={visibleOffers.length > 0}
          hasSelection={!!selectedOffer}
          isDark={isDark}
          styles={styles}
          t={t}
        />
      )}
      </Animated.View>

      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, rideTransition.bottomStyle]}>
      <HomeScreenOffersBottomSheet
        loading={loading}
        error={showOffersError}
        onRetry={retryOffers}
        offers={visibleOffers}
        assignedDriver={assignedDriver}
        selectedDriverId={selectedDriverId}
        selectedOffer={selectedOffer}
        isConfirming={isConfirming}
        isCancelling={isCancelling}
        confirmBtnAnim={confirmBtnAnim}
        cancelBtnAnim={cancelBtnAnim}
        primaryActionLabel={primaryActionLabel}
        colors={colors}
        isDark={isDark}
        renderOffer={renderOffer}
        onShowDriverReviews={() => setShowDriverReviews(true)}
        onConfirmSelectedDriver={confirmSelectedDriver}
        onCancelSearch={() => {
          setCancelError(null);
          setShowCancelSheet(true);
        }}
        proposal={proposalStepper}
        onHeightChange={(height) => setBottomSheetHeight((current) => (
          current === height ? current : height
        ))}
        styles={styles}
        t={t}
      />
      </Animated.View>

      <CancelSearchSheet
        visible={showCancelSheet}
        busy={isCancelling}
        hasOffers={visibleOffers.length > 0}
        error={cancelError}
        onClose={() => setShowCancelSheet(false)}
        onConfirm={cancelSearch}
      />

      {/* Modal de Negociación */}
      <PriceNegotiationModal
        visible={showNegotiation}
        onClose={() => setShowNegotiation(false)}
        driver={{
          id: selectedOffer?.driverId,
          name: selectedOffer?.driver?.name,
          rating: typeof selectedOffer?.driver?.rating === 'number' ? selectedOffer?.driver?.rating as number : undefined,
        }}
        estimatedPrice={
          rideSnapshot?.estimatedPrice ||
          rideSnapshot?.estimatedFare ||
          negotiationBasePrice ||
          0
        }
        clientSuggestedPrice={
          firstPositivePrice(
            rideSnapshot?.clientSuggestedPrice,
            rideSnapshot?.negotiation?.clientSuggestedPrice,
          ) ?? undefined
        }
        driverOfferedPrice={
          firstPositivePrice(
            selectedOffer?.offeredPrice,
            rideSnapshot?.driverOfferedPrice,
            rideSnapshot?.negotiation?.driverOfferedPrice,
          ) ?? 0
        }
        dynamicMinimumFare={
          typeof rideSnapshot?.pricingSnapshot?.dynamicMinimumFare === 'number'
            ? rideSnapshot.pricingSnapshot.dynamicMinimumFare
            : undefined
        }
        negotiationStatus={rideSnapshot?.negotiationStatus}
        acceptedClientPrice={rideSnapshot?.acceptedClientPrice}
        onAcceptDriverOffer={async () => {
          await onAcceptDriverOffer();
          setShowNegotiation(false);
        }}
        onSendCounterOffer={onSendCounterOffer}
        onAcceptAndStartRide={async () => {
          await onAcceptAndStartRide();
          setShowNegotiation(false);
        }}
      />

      <DriverReviewsModal
        visible={showDriverReviews}
        onClose={() => setShowDriverReviews(false)}
        driverName={selectedOffer?.driver?.name || driverFallbackName}
        driverPhoto={selectedDriverPhotoUri}
        rating={
          typeof driverPublicInsights?.stats?.averageRating === 'number'
            ? driverPublicInsights.stats.averageRating
            : (selectedOffer?.driver?.rating ?? null)
        }
        ridesCount={selectedDriverReviewsData.ridesCount}
        yearsWithApp={selectedDriverReviewsData.yearsWithApp}
        available={selectedDriverReviewsData.available}
        compliments={selectedDriverReviewsData.compliments}
        reviews={selectedDriverReviewsData.reviews}
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingTop: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
    boxShadow: '0px -8px 20px rgba(0, 0, 0, 0.18)',
    elevation: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.text,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 0.2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  loadingBox: { paddingVertical: 22, alignItems: 'center' },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyBox: { paddingVertical: 14, alignItems: 'center' },
  radarWrap: {
    width: 92,
    height: 92,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  radarRing: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
  },
  radarCoreOuter: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarCoreInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
    maxWidth: 270,
  },
  offerListContent: { paddingBottom: 4 },

  hintCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.12)',
    elevation: 8,
    zIndex: 20,
  },
  hintIconDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },

  assignedDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 0.1,
    borderStyle: 'dashed',
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 10,
  },
  assignedDriverTime: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: 78,
  },

  offerCard: {
    borderRadius: 22,
    padding: 14,
    marginBottom: 10,
    borderWidth: 0.4,
    boxShadow: '1px 2px 2px rgba(0, 0, 0, 0.15)',
    elevation: 2,
  },
  offerPriceHeader: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
    backgroundColor: 'rgba(179,135,55,0.08)',
  },
  offerPriceHeading: { flex: 1, minWidth: 0, gap: 1 },
  offerPriceLine: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  offerPriceEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  offerEtaBadge: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 10,
    marginLeft: 10,
  },
  offerEtaText: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  offerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  offerAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  offerAvatarPhoto: { width: '100%', height: '100%' },
  offerAvatarInitials: { fontSize: 18, fontWeight: '800' },
  offerInfo: { flex: 1, minWidth: 0, gap: 3 },
  offerDriverHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerName: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '800' },
  offerRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  offerRatingText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  offerMetaText: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] },
  offerTripMeta: { fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  offerVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 1,
  },
  offerVehicleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  offerPlateBadge: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offerPlateText: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  offerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  offerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  offerStatusText: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
  offerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  offerChipText: { fontSize: 11, fontWeight: '600' },
  offerPriceValue: {
    flexShrink: 1,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  offerPreviousPrice: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'line-through',
  },
  offerPricePending: { fontSize: 19, fontWeight: '800' },
  pricePanel: {
    marginTop: 6,
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  pricePanelTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  priceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 8,
    paddingVertical: 3,
  },
  priceItemDivider: { height: 1 },
  priceItemLabel: { flex: 1, fontSize: 12, fontWeight: '500' },
  priceItemValue: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  priceItemValueHero: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  iconActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  negotiatePill: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  negotiateText: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  acceptedPill: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  acceptedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptedPillText: { fontSize: 15, fontWeight: '700' },

  reviewsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 0.2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reviewsLink: {
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 40,
    marginTop: 2,
    borderWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  reviewsLinkText: { flex: 0, fontSize: 12, fontWeight: '600' },
  reviewsRowText: { flex: 1, fontSize: 13, fontWeight: '700' },
  proposalRow: {
    backgroundColor: colors.surface,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  proposalStepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  proposalStepBtnDisabled: { opacity: 0.4 },
  proposalPriceWrap: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  proposalPriceText: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  proposalPriceInput: {
    flex: 1,
    minHeight: 34,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 0,
  },
  proposalSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  proposalSendText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  primaryBtn: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnEnabled: {
    boxShadow: '0px 6px 12px rgba(179, 135, 55, 0.32)',
    elevation: 5,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  cancelBtn: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '800' },
});
