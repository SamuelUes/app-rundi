import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
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
import { HomeScreenOffersOfferCard } from '../../components/client/HomeScreenOffers/HomeScreenOffersOfferCard';
import { HomeScreenOffersBottomSheet } from '../../components/client/HomeScreenOffers/HomeScreenOffersBottomSheet';

const { USER_LOCATION_LIGHT, USER_LOCATION_DARK } = MAP_ICONS;
const MAX_DRIVER_RADIUS_KM = typeof RIDES_RADIUS_KM === 'number' ? RIDES_RADIUS_KM : 6;

interface Props {
  navigation: any;
  route?: { params?: { rideId?: string } };
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

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

  const { insights: driverPublicInsights, reviewsData: selectedDriverReviewsData } =
    useDriverPublicInsights(
      selectedOffer?.driverId,
      driversInfo,
      driversRaw,
      null,
      t,
    );

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

  const cancelSearch = useCallback(async () => {
    if (!rideId || isCancelling) return;
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
  }, [rideId, isCancelling, cancelBtnAnim, cancelSearchBase]);

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

    const allowedOfferIds = new Set(offers?.map((offer) => offer.driverId) ?? []);
    const center = mapCenterPoint;
    const includeByRadius = !!center;

    const trimmed = Object.entries(driverLocations).reduce<Record<string, any>>((acc, [driverId, location]) => {
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
  }, [driverLocations, mapCenterPoint, offers]);

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
    if (!offers || offers.length === 0) return [];

    return offers
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
          vehicleIconSource: isSelected ? ensureVehicleIconSource(type) : undefined,
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
    offers,
    getDriverCoordinate,
    filteredDriverLocations,
    driverLocations,
    driversInfo,
    driversRaw,
    selectedDriverId,
  ]);

  const etasByDriver = useOfferETAs(offers, getDriverCoordinate, originCoords);

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
    const ratingPrefix = ratingLabel ? t('client.homeOffers.list.ratingPrefix', { rating: ratingLabel }) : '';
    const displayName = mergeName(driverFallbackName, info, raw, item.driver);
    const vehicleIconSource = ensureVehicleIconSource(vehicleType);
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
        eta={eta}
        etaValueText={etaValueText}
        arrivalLabel={arrivalLabel}
        plate={plate}
        clientPriceLabel={clientPriceLabel}
        driverPriceLabel={driverPriceLabel}
        negotiationLabel={negotiationLabel}
        displayName={displayName}
        vehicleIconSource={vehicleIconSource}
        ratingPrefix={ratingPrefix}
        photoUri={photoUri}
        colors={colors}
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
          showUserLocation
          userLocation={{ latitude: centerLat, longitude: centerLng }}
          userLocationLightIcon={USER_LOCATION_LIGHT}
          userLocationDarkIcon={USER_LOCATION_DARK}
          originMarker={originCoords || undefined}
          destinationMarker={destinationCoords || undefined}
          originLabel={rideSnapshot?.origin?.address || rideSnapshot?.originAddress || undefined}
          destinationLabel={rideSnapshot?.destination?.address || rideSnapshot?.destinationAddress || undefined}
          extraStopMarkers={extraStopMarkers}
          showPinBubbles
          autoFitEnabled
        />
      </View>

      <HomeScreenOffersBottomSheet
        loading={loading}
        offers={offers}
        selectedDriverId={selectedDriverId}
        selectedOffer={selectedOffer}
        isConfirming={isConfirming}
        isCancelling={isCancelling}
        confirmBtnAnim={confirmBtnAnim}
        cancelBtnAnim={cancelBtnAnim}
        primaryActionLabel={primaryActionLabel}
        colors={colors}
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
        driverPhoto={selectedOffer?.driver?.photoURL || null}
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
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  offerRowDefault: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(239, 188, 6, 0.85)',
  },
  offerRowSelected: {
    backgroundColor: '#D39838',
    borderColor: '#F7CD76',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 7,
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
  offerInfo: { flex: 1, paddingRight: 4 },
  offerTitle: { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  offerTitleDefault: { color: colors.text },
  offerTitleSelected: { color: '#FFFFFF' },
  offerSubtitle: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  offerSubtitleDefault: { color: colors.textSecondary },
  offerSubtitleSelected: { color: '#F8FAFC' },
  offerEtaBadge: {
    marginTop: 8,
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 188, 6, 0.65)',
    backgroundColor: 'rgba(239, 188, 6, 0.12)',
  },
  offerEtaText: { fontSize: 11, fontWeight: '700', color: colors.text },
  priceRow: {
    marginTop: 6,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  priceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  priceHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  priceLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.15 },
  priceItems: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  priceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  priceItemDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 8,
  },
  priceItemLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    paddingRight: 6,
  },
  priceItemValue: {
    minWidth: 88,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '800',
  },
  negotiatePill: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#5B2AB0',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2E1065',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 22,
  },
  negotiateText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.2 },
  selectedActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 0,
    minHeight: 66,
  },
  messageButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1.2,
    borderColor: 'rgba(120, 53, 15, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  acceptedStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(22, 101, 52, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(187, 247, 208, 0.55)',
  },
  acceptedStatusText: { color: '#F0FDF4', fontWeight: '800', fontSize: 11 },
  acceptedStatusChipSecondary: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: 'rgba(22, 101, 52, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(22, 101, 52, 0.34)',
    marginVertical: 18,
  },
  acceptedStatusTextSecondary: { 
    color: '#166534',
    fontWeight: '700',
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
  reviewsBtn: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(211, 152, 56, 0.14)',
    borderColor: 'rgba(211, 152, 56, 0.7)',
  },
  reviewsBtnText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 15,
  },
});
