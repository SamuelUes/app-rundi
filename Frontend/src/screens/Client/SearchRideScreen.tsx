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
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
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
import servicesService, { ServiceItem } from '../../services/servicesService';
import {
  getFeatureAvailability,
  getSelectedFeatureCodes,
  type FeatureOverrides,
} from '../../utils/rideFeatures';
import alertService from '../../services/alertService';
import { metersBetween, type Coords } from '../../utils/rideCoords';
import { normalizeSuggestion, type NormalizedSuggestion } from '../../utils/suggestions';
import { useRideRouteCalculation } from '../../hooks/client/SearchRideScreen/useRideRouteCalculation';
import { useScheduleRide } from '../../hooks/client/SearchRideScreen/useScheduleRide';
import { useSearchRideState } from '../../hooks/client/SearchRideScreen/useSearchRideState';
import { useSearchRideLocation } from '../../hooks/client/SearchRideScreen/useSearchRideLocation';
import { useSearchRideSubmission } from '../../hooks/client/SearchRideScreen/useSearchRideSubmission';
import { useVehiclePhoto } from '../../hooks/client/SearchRideScreen/useVehiclePhoto';
import { useDriversAvailability } from '../../hooks/client/SearchRideScreen/useDriversAvailability';
import { SearchRideRouteBubble } from '../../components/client/SearchRide/SearchRideRouteBubble';
import { SearchRideVehicleOptions, RideIcon } from '../../components/client/SearchRide/SearchRideVehicleOptions';
import { SearchRideSummary } from '../../components/client/SearchRide/SearchRideSummary';
import { SearchRideCTA } from '../../components/client/SearchRide/SearchRideCTA';
import { SearchRideSearchOverlay } from '../../components/client/SearchRide/SearchRideSearchOverlay';
import { SearchRideScheduleModal } from '../../components/client/SearchRide/SearchRideScheduleModal';
import type { RecurringRide } from '../../types/recurringRide';

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
    extraStopSelectionLoading,
    hasPinnedOrigin, setHasPinnedOrigin,
    cameraTarget,
    mapSelectionMode, setMapSelectionMode,
    showSearchOverlay, setShowSearchOverlay,
    searchQuery, setSearchQuery,
    activeSelection, setActiveSelection,
    recentLocations,
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
            : undefined,
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
  const selectedFeatureCodes = selectedFeatureCodesByService[selectedFeatureServiceCode];
  const { driversAvailable, checkingDrivers, availabilityByType } = useDriversAvailability(
    coords,
    vehicleType,
    designatedDriverMode,
    selectedFeatureServiceCode,
    selectedFeatureCodes,
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
    handleRegionChangeCompleteCenter,
    handleMapPress,
    manualOriginMarkerPosition,
  } = useSearchRideLocation(state, user?.id, coords, defaultLabels, tr, recomputeRouteWith);

  const {
    clientVehiclePhoto,
    clientVehiclePhotoLocalUri,
    uploadingPhoto,
    handleTakeVehiclePhoto,
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
    tr,
    navigation,
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
    recalcPriceOnly(originCoords, coords, destinationCoords, stopsCount);
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
    recalcPriceOnly,
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
          const mapsService = (await import('../../services/mapsService')).default;
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

  const selectionDescription = useMemo(() => {
    if (activeSelection === 'origin') return tr('search.descriptionOrigin');
    if (activeSelection === 'destination') return tr('search.descriptionDestination');
    if (activeSelection === 'new-stop' || typeof activeSelection === 'number') return tr('search.descriptionExtra');
    return tr('search.descriptionGeneric');
  }, [activeSelection, tr]);

  const isDestinationSelection = activeSelection === 'destination';
  const shouldHighlightMapAction = isDestinationSelection && !destinationCoords;
  const hasConfirmedDestination = !!destinationCoords;
  const requiresVehiclePhoto = vehicleType === 'designated_driver';
  const hasVehiclePhotoSelection = !!clientVehiclePhoto || !!clientVehiclePhotoLocalUri;
  const isRequestReady =
    !!destinationCoords && estimatedPrice > 0 && !calculatingRoute && !calculatingPrice && !priceCalculationError &&
    (!requiresVehiclePhoto || (hasVehiclePhotoSelection && !uploadingPhoto));

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
  const sheetHeight = useSharedValue(windowHeight * SHEET_EXPANDED_RATIO);
  const dragStartHeight = useSharedValue(0);

  const expandSheet = useCallback(() => {
    sheetHeight.value = withSpring(expandedSheetHeight, SHEET_SPRING);
    setBottomPanelExpanded(true);
  }, [expandedSheetHeight, sheetHeight, setBottomPanelExpanded]);

  const collapseSheet = useCallback(() => {
    sheetHeight.value = withSpring(collapsedSheetHeight, SHEET_SPRING);
    setBottomPanelExpanded(false);
  }, [collapsedSheetHeight, sheetHeight, setBottomPanelExpanded]);

  const toggleSheet = useCallback(() => {
    if (bottomPanelExpanded) collapseSheet();
    else expandSheet();
  }, [bottomPanelExpanded, collapseSheet, expandSheet]);

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
          sheetHeight.value = Math.min(Math.max(next, collapsedSheetHeight), expandedSheetHeight);
        })
        .onEnd((e) => {
          'worklet';
          const projected = sheetHeight.value - e.velocityY * 0.18;
          const mid = (collapsedSheetHeight + expandedSheetHeight) / 2;
          const target = projected >= mid ? expandedSheetHeight : collapsedSheetHeight;
          sheetHeight.value = withSpring(target, SHEET_SPRING);
          runOnJS(setBottomPanelExpanded)(target === expandedSheetHeight);
        }),
    [collapsedSheetHeight, expandedSheetHeight, dragStartHeight, sheetHeight, setBottomPanelExpanded],
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
    () => bottomPanelAnim.interpolate({ inputRange: [0, 1], outputRange: [sheetMaxHeight + 60, 0] }),
    [bottomPanelAnim, sheetMaxHeight],
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
      setBottomPanelExpanded(true);
    }
  }, [bottomPanelReady, expandedSheetHeight, sheetHeight, setBottomPanelExpanded]);

  // Keep the open sheet glued to the measured content height (e.g. when the
  // vehicle photo row appears or the form finishes measuring on first render).
  useEffect(() => {
    if (bottomPanelReady && bottomPanelExpanded && Math.abs(sheetHeight.value - expandedSheetHeight) > 1) {
      sheetHeight.value = withTiming(expandedSheetHeight, { duration: 200 });
    }
  }, [expandedSheetHeight, bottomPanelReady, bottomPanelExpanded, sheetHeight]);

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

      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 12 }]}
        onPress={() => navigation?.goBack?.()}
        accessibilityLabel={tr('accessibility.back')}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </TouchableOpacity>

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
        tr={tr}
      />

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
                      onTakeVehiclePhoto={handleTakeVehiclePhoto}
                      colors={colors}
                      styles={styles}
                      tr={tr}
                    />

                    <SearchRideSummary
                      calculatingRoute={calculatingRoute}
                      estimatedDistance={estimatedDistance}
                      estimatedDuration={estimatedDuration}
                      estimatedPrice={estimatedPrice}
                      calculatingPrice={calculatingPrice}
                      priceCalculationError={priceCalculationError}
                      paymentMethod={paymentMethod}
                      priceSuggestion={priceSuggestion}
                      rideComment={rideComment}
                      checkingDrivers={checkingDrivers}
                      driversAvailable={driversAvailable}
                      colors={colors}
                      onSetPaymentMethod={setPaymentMethod}
                      onSetPriceSuggestion={setPriceSuggestion}
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
                    <TouchableOpacity activeOpacity={1} onPress={expandSheet} accessibilityRole="button">
                      <View
                        style={styles.collapsedSummary}
                        onLayout={(e) => setPeekContentHeight(Math.round(e.nativeEvent.layout.height))}
                      >
                        <View style={styles.collapsedSummaryRow}>
                          <View style={styles.collapsedSummaryIcon}>
                            <RideIcon
                              name={(selectedVehicleOption?.icon ?? 'directions-car') as never}
                              size={20}
                              color={colors.primary || '#b38737'}
                            />
                          </View>
                          <View style={styles.collapsedSummaryText}>
                            <Text style={styles.collapsedSummaryTitle} numberOfLines={1}>
                              {selectedVehicleOption?.label ?? defaultLabels.service}
                            </Text>
                            <Text style={styles.collapsedSummaryMeta} numberOfLines={1}>
                              {selectedVehicleOption?.subtitle ?? ''}
                            </Text>
                          </View>
                          <Text style={styles.collapsedSummaryPrice}>
                            {formatPriceValue(vehicleEstimates[vehicleType]?.price ?? null)}
                          </Text>
                        </View>
                        <View style={styles.collapsedSummaryMetaRow}>
                          <View style={styles.collapsedSummaryMetaPill}>
                            <MaterialIcons name="schedule" size={13} color={colors.textSecondary || '#666666'} />
                            <Text style={styles.collapsedSummaryMetaPillText}>
                              {calculatingRoute
                                ? tr('labels.calculating')
                                : estimatedDuration > 0
                                ? tr('labels.etaValue', { minutes: estimatedDuration })
                                : tr('labels.etaUnavailable')}
                            </Text>
                          </View>
                          <View style={styles.collapsedSummaryMetaPill}>
                            <MaterialIcons name="person" size={13} color={colors.textSecondary || '#666666'} />
                            <Text style={styles.collapsedSummaryMetaPillText}>
                              {tr('labels.passengersCount', { count: getPassengersForVehicle(vehicleType) })}
                            </Text>
                          </View>
                          <View style={styles.collapsedSummaryExpandHint}>
                            <Text style={styles.collapsedSummaryExpandHintText}>{tr('labels.viewOptions')}</Text>
                            <MaterialIcons name="keyboard-arrow-up" size={16} color={colors.primary || '#b38737'} />
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
                  tr={tr}
                />
              </View>
            </KeyboardAvoidingView>
          </Reanimated.View>
        </GestureHandlerRootView>
      </Animated.View>

      {showSearchOverlay && (
        <SearchRideSearchOverlay
          selectionTitle={selectionTitle}
          selectionDescription={selectionDescription}
          isDestinationSelection={isDestinationSelection}
          shouldHighlightMapAction={shouldHighlightMapAction}
          hasConfirmedDestination={hasConfirmedDestination}
          searchQuery={searchQuery}
          searchLoading={searchLoading}
          searchError={searchError}
          searchResults={searchResults}
          favoriteLocations={favoriteLocations}
          recentLocations={recentLocations}
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
  const accentSecondBorder = isDark ? 'rgba(147, 117, 254, 0.5)' : 'rgba(179, 135, 55, 0.1)';
  const cardBg = colors.card || '#ffffff';
  const card2Bg = colors.card2 || '#ededed';
  const surfaceBg = colors.surface || '#f5f5f5';
  const surface2Bg = colors.surface2|| '#fafafa';
  const textPrimary = colors.text || '#111111';
  const SecondBorder = isDark ? 'rgba(110, 68, 255, 0.3)' : 'rgba(179, 135, 55, 0.1)';
  const textSecondary = colors.textSecondary || '#666666';
  const borderColor = colors.border || '#e0e0e0';
  const inputBg = isDark ? 'rgba(255, 255, 255, 0.07)' : surfaceBg;
  const inputBgDeep = isDark ? 'rgba(255, 255, 255, 0.08)' : surfaceBg;
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
    timelineContent: {
      flex: 1,
      marginHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: borderColor,
    },
    timelineContentCompact: { marginRight: 4 },
    inlineAddStop: {
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: 99,
      backgroundColor: accent,
    },
    inlineAddStopIcon: { fontSize: 16, fontWeight: '800', color: '#fff' },
    timelineLabel: { fontSize: 14, fontWeight: '600', color: textPrimary },
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
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: surfaceBg,
      borderWidth: 1,
      borderColor: borderColor,
      gap: 9,
    },
    collapsedSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    collapsedSummaryIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    collapsedSummaryText: { flex: 1, minWidth: 0 },
    collapsedSummaryTitle: { fontSize: 15, fontWeight: '800', color: textPrimary },
    collapsedSummaryMeta: { fontSize: 12, color: textSecondary, marginTop: 2 },
    collapsedSummaryPrice: { fontSize: 19, fontWeight: '800', color: accentStrong, fontVariant: ['tabular-nums'] },
    collapsedSummaryMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    collapsedSummaryMetaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: borderColor,
    },
    collapsedSummaryMetaPillText: { fontSize: 12, fontWeight: '700', color: textPrimary, fontVariant: ['tabular-nums'] },
    collapsedSummaryExpandHint: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    collapsedSummaryExpandHintText: { fontSize: 12, fontWeight: '700', color: textSecondary },

    section: { marginBottom: 16 },
    vehicleSection: {},
    summarySection: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: borderColor,
      paddingTop: 10,
    },
    summaryRouteMetrics: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
      gap: 18,
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
    summaryRouteDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: borderColor },
    summaryAvailabilityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4, paddingBottom: 8 },
    summaryAvailabilityDot: { width: 7, height: 7, borderRadius: 4, marginTop: 4 },
    summaryAvailabilityText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '600' },
    summaryFareCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 68,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 4,
      borderRadius: 14,
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: borderColor,
    },
    summaryFareDetails: { gap: 4 },
    summaryFareLabel: {
      color: textSecondary,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.55,
    },
    summaryPayment: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
    summaryPaymentText: { color: textPrimary, fontSize: 14, fontWeight: '700' },
    summaryPriceValue: { color: accentStrong, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
    summaryPricePending: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
    summaryPricePendingText: { fontSize: 12, fontWeight: '600', color: textSecondary, flexShrink: 1 },
    summaryPriceError: { maxWidth: 140, color: colors.warning || '#ffa726', fontSize: 12, fontWeight: '700', textAlign: 'right' },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 54,
      paddingHorizontal: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: borderColor,
    },
    summaryRowLast: { borderBottomWidth: 0 },
    summaryRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary },
    summaryRowInput: { flex: 1, minHeight: 50, fontSize: 15, color: textPrimary },
    sectionCompact: { marginBottom: 14 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: textPrimary, marginBottom: 8 },

    vehicleOptionsList: { gap: 5 },
    vehicleOptionCard: {
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: surface2Bg,
      paddingHorizontal: 10,
    },
    vehicleOptionCardSelected: {
      backgroundColor: inputBg,
    },
    vehicleOptionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 64 },
    vehicleOptionIconBubble: {
      width: 52,
      height: 44,
      borderRadius: 12,
      backgroundColor: surfaceBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vehicleOptionIconBubbleSelected: { backgroundColor: accentSoft },
    vehicleOptionIconImage: { width: 46, height: 32 },
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
      backgroundColor: accentSoft,
    },
    vehicleOptionPassengerValue: { fontSize: 13, fontWeight: '700', color: textPrimary },
    vehicleOptionMeta: { fontSize: 12.5, color: textPrimary, marginTop: 1, fontVariant: ['tabular-nums'] },
    vehicleOptionSubtitle: { fontSize: 12.5, color: textSecondary, marginTop: 1 },
    vehicleOptionPrice: { fontSize: 16, fontWeight: '700', color: textPrimary, fontVariant: ['tabular-nums'], marginLeft: 4 },
    vehicleOptionPriceSelected: { fontSize: 17, fontWeight: '800', color: accentStrong },
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
      backgroundColor: card2Bg,
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
    vehicleOptionPassengerCount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    vehicleOptionPassengerCountText: { fontSize: 17, fontWeight: '800', color: textPrimary, fontVariant: ['tabular-nums']},

    vehicleFeaturesSection: { gap: 7 },
    vehicleFeaturesHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    vehicleFeaturesLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    vehicleFeaturesHint: { fontSize: 11, color: textSecondary },
    vehicleFeatureRail: { gap: 8, paddingRight: 8 },
    vehicleFeatureCard: {
      minWidth: 140,
      maxWidth: 210,
      minHeight: 64,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: borderColor,
      backgroundColor: surfaceBg,
      gap: 4,
    },
    vehicleFeatureCardSelected: {
      borderColor: accentSecondBorder,
      backgroundColor: SecondBorder,
    },
    vehicleFeatureCardDisabled: { opacity: 0.56 },
    vehicleFeatureCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    vehicleFeatureCardTitle: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: textPrimary },
    vehicleFeatureToggle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: textSecondary,
    },
    vehicleFeatureToggleSelected: { 
      borderColor: accentBorder, 
      borderWidth: 1.6, 
      backgroundColor: accentSecondBorder 
    },
    vehicleFeatureImpact: { fontSize: 12, fontWeight: '700', color: textPrimary, fontVariant: ['tabular-nums'] },
    vehicleFeatureCondition: { fontSize: 10, color: textSecondary },
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

    scheduleCta: {
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: accentBorder,
      marginBottom: 0,
      backgroundColor: accentSoft,
    },
    scheduleCtaDisabled: { opacity: 0.65 },
    scheduleCtaText: { textAlign: 'center', fontWeight: '700', color: accentStrong },
    scheduleClearCta: {
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: borderColor,
      marginBottom: 0,
      backgroundColor: 'transparent',
    },
    scheduleClearText: { textAlign: 'center', fontWeight: '700', color: textSecondary },

    scheduleOverlay: {
      flex: 1,
      backgroundColor: colors.overlay || 'rgba(0,0,0,0.6)',
      padding: 16,
      justifyContent: 'center',
    },
    scheduleCard: {
      borderRadius: 18,
      padding: 16,
    },
    scheduleTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
    scheduleLabel: { fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
    pickerBox: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
    timeRow: { flexDirection: 'row', alignItems: 'center' },
    timePicker: { flex: 1 },
    timeSeparator: { marginHorizontal: 10, fontSize: 18, fontWeight: '800' },
    scheduleButtonsRow: { flexDirection: 'row', marginTop: 16 },
    scheduleButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    scheduleCancelButton: { marginRight: 10, borderWidth: 1, backgroundColor: 'transparent' },
    scheduleButtonText: { fontWeight: '800' },
    scheduleButtonTextPrimary: { fontWeight: '800', color: '#fff' },

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
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    searchCard: {
      width: '100%',
      maxHeight: '85%',
      borderRadius: 20,
      padding: 16,
      backgroundColor: cardBg,
    },
    searchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    searchHeaderTextBlock: { flex: 1, paddingRight: 12 },
    searchTitle: { fontSize: 18, fontWeight: '700', color: textPrimary },
    searchDescription: { fontSize: 13, color: textSecondary, marginTop: 2 },
    searchCloseButton: { paddingVertical: 4, paddingHorizontal: 6 },
    searchCloseText: { fontSize: 14, color: accentStrong, fontWeight: '700' },
    destinationGuidanceCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: accentBorder,
      backgroundColor: accentSoft,
      padding: 12,
      marginBottom: 12,
    },
    destinationGuidanceTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: accentStrong,
      marginBottom: 4,
    },
    destinationGuidanceText: {
      fontSize: 12,
      color: textSecondary,
      lineHeight: 17,
    },
    destinationGuidanceSteps: { flexDirection: 'row', gap: 8, marginTop: 10 },
    destinationGuidanceStepPill: {
      flex: 1,
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: borderColor,
      backgroundColor: cardBg,
      alignItems: 'center',
    },
    destinationGuidanceStepText: {
      fontSize: 11,
      fontWeight: '700',
      color: textSecondary,
      textAlign: 'center',
    },
    destinationConfirmedPill: {
      alignSelf: 'flex-start',
      marginTop: 10,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: successSoft,
      borderWidth: 1,
      borderColor: successBorder,
    },
    destinationConfirmedText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.success || '#4caf50',
    },

    searchInputWrapper: { marginBottom: 16 },
    searchInputLabel: { fontSize: 12, fontWeight: '600', color: textSecondary, marginBottom: 6, textTransform: 'uppercase' },
    searchInputHelper: { fontSize: 12, color: accentStrong, marginBottom: 6 },
    searchInputContainer: {
      borderRadius: 12,
      backgroundColor: inputBgDeep,
      paddingHorizontal: 14,
      paddingVertical: Platform.select({ ios: 12, android: 6, default: 8 }),
      borderWidth: 1,
      borderColor: borderColor,
    },
    searchInput: { color: textPrimary, fontSize: 15, paddingVertical: Platform.select({ ios: 2, android: 0, default: 6 }) },

    searchActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    searchActionChip: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: surfaceBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: borderColor,
    },
    searchActionPrimary: { backgroundColor: accent, borderColor: accent },
    searchActionText: { fontSize: 13, fontWeight: '700', color: textPrimary },
    searchActionTextPrimary: { color: '#fff' },

    searchScroll: { maxHeight: 360 },
    savedSection: { marginBottom: 16 },
    savedSectionTitle: { fontSize: 12, fontWeight: '700', color: textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    savedItem: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: borderColor,
    },
    savedItemLabel: { fontSize: 14, color: textPrimary, fontWeight: '600' },
    savedItemCoords: { fontSize: 12, color: textSecondary, marginTop: 2 },

    searchResultsSection: { paddingBottom: 12 },
    searchLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    searchLoadingText: { color: textSecondary },
    searchErrorText: { color: colors.error || '#e53935', paddingVertical: 8 },
    searchHintText: { color: textSecondary, paddingVertical: 8 },

    searchResultItem: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: borderColor,
    },
    searchResultMain: { fontSize: 15, color: textPrimary, fontWeight: '600' },
    searchResultSecondary: { fontSize: 12, color: textSecondary, marginTop: 2 },
  });
}