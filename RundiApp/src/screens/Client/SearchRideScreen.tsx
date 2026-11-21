import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  Image,
  useWindowDimensions,
  BackHandler,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DynamicMap from '../../components/map/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAddressSearch } from '../../hooks/client/SearchRideScreen/useAddressSearch';
import servicesService, { ServiceItem } from '../../services/catalog/servicesService';
import {
  getFeatureAvailability,
  getSelectedFeatureCodes,
  type FeatureOverrides,
} from '../../utils/ride/rideFeatures';
import alertService from '../../services/notification/alertService';
import { metersBetween, type Coords } from '../../utils/geo/rideCoords';
import { normalizeSuggestion, type NormalizedSuggestion } from '../../utils/ride/suggestions';
import { useRideRouteCalculation } from '../../hooks/client/SearchRideScreen/useRideRouteCalculation';
import { useScheduleRide } from '../../hooks/client/SearchRideScreen/useScheduleRide';
import { useSearchRideState } from '../../hooks/client/SearchRideScreen/useSearchRideState';
import { useSearchRideLocation } from '../../hooks/client/SearchRideScreen/useSearchRideLocation';
import { useSearchRideSubmission } from '../../hooks/client/SearchRideScreen/useSearchRideSubmission';
import { useVehiclePhoto } from '../../hooks/client/SearchRideScreen/useVehiclePhoto';
import { useDriversAvailability } from '../../hooks/client/SearchRideScreen/useDriversAvailability';
import { SearchRideRouteBubble } from '../../components/client/SearchRide/SearchRideRouteBubble';
import {
  SearchRideVehicleOptions,
  RideIcon,
  VEHICLE_OPTION_IMAGES,
} from '../../components/client/SearchRide/SearchRideVehicleOptions';
import { SearchRideSummary } from '../../components/client/SearchRide/SearchRideSummary';
import { isPeakHour } from '../../utils/ride/priceCalculatorCentralize';
import { SearchRideCTA } from '../../components/client/SearchRide/SearchRideCTA';
import { SearchRideSearchOverlay } from '../../components/client/SearchRide/SearchRideSearchOverlay';
import { SearchRideConfirmPinButton } from '../../components/client/SearchRide/SearchRideConfirmPinButton';
import { SearchRideScheduleModal } from '../../components/client/SearchRide/SearchRideScheduleModal';
import type { RecurringRide } from '../../types/recurringRide';
import { useRideFlowTransition } from '../../hooks/client/useRideFlowTransition';

const { MANUAL_ORIGIN, MANUAL_ORIGIN_HOLD, ORIGIN_PIN, DESTINATION_PIN, MULTI_STOP_PIN } = MAP_ICONS;
const DEFAULT_FALLBACK_COORDS = { latitude: 12.1364, longitude: -86.2514 };
const MAX_EXTRA_STOPS = 3;
const SHEET_HANDLE_HEIGHT = 29;
const SHEET_EXPANDED_RATIO = 0.68;
const SHEET_SPRING = { damping: 26, stiffness: 300 };
type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';
type PaymentMethod = 'cash' | 'card';

interface SavedLocation {
  label: string;
  coords: Coords;
}

type MapSelectionState =
  | 'origin'
  | 'destination'
  | 'extra-new'
  | { type: 'extra-edit'; index: number }
  | null;

export default function SearchRideScreenNewDesign({ navigation, route }: any) {
  const rideTransition = useRideFlowTransition();
  const allowRideFlowBack = useRef(false);
  const submissionNavigation = useMemo(() => ({
    ...navigation,
    navigate: (screen: string, params?: any) => {
      if (screen === 'HomeOffers') {
        rideTransition.exit(() => navigation.navigate(screen, params));
      } else {
        navigation.navigate(screen, params);
      }
    },
  }), [navigation, rideTransition.exit]);
  const recurringRide: RecurringRide | undefined = route?.params?.recurringRide;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { coords } = useLocation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const tr = useCallback((path: string, options?: Record<string, any>) => t(`shared.searchRide.${path}`, options), [t]);
  const defaultLabels = useMemo(
    () => ({
      origin: tr('defaults.origin'),
      destination: tr('defaults.destination'),
      locationFallback: tr('defaults.locationFallback'),
      currentLocation: tr('defaults.currentLocation'),
      myLocation: tr('defaults.myLocation'),
      service: tr('defaults.serviceFallback'),
    }),
    [tr],
  );

  useLayoutEffect(() => {
    navigation?.setOptions?.({ headerShown: false });
  }, [navigation]);

  const [servicesCatalog, setServicesCatalog] = useState<ServiceItem[]>([]);
  const [featureOverridesByService, setFeatureOverridesByService] = useState<Record<string, FeatureOverrides>>({});
  const [currentPricingMinute, setCurrentPricingMinute] = useState(() => Math.floor(Date.now() / 60_000));
  const state = useSearchRideState();
  const {
    origin, destination,
    originCoords, destinationCoords,
    extraDestinations,
    vehicleType, setVehicleType,
    designatedDriverMode, setDesignatedDriverMode,
    paymentMethod, setPaymentMethod,
    passengersByVehicle, setPassengersByVehicle,
    priceSuggestion, setPriceSuggestion,
    rideComment, setRideComment,
    manualOriginDraft, manualOriginAddress,
    manualOriginLoading, manualOriginDragging,
    manualDestinationDraft, manualDestinationLoading, manualDestinationDragging,
    setManualOriginDraft, setManualDestinationDraft,
    setManualOriginDragging, setManualDestinationDragging,
    extraStopSelectionLoading,
    hasPinnedOrigin, setHasPinnedOrigin,
    cameraTarget,
    mapSelectionMode, setMapSelectionMode,
    showSearchOverlay, setShowSearchOverlay,
    searchQuery, setSearchQuery,
    activeSelection, setActiveSelection,
    recentOriginLocations,
    recentDestinationLocations,
    favoriteLocations,
    submittingRequest, setSubmittingRequest,
    bottomPanelExpanded, setBottomPanelExpanded,
  } = state;

  const {
    scheduleModalVisible,
    setScheduleModalVisible,
    scheduledAt,
    setScheduledAt,
    scheduleDayIndex,
    setScheduleDayIndex,
    scheduleHour,
    setScheduleHour,
    scheduleMinute,
    setScheduleMinute,
    scheduleDayOptions,
    scheduleHourOptions,
    scheduleMinuteOptions,
    scheduleMinuteOptionsForHour,
    openScheduleModal,
    applyScheduleSelection,
  } = useScheduleRide({ tr });

  useEffect(() => {
    if (scheduledAt != null) return;
    const delayToNextMinute = 60_000 - (Date.now() % 60_000) + 50;
    const timer = setTimeout(() => setCurrentPricingMinute(Math.floor(Date.now() / 60_000)), delayToNextMinute);
    return () => clearTimeout(timer);
  }, [scheduledAt, currentPricingMinute]);

  const calculationAt =
    scheduledAt != null ? new Date(scheduledAt) : new Date(currentPricingMinute * 60_000);
  const calculationAtMinute = Math.floor(calculationAt.getTime() / 60_000);
  const selectedFeatureCodesByService = useMemo(
    () =>
      Object.fromEntries(
        servicesCatalog.map((service) => [
          service.code ?? '',
          service.featuresCatalogAvailable
            ? getSelectedFeatureCodes(
                service.features,
                featureOverridesByService[service.code ?? ''] ?? {},
                calculationAt,
              )
            : [],
        ]),
      ) as Record<string, string[] | undefined>,
    [servicesCatalog, featureOverridesByService, calculationAtMinute],
  );

  const selectedFeatureServiceCode =
    vehicleType === 'designated_driver'
      ? designatedDriverMode === 'moto'
        ? 'designated_driver_moto'
        : 'designated_driver_auto'
      : vehicleType === 'moto'
      ? 'motorcycle'
      : 'normal';
  const selectedFeatureService = servicesCatalog.find((service) => service.code === selectedFeatureServiceCode);
  const selectedFeatureCodes = selectedFeatureCodesByService[selectedFeatureServiceCode] ?? [];
  // Solo los features con elegibilidad (senior/premium/pet_friendly) filtran
  // conductores: los ajustes de pricing (night, hora pico) no son capacidades.
  const eligibilityFeatureCodes = useMemo(
    () =>
      selectedFeatureCodes.filter((code) => {
        const subject = selectedFeatureService?.features.find((f) => f.code === code)?.eligibilitySubject;
        return subject === 'driver' || subject === 'vehicle';
      }),
    [selectedFeatureCodes, selectedFeatureService],
  );
  const { driversAvailable, checkingDrivers, availabilityByType } = useDriversAvailability(
    coords,
    vehicleType,
    designatedDriverMode,
    selectedFeatureServiceCode,
    eligibilityFeatureCodes,
    calculationAt.getTime(),
  );

  const onToggleFeature = useCallback(
    (code: string) => {
      if (!selectedFeatureService?.featuresCatalogAvailable) return;
      const feature = selectedFeatureService.features.find((item) => item.code === code);
      if (!feature || getFeatureAvailability(feature, calculationAt) !== 'eligible') return;
      const isSelected = selectedFeatureCodes?.includes(code) ?? false;
      setFeatureOverridesByService((current) => ({
        ...current,
        [selectedFeatureServiceCode]: {
          ...current[selectedFeatureServiceCode],
          [code]: !isSelected,
        },
      }));
    },
    [
      selectedFeatureService,
      selectedFeatureServiceCode,
      selectedFeatureCodes,
      calculationAtMinute,
    ],
  );

  const {
    calculatingRoute,
    routeCoordinates,
    estimatedDistance,
    estimatedDuration,
    estimatedPrice,
    calculatingPrice,
    priceCalculationError,
    priceBreakdown,
    vehicleEstimates,
    designatedDriverEstimates,
    recommendedVehicle,
    designatedDriverEligibility,
    recomputeRoute,
    recalcPriceOnly,
    recalcEstimates,
  } = useRideRouteCalculation({
    vehicleType,
    designatedDriverMode,
    tr,
    // Tamaño del grupo: invariante al vehículo seleccionado para que la
    // auto-selección por recomendación no realimente el cálculo.
    partySize: Math.max(
      passengersByVehicle.moto || 1,
      passengersByVehicle.auto || 1,
      passengersByVehicle.designated_driver || 1,
    ),
    availabilityByType,
    scheduledAt,
    selectedFeatureCodes,
    selectedFeatureCodesByService,
  });

  const {
    searchResults,
    searchLoading,
    setSearchLoading,
    searchError,
    setSearchError,
    reset: resetSearch,
  } = useAddressSearch(
    showSearchOverlay,
    searchQuery,
    coords,
    defaultLabels.locationFallback,
    tr('labels.noResults'),
    tr('search.error'),
  );

  const bottomPanelAnim = useRef(new Animated.Value(0)).current;
  const markerBounce = useRef(new Animated.Value(0)).current;
  const markerBounceTranslateY = markerBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  const recomputeRouteWith = useCallback(
    async (
      overrideOrigin?: Coords | null,
      overrideDestination?: Coords | null,
      overrideStops?: Array<{ address: string; coords: Coords | null }>,
    ) => {
      await recomputeRoute(
        overrideOrigin,
        overrideDestination,
        overrideStops,
        coords ?? null,
        originCoords,
        destinationCoords,
        extraDestinations,
      );
    },
    [recomputeRoute, coords, originCoords, destinationCoords, extraDestinations],
  );

  const {
    validateLocationForContext,
    rememberRecentLocation,
    applySelectionForTarget,
    handleManualOriginDragStart,
    handleManualOriginDragEnd,
    handleRegionChangeCenter,
    confirmCenterPinSelection,
    handleRegionChangeCompleteCenter,
    handleMapPress,
    manualOriginMarkerPosition,
  } = useSearchRideLocation(state, user?.id, coords, defaultLabels, tr, recomputeRouteWith);

  const {
    clientVehiclePhoto,
    clientVehiclePhotoLocalUri,
    uploadingPhoto,
    handleTakeVehiclePhoto,
    captureVehiclePhotoNow,
    uploadPhotoIfNeeded,
  } = useVehiclePhoto(user?.id, t);

  const { onConfirmRequest } = useSearchRideSubmission({
    user,
    coords,
    origin,
    destination,
    originCoords,
    destinationCoords,
    extraDestinations,
    vehicleType,
    designatedDriverMode,
    paymentMethod,
    passengersByVehicle,
    priceSuggestion,
    rideComment,
    clientVehiclePhoto,
    clientVehiclePhotoLocalUri,
    routeCalc: { estimatedDistance, estimatedDuration, estimatedPrice },
    selectedFeatureCodes,
    servicesCatalog,
    scheduledAt,
    defaultLabels,
    submittingRequest,
    setSubmittingRequest,
    validateLocationForContext,
    uploadPhotoIfNeeded,
    captureVehiclePhotoNow,
    tr,
    navigation: submissionNavigation,
  });

  useEffect(() => {
    servicesService.listServices().then(setServicesCatalog).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!mapSelectionMode) return;
    let title = tr('mapSelection.defaultTitle');
    let message: string | null = null;
    if (mapSelectionMode === 'origin') {
      title = tr('mapSelection.originTitle');
      message = tr('mapSelection.originMessage');
    } else if (mapSelectionMode === 'destination') {
      title = tr('mapSelection.destinationTitle');
      message = tr('mapSelection.destinationMessage');
    } else if (mapSelectionMode === 'extra-new') {
      title = tr('mapSelection.newStopTitle');
      message = tr('mapSelection.newStopMessage', { index: extraDestinations.length + 1 });
    } else if (typeof mapSelectionMode === 'object' && mapSelectionMode.type === 'extra-edit') {
      title = tr('mapSelection.editStopTitle');
      message = tr('mapSelection.editStopMessage', { index: mapSelectionMode.index + 1 });
    }
    if (message) alertService.showInfoAlert(title, message);
  }, [mapSelectionMode, extraDestinations.length]);

  const orderedRouteRows = useMemo(() => {
    const rows: Array<{ kind: 'origin' | 'destination' | 'extra'; index?: number }> = [{ kind: 'origin' }];
    extraDestinations.forEach((_, index) => rows.push({ kind: 'extra', index }));
    rows.push({ kind: 'destination' });
    return rows;
  }, [extraDestinations]);

  const canAddExtraStop = useMemo(() => extraDestinations.length < MAX_EXTRA_STOPS, [extraDestinations.length]);

  useEffect(() => {
    if (vehicleType === 'moto' && passengersByVehicle.moto > 1) {
      setPassengersByVehicle(prev => ({ ...prev, moto: 1 }));
      alertService.showInfoAlert(tr('alerts.motoSelectedTitle'), tr('alerts.singlePassengerMessage'));
    }
  }, [vehicleType, passengersByVehicle.moto, tr]);

  useEffect(() => {
    if (vehicleType === 'designated_driver' && designatedDriverMode === 'moto' && passengersByVehicle.designated_driver > 1) {
      setPassengersByVehicle((prev) => ({ ...prev, designated_driver: 1 }));
      alertService.showInfoAlert(tr('alerts.designatedDriverMotoTitle'), tr('alerts.singlePassengerMessage'));
    }
  }, [vehicleType, designatedDriverMode, passengersByVehicle.designated_driver, tr]);

  useEffect(() => {
    if (vehicleType === 'designated_driver' && !designatedDriverEligibility.anyEligible) {
      setVehicleType('auto');
    }
  }, [vehicleType, designatedDriverEligibility, setVehicleType]);

  const lastPricedOriginRef = useRef<Coords | null>(null);
  const lastFeaturePriceKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // Con origen fijado el precio ya se recalcula vía recomputeRoute; aquí solo
    // re-pricamos cuando el origen sigue al GPS y se movió lo suficiente.
    if (originCoords) return;
    if (!coords || !destinationCoords || estimatedDistance <= 0) return;
    const last = lastPricedOriginRef.current;
    if (last && metersBetween(last, coords) < 300) return;
    lastPricedOriginRef.current = coords;
    const stopsCount = extraDestinations.filter((d) => d.coords).length;
    recalcPriceOnly(originCoords, coords, destinationCoords, stopsCount);
  }, [coords, estimatedDistance, originCoords, destinationCoords, extraDestinations, recalcPriceOnly]);

  useEffect(() => {
    const featurePriceKey = [
      selectedFeatureServiceCode,
      selectedFeatureCodes?.join(',') ?? 'catalog-unavailable',
      calculationAtMinute,
      scheduledAt ?? 'now',
      vehicleType,
      designatedDriverMode,
    ].join(':');
    if (lastFeaturePriceKeyRef.current === featurePriceKey) return;
    lastFeaturePriceKeyRef.current = featurePriceKey;
    if (!destinationCoords || estimatedDistance <= 0) return;
    const stopsCount = extraDestinations.filter((item) => item.coords).length;
    // Batch: refresca el precio de todas las tarjetas con sus features
    // (p. ej. premium ×1.38), no solo el estimado del servicio actual.
    recalcEstimates(originCoords, coords, stopsCount);
  }, [
    coords,
    originCoords,
    destinationCoords,
    estimatedDistance,
    extraDestinations,
    selectedFeatureServiceCode,
    selectedFeatureCodes,
    calculationAtMinute,
    vehicleType,
    designatedDriverMode,
    scheduledAt,
    recalcEstimates,
  ]);

  const capacityByVehicle: Record<VehicleType, number> = useMemo(
    () => ({ moto: 1, auto: 4, designated_driver: designatedDriverMode === 'moto' ? 1 : 4 }),
    [designatedDriverMode],
  );

  // Aplica la recomendación solo si el usuario no ha elegido manualmente.
  const userPickedVehicleRef = useRef(false);

  // Hidrata el formulario cuando se abre desde un viaje recurrente guardado.
  const hydratedRecurringRef = useRef(false);
  useEffect(() => {
    if (!recurringRide || hydratedRecurringRef.current) return;
    hydratedRecurringRef.current = true;
    const originPt: Coords = { latitude: recurringRide.origin.lat, longitude: recurringRide.origin.lng };
    const destPt: Coords = { latitude: recurringRide.destination.lat, longitude: recurringRide.destination.lng };
    const stops = recurringRide.extraStops.map((stop) => ({
      address: stop.address,
      coords: { latitude: stop.lat, longitude: stop.lng } as Coords,
    }));
    state.setOrigin(recurringRide.origin.address);
    state.setManualOriginAddress(recurringRide.origin.address);
    state.setOriginCoords(originPt);
    state.setHasManualOriginOverride(true);
    state.setHasPinnedOrigin(true);
    state.setDestination(recurringRide.destination.address);
    state.setDestinationCoords(destPt);
    state.setExtraDestinations(stops);
    userPickedVehicleRef.current = true;
    state.setVehicleType(recurringRide.vehicleType);
    if (recurringRide.designatedDriverMode) {
      state.setDesignatedDriverMode(recurringRide.designatedDriverMode);
    }
    state.setPaymentMethod(recurringRide.paymentMethod);
    state.setPassengersByVehicle((prev) => ({
      ...prev,
      [recurringRide.vehicleType]: recurringRide.passengers,
    }));
    if (recurringRide.comment) state.setRideComment(recurringRide.comment);
    if (recurringRide.priceSuggestion != null) {
      state.setPriceSuggestion(String(recurringRide.priceSuggestion));
    }
    state.setCameraTarget(originPt);
    void recomputeRouteWith(originPt, destPt, stops);
  }, [recurringRide, recomputeRouteWith]);

  const handleSelectVehicle = useCallback(
    (type: VehicleType) => {
      userPickedVehicleRef.current = true;
      setVehicleType(type);
    },
    [setVehicleType],
  );

  useEffect(() => {
    if (!userPickedVehicleRef.current && recommendedVehicle && recommendedVehicle !== vehicleType) {
      setVehicleType(recommendedVehicle);
    }
  }, [recommendedVehicle, vehicleType, setVehicleType]);

  const preferServiceCatalogCopy = useMemo(() => {
    const lang = i18n.language || 'en';
    return lang.toLowerCase().startsWith('es');
  }, [i18n.language]);

  const VEHICLE_TYPES: VehicleType[] = ['moto', 'auto', 'designated_driver'];

  const vehicleOptions = useMemo(() => {
    const defaults: Record<VehicleType, { label: string; subtitle: string; icon: string }> = {
      moto: { label: tr('vehicle.motoLabel'), subtitle: tr('vehicle.motoSubtitle'), icon: 'two-wheeler' },
      auto: { label: tr('vehicle.autoLabel'), subtitle: tr('vehicle.autoSubtitle'), icon: 'directions-car' },
      designated_driver: { label: tr('vehicle.designatedLabel'), subtitle: tr('vehicle.designatedSubtitle'), icon: 'person-pin' },
    };
    const normalizeServiceText = (value: string | undefined | null) =>
      (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
    const isDesignatedService = (code: string, name: string) => {
      const haystack = `${code} ${name}`;
      return haystack.includes('designated_driver') || haystack.includes('designated') || haystack.includes('conductor_designado');
    };
    const findByCode = (codes: string[]) =>
      servicesCatalog.find((service) => codes.includes(normalizeServiceText(service.code)));
    const findMatch = (type: VehicleType) => {
      if (type === 'auto') { const m = findByCode(['normal', 'auto']); if (m) return m; }
      if (type === 'moto') { const m = findByCode(['motorcycle', 'moto']); if (m) return m; }
      if (type === 'designated_driver') { const m = findByCode(['designated_driver_auto', 'designated_driver']); if (m) return m; }
      return servicesCatalog.find((service) => {
        const code = normalizeServiceText(service.code);
        const name = normalizeServiceText(service.name);
        if (type === 'designated_driver') return isDesignatedService(code, name);
        if (isDesignatedService(code, name)) return false;
        if (type === 'auto') return code === 'auto' || code.startsWith('auto_') || code.includes('car') || name.includes('auto') || name.includes('carro');
        if (type === 'moto') return code === 'moto' || code.startsWith('moto_') || code.includes('motorcycle') || name.includes('moto') || name.includes('motocicleta');
        return false;
      });
    };
    const typesToRender = designatedDriverEligibility.anyEligible
      ? VEHICLE_TYPES
      : VEHICLE_TYPES.filter((type) => type !== 'designated_driver');
    return typesToRender.map((type) => {
      const match = findMatch(type);
      const shouldUseCatalogCopy = preferServiceCatalogCopy && match && type !== 'designated_driver';
      return {
        type,
        label: shouldUseCatalogCopy && match?.name ? match.name : defaults[type].label,
        subtitle: shouldUseCatalogCopy && match?.description ? match.description : defaults[type].subtitle,
        icon: defaults[type].icon,
        serviceCode:
          match?.code ??
          (type === 'moto' ? 'motorcycle' : type === 'auto' ? 'normal' : 'designated_driver_auto'),
      };
    });
  }, [servicesCatalog, tr, preferServiceCatalogCopy, designatedDriverEligibility.anyEligible]);

  const formatPriceValue = useCallback(
    (value: number | null | undefined) => {
      if (value == null || Number.isNaN(value)) return tr('labels.calculating');
      return tr('labels.priceApproximation', { value: Math.round(value) });
    },
    [tr],
  );

  const openLocationSearch = useCallback(
    (target: 'origin' | 'destination' | number | 'new-stop') => {
      setActiveSelection(target);
      setShowSearchOverlay(true);
      resetSearch();
      setMapSelectionMode(null);
      let initialQuery = '';
      if (target === 'origin') initialQuery = manualOriginAddress || origin;
      else if (target === 'destination') initialQuery = destination;
      else if (typeof target === 'number') initialQuery = extraDestinations[target]?.address || '';
      setSearchQuery(initialQuery);
    },
    [manualOriginAddress, origin, destination, extraDestinations],
  );

  const closeSearchOverlay = useCallback(() => {
    setShowSearchOverlay(false);
    setSearchQuery('');
    resetSearch();
    setActiveSelection(null);
  }, [resetSearch]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: NormalizedSuggestion) => {
      const target = activeSelection || 'destination';
      try {
        setSearchLoading(true);
        let coordsValue = suggestion.coords;
        if (!coordsValue && suggestion.placeId) {
          const mapsService = (await import('../../services/map/mapsService')).default;
          coordsValue = (await mapsService.getPlaceDetails(suggestion.placeId)) || null;
        }
        if (!coordsValue) {
          alertService.showErrorAlert(tr('alerts.locationFetchFailed'));
          return;
        }
        await applySelectionForTarget(target, suggestion.fullText, coordsValue);
        closeSearchOverlay();
      } finally {
        setSearchLoading(false);
      }
    },
    [activeSelection, applySelectionForTarget, closeSearchOverlay],
  );

  const handleSelectSavedLocation = useCallback(
    async (location: SavedLocation) => {
      if (!activeSelection) return;
      await applySelectionForTarget(activeSelection, location.label, location.coords);
      closeSearchOverlay();
    },
    [activeSelection, applySelectionForTarget, closeSearchOverlay],
  );

  const handleUseCurrentLocation = useCallback(async () => {
    if (!coords) {
      alertService.showInfoAlert(tr('alerts.locationUnavailableTitle'), tr('alerts.locationUnavailableMessage'));
      return;
    }
    const target = activeSelection || 'origin';
    const label = target === 'origin' ? defaultLabels.origin : defaultLabels.currentLocation;
    await applySelectionForTarget(target, label, coords);
    closeSearchOverlay();
  }, [coords, activeSelection, applySelectionForTarget, closeSearchOverlay]);

  const beginAddExtraStop = useCallback(() => {
    if (!canAddExtraStop) return;
    openLocationSearch('new-stop');
  }, [canAddExtraStop, openLocationSearch]);

  const handleRouteRowPress = useCallback(
    (row: { kind: 'origin' | 'destination' | 'extra'; index?: number }) => {
      if (row.kind === 'origin') openLocationSearch('origin');
      else if (row.kind === 'destination') openLocationSearch('destination');
      else if (row.kind === 'extra' && typeof row.index === 'number') openLocationSearch(row.index);
    },
    [openLocationSearch],
  );

  const handleRemoveStop = useCallback(
    (index: number) => {
      const updatedStops = extraDestinations.filter((_, idx) => idx !== index);
      state.setExtraDestinations(updatedStops);
      void recomputeRouteWith(undefined, undefined, updatedStops);
    },
    [extraDestinations, recomputeRouteWith],
  );

  const handlePickFromMap = useCallback(() => {
    if (!activeSelection) return;
    if (activeSelection === 'origin') {
      setHasPinnedOrigin(false);
      setMapSelectionMode('origin');
    } else if (activeSelection === 'destination') setMapSelectionMode('destination');
    else if (activeSelection === 'new-stop') setMapSelectionMode('extra-new');
    else if (typeof activeSelection === 'number') setMapSelectionMode({ type: 'extra-edit', index: activeSelection });
    setShowSearchOverlay(false);
    setSearchQuery('');
    resetSearch();
  }, [activeSelection, resetSearch]);

  const selectionTitle = useMemo(() => {
    if (activeSelection === 'origin') return tr('search.selectionOriginTitle');
    if (activeSelection === 'destination') return tr('search.selectionDestinationTitle');
    if (activeSelection === 'new-stop') return tr('search.selectionNewStopTitle', { current: extraDestinations.length + 1, max: MAX_EXTRA_STOPS });
    if (typeof activeSelection === 'number') return tr('search.selectionEditStopTitle', { index: activeSelection + 1 });
    return tr('search.selectionGenericTitle');
  }, [activeSelection, extraDestinations.length, tr]);

  const isDestinationSelection = activeSelection === 'destination';
  const shouldHighlightMapAction = isDestinationSelection && !destinationCoords;
  const hasConfirmedDestination = !!destinationCoords;
  const requiresVehiclePhoto = vehicleType === 'designated_driver';
  const hasVehiclePhotoSelection = !!clientVehiclePhoto || !!clientVehiclePhotoLocalUri;
  // La foto deja de bloquear el CTA: si falta, al confirmar se abre la cámara
  // (o galería) y el flujo continúa solo.
  const isRequestReady =
    !!destinationCoords && estimatedPrice > 0 && !calculatingRoute && !calculatingPrice && !priceCalculationError &&
    !uploadingPhoto;

  const maxPassengersByType: Record<VehicleType, number> = useMemo(
    () => ({ moto: 1, auto: 4, designated_driver: designatedDriverMode === 'moto' ? 1 : 4 }),
    [designatedDriverMode],
  );

  const getPassengersForVehicle = (type: VehicleType) => passengersByVehicle[type] || 1;
  const canDecreasePassengers = (type: VehicleType) => getPassengersForVehicle(type) > 1;
  const canIncreasePassengers = (type: VehicleType) => getPassengersForVehicle(type) < maxPassengersByType[type];
  const updatePassengers = (type: VehicleType, delta: number) => {
    setPassengersByVehicle((prev) => {
      const current = prev[type] || 1;
      const newValue = Math.max(1, Math.min(maxPassengersByType[type], current + delta));
      return { ...prev, [type]: newValue };
    });
  };

  const selectedVehicleOption = useMemo(() => vehicleOptions.find((option) => option.type === vehicleType) || vehicleOptions[0], [vehicleOptions, vehicleType]);
  const parsedSuggestion = priceSuggestion.trim().length > 0 ? Number(priceSuggestion) : NaN;
  const peekPrice = Number.isFinite(parsedSuggestion)
    ? Math.max(Math.round(vehicleEstimates[vehicleType]?.price ?? 0), Math.round(parsedSuggestion))
    : (vehicleEstimates[vehicleType]?.price ?? null);
  const hasRouteSelection = !!originCoords && !!destinationCoords;
  const hasRouteMetrics = hasRouteSelection && estimatedDistance > 0 && estimatedDuration > 0 && estimatedPrice > 0;
  const centerPinActive =
    mapSelectionMode === 'origin' || mapSelectionMode === 'destination' ||
    mapSelectionMode === 'extra-new' ||
    (typeof mapSelectionMode === 'object' && mapSelectionMode?.type === 'extra-edit');
  const editingExtraStopIndex =
    typeof mapSelectionMode === 'object' && mapSelectionMode?.type === 'extra-edit' ? mapSelectionMode.index : null;
  const visibleDestinationMarker = mapSelectionMode === 'destination' ? undefined : destinationCoords || undefined;
  const visibleExtraStopMarkers = extraDestinations
    .map((stop, index) => {
      if (index === editingExtraStopIndex) return null;
      if (!stop.coords) return null;
      return {
        latitude: stop.coords.latitude,
        longitude: stop.coords.longitude,
        index,
        title: t('common.mapPins.extraStop', { index: index + 1 }),
        label: stop.address || undefined,
      };
    })
    .filter(Boolean) as Array<{ latitude: number; longitude: number; index: number; title?: string; label?: string }>;
  const autoFitEnabled = !centerPinActive && !manualOriginDragging && !manualOriginLoading && !manualDestinationDragging && !manualDestinationLoading;
  const showManualOriginMarker = (!centerPinActive && (hasPinnedOrigin || !!originCoords || !!manualOriginDraft)) || mapSelectionMode === 'destination';
  const bottomPanelReady = hasRouteMetrics && !calculatingRoute && !centerPinActive && !manualOriginDragging && !manualDestinationDragging && !manualOriginLoading && !manualDestinationLoading;

  // Salir del modo de selección por pin sin tocar origen/destino/paradas ya
  // confirmadas: solo limpia borradores y flags de arrastre.
  const cancelMapSelection = useCallback(() => {
    setManualOriginDragging(false);
    setManualDestinationDragging(false);
    setManualOriginDraft(null);
    setManualDestinationDraft(null);
    setMapSelectionMode(null);
  }, [setManualOriginDragging, setManualDestinationDragging, setManualOriginDraft, setManualDestinationDraft, setMapSelectionMode]);

  // Mientras se selecciona con el pin (o se arrastra el mapa), "atrás" no debe
  // salir de la pantalla: la primera pulsación cancela la selección; la
  // siguiente ya navega normal. Cubre botón físico, gesto iOS y botón propio.
  useEffect(() => {
    const interactionActive =
      centerPinActive || manualOriginDragging || manualDestinationDragging || showSearchOverlay;
    if (!interactionActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSearchOverlay) {
        setShowSearchOverlay(false);
        return true;
      }
      if (centerPinActive) cancelMapSelection();
      return true;
    });
    return () => sub.remove();
  }, [centerPinActive, manualOriginDragging, manualDestinationDragging, showSearchOverlay, setShowSearchOverlay, cancelMapSelection]);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('beforeRemove', (event: any) => {
      if (manualOriginDragging || manualDestinationDragging) {
        event.preventDefault();
        return;
      }
      if (centerPinActive) {
        event.preventDefault();
        cancelMapSelection();
        return;
      }
      if (showSearchOverlay) {
        event.preventDefault();
        setShowSearchOverlay(false);
        return;
      }
      const navState = navigation.getState();
      const previousRoute = navState.routes[navState.index - 1];
      if (!allowRideFlowBack.current && previousRoute?.name === 'ClientHome' &&
          (event.data.action.type === 'GO_BACK' || event.data.action.type === 'POP')) {
        event.preventDefault();
        rideTransition.exit(() => {
          allowRideFlowBack.current = true;
          navigation.dispatch(event.data.action);
          allowRideFlowBack.current = false;
        });
      }
    });
    return unsubscribe;
  }, [navigation, centerPinActive, manualOriginDragging, manualDestinationDragging, showSearchOverlay, setShowSearchOverlay, cancelMapSelection, rideTransition.exit]);

  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.round(windowHeight * SHEET_EXPANDED_RATIO);
  const [peekContentHeight, setPeekContentHeight] = useState(140);
  const [ctaBlockHeight, setCtaBlockHeight] = useState(150);
  const [formContentHeight, setFormContentHeight] = useState(0);
  const collapsedSheetHeight = SHEET_HANDLE_HEIGHT + peekContentHeight + ctaBlockHeight;
  const expandedSheetHeight = Math.max(
    collapsedSheetHeight + 60,
    Math.min(sheetMaxHeight, SHEET_HANDLE_HEIGHT + formContentHeight + ctaBlockHeight + 8),
  );
  const fullSheetHeight = Math.max(
    expandedSheetHeight,
    Math.round(windowHeight - insets.top - 8),
  );
  const sheetHeight = useSharedValue(windowHeight * SHEET_EXPANDED_RATIO);
  const dragStartHeight = useSharedValue(0);
  const [panelLevel, setPanelLevel] = useState(1);

  const expandSheet = useCallback(() => {
    sheetHeight.value = withSpring(expandedSheetHeight, SHEET_SPRING);
    setPanelLevel(1);
    setBottomPanelExpanded(true);
  }, [expandedSheetHeight, sheetHeight, setBottomPanelExpanded]);

  const collapseSheet = useCallback(() => {
    sheetHeight.value = withSpring(collapsedSheetHeight, SHEET_SPRING);
    setPanelLevel(0);
    setBottomPanelExpanded(false);
  }, [collapsedSheetHeight, sheetHeight, setBottomPanelExpanded]);

  const toggleSheet = useCallback(() => {
    if (panelLevel > 0) collapseSheet();
    else expandSheet();
  }, [panelLevel, collapseSheet, expandSheet]);

  const makeSheetPan = useCallback(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onStart(() => {
          'worklet';
          dragStartHeight.value = sheetHeight.value;
        })
        .onUpdate((e) => {
          'worklet';
          const next = dragStartHeight.value - e.translationY;
          sheetHeight.value = Math.min(Math.max(next, collapsedSheetHeight), fullSheetHeight);
        })
        .onEnd((e) => {
          'worklet';
          const projected = sheetHeight.value - e.velocityY * 0.18;
          const detents = [collapsedSheetHeight, expandedSheetHeight, fullSheetHeight];
          let target = collapsedSheetHeight;
          let targetLevel = 0;
          for (let i = 0; i < detents.length; i += 1) {
            if (Math.abs(projected - detents[i]) < Math.abs(projected - target)) {
              target = detents[i];
              targetLevel = i;
            }
          }
          sheetHeight.value = withSpring(target, SHEET_SPRING);
          runOnJS(setPanelLevel)(targetLevel);
          runOnJS(setBottomPanelExpanded)(targetLevel > 0);
        }),
    [collapsedSheetHeight, expandedSheetHeight, fullSheetHeight, dragStartHeight, sheetHeight, setBottomPanelExpanded, setPanelLevel],
  );
  const handlePan = useMemo(() => {
    const tap = Gesture.Tap().onEnd(() => {
      'worklet';
      runOnJS(toggleSheet)();
    });
    return Gesture.Exclusive(tap, makeSheetPan());
  }, [makeSheetPan, toggleSheet]);
  const collapsedPan = useMemo(() => makeSheetPan(), [makeSheetPan]);

  const sheetHeightStyle = useAnimatedStyle(() => ({ height: sheetHeight.value }));
  const formRegionStyle = useAnimatedStyle(() => {
    const progress =
      (sheetHeight.value - collapsedSheetHeight) / Math.max(expandedSheetHeight - collapsedSheetHeight, 1);
    return { opacity: interpolate(progress, [0.3, 0.85], [0, 1], Extrapolation.CLAMP) };
  });
  const collapsedRegionStyle = useAnimatedStyle(() => {
    const progress =
      (sheetHeight.value - collapsedSheetHeight) / Math.max(expandedSheetHeight - collapsedSheetHeight, 1);
    return { opacity: interpolate(progress, [0, 0.3], [1, 0], Extrapolation.CLAMP) };
  });

  const bottomPanelTranslate = useMemo(
    () => bottomPanelAnim.interpolate({ inputRange: [0, 1], outputRange: [fullSheetHeight + 60, 0] }),
    [bottomPanelAnim, fullSheetHeight],
  );
  const isLocationLoading = manualOriginLoading || manualDestinationLoading || extraStopSelectionLoading;

  useEffect(() => {
    if (isLocationLoading) {
      markerBounce.setValue(0);
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(markerBounce, { toValue: 1, duration: 350, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(markerBounce, { toValue: 0, duration: 350, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }
    markerBounce.stopAnimation(() => markerBounce.setValue(0));
  }, [isLocationLoading, markerBounce]);

  useEffect(() => {
    Animated.timing(bottomPanelAnim, { toValue: bottomPanelReady ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [bottomPanelAnim, bottomPanelReady]);

  useEffect(() => {
    if (!bottomPanelReady) {
      sheetHeight.value = expandedSheetHeight;
      setPanelLevel(1);
      setBottomPanelExpanded(true);
    }
  }, [bottomPanelReady, expandedSheetHeight, sheetHeight, setBottomPanelExpanded]);

  // Keep the open sheet glued to the measured content height (e.g. when the
  // vehicle photo row appears or the form finishes measuring on first render).
  useEffect(() => {
    if (bottomPanelReady && panelLevel === 1 && Math.abs(sheetHeight.value - expandedSheetHeight) > 1) {
      sheetHeight.value = withTiming(expandedSheetHeight, { duration: 200 });
    }
  }, [expandedSheetHeight, bottomPanelReady, panelLevel, sheetHeight]);

  return (
    <View style={styles.container}>

      <View style={StyleSheet.absoluteFill}>
        <DynamicMap
          latitude={(originCoords || coords)?.latitude || DEFAULT_FALLBACK_COORDS.latitude}
          longitude={(originCoords || coords)?.longitude || DEFAULT_FALLBACK_COORDS.longitude}
          onMapPress={({ latitude, longitude }) => handleMapPress({ latitude, longitude })}
          onRegionChangeCenter={centerPinActive ? handleRegionChangeCenter : undefined}
          onRegionChangeCompleteCenter={centerPinActive ? handleRegionChangeCompleteCenter : undefined}
          autoFitEnabled={autoFitEnabled}
          allowRouteZoomOut
          fitEdgePadding={{
            top: 140,
            left: 60,
            right: 60,
            bottom: bottomPanelReady
              ? Math.min(windowHeight - 220, (panelLevel === 2 ? fullSheetHeight : panelLevel === 1 ? expandedSheetHeight : collapsedSheetHeight) + 16)
              : 80,
          }}
          destinationMarker={visibleDestinationMarker}
          extraStopMarkers={visibleExtraStopMarkers}
          showPinBubbles
          originTitle={t('common.mapPins.origin')}
          originLabel={manualOriginAddress || origin || undefined}
          destinationTitle={t('common.mapPins.destination')}
          destinationLabel={destination || undefined}
          routeCoordinates={routeCoordinates}
          showUserLocation={false}
          showTraffic
          showMarker={showManualOriginMarker}
          markerPosition={manualOriginMarkerPosition}
          markerType="manual_origin"
          draggableMarker
          manualOriginIcon={MANUAL_ORIGIN}
          manualOriginHoldIcon={MANUAL_ORIGIN_HOLD}
          onMarkerDragStart={handleManualOriginDragStart}
          onMarkerDragEnd={handleManualOriginDragEnd}
          cameraTarget={cameraTarget}
        />
        {centerPinActive && (
          <View pointerEvents="none" style={styles.centerPinContainer}>
            <Animated.Image
              source={
                mapSelectionMode === 'origin'
                  ? manualOriginDragging
                    ? MANUAL_ORIGIN_HOLD
                    : MANUAL_ORIGIN
                  : mapSelectionMode === 'destination'
                  ? DESTINATION_PIN
                  : MULTI_STOP_PIN
              }
              style={[
                styles.centerPinImage,
                isLocationLoading && { transform: [{ translateY: markerBounceTranslateY }] },
              ]}
              resizeMode="contain"
            />
          </View>
        )}
      </View>

      {centerPinActive ? (
        <SearchRideConfirmPinButton
          colors={colors}
          bottom={insets.bottom + 28}
          loading={isLocationLoading}
          onPress={confirmCenterPinSelection}
          tr={tr}
        />
      ) : null}

      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, rideTransition.topStyle]}>
      {panelLevel < 2 ? (
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 12 }]}
          onPress={() => {
            if (centerPinActive) cancelMapSelection();
            else if (!manualOriginDragging && !manualDestinationDragging) navigation?.goBack?.();
          }}
          disabled={showSearchOverlay}
          accessibilityLabel={tr('accessibility.back')}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
      ) : null}

      <SearchRideRouteBubble
        top={insets.top + 12}
        orderedRouteRows={orderedRouteRows}
        canAddExtraStop={canAddExtraStop}
        manualOriginLoading={manualOriginLoading}
        manualOriginAddress={manualOriginAddress}
        manualOriginDraft={manualOriginDraft}
        manualDestinationLoading={manualDestinationLoading}
        manualDestinationDraft={manualDestinationDraft}
        destination={destination}
        destinationCoords={destinationCoords}
        mapSelectionMode={mapSelectionMode}
        extraDestinations={extraDestinations}
        onRouteRowPress={handleRouteRowPress}
        onAddExtraStop={beginAddExtraStop}
        onRemoveStop={handleRemoveStop}
        styles={styles}
        colors={colors}
        tr={tr}
      />
      </Animated.View>

      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, rideTransition.bottomStyle]}>
      <Animated.View
        pointerEvents={bottomPanelReady ? 'auto' : 'none'}
        style={[styles.bottomPanel, { transform: [{ translateY: bottomPanelTranslate }], opacity: bottomPanelAnim }]}
      >
        <GestureHandlerRootView style={styles.sheetRoot}>
          <Reanimated.View style={[styles.sheetContent, sheetHeightStyle]}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
              style={styles.bottomAvoiding}
            >
              <GestureDetector gesture={handlePan}>
                <View
                  style={styles.panelToggle}
                  accessibilityRole="button"
                  accessibilityLabel={tr('accessibility.togglePanel')}
                >
                  <View style={styles.panelHandle} />
                </View>
              </GestureDetector>

              <View style={styles.sheetBody}>
                <Reanimated.View
                  style={[styles.sheetFormRegion, formRegionStyle]}
                  pointerEvents={bottomPanelExpanded ? 'auto' : 'none'}
                >
                  <ScrollView
                    style={styles.formScroll}
                    contentContainerStyle={styles.formContent}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    scrollEnabled={bottomPanelExpanded}
                    onContentSizeChange={(_, h) => setFormContentHeight(h)}
                  >
                    <SearchRideVehicleOptions
                      vehicleOptions={vehicleOptions}
                      vehicleType={vehicleType}
                      serviceFeatures={selectedFeatureService?.features ?? []}
                      featuresCatalogAvailable={selectedFeatureService?.featuresCatalogAvailable === true}
                      selectedFeatureCodes={selectedFeatureCodes ?? []}
                      calculationAt={calculationAt}
                      onToggleFeature={onToggleFeature}
                      vehicleEstimates={vehicleEstimates}
                      designatedDriverEstimates={designatedDriverEstimates}
                      designatedDriverMode={designatedDriverMode}
                      designatedDriverEligibility={designatedDriverEligibility}
                      recommendedVehicle={recommendedVehicle}
                      calculatingRoute={calculatingRoute}
                      calculatingPrice={calculatingPrice}
                      priceCalculationError={priceCalculationError}
                      estimatedDuration={estimatedDuration}
                      capacityByVehicle={capacityByVehicle}
                      passengersByVehicle={passengersByVehicle}
                      surgeMultiplier={priceBreakdown?.surgeMultiplier ?? 1}
                      requiresVehiclePhoto={requiresVehiclePhoto}
                      hasVehiclePhotoSelection={hasVehiclePhotoSelection}
                      uploadingPhoto={uploadingPhoto}
                      formatPriceValue={formatPriceValue}
                      getPassengersForVehicle={getPassengersForVehicle}
                      canDecreasePassengers={canDecreasePassengers}
                      canIncreasePassengers={canIncreasePassengers}
                      onSelectVehicle={handleSelectVehicle}
                      onSetDesignatedDriverMode={setDesignatedDriverMode}
                      onUpdatePassengers={updatePassengers}
                      priceSuggestion={priceSuggestion}
                      onSetPriceSuggestion={setPriceSuggestion}
                      onTakeVehiclePhoto={handleTakeVehiclePhoto}
                      colors={colors}
                      styles={styles}
                      tr={tr}
                    />

                    <SearchRideSummary
                      estimatedDistance={estimatedDistance}
                      estimatedDuration={estimatedDuration}
                      paymentMethod={paymentMethod}
                      rideComment={rideComment}
                      checkingDrivers={checkingDrivers}
                      driversAvailable={driversAvailable}
                      isPeakHour={priceBreakdown?.isPeakHour ?? isPeakHour(calculationAt)}
                      colors={colors}
                      onSetPaymentMethod={setPaymentMethod}
                      onSetRideComment={setRideComment}
                      styles={styles}
                      tr={tr}
                    />
                  </ScrollView>
                </Reanimated.View>

                <Reanimated.View
                  style={[styles.collapsedOverlay, collapsedRegionStyle]}
                  pointerEvents={bottomPanelExpanded ? 'none' : 'auto'}
                >
                  <GestureDetector gesture={collapsedPan}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={expandSheet}
                      accessibilityRole="button"
                      accessibilityLabel={tr('labels.viewOptions')}
                    >
                      <View
                        style={styles.collapsedSummary}
                        onLayout={(e) => setPeekContentHeight(Math.round(e.nativeEvent.layout.height))}
                      >
                        <View style={styles.collapsedSummaryRow}>
                          <Image
                            source={VEHICLE_OPTION_IMAGES[vehicleType]}
                            style={styles.collapsedSummaryImage}
                            resizeMode="contain"
                            accessibilityIgnoresInvertColors
                          />
                          <View style={styles.collapsedSummaryText}>
                            <View style={styles.collapsedSummaryTitleRow}>
                              <Text style={styles.collapsedSummaryTitle} numberOfLines={1}>
                                {selectedVehicleOption?.label ?? defaultLabels.service}
                              </Text>
                              <View style={styles.collapsedSummaryPassengers}>
                                <RideIcon name="person" size={12} color={colors.textSecondary || '#666666'} />
                                <Text style={styles.collapsedSummaryPassengersText}>
                                  {getPassengersForVehicle(vehicleType)}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.collapsedSummaryMeta} numberOfLines={1}>
                              {`${estimatedDistance > 0 ? estimatedDistance.toFixed(1) : '--'} km · ${
                                calculatingRoute
                                  ? tr('labels.calculating')
                                  : estimatedDuration > 0
                                  ? tr('labels.etaValue', { minutes: estimatedDuration })
                                  : tr('labels.etaUnavailable')
                              }${selectedVehicleOption?.subtitle ? ` · ${selectedVehicleOption.subtitle}` : ''}`}
                            </Text>
                          </View>
                          <View style={styles.collapsedSummaryRight}>
                            <Text style={styles.collapsedSummaryPrice}>
                              {formatPriceValue(peekPrice)}
                            </Text>
                            <View style={styles.collapsedSummaryExpandHint}>
                              <Text style={styles.collapsedSummaryExpandHintText}>{tr('labels.viewOptions')}</Text>
                              <RideIcon name="chevron-up" size={14} color={colors.primary || '#b38737'} />
                            </View>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </GestureDetector>
                </Reanimated.View>
              </View>

              <View
                onLayout={(e) => setCtaBlockHeight(Math.round(e.nativeEvent.layout.height))}
                style={{ paddingBottom: Math.max(insets.bottom, 12) }}
              >
                <SearchRideCTA
                  scheduledAt={scheduledAt}
                  submittingRequest={submittingRequest}
                  isRequestReady={isRequestReady}
                  onOpenScheduleModal={openScheduleModal}
                  onClearSchedule={() => setScheduledAt(null)}
                  onConfirmRequest={onConfirmRequest}
                  styles={styles}
                  colors={colors}
                  tr={tr}
                />
              </View>
            </KeyboardAvoidingView>
          </Reanimated.View>
        </GestureHandlerRootView>
      </Animated.View>
      </Animated.View>

      {showSearchOverlay && (
        <SearchRideSearchOverlay
          selectionTitle={selectionTitle}
          topInset={insets.top}
          isDestinationSelection={isDestinationSelection}
          shouldHighlightMapAction={shouldHighlightMapAction}
          hasConfirmedDestination={hasConfirmedDestination}
          searchQuery={searchQuery}
          searchLoading={searchLoading}
          searchError={searchError}
          searchResults={searchResults}
          favoriteLocations={favoriteLocations}
          recentLocations={
            activeSelection === 'origin' ? recentOriginLocations : recentDestinationLocations
          }
          activeSelection={activeSelection}
          colors={colors}
          onSetSearchQuery={setSearchQuery}
          onSetSearchError={setSearchError}
          onClose={closeSearchOverlay}
          onUseCurrentLocation={handleUseCurrentLocation}
          onPickFromMap={handlePickFromMap}
          onSelectSuggestion={handleSelectSuggestion}
          onSelectSavedLocation={handleSelectSavedLocation}
          styles={styles}
          tr={tr}
        />
      )}

      {submittingRequest && (
        <View style={styles.submittingOverlay} pointerEvents="none">
          <View style={styles.submittingCard}>
            <LoadingIcon size={32} color={colors.primary || '#b38737'} />
            <Text style={[styles.submittingText, { color: colors.text }]}>{tr('cta.loading')}</Text>
          </View>
        </View>
      )}

      <SearchRideScheduleModal
        visible={scheduleModalVisible}
        isDark={isDark}
        colors={colors}
        scheduleDayIndex={scheduleDayIndex}
        scheduleDayOptions={scheduleDayOptions}
        scheduleHour={scheduleHour}
        scheduleHourOptions={scheduleHourOptions}
        scheduleMinute={scheduleMinute}
        scheduleMinuteOptionsForHour={scheduleMinuteOptionsForHour}
        onSetScheduleDayIndex={setScheduleDayIndex}
        onSetScheduleHour={setScheduleHour}
        onSetScheduleMinute={setScheduleMinute}
        onClose={() => setScheduleModalVisible(false)}
        onConfirm={applyScheduleSelection}
        styles={styles}
        tr={tr}
      />
    </View>
  );
}

function createStyles(colors: any, isDark: boolean = false) {
  const accent = colors.primary || '#b38737';
  const accentStrong = isDark ? '#e8c47f' : '#c38d28';
  const accentSoft = isDark ? 'rgba(179, 135, 55, 0.26)' : 'rgba(179, 135, 55, 0.1)';
  const accentBorder = isDark ? 'rgba(232, 196, 127, 0.45)' : 'rgba(179, 135, 55, 0.45)';
  const cardBg = colors.card || '#ffffff';
  const card2Bg = colors.card2 || '#ededed';
  const surfaceBg = colors.surface || 'rgba(245, 245, 245, 0.07)';
  const surface2Bg = isDark ? 'rgba(255, 255, 255, 0.015)' : 'rgba(118, 118, 118, 0.03)';
  const textPrimary = colors.text || '#111111';
  const textSecondary = colors.textSecondary || '#666666';
  const borderColor = colors.border || '#e0e0e0';
  const inputBg = isDark ? '#484848' : surfaceBg;
  const inputBgDeep = isDark ? 'rgba(255, 255, 255, 0.07)' : surfaceBg;
  const successSoft = isDark ? 'rgba(129, 199, 132, 0.15)' : 'rgba(76, 175, 80, 0.1)';
  const successBorder = isDark ? 'rgba(129, 199, 132, 0.4)' : 'rgba(76, 175, 80, 0.35)';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background || '#fff' },

    backButton: {
      position: 'absolute',
      left: 16,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: cardBg,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 5,
      zIndex: 30,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: borderColor,
    },
    // Center pin overlay for origin selection
    centerPinContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    centerPinImage: { width: 48, height: 48 },

    routeBubble: {
      position: 'absolute',
      // A la derecha del back button (16 + 44 + 12 de separación)
      left: 72,
      right: 14,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: cardBg,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: borderColor,
    },

    routeTimeline: { marginTop: 4 },
    timelineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    timelineLeft: { width: 30, alignItems: 'center' },
    timelineIcon: { width: 20, height: 20 },
    timelineConnector: { flex: 1, width: 2, backgroundColor: borderColor, marginTop: 4 },
    timelineCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    // Cada fila luce como campo de búsqueda (mismo relleno que los inputs) +
    // lupa a la derecha: señala que se toca para abrir el selector de lugar.
    timelineContent: {
      flex: 1,
      marginHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: inputBg,
      borderWidth: 0.1,
      borderColor: borderColor,
    },
    timelineContentText: { flex: 1 },
    // Pin de parada atenuado = "espacio disponible" para una parada nueva.
    addStopMarker: {
      width: 20,
      height: 20,
      opacity: 0.5,
    },
    addStopButton: {
      marginHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 5,
      paddingHorizontal: 11,
      borderRadius: 24,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: accentBorder,
      backgroundColor: accentSoft,
      // Sin elevation: en Android, elevation + fondo rgba translúcido hace que
      // la sombra sangre dentro de la vista (bandas de dos tonos).
      shadowColor: accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
    },
    addStopButtonIcon: { fontSize: 13, fontWeight: '800', color: accent, lineHeight: 15 },
    addStopButtonText: { fontSize: 12.5, fontWeight: '600', color: accent },
    timelineLabel: { fontSize: 14, fontWeight: '600', color: textPrimary },
    timelineLabelPlaceholder: { color: textSecondary, fontWeight: '500' },
    timelineSubtitle: { fontSize: 11, color: textSecondary, marginTop: 2 },
    timelineRemove: { padding: 8 },
    timelineRemoveText: { fontSize: 14, color: colors.error || '#e53935', fontWeight: '700' },

    bottomPanel: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: cardBg,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 12,
      zIndex: 35,
      overflow: 'hidden',
    },
    sheetRoot: { width: '100%' },
    sheetContent: { width: '100%', overflow: 'hidden' },
    bottomAvoiding: { flex: 1 },
    sheetBody: { flex: 1 },
    sheetFormRegion: { flex: 1 },
    collapsedOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: cardBg,
    },
    formScroll: { flexGrow: 0, flexShrink: 1 },
    formContent: { paddingBottom: 16, paddingHorizontal: 4, gap: 12 },
    panelToggle: { alignItems: 'center', justifyContent: 'center', height: SHEET_HANDLE_HEIGHT },
    panelHandle: {
      width: 44,
      height: 5,
      borderRadius: 20,
      backgroundColor: borderColor,
    },
    collapsedSummary: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: surface2Bg,
      borderWidth: 0,
      borderColor: borderColor,
    },
    collapsedSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    collapsedSummaryImage: { width: 66, height: 38 },
    collapsedSummaryText: { flex: 1, minWidth: 0, gap: 3 },
    collapsedSummaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
    collapsedSummaryTitle: { fontSize: 15, fontWeight: '800', color: textPrimary, flexShrink: 1 },
    collapsedSummaryPassengers: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    collapsedSummaryPassengersText: {
      fontSize: 12,
      fontWeight: '700',
      color: textSecondary,
      fontVariant: ['tabular-nums'],
    },
    collapsedSummaryMeta: { fontSize: 12, color: textSecondary, fontVariant: ['tabular-nums'] },
    collapsedSummaryRight: { alignItems: 'flex-end', gap: 2 },
    collapsedSummaryPrice: { fontSize: 19, fontWeight: '800', color: accentStrong, fontVariant: ['tabular-nums'] },
    collapsedSummaryExpandHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    collapsedSummaryExpandHintText: { fontSize: 11, fontWeight: '600', color: textSecondary },

    section: { marginBottom: 16 },
    vehicleSection: {},
    summarySection: { gap: 8 },
    summaryRouteMetrics: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    summaryRouteTile: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: surface2Bg,
    },
    summaryRouteMetric: { flex: 1, minWidth: 0, gap: 2 },
    summaryRouteLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.45,
    },
    summaryRouteValue: { fontSize: 17, fontWeight: '700', color: textPrimary, fontVariant: ['tabular-nums'] },
    summaryAvailabilityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
    summaryAvailabilityDot: { width: 7, height: 7, borderRadius: 4, marginTop: 4 },
    summaryAvailabilityText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '600' },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 50,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: inputBgDeep,
    },
    summaryRowInput: { flex: 1, minHeight: 46, fontSize: 14, fontWeight: '600', color: textPrimary, padding: 0 },
    sectionCompact: { marginBottom: 14 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: textPrimary, marginBottom: 8 },

    vehicleOptionsList: { gap: 12 },
    vehicleOptionCard: {
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: surface2Bg,
      paddingHorizontal: 10,
    },
    vehicleOptionCardSelected: {
      backgroundColor: isDark ? 'rgba(72, 72, 72, 0.45)' : surfaceBg,
    },
    vehicleOptionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, minHeight: 64 },
    vehicleOptionIconBubble: {
      width: 52,
      height: 44,
      borderRadius: 12,
      // backgroundColor: surfaceBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vehicleOptionIconBubbleSelected: { backgroundColor: accentSoft, borderRadius: 8 },
    vehicleOptionIconImage: { width: 56, height: 42 },
    vehicleOptionTitleBlock: { flex: 1, minWidth: 0 },
    vehicleOptionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
    vehicleOptionTitle: { fontSize: 16, fontWeight: '700', color: textPrimary, flexShrink: 1 },
    vehicleOptionPassengerDisplay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(179, 135, 55, 0)' : 'rgba(179, 135, 55, 0.1)',
    },
    vehicleOptionPassengerValue: { fontSize: 13, fontWeight: '700', color: textPrimary },
    vehicleOptionMeta: { fontSize: 12.5, color: textPrimary, marginTop: 1, fontVariant: ['tabular-nums'] },
    vehicleOptionSubtitle: { fontSize: 12.5, color: textSecondary, marginTop: 1 },
    vehicleOptionPrice: { fontSize: 16, fontWeight: '700', color: textPrimary, fontVariant: ['tabular-nums'], marginLeft: 4 },
    vehicleOptionExpanded: {
      gap: 10,
      paddingTop: 10,
      paddingBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: borderColor,
    },
    vehicleOptionPassengerControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.08)' : '#ededed',
      padding: 4,
    },
    vehicleOptionCounterBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: cardBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vehicleOptionCounterBtnDisabled: { opacity: 0.35 },
    vehicleOptionSelectArea: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    vehicleOptionPassengerControlsCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(72, 72, 72, 0.6)' : '#ededed',
      padding: 4,
      marginLeft: 4,
    },
    vehicleOptionCounterBtnCompact: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: cardBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vehicleOptionPassengerCountCompact: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    vehicleOptionPassengerCountTextCompact: { fontSize: 15, fontWeight: '800', color: textPrimary, fontVariant: ['tabular-nums'] },

    vehicleOptionOfferControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(72, 72, 72, 0.6)' : '#ededed',
      padding: 8,
    },
    vehicleOptionOfferCounterBtn: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: cardBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vehicleOptionOfferCenter: { alignItems: 'center', gap: 2 },
    vehicleOptionSuggestRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    vehicleOptionSuggestLabel: {
      fontSize: 10.5,
      fontWeight: '700',
      color: textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.45,
    },
    vehicleOptionEstimateTag: {
      fontSize: 10.5,
      fontWeight: '700',
      color: textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.45,
    },
    vehicleOptionEstimateLine: {
      fontSize: 13,
      fontWeight: '600',
      color: textSecondary,
      opacity: 0.6,
      textDecorationLine: 'line-through',
      fontVariant: ['tabular-nums'],
    },
    vehicleOptionOfferValue: { fontSize: 22, fontWeight: '800', color: accentStrong, fontVariant: ['tabular-nums'] },
    vehicleOptionOfferInput: {
      minWidth: 72,
      fontSize: 22,
      fontWeight: '800',
      color: accentStrong,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      padding: 0,
    },
    vehicleOptionOfferFallback: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: textSecondary,
      textAlign: 'center',
      paddingVertical: 10,
    },

    vehicleFeaturesSection: { gap: 7 },
    vehicleFeaturesHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    vehicleFeaturesLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    vehicleFeaturesHint: { 
      fontSize: 13, 
      color: textSecondary,
      fontWeight: '600',
    },
    vehicleFeatureRail: { gap: 8, paddingRight: 8 },
    vehicleFeatureCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 170,
      maxWidth: 210,
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: surface2Bg,
    },
    vehicleFeatureCardSelected: { backgroundColor: accentSoft },
    vehicleFeatureCardDisabled: { opacity: 0.45 },
    vehicleFeatureCardBody: { flex: 1, minWidth: 0, gap: 2 },
    vehicleFeatureCardTitle: { fontSize: 13, fontWeight: '700', color: textPrimary },
    vehicleFeatureCardMeta: { fontSize: 11.5, fontWeight: '600', color: textSecondary, fontVariant: ['tabular-nums'] },
    vehicleFeatureToggle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: textSecondary,
    },
    vehicleFeatureToggleSelected: { borderColor: accent, backgroundColor: accent },
    vehicleDemandNotice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    vehicleDemandNoticeText: { fontSize: 12, fontWeight: '600', color: colors.warning || '#ffa726' },

    designatedDriverModeChips: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      borderRadius: 14,
      backgroundColor: surfaceBg,
    },
    designatedDriverModeChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: 11,
    },
    designatedDriverModeChipSelected: {
      backgroundColor: cardBg,
      shadowColor: '#000',
      shadowOpacity: Platform.OS === 'ios' ? 0.08 : 0,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: Platform.OS === 'android' ? 1 : 0,
    },
    designatedDriverModeChipText: { fontSize: 14, fontWeight: '600', color: textSecondary },
    designatedDriverModeChipTextSelected: { color: textPrimary },
    designatedDriverModeChipPrice: { fontSize: 12, color: textSecondary, fontVariant: ['tabular-nums'] },
    designatedDriverModeInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    designatedDriverModeInfoText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.warning || '#ffa726',
      flexShrink: 1,
    },

    photoHint: { fontSize: 12, color: textSecondary, marginTop: 1 },
    photoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: card2Bg,
    },
    photoButtonText: { color: textPrimary, fontWeight: '700', fontSize: 14 },

    cta: {
      flex: 1,
      backgroundColor: accent,
      paddingVertical: 15,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaDisabled: { opacity: 0.5 },
    ctaLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },

    ctaContainer: { paddingTop: 12, gap: 10 },
    ctaRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },

    scheduleIconCta: {
      width: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(109, 68, 255, 0.75)',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    scheduleIconCtaActive: { 
      backgroundColor: accentSoft, 
      borderColor: accentBorder ,
    },

    scheduledRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    scheduledInfo: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: accentSoft,
    },
    scheduledText: { flex: 1, fontSize: 13, fontWeight: '700', color: accentStrong },
    scheduledClear: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: card2Bg,
    },

    scheduleModalRoot: { flex: 1 },
    scheduleBackdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.overlay || 'rgba(0,0,0,0.6)',
    },
    scheduleSheetDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    scheduleSheet: {
      backgroundColor: colors.card || '#ffffff',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: 'hidden',
      paddingHorizontal: 20,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0 : 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -4 },
      elevation: isDark ? 0 : 12,
      borderTopWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderTopColor: borderColor,
    },
    scheduleHandleZone: { alignItems: 'center', paddingVertical: 10 },
    scheduleHandle: {
      width: 48,
      height: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.16)',
    },
    scheduleHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    scheduleTitleIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accentSoft,
    },
    scheduleTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: textPrimary },
    scheduleCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface || '#F5F5F5',
    },
    scheduleSectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: textSecondary,
      marginTop: 14,
      marginBottom: 8,
    },
    schedulePickerTrack: {
      flexDirection: 'row',
      backgroundColor: colors.surface || '#F5F5F5',
      borderRadius: 14,
      overflow: 'hidden',
      ...(Platform.OS === 'ios' ? { height: 148 } : {}),
    },
    scheduleDayPickerCol: { flex: 1.6 },
    scheduleTimePickerCol: { flex: 1 },
    schedulePickerWheel: Platform.OS === 'ios' ? { height: 148 } : {},
    schedulePreview: {
      marginTop: 14,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '700',
      color: accentStrong,
      fontVariant: ['tabular-nums'],
    },
    scheduleConfirmBtn: {
      marginTop: 16,
      backgroundColor: accent,
      paddingVertical: 15,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scheduleConfirmText: { 
      color: '#fff', 
      fontSize: 16, 
      fontWeight: '800' 
    },
    scheduleCancelBtn: {
      alignItems: 'center',
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginTop: 6,
      justifyContent: 'center',
      backgroundColor: 'rgba(200, 48, 48, 0.9)'
    },
    scheduleCancelText: { 
      fontSize: 14, 
      fontWeight: '800', 
      color: textPrimary 
    },
    scheduleHintRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 10,
    },
    scheduleHintText: {
      flexShrink: 1,
      fontSize: 12,
      fontWeight: '500',
      color: textSecondary,
      textAlign: 'center',
      lineHeight: 17,
    },

    estimateCard: { borderRadius: 14, padding: 12, backgroundColor: cardBg, borderWidth: 1, borderColor: borderColor, marginBottom: 10 },
    estimateCardElevated: {
      shadowColor: '#000',
      shadowOpacity: Platform.OS === 'ios' ? 0.06 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: Platform.OS === 'android' ? 2 : 0,
    },
    centeredRow: { flexDirection: 'row', alignItems: 'center' },
    estimateText: { marginLeft: 8, color: textSecondary },
    estimateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
    estimateLabel: { color: textSecondary, fontSize: 13 },
    estimateValue: { color: textPrimary, fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] },
    estimateHeroRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 6,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: borderColor,
    },
    estimateHeroLabel: { color: textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    estimateHeroValue: { color: accentStrong, fontWeight: '800', fontSize: 26, fontVariant: ['tabular-nums'] },

    paymentRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 8 },
    paymentChip: {
      paddingVertical: 9,
      paddingHorizontal: 18,
      borderRadius: 999,
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: borderColor,
    },
    paymentChipSelected: { backgroundColor: accent, borderColor: accent },
    paymentChipText: { color: textPrimary, fontWeight: '600', fontSize: 14 },
    paymentChipTextSelected: { color: '#fff' },

    priceCommentRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 4 },
    priceCommentColumn: { flex: 1 },
    priceCommentLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: textSecondary,
      marginBottom: 6,
    },
    priceCommentInput: {
      height: 42,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: inputBg,
      borderWidth: 1,
      borderColor: borderColor,
      color: textPrimary,
      fontSize: 14,
    },

    availabilityRow: { marginTop: 10, alignItems: 'center' },
    availabilityText: { color: textSecondary, fontSize: 13 },
    availabilityWarn: { color: colors.warning || '#ffa726', fontWeight: '700', fontSize: 13 },
    availabilityOk: { color: colors.success || '#4caf50', fontWeight: '700', fontSize: 13 },

    submittingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    },
    submittingCard: {
      paddingVertical: 20,
      paddingHorizontal: 28,
      borderRadius: 18,
      backgroundColor: cardBg,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
      gap: 12,
    },
    submittingText: {
      marginTop: 12,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },

    searchOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 16,
      zIndex: 40,
    },
    searchCard: {
      borderRadius: 22,
      padding: 16,
      maxHeight: '92%',
      backgroundColor: cardBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 20,
      top: -50,
      left: 0,
    },
    searchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    searchTitle: { fontSize: 18, fontWeight: '800', color: textPrimary, flexShrink: 1 },

    searchInputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: Platform.select({ ios: 12, android: 8, default: 8 }),
      backgroundColor: inputBgDeep,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: borderColor,
    },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary, padding: 0 },

    searchActionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    searchActionChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 11,
      paddingHorizontal: 10,
      borderRadius: 14,
      backgroundColor: accentSoft,

    },
    searchActionChipPrimary: { backgroundColor: isDark ? 'rgba(124, 94, 234, 0.4)' : 'rgb(214, 161, 61)'},
    searchActionText: { fontSize: 12.5, fontWeight: '800', color: accentStrong },
    searchActionTextPrimary: { color: '#FFFFFF' },
    searchConfirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    searchConfirmedText: { fontSize: 12, fontWeight: '600' },
    searchStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
    searchStatusText: { fontSize: 13, fontWeight: '600', color: textSecondary },
    searchErrorText: { fontSize: 13, fontWeight: '600', color: colors.error || '#e53935', marginTop: 12 },

    searchScroll: { marginTop: 6, flexShrink: 1 },
    savedSection: { marginTop: 8 },
    savedSectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: textSecondary,
      marginBottom: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    savedItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: borderColor,
    },
    searchResultBody: { flex: 1, minWidth: 0 },
    searchResultsSection: { paddingBottom: 8 },
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: borderColor,
    },
    searchResultMain: { fontSize: 14, fontWeight: '700', color: textPrimary },
    searchResultSecondary: { fontSize: 12, fontWeight: '500', color: textSecondary, marginTop: 1 },
  });
}