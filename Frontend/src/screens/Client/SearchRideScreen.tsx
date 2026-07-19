import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingIcon } from '../../components/LoadingIcon';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Modal,
  Animated,
  Easing,
  useColorScheme,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DynamicMap from '../../components/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAddressSearch } from '../../hooks/client/SearchRideScreen/useAddressSearch';
import servicesService, { ServiceItem } from '../../services/servicesService';
import alertService from '../../services/alertService';
import {
  formatCoords,
  type Coords,
} from '../../utils/rideCoords';
import { normalizeSuggestion, type NormalizedSuggestion } from '../../utils/suggestions';
import { useRideRouteCalculation } from '../../hooks/client/SearchRideScreen/useRideRouteCalculation';
import { useScheduleRide } from '../../hooks/client/SearchRideScreen/useScheduleRide';
import { useSearchRideState } from '../../hooks/client/SearchRideScreen/useSearchRideState';
import { useSearchRideLocation } from '../../hooks/client/SearchRideScreen/useSearchRideLocation';
import { useSearchRideSubmission } from '../../hooks/client/SearchRideScreen/useSearchRideSubmission';
import { useVehiclePhoto } from '../../hooks/client/SearchRideScreen/useVehiclePhoto';
import { useDriversAvailability } from '../../hooks/client/SearchRideScreen/useDriversAvailability';

const { MANUAL_ORIGIN, MANUAL_ORIGIN_HOLD, ORIGIN_PIN, DESTINATION_PIN, MULTI_STOP_PIN } = MAP_ICONS;
const BACK_BUTTON_ICON = require('../../assets/icons/back_button/back_button2x.png');
const DEFAULT_FALLBACK_COORDS = { latitude: 12.1364, longitude: -86.2514 };
const MAX_EXTRA_STOPS = 3;
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

export default function SearchRideScreenNewDesign({ navigation }: any) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { coords } = useLocation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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
    calculatingRoute,
    routeCoordinates,
    estimatedDistance,
    estimatedDuration,
    estimatedPrice,
    vehicleEstimates,
    designatedDriverEstimates,
    recommendedVehicle,
    designatedDriverEligibility,
    recomputeRoute,
    recalcPriceOnly,
  } = useRideRouteCalculation({ vehicleType, designatedDriverMode, tr });

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

  const { driversAvailable, checkingDrivers } = useDriversAvailability(coords, vehicleType, designatedDriverMode);

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

  useEffect(() => {
    if (estimatedDistance > 0 && (originCoords || coords)) {
      const stopsCount = extraDestinations.filter((d) => d.coords).length;
      recalcPriceOnly(originCoords, coords ?? null, destinationCoords, stopsCount);
    }
  }, [coords, estimatedDistance, originCoords, destinationCoords, extraDestinations, recalcPriceOnly]);

  const capacityByVehicle: Record<VehicleType, number> = useMemo(
    () => ({ moto: 1, auto: 4, designated_driver: designatedDriverMode === 'moto' ? 1 : 4 }),
    [designatedDriverMode],
  );

  const preferServiceCatalogCopy = useMemo(() => {
    const lang = i18n.language || 'en';
    return lang.toLowerCase().startsWith('es');
  }, [i18n.language]);

  const VEHICLE_TYPES: VehicleType[] = ['moto', 'auto', 'designated_driver'];

  const vehicleOptions = useMemo(() => {
    const defaults: Record<VehicleType, { label: string; subtitle: string; emoji: string }> = {
      moto: { label: tr('vehicle.motoLabel'), subtitle: tr('vehicle.motoSubtitle'), emoji: '🏍️' },
      auto: { label: tr('vehicle.autoLabel'), subtitle: tr('vehicle.autoSubtitle'), emoji: '🚘' },
      designated_driver: { label: tr('vehicle.designatedLabel'), subtitle: tr('vehicle.designatedSubtitle'), emoji: '🧑‍✈️' },
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
        emoji: defaults[type].emoji,
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
          coordsValue = (await mapsService.getPlaceDetails(suggestion.placeId, undefined, { forceProvider: 'google' })) || null;
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
    !!destinationCoords && estimatedPrice > 0 &&
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
      return { latitude: stop.coords.latitude, longitude: stop.coords.longitude, index };
    })
    .filter(Boolean) as Array<{ latitude: number; longitude: number; index: number }>;
  const autoFitEnabled = !centerPinActive && !manualOriginDragging && !manualOriginLoading && !manualDestinationDragging && !manualDestinationLoading;
  const showManualOriginMarker = (!centerPinActive && (hasPinnedOrigin || !!originCoords || !!manualOriginDraft)) || mapSelectionMode === 'destination';
  const bottomPanelReady = hasRouteMetrics && !calculatingRoute && !centerPinActive && !manualOriginDragging && !manualDestinationDragging && !manualOriginLoading && !manualDestinationLoading;
  const bottomPanelTranslate = useMemo(
    () => bottomPanelAnim.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }),
    [bottomPanelAnim],
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
      setBottomPanelExpanded((prev) => (prev ? prev : true));
    }
  }, [bottomPanelReady]);

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
          routeCoordinates={routeCoordinates}
          showUserLocation
          userLocation={coords || undefined}
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

      <View style={styles.routeBubble}>
        <View style={styles.routeTimeline}>
          {orderedRouteRows.map((row, idx) => {
            const isLast = idx === orderedRouteRows.length - 1;
            const isExtra = row.kind === 'extra';
            const isDestinationRow = row.kind === 'destination';
            const showInlineAdd = isDestinationRow && canAddExtraStop;
            let label = '';
            let subtitle = '';
            if (row.kind === 'origin') {
              label = manualOriginLoading ? tr('labels.searching') : manualOriginAddress || tr('labels.originPlaceholder');
              if (manualOriginDraft) subtitle = formatCoords(manualOriginDraft);
            } else if (row.kind === 'destination') {
              label = manualDestinationLoading ? tr('labels.searching') : destination || tr('labels.destinationPlaceholder');
              if (manualDestinationDraft && mapSelectionMode === 'destination') subtitle = formatCoords(manualDestinationDraft);
              else if (destinationCoords) subtitle = formatCoords(destinationCoords);
            } else if (typeof row.index === 'number') {
              const stop = extraDestinations[row.index];
              label = stop?.address || tr('labels.stopLabel', { index: row.index + 1 });
              if (stop?.coords) subtitle = formatCoords(stop.coords);
            }

            const iconSource =
              row.kind === 'origin'
                ? ORIGIN_PIN
                : row.kind === 'destination'
                ? DESTINATION_PIN
                : MULTI_STOP_PIN;

            return (
              <View key={`${row.kind}-${row.index ?? 'final'}`} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <Image source={iconSource} style={styles.timelineIcon} resizeMode="contain" />
                  {!isLast && <View style={styles.timelineConnector} />}
                </View>

                <View style={styles.timelineCenter}>
                  <TouchableOpacity style={[styles.timelineContent, showInlineAdd && styles.timelineContentCompact]} onPress={() => handleRouteRowPress(row)}>
                    <Text style={styles.timelineLabel} numberOfLines={1}>
                      {label}
                    </Text>
                    {subtitle ? (
                      <Text style={styles.timelineSubtitle} numberOfLines={1}>
                        {subtitle}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                  {showInlineAdd ? (
                    <TouchableOpacity
                      style={styles.inlineAddStop}
                      onPress={beginAddExtraStop}
                      accessibilityLabel={tr('accessibility.addExtraStop')}
                    >
                      <Text style={styles.inlineAddStopIcon}>＋</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {isExtra && typeof row.index === 'number' ? (
                  <TouchableOpacity style={styles.timelineRemove} onPress={() => handleRemoveStop(row.index!)}>
                    <Text style={styles.timelineRemoveText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>

      </View>

      <Animated.View
        pointerEvents={bottomPanelReady ? 'auto' : 'none'}
        style={[styles.bottomPanel, { transform: [{ translateY: bottomPanelTranslate }], opacity: bottomPanelAnim }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
          style={styles.bottomAvoiding}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack?.()}
            accessibilityLabel={tr('accessibility.back')}
          >
        <Image source={BACK_BUTTON_ICON} style={styles.backButtonIcon} resizeMode="contain" />
          </TouchableOpacity>

            <TouchableOpacity style={styles.panelToggle} onPress={() => setBottomPanelExpanded((prev) => !prev)}>
              <View style={styles.panelHandle} />
              <Text style={styles.panelToggleText}>{bottomPanelExpanded ? '' : ''}</Text>
            </TouchableOpacity>

          {bottomPanelExpanded ? (
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              
            <View style={[styles.section, styles.vehicleSection]}>

              <View style={styles.vehicleOptionsList}>
                {vehicleOptions.map((option) => {
                  const estimate = vehicleEstimates[option.type];
                  const designatedEstimate = option.type === 'designated_driver' ? designatedDriverEstimates[designatedDriverMode] : null;
                  const showDesignatedMotoShortDistanceNotice =
                    option.type === 'designated_driver' &&
                    vehicleType === 'designated_driver' &&
                    designatedDriverMode === 'moto' &&
                    !designatedDriverEligibility.motoEligible &&
                    (designatedDriverEstimates.moto.price ?? 0) > 0;
                  const priceLabel = formatPriceValue((designatedEstimate ?? estimate)?.price ?? null);
                  const isSelected = vehicleType === option.type;
                  const isRecommended = recommendedVehicle === option.type;
                  const capacity = capacityByVehicle[option.type];
                  const etaLabel = calculatingRoute
                    ? tr('labels.calculating')
                    : estimatedDuration > 0
                    ? tr('labels.etaValue', { minutes: estimatedDuration })
                    : tr('labels.etaUnavailable');

                  return (
                    <TouchableOpacity
                      key={option.type}
                      style={[styles.vehicleOptionCard, isSelected && styles.vehicleOptionCardSelected]}
                      onPress={() => setVehicleType(option.type)}
                      accessibilityLabel={tr('vehicle.selectOption', { label: option.label })}
                    >
                      <View style={styles.vehicleOptionTopRow}>
                        <View style={styles.vehicleOptionTitleBlock}>
                          <View style={styles.vehicleOptionTitleRow}>
                            <View style={styles.vehicleOptionIconBubble}>
                              <Text style={styles.vehicleEmoji}>{option.emoji}</Text>
                            </View>
                            <Text style={[styles.vehicleOptionTitle, isSelected && styles.vehicleOptionTitleSelected]} numberOfLines={1}>
                              {option.label}
                            </Text>
                          </View>
                          <Text style={[styles.vehicleOptionSubtitle, isSelected && styles.vehicleOptionSubtitleSelected]} numberOfLines={2}>
                            {option.subtitle}
                          </Text>
                        </View>
                        <View style={styles.vehicleOptionPriceBlock}>
                          {isRecommended ? (
                            <Text style={styles.vehicleOptionBadge}>{tr('vehicle.recommendedBadge')}</Text>
                          ) : null}
                          <Text style={styles.vehicleOptionPrice}>{priceLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.vehicleOptionInfoRow}>
                        <Text style={[styles.vehicleOptionMeta, isSelected && styles.vehicleOptionMetaSelected]} numberOfLines={1}>
                          {etaLabel}
                        </Text>
                        {isSelected ? (
                          <View style={styles.vehicleOptionPassengerControls}>
                            <TouchableOpacity
                              style={[styles.vehicleOptionCounterBtn, !canDecreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                              disabled={!canDecreasePassengers(option.type)}
                              onPress={() => updatePassengers(option.type, -1)}
                            >
                              <Text style={styles.vehicleOptionCounterText}>−</Text>
                            </TouchableOpacity>
                            <View style={styles.vehicleOptionPassengerCount}>
                              <Text style={[styles.vehicleOptionPassengerValue, styles.vehicleOptionPassengerValueSelected]}>{getPassengersForVehicle(option.type)}</Text>
                              <Text style={styles.vehicleOptionPassengerIcon}>👤</Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.vehicleOptionCounterBtn, !canIncreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                              disabled={!canIncreasePassengers(option.type)}
                              onPress={() => updatePassengers(option.type, 1)}
                            >
                              <Text style={styles.vehicleOptionCounterText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.vehicleOptionPassengerDisplay}>
                            <Text style={[styles.vehicleOptionPassengerValue, isSelected && styles.vehicleOptionPassengerValueSelected]}>{getPassengersForVehicle(option.type)}</Text>
                            <Text style={styles.vehicleOptionPassengerIcon}>👤</Text>
                          </View>
                        )}
                      </View>
                      {option.type === 'designated_driver' && isSelected ? (
                        <View style={styles.designatedDriverModeContainer}>
                          <Text style={styles.designatedDriverModeLabel}>{tr('vehicle.modeLabel')}</Text>
                          <View style={styles.designatedDriverModeChips}>
                            {(['auto', 'moto'] as DesignatedDriverMode[]).map((mode) => {
                              const selected = designatedDriverMode === mode;
                              return (
                                <TouchableOpacity
                                  key={mode}
                                  style={[styles.designatedDriverModeChip, selected && styles.designatedDriverModeChipSelected]}
                                  onPress={() => setDesignatedDriverMode(mode)}
                                >
                                  <Text style={[styles.designatedDriverModeChipText, selected && styles.designatedDriverModeChipTextSelected]}>
                                    {mode === 'auto' ? tr('vehicle.modeAuto') : tr('vehicle.modeMoto')}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          {showDesignatedMotoShortDistanceNotice ? (
                            <Text style={styles.designatedDriverModeInfoText}>
                              La distancia es muy corta para solicitar este servicio en motocicleta.
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {recommendedVehicle && vehicleEstimates[recommendedVehicle]?.price ? (
                <View /*style={styles.vehicleRecommendationStrip}*/>
                  {/* <Text style={styles.vehicleRecommendationLabel}>{tr('vehicle.recommendationLabel')}</Text> */}
                  {/* <Text style={styles.vehicleRecommendationValue}> */}
                    {formatPriceValue(vehicleEstimates[recommendedVehicle]?.price ?? null)}
                  {/* </Text> */}
                </View>
              ) : null}

              {vehicleType === 'designated_driver' && (
                <View style={styles.photoRow}>
                  <Text style={styles.photoHint}>{tr('photo.hint')}</Text>
                  <TouchableOpacity style={styles.photoButton} onPress={handleTakeVehiclePhoto} disabled={uploadingPhoto}>
                    <Text style={styles.photoButtonText}>
                      {uploadingPhoto
                        ? tr('photo.buttonProcessing')
                        : hasVehiclePhotoSelection
                        ? tr('photo.buttonChange')
                        : tr('photo.buttonDefault')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={[styles.section, styles.sectionCompact, styles.summarySection]}>
              <Text style={styles.sectionTitle}>{tr('summary.title')}</Text>

              <View style={[styles.estimateCard, styles.estimateCardElevated]}>
                {calculatingRoute ? (
                  <View style={styles.centeredRow}>
                    <LoadingIcon size={20} color={colors.primary} />
                    <Text style={styles.estimateText}>{` ${tr('summary.calculatingRoute')}`}</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.estimateRow}>
                      <Text style={styles.estimateLabel}>{tr('summary.distance')}</Text>
                      <Text style={styles.estimateValue}>{estimatedDistance.toFixed(2)} km</Text>
                    </View>
                    <View style={styles.estimateRow}>
                      <Text style={styles.estimateLabel}>{tr('summary.duration')}</Text>
                      <Text style={styles.estimateValue}>{estimatedDuration} min</Text>
                    </View>
                    <View style={styles.estimateRow}>
                      <Text style={styles.estimateLabel}>{tr('summary.estimate')}</Text>
                      <Text style={styles.estimateValue}>C${estimatedPrice.toFixed(2)}</Text>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.paymentRow}>
                <TouchableOpacity
                  style={[styles.paymentChip, paymentMethod === 'cash' && styles.paymentChipSelected]}
                  onPress={() => setPaymentMethod('cash')}
                  accessibilityLabel={tr('accessibility.payCash')}
                >
                  <Text style={[styles.paymentChipText, paymentMethod === 'cash' && styles.paymentChipTextSelected]}>
                    {tr('payment.cash')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentChip, paymentMethod === 'card' && styles.paymentChipSelected]}
                  onPress={() => setPaymentMethod('card')}
                  accessibilityLabel={tr('accessibility.payCard')}
                >
                  <Text style={[styles.paymentChipText, paymentMethod === 'card' && styles.paymentChipTextSelected]}>
                    {tr('payment.card')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.priceCommentRow}>
                <View style={styles.priceCommentColumn}>
                  <Text style={styles.priceCommentLabel}>{tr('labels.priceSuggestion')}</Text>
                  <TextInput
                    keyboardType={Platform.select({
                      ios: 'numbers-and-punctuation',
                      android: 'numeric',
                      default: 'numeric',
                    })}
                    placeholder={tr('labels.pricePlaceholder')}
                    placeholderTextColor={colors.textSecondary || '#999'}
                    value={priceSuggestion}
                    onChangeText={setPriceSuggestion}
                    style={styles.priceCommentInput}
                  />
                </View>
                <View style={styles.priceCommentColumn}>
                  <Text style={styles.priceCommentLabel}>{tr('labels.comment')}</Text>
                  <TextInput
                    placeholder={tr('labels.commentPlaceholder')}
                    placeholderTextColor={colors.textSecondary || '#999'}
                    value={rideComment}
                    onChangeText={setRideComment}
                    style={styles.priceCommentInput}
                    maxLength={100}
                  />
                </View>
              </View>

              {/* {priceBreakdown ? (
                <View style={styles.breakdownBox}>
                  <Text style={styles.breakdownText}>{formatPriceBreakdown(priceBreakdown)}</Text>
                </View>
              ) : null} */}

              <View style={styles.availabilityRow}>
                {checkingDrivers ? (
                  <Text style={styles.availabilityText}>{tr('availability.checking')}</Text>
                ) : driversAvailable === false ? (
                  <Text style={styles.availabilityWarn}>{tr('availability.low')}</Text>
                ) : driversAvailable === true ? (
                  <Text style={styles.availabilityOk}>{tr('availability.ok')}</Text>
                ) : (
                  <Text style={styles.availabilityText}>{tr('availability.unknown')}</Text>
                )}
              </View>
            </View>
          </ScrollView>
          ) : (
            <View style={styles.collapsedSummary}>
              <View style={styles.collapsedSummaryRow}>
                <View style={styles.collapsedSummaryIcon}>
                  <Text style={styles.vehicleEmoji}>{selectedVehicleOption?.emoji ?? '🚘'}</Text>
                </View>
                <View style={styles.collapsedSummaryText}>
                  <Text style={styles.collapsedSummaryTitle}>
                    {selectedVehicleOption?.label ?? defaultLabels.service}
                  </Text>
                  <Text style={styles.collapsedSummaryMeta}>
                    {selectedVehicleOption?.subtitle ?? ''}
                  </Text>
                </View>
                <Text style={styles.collapsedSummaryPrice}>{formatPriceValue(vehicleEstimates[vehicleType]?.price ?? null)}</Text>
              </View>
              <View style={styles.collapsedSummaryMetaRow}>
                <View style={styles.collapsedSummaryMetaPill}>
                  <Text style={styles.collapsedSummaryMetaPillText}>
                    {calculatingRoute
                      ? tr('labels.calculating')
                      : estimatedDuration > 0
                      ? tr('labels.etaValue', { minutes: estimatedDuration })
                      : tr('labels.etaUnavailable')}
                  </Text>
                </View>
                <View style={styles.collapsedSummaryMetaPill}>
                  <Text style={styles.collapsedSummaryMetaPillText}>{`${getPassengersForVehicle(vehicleType)} 👤`}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.ctaContainer}>
            <TouchableOpacity
              style={[styles.scheduleCta, submittingRequest && styles.scheduleCtaDisabled]}
              disabled={submittingRequest}
              onPress={openScheduleModal}
            >
              <Text style={styles.scheduleCtaText}>
                {scheduledAt
                  ? tr('scheduling.scheduledLabel', {
                      date: new Date(scheduledAt).toLocaleString(),
                    })
                  : tr('scheduling.openButton')}
              </Text>
            </TouchableOpacity>
            {scheduledAt ? (
              <TouchableOpacity
                style={[styles.scheduleClearCta, submittingRequest && styles.scheduleCtaDisabled]}
                disabled={submittingRequest}
                onPress={() => setScheduledAt(null)}
              >
                <Text style={styles.scheduleClearText}>{tr('scheduling.clearButton')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.cta, (!isRequestReady || submittingRequest) && styles.ctaDisabled]}
              disabled={!isRequestReady || submittingRequest}
              onPress={onConfirmRequest}
            >
              {submittingRequest ? (
                <View style={styles.ctaLoadingRow}>
                  <LoadingIcon size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.ctaText}>{tr('cta.loading')}</Text>
                </View>
              ) : (
                <Text style={styles.ctaText}>
                  {scheduledAt ? tr('cta.primaryScheduled') : tr('cta.primary')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>

      {showSearchOverlay && (
        <View style={styles.searchOverlay}>
          <View style={styles.searchCard}>
            <View style={styles.searchHeader}>
              <View style={styles.searchHeaderTextBlock}>
                <Text style={styles.searchTitle}>{selectionTitle}</Text>
                <Text style={styles.searchDescription}>{selectionDescription}</Text>
              </View>
              <TouchableOpacity onPress={closeSearchOverlay} style={styles.searchCloseButton}>
                <Text style={styles.searchCloseText}>{tr('search.close')}</Text>
              </TouchableOpacity>
            </View>

            {isDestinationSelection ? (
              <View style={styles.destinationGuidanceCard}>
                <Text style={styles.destinationGuidanceTitle}>{tr('search.destinationGuidanceTitle')}</Text>
                <Text style={styles.destinationGuidanceText}>{tr('search.destinationGuidanceBody')}</Text>
                <View style={styles.destinationGuidanceSteps}>
                  <View style={styles.destinationGuidanceStepPill}>
                    <Text style={styles.destinationGuidanceStepText}>{tr('search.destinationGuidanceStep1')}</Text>
                  </View>
                  <View style={styles.destinationGuidanceStepPill}>
                    <Text style={styles.destinationGuidanceStepText}>{tr('search.destinationGuidanceStep2')}</Text>
                  </View>
                </View>
                {hasConfirmedDestination ? (
                  <View style={styles.destinationConfirmedPill}>
                    <Text style={styles.destinationConfirmedText}>{tr('search.destinationConfirmed')}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.searchInputWrapper}>
              <Text style={styles.searchInputLabel}>{tr('search.inputLabel')}</Text>
              {isDestinationSelection ? (
                <Text style={styles.searchInputHelper}>{tr('search.placeholderDestinationReference')}</Text>
              ) : null}
              <View style={styles.searchInputContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder={(() => {
                    if (activeSelection === 'origin') return tr('search.placeholderOrigin');
                    if (activeSelection === 'destination') return tr('search.placeholderDestinationReference');
                    if (activeSelection === 'new-stop' || typeof activeSelection === 'number') {
                      return tr('search.placeholderStop');
                    }
                    return tr('search.placeholderGeneric');
                  })()}
                  placeholderTextColor={colors.textSecondary || '#999'}
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    setSearchError(null);
                  }}
                  autoFocus
                  returnKeyType="search"
                />
              </View>
            </View>

            <View style={styles.searchActionsRow}>
              <TouchableOpacity
                style={[styles.searchActionChip, !shouldHighlightMapAction && styles.searchActionPrimary]}
                onPress={handleUseCurrentLocation}
              >
                <Text style={[styles.searchActionText, !shouldHighlightMapAction && styles.searchActionTextPrimary]}>
                  {tr('search.useCurrentLocation')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.searchActionChip, shouldHighlightMapAction && styles.searchActionPrimary]} onPress={handlePickFromMap}>
                <Text style={[styles.searchActionText, shouldHighlightMapAction && styles.searchActionTextPrimary]}>{tr('search.pickOnMap')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.searchScroll} keyboardShouldPersistTaps="handled">
              {favoriteLocations.length > 0 && (
                <View style={styles.savedSection}>
                  <Text style={styles.savedSectionTitle}>{tr('labels.favorites')}</Text>
                  {favoriteLocations.map((location, index) => (
                    <TouchableOpacity
                      key={`fav-${index}`}
                      style={styles.savedItem}
                      onPress={() => handleSelectSavedLocation(location)}
                    >
                      <Text style={styles.savedItemLabel}>{location.label}</Text>
                      <Text style={styles.savedItemCoords}>{formatCoords(location.coords)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {recentLocations.length > 0 && (
                <View style={styles.savedSection}>
                  <Text style={styles.savedSectionTitle}>{tr('labels.recent')}</Text>
                  {recentLocations.map((location, index) => (
                    <TouchableOpacity
                      key={`recent-${index}`}
                      style={styles.savedItem}
                      onPress={() => handleSelectSavedLocation(location)}
                    >
                      <Text style={styles.savedItemLabel}>{location.label}</Text>
                      <Text style={styles.savedItemCoords}>{formatCoords(location.coords)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.searchResultsSection}>
                {searchLoading && (
                  <View style={styles.searchLoadingRow}>
                    <LoadingIcon size={20} color={colors.primary || '#2196F3'} />
                    <Text style={styles.searchLoadingText}>{tr('search.loading')}</Text>
                  </View>
                )}

                {!searchLoading && searchError ? (
                  <Text style={styles.searchErrorText}>{searchError}</Text>
                ) : null}

                {searchResults.map((suggestion, index) => (
                  <TouchableOpacity
                    key={`result-${index}`}
                    style={styles.searchResultItem}
                    onPress={() => handleSelectSuggestion(suggestion)}
                  >
                    <Text style={styles.searchResultMain}>{suggestion.mainText}</Text>
                    {suggestion.secondaryText ? (
                      <Text style={styles.searchResultSecondary}>{suggestion.secondaryText}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {submittingRequest && (
        <View style={styles.submittingOverlay} pointerEvents="none">
          <View style={styles.submittingCard}>
            <LoadingIcon size={32} color={colors.primary || '#2196F3'} />
            <Text style={[styles.submittingText, { color: colors.text }]}>{tr('cta.loading')}</Text>
          </View>
        </View>
      )}

      <Modal
        visible={scheduleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScheduleModalVisible(false)}
      >
        <View style={styles.scheduleOverlay}>
          <View style={[styles.scheduleCard, { backgroundColor: isDark ? '#1f1f1f' : colors.card }]}>
            <Text style={[styles.scheduleTitle, { color: colors.text }]}>{tr('scheduling.modalTitle')}</Text>

            <Text style={[styles.scheduleLabel, { color: colors.text }]}>{tr('scheduling.dateLabel')}</Text>
            <View style={[styles.pickerBox, { borderColor: colors.border || (isDark ? '#444' : '#ddd') }]}>
              <Picker selectedValue={scheduleDayIndex} onValueChange={(value) => setScheduleDayIndex(Number(value))}>
                {scheduleDayOptions.map((opt, idx) => (
                  <Picker.Item key={`day-${idx}`} label={opt.label} value={idx} />
                ))}
              </Picker>
            </View>

            <Text style={[styles.scheduleLabel, { color: colors.text }]}>{tr('scheduling.timeLabel')}</Text>
            <View style={styles.timeRow}>
              <View
                style={[
                  styles.pickerBox,
                  styles.timePicker,
                  { borderColor: colors.border || (isDark ? '#444' : '#ddd') },
                ]}
              >
                <Picker selectedValue={scheduleHour} onValueChange={(value) => setScheduleHour(Number(value))}>
                  {scheduleHourOptions.map((h) => (
                    <Picker.Item key={`hour-${h}`} label={String(h).padStart(2, '0')} value={h} />
                  ))}
                </Picker>
              </View>
              <Text style={[styles.timeSeparator, { color: colors.text }]}>:</Text>
              <View
                style={[
                  styles.pickerBox,
                  styles.timePicker,
                  { borderColor: colors.border || (isDark ? '#444' : '#ddd') },
                ]}
              >
                <Picker selectedValue={scheduleMinute} onValueChange={(value) => setScheduleMinute(Number(value))}>
                  {scheduleMinuteOptionsForHour.map((m) => (
                    <Picker.Item key={`min-${m}`} label={String(m).padStart(2, '0')} value={m} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.scheduleButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.scheduleButton,
                  styles.scheduleCancelButton,
                  { borderColor: colors.border || (isDark ? '#444' : '#ddd') },
                ]}
                onPress={() => setScheduleModalVisible(false)}
              >
                <Text style={[styles.scheduleButtonText, { color: colors.text }]}>{tr('scheduling.modalCancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.scheduleButton, { backgroundColor: '#b38737' }]} onPress={applyScheduleSelection}>
                <Text style={styles.scheduleButtonTextPrimary}>{tr('scheduling.modalConfirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: any, isDark: boolean = false) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background || '#fff' },

    backButton: {
      position: 'absolute',
      top: -70,
      left: 0,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(95, 93, 93, 0.34)' : colors.card || '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 5,
      zIndex: 20,
    },
    backButtonIcon: { width: 18, height: 18 },

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
      top: 45,
      left: 14,
      right: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.card || 'rgba(255,255,255,0.96)',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 6,
    },
    routeBubbleHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    routeBubbleTitle: { fontSize: 16, fontWeight: '700', color: colors.text || '#111' },
    routeBubbleTitleCompact: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary || '#555',
      textAlign: 'center',
      letterSpacing: 0.6,
      marginBottom: 6,
    },

    routeTimeline: { marginTop: 4 },
    timelineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    timelineLeft: { width: 30, alignItems: 'center' },
    timelineIcon: { width: 20, height: 20 },
    timelineConnector: { flex: 1, width: 2, backgroundColor: colors.border || '#ddd', marginTop: 4 },
    timelineCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    timelineContent: {
      flex: 1,
      marginHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border || '#ddd',
    },
    timelineContentCompact: { marginRight: 4 },
    inlineAddStop: {
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: 99,
      backgroundColor: '#d4a651',
    },
    inlineAddStopIcon: { fontSize: 16, fontWeight: '800', color: '#fff' },
    timelineLabel: { fontSize: 14, fontWeight: '600', color: colors.text || '#111' },
    timelineSubtitle: { fontSize: 11, color: colors.textSecondary || '#666', marginTop: 2 },
    timelineRemove: { padding: 8 },
    timelineRemoveText: { fontSize: 14, color: '#E53935', fontWeight: '700' },

    addStopButton: {
      marginTop: 8,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.surface || '#b38737',
    },
    addStopButtonText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary || '#fff' },
    addStopLimitText: { marginTop: 8, fontSize: 12, color: colors.textSecondary || '#666' },

    bottomPanel: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: 10,
      paddingHorizontal: 16,
      paddingBottom: Platform.select({ ios: 14, android: 20, default: 18 }),
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: colors.card || '#fff',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 12,
      maxHeight: '45%',
      minHeight: 260,
    },
    bottomAvoiding: { flex: 1, maxHeight: '100%' },
    formScroll: { flexGrow: 0, flexShrink: 1 },
    formContent: { paddingBottom: 24, paddingHorizontal: 4, gap: 12 },
    panelToggle: { alignItems: 'center', marginBottom: 8, paddingTop: 4 },
    panelHandle: {
      width: 52,
      height: 5,
      borderRadius: 20,
      backgroundColor: colors.border || '#d0d0d0',
      marginBottom: 6,
    },
    panelToggleText: { fontSize: 12, color: colors.textSecondary || '#666', fontWeight: '600' },
    collapsedSummary: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      backgroundColor: colors.card || (isDark ? '#232323' : '#fcfcfd'),
      borderWidth: 1,
      borderColor: isDark ? '#3f3f3f' : '#ece9f5',
      marginBottom: 12,
      shadowColor: '#000',
      shadowOpacity: Platform.OS === 'ios' ? 0.08 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: Platform.OS === 'android' ? 3 : 0,
      gap: 10,
    },
    collapsedSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    collapsedSummaryIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: isDark ? '#2e2e2e' : '#fff',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: Platform.OS === 'ios' ? 0.08 : 0,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    collapsedSummaryText: { flex: 1 },
    collapsedSummaryTitle: { fontSize: 16, fontWeight: '800', color: colors.text || '#111' },
    collapsedSummaryMeta: { fontSize: 12, color: colors.textSecondary || '#666', marginTop: 2 },
    collapsedSummaryPrice: { fontSize: 22, fontWeight: '800', color: '#c87a1a' },
    collapsedSummaryMetaRow: { flexDirection: 'row', gap: 8 },
    collapsedSummaryMetaPill: {
      flex: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: isDark ? '#2f2a35' : '#5a5a66b0',
      borderWidth: 1,
      borderColor: isDark ? '#453c4f' : '#5500ff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    collapsedSummaryMetaPillText: { fontSize: 14, fontWeight: '900', color: '#cbbcff' },
    formOverline: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary || '#666',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 8,
      textAlign: 'center',
    },

    counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 8, gap: 12 },
    counterButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#2b2b2b', alignItems: 'center', justifyContent: 'center' },
    counterButtonDisabled: { opacity: 0.35 },
    counterButtonText: { color: '#fff', fontSize: 22, fontWeight: '700' },
    counterValueBox: {
      minWidth: 76,
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: colors.background || '#f2f2f2',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    counterValue: { fontSize: 20, fontWeight: '700', color: colors.text || '#111' },
    counterCaption: { fontSize: 11, color: colors.textSecondary || '#666' },

    section: { marginBottom: 16 },
    vehicleSection: {
      padding: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? '#32343a' : '#efe6d5',
      backgroundColor: isDark ? '#1d1f24' : '#a5a5a5ad',
    },
    summarySection: {
      padding: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? '#3e3e3e' : '#e7e7eb',
      backgroundColor: colors.card || (isDark ? '#252525' : '#fcfcfd'),
    },
    sectionCompact: { marginBottom: 14 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text || '#111', marginBottom: 8 },
    sectionHint: { fontSize: 12, color: colors.textSecondary || '#666' },
    sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border || '#ddd', marginVertical: 12 },

    vehicleOptionsList: { gap: 10 },
    vehicleOptionCard: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 18,
     backgroundColor: colors.card || (isDark ? '#2a2a2a' : '#FFFAF5'),
      borderWidth: 1,
      borderColor: colors.border || (isDark ? '#444' : '#e1e1e1'),
      gap: 8,
    },
    vehicleOptionCardSelected: {
      borderColor: isDark ? '#7e6746' : '#d3a24c',
      backgroundColor: isDark ? '#2f2a24' : '#fff8e8',
      shadowColor: '#cfa146',
      shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    vehicleOptionTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
    vehicleOptionTitleBlock: { flex: 1, gap: 2, minWidth: 0 },
    vehicleOptionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
    vehicleOptionIconBubble: {
      width: 46,
      height: 46,
      borderRadius: 28,
    //  backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: 'rgba(107, 78, 35, 0.12)',
      shadowOpacity: Platform.OS === 'ios' ? 0.05 : 0,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    vehicleEmoji: { fontSize: 20 },
    vehicleOptionTitle: { fontSize: 18, fontWeight: '800', color: colors.text || '#111', flexShrink: 1 },
    vehicleOptionTitleSelected: { color: '#111' },
    vehicleOptionSubtitle: { fontSize: 14, color: colors.textSecondary || '#666', marginTop: 2 },
    vehicleOptionSubtitleSelected: { color: '#222' },
    vehicleOptionPriceBlock: { alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 8 },
    vehicleOptionBadge: {
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: '#f3c168',
      fontSize: 15,
      fontWeight: '700',
      color: '#3b2b0f',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    vehicleOptionPrice: { fontSize: 24, fontWeight: '800', color: '#c87a1a' },
    vehicleOptionInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
    vehicleOptionMeta: { fontSize: 12, color: colors.textSecondary || '#666', flex: 1 },
    vehicleOptionMetaSelected: { color: '#222' },
    vehicleOptionPassengerControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    vehicleOptionCounterBtn: {
      width: 26,
      height: 26,
      borderRadius: 7,
      backgroundColor: '#2b2b2b',
      alignItems: 'center',
      justifyContent: 'center',
    },
    vehicleOptionCounterBtnDisabled: { opacity: 0.3 },
    vehicleOptionCounterText: { color: '#fff', fontSize: 22, fontWeight: '700' },
    vehicleOptionPassengerCount: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 38, justifyContent: 'center' },
    vehicleOptionPassengerDisplay: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    vehicleOptionPassengerValue: { fontSize: 15, fontWeight: '700', color: colors.text || '#111' },
    vehicleOptionPassengerValueSelected: { color: '#111' },
    vehicleOptionPassengerIcon: { fontSize: 15 },
    vehicleRecommendationStrip: {
      marginTop: 10,
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: '#fff2cf',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    vehicleRecommendationLabel: { fontSize: 14, fontWeight: '600', color: '#6b5223' },
    vehicleRecommendationValue: { fontSize: 16, fontWeight: '800', color: '#b86d17' },

    designatedDriverModeContainer: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border || '#ddd',
      gap: 10,
    },
    designatedDriverModeLabel: {
      fontSize: 13,
      fontWeight: '600',
      color:  colors.border || colors.text,
    },
    designatedDriverModeChips: {
      flexDirection: 'row',
      gap: 10,
    },
    designatedDriverModeChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border || '#d8d8d8',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card || (isDark ? '#2a2a2a' : '#fafafa'),
    },
    designatedDriverModeChipSelected: {
      borderColor: '#cfa146',
      backgroundColor: '#fff3d6',
      shadowColor: '#cfa146',
      shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: Platform.OS === 'android' ? 4 : 0,
    },
    designatedDriverModeChipText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary || '#555',
    },
    designatedDriverModeChipTextSelected: {
      color: '#9a5c0c',
    },
    designatedDriverModeInfoText: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '500',
      color: isDark ? '#f2c98a' : '#8a4f00',
      textAlign: 'center',
    },

    photoRow: { marginTop: 8 },
    photoHint: { fontSize: 12, color: isDark ? '#a8acb8' : (colors.textSecondary || '#666'), marginBottom: 8, textAlign: 'center' },
    photoButton: {
      alignSelf: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: isDark ? '#2d3038' : (colors.surface || '#f1f1f1'),
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? '#414550' : 'transparent',
    },
    photoButtonText: { color: colors.text || '#111', fontWeight: '600' },

    cta: {
      flex: 1,
      backgroundColor: '#c9782d',
      paddingVertical: 16,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaSecondary: { backgroundColor: '#6e44ff' },
    ctaDisabled: { opacity: 0.5 },
    ctaLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },

    ctaContainer: { paddingTop: 12, gap: 10 },

    scheduleCta: {
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: '#6e44ff',
      marginBottom: 0,
      backgroundColor: isDark ? '#241d3b' : '#f4f1ff',
    },
    scheduleCtaDisabled: { opacity: 0.65 },
    scheduleCtaText: { textAlign: 'center', fontWeight: '800', color: isDark ? '#e6ddff' : '#2f215c' },
    scheduleClearCta: {
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border || (isDark ? '#444' : '#ddd'),
      marginBottom: 0,
      backgroundColor: 'transparent',
    },
    scheduleClearText: { textAlign: 'center', fontWeight: '700', color: colors.text },

    scheduleOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: 16,
      justifyContent: 'center',
    },
    scheduleCard: {
      borderRadius: 16,
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

    estimateCard: { borderRadius: 14, padding: 12, backgroundColor: colors.card || (isDark ? '#2a2a2a' : '#f7f7f8'), borderWidth: 1, borderColor: colors.border || (isDark ? '#444' : '#e8e8ec'), marginBottom: 10 },
    estimateCardElevated: {
      shadowColor: '#000',
      shadowOpacity: Platform.OS === 'ios' ? 0.06 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: Platform.OS === 'android' ? 2 : 0,
    },
    centeredRow: { flexDirection: 'row', alignItems: 'center' },
    estimateText: { marginLeft: 8, color: colors.textSecondary || '#666' },
    estimateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    estimateLabel: { color: colors.textSecondary || '#666' },
    estimateValue: { color: colors.text || '#111', fontWeight: '800', fontSize: 22 },

    paymentRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 8 },
 paymentChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface || '#eee' },
    paymentChipSelected: { backgroundColor: '#b88939', borderColor: '#b88939' },
    paymentChipText: { color: colors.text || '#111', fontWeight: '600' },
    paymentChipTextSelected: { color: '#fff' },

    priceCommentRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 4 },
    priceCommentColumn: { flex: 1 },
    priceCommentLabel: { 
      fontSize: 12, 
      fontWeight: '600', 
      color: colors.text || '#333', 
      marginBottom: 6 
    },
    priceCommentInput: {
      height: 42,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.card || (isDark ? '#2b2b2b' : '#f6f6f7'),
      borderWidth: 1.25,
      borderColor: isDark ? '#494949' : '#e0e0e4',
      color: colors.text || '#111',
      fontSize: 14,
    },

    breakdownBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: colors.card || (isDark ? '#2a2a2a' : '#f1f1f1'), borderWidth: 1, borderColor: colors.border || (isDark ? '#444' : 'transparent') },
    breakdownText: { color: colors.textSecondary || '#666', fontSize: 12 },

    availabilityRow: { marginTop: 10, alignItems: 'center' },
    availabilityText: { color: colors.textSecondary || '#666' },
    availabilityWarn: { color: colors.warning || '#FFA726', fontWeight: '700' },
    availabilityOk: { color: colors.success || '#4CAF50', fontWeight: '700' },

    submittingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    },
    submittingCard: {
      paddingVertical: 20,
      paddingHorizontal: 28,
      borderRadius: 18,
      backgroundColor: colors.card || '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
      gap: 12,
    },
    submittingLabel: { fontSize: 14, fontWeight: '600', color: colors.text || '#111' },
    submittingText: {
      marginTop: 12,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },

    searchOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    searchCard: {
      width: '100%',
      maxHeight: '85%',
      borderRadius: 18,
      padding: 16,
      backgroundColor: colors.card || '#fff',
    },
    searchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    searchHeaderTextBlock: { flex: 1, paddingRight: 12 },
    searchTitle: { fontSize: 18, fontWeight: '700', color: colors.text || '#111' },
    searchDescription: { fontSize: 13, color: colors.textSecondary || '#666', marginTop: 2 },
    searchCloseButton: { paddingVertical: 4, paddingHorizontal: 6 },
    searchCloseText: { fontSize: 14, color: colors.primary || '#2196F3', fontWeight: '600' },
    destinationGuidanceCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#43444c' : '#e8ddc5',
      backgroundColor: isDark ? '#262730' : '#fff8ea',
      padding: 12,
      marginBottom: 12,
    },
    destinationGuidanceTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? '#f2e4c4' : '#7d5a21',
      marginBottom: 4,
    },
    destinationGuidanceText: {
      fontSize: 12,
      color: isDark ? '#c8cbd5' : '#5f5f66',
      lineHeight: 17,
    },
    destinationGuidanceSteps: { flexDirection: 'row', gap: 8, marginTop: 10 },
    destinationGuidanceStepPill: {
      flex: 1,
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: isDark ? '#4f515b' : '#dfd4bc',
      backgroundColor: isDark ? '#2f313b' : '#fff3d8',
      alignItems: 'center',
    },
    destinationGuidanceStepText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#e4e7f2' : '#6d5631',
      textAlign: 'center',
    },
    destinationConfirmedPill: {
      alignSelf: 'flex-start',
      marginTop: 10,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: isDark ? '#244230' : '#e8f8ee',
      borderWidth: 1,
      borderColor: isDark ? '#3f6f53' : '#b8e1c4',
    },
    destinationConfirmedText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#9fe1b7' : '#2f8f57',
    },

    searchInputWrapper: { marginBottom: 16 },
    searchInputLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary || '#777', marginBottom: 6, textTransform: 'uppercase' },
    searchInputHelper: { fontSize: 12, color: isDark ? '#e7cda0' : '#7b5e2d', marginBottom: 6 },
    searchInputContainer: {
      borderRadius: 12,
      backgroundColor: colors.surface || '#f4f4f5',
      paddingHorizontal: 14,
      paddingVertical: Platform.select({ ios: 12, android: 6, default: 8 }),
      borderWidth: 1,
      borderColor: (colors.border || '#dedede'),
    },
    searchInput: { color: colors.text || '#111', fontSize: 15, paddingVertical: Platform.select({ ios: 2, android: 0, default: 6 }) },

    searchActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    searchActionChip: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: colors.surface || '#ededed',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border || '#e3e3e3',
    },
    searchActionPrimary: { backgroundColor: colors.primary || '#2196F3', borderColor: colors.primary || '#2196F3' },
    searchActionText: { fontSize: 13, fontWeight: '700', color: colors.text || '#111' },
    searchActionTextPrimary: { color: '#fff' },

    searchScroll: { maxHeight: 360 },
    savedSection: { marginBottom: 16 },
    savedSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary || '#555', marginBottom: 6, textTransform: 'uppercase' },
    savedItem: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border || '#ddd',
    },
    savedItemLabel: { fontSize: 14, color: colors.text || '#111', fontWeight: '600' },
    savedItemCoords: { fontSize: 12, color: colors.textSecondary || '#666', marginTop: 2 },

    searchResultsSection: { paddingBottom: 12 },
    searchLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    searchLoadingText: { color: colors.textSecondary || '#666' },
    searchErrorText: { color: '#E53935', paddingVertical: 8 },
    searchHintText: { color: colors.textSecondary || '#666', paddingVertical: 8 },

    searchResultItem: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border || '#ddd',
    },
    searchResultMain: { fontSize: 15, color: colors.text || '#111', fontWeight: '600' },
    searchResultSecondary: { fontSize: 12, color: colors.textSecondary || '#666', marginTop: 2 },
  });
}