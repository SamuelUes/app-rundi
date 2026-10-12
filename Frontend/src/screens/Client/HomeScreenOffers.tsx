import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useLocation } from '../../hooks/shared/location/useLocation';
import DynamicMap from '../../components/map/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';
import PriceNegotiationModal from '../../components/shared/PriceNegotiationModal';
import DriverReviewsModal from '../../components/shared/DriverReviewsModal';
import { useRideOffers, type OfferItem } from '../../hooks/client/HomeScreenOffers/useRideOffers';
import { useDriverLocations } from '../../hooks/client/HomeScreenOffers/useDriverLocations';
import { useDriverPublicInsights } from '../../hooks/client/HomeScreenOffers/useDriverPublicInsights';
import { useOfferETAs } from '../../hooks/client/HomeScreenOffers/useOfferETAs';
import { usePriceNegotiationClient } from '../../hooks/client/HomeScreenOffers/usePriceNegotiationClient';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/vehicleIcons';
import { getPreflightResult } from '../../stores/preflightStore';
import { RIDES_RADIUS_KM } from '../../constants/rideRadius';
import {
  extractCoordinateFromSource,
  type LatLngPoint,
} from '../../utils/coordinates';
import { mergeName } from '../../utils/driverInfo';
import { mergeRating } from '../../utils/rating';
import {
  firstPositivePrice,
  resolveNegotiationBasePrice,
} from '../../utils/pricing';
import { haversineKm } from '../../utils/distance';
import alertService from '../../services/alertService';
import { HomeScreenOffersOfferCard } from '../../components/client/HomeScreenOffers/HomeScreenOffersOfferCard';
import { HomeScreenOffersBottomSheet } from '../../components/client/HomeScreenOffers/HomeScreenOffersBottomSheet';
import { HomeScreenOffersHint } from '../../components/client/HomeScreenOffers/HomeScreenOffersHint';

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

  const {
    rideId,
    offers,
    selectedDriverId,
    setSelectedDriverId,
    loading,
    rideSnapshot,
    driversInfo,
    driversRaw,
    reset: resetRideOffers,
  } = useRideOffers(route?.params?.rideId || null, user?.id, serviceAreaId, driverFallbackName);

  const programmedRide = route?.params?.programmedRide;

  // Listener en vivo del viaje programado: los params de navegación son
  // estáticos, así que driverConfirmed/status/driver solo se actualizan si
  // escuchamos programmedRides/{rideId} directamente. Al promoverse (o al
  // cancelarse) el nodo desaparece y rideSnapshot (activeRides) toma el control.
  const [programmedRideLive, setProgrammedRideLive] = useState<any | null>(null);
  useEffect(() => {
    if (!rideId || !programmedRide) {
      setProgrammedRideLive(null);
      return;
    }
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const { getDatabase, ref, onValue } = await import('firebase/database');
      const db = getDatabase();
      const programmedRef = ref(db, `programmedRides/${rideId}`);
      unsubscribe = onValue(
        programmedRef,
        (snap) => {
          if (!mounted) return;
          setProgrammedRideLive(snap.exists() ? snap.val() : null);
        },
        (error) => {
          console.warn('[HomeScreenOffers] Error escuchando programmedRide:', error);
        },
      );
    })();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [rideId, programmedRide]);

  const effectiveProgrammedRide = useMemo(() => {
    if (!programmedRide && !programmedRideLive) return null;
    return { ...(programmedRide || {}), ...(programmedRideLive || {}) };
  }, [programmedRide, programmedRideLive]);

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

  const cancelSearch = useCallback(() => {
    if (!rideId || isCancelling) return;
    alertService.showConfirmAlert(
      t('client.homeOffers.cancelConfirmTitle'),
      visibleOffers.length > 0
        ? t('client.homeOffers.cancelConfirmBody')
        : t('client.homeOffers.cancelConfirmBodyEmpty'),
      async () => {
        setIsCancelling(true);
        Animated.timing(cancelBtnAnim, {
          toValue: 0.95,
          duration: 120,
          useNativeDriver: true,
        }).start();
        try {
          await cancelSearchBase();
        } finally {
          Animated.timing(cancelBtnAnim, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
          }).start();
          setIsCancelling(false);
        }
      },
      undefined,
      t('client.homeOffers.cancelConfirmYes'),
      t('client.homeOffers.cancelConfirmNo'),
      true,
    );
  }, [rideId, isCancelling, cancelBtnAnim, cancelSearchBase, visibleOffers.length, t]);

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
    if (!['accepted', 'driver_on_route', 'in_progress'].includes(status)) return;
    if (!rideSnapshot?.driverId && !rideSnapshot?.driver?.id) return;

    navigation.replace('RideTracking', {
      rideId,
      driverId: rideSnapshot.driverId ?? rideSnapshot.driver?.id,
      driverName: rideSnapshot.driver?.name || assignedDriver?.name || 'Conductor',
      vehiclePlate:
        rideSnapshot.vehicle?.plate ||
        rideSnapshot.driver?.vehicle?.plate ||
        assignedDriver?.plate ||
        'N/A',
      vehicleBrand: rideSnapshot.vehicle?.make || rideSnapshot.vehicle?.brand || 'N/A',
      vehicleModel: rideSnapshot.vehicle?.model || 'N/A',
      vehicleColor: rideSnapshot.vehicle?.color || 'N/A',
      estimatedFare: rideSnapshot.finalFare || rideSnapshot.estimatedPrice || 0,
    });
  }, [programmedRide, rideSnapshot, rideId, navigation, assignedDriver]);

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
    const clientPrice = firstPositivePrice(
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
    const negotiationLabel = negotiationStatusLabel(rideSnapshot?.negotiationStatus);

    return (
      <HomeScreenOffersOfferCard
        item={item}
        selected={selected}
        isDark={isDark}
        colors={colors}
        etaValueText={etaValueText}
        arrivalLabel={arrivalLabel}
        plate={plate}
        clientPriceLabel={clientPriceLabel}
        driverPriceLabel={driverPriceLabel}
        hasDriverPrice={driverPrice != null}
        negotiationLabel={negotiationLabel}
        displayName={displayName}
        vehicleType={vehicleType}
        ratingLabel={ratingLabel}
        photoUri={photoUri}
        acceptedAnim={acceptedAnim}
        onSelect={() => handleSelectFromList(item.driverId)}
        onMessageDriver={() => handleMessageDriver(item)}
        onOpenNegotiation={openNegotiation}
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
          onDriverPress={handleDriverPressOnMap}
          showUserLocation={false}
          userLocationLightIcon={USER_LOCATION_LIGHT}
          userLocationDarkIcon={USER_LOCATION_DARK}
          originMarker={originCoords || undefined}
          destinationMarker={destinationCoords || undefined}
          originTitle={t('common.mapPins.origin')}
          destinationTitle={t('common.mapPins.destination')}
          originLabel={rideSnapshot?.origin?.address || rideSnapshot?.originAddress || programmedRide?.origin?.address || undefined}
          destinationLabel={rideSnapshot?.destination?.address || rideSnapshot?.destinationAddress || programmedRide?.destination?.address || undefined}
          extraStopMarkers={extraStopMarkers}
          showPinBubbles
          autoFitEnabled
        />
      </View>

      <HomeScreenOffersHint
        hasOffers={visibleOffers.length > 0}
        hasSelection={!!selectedOffer}
        isDark={isDark}
        styles={styles}
        t={t}
      />

      <HomeScreenOffersBottomSheet
        loading={loading}
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
        onCancelSearch={cancelSearch}
        styles={styles}
        t={t}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
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
    borderWidth: 1,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
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
    borderWidth: 1,
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
    borderRadius: 18,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  offerCardSelected: {
    borderWidth: 1.5,
    shadowColor: '#b38737',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  offerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  offerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: 1,
  },
  offerAvatarPhoto: { width: '100%', height: '100%' },
  offerAvatarInitials: { fontSize: 16, fontWeight: '800' },
  offerInfo: { flex: 1, paddingTop: 1 },
  offerName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  offerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 7,
  },
  offerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  offerChipText: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },
  offerPriceColumn: { alignItems: 'flex-end', paddingTop: 2, paddingLeft: 4 },
  offerPriceValue: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  offerPriceCaption: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  offerPricePending: { fontSize: 12, fontWeight: '700' },
  pricePanel: {
    marginTop: 11,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 9,
  },
  pricePanelTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  priceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 8,
    paddingVertical: 5,
  },
  priceItemDivider: { height: 1 },
  priceItemLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  priceItemValue: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  iconActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconActionBtnChat: {
    backgroundColor: colors.secondary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  negotiatePill: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#5B2AB0',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  negotiateText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13, letterSpacing: 0.2 },
  acceptedPill: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptedPillText: { fontSize: 12, fontWeight: '800' },

  reviewsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reviewsRowText: { flex: 1, fontSize: 13, fontWeight: '700' },
  primaryBtn: {
    marginTop: 10,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnEnabled: {
    shadowColor: '#b38737',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
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
    borderRadius: 999,
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
