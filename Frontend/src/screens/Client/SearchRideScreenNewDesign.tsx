import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Modal,
  Animated,
  Easing,
  useColorScheme,
  Share,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useFirebaseItem } from '../../hooks/useFirebaseData';
import mapsService from '../../services/mapsService';
import driversService from '../../services/driversService';
import ridesService from '../../services/ridesService';
import servicesService, { ServiceItem } from '../../services/servicesService';
import { calculateRidePrice, formatPriceBreakdown, type PriceBreakdown } from '../../utils/priceCalculatorCentralize';
import alertService from '../../services/alertService';
import { uploadClientVehiclePhoto } from '../../services/supabaseStorage';
import BiometricService from '../../services/biometricService';
import client from '../../api/client';

const MANUAL_ORIGIN_ICON = require('../../assets/icons/select-origin-position/selectoriginposition_2x.png');
const MANUAL_ORIGIN_HOLD_ICON = require('../../assets/icons/select-origin-position-holding/selectoriginpositionholding_2x.png');
const ORIGIN_PIN_ICON = require('../../assets/icons/origin_marker/origin_marker.png');
const DESTINATION_PIN_ICON = require('../../assets/icons/select-final-destination/selectfinaldestination.png');
const STOP_PIN_ICON = require('../../assets/icons/select-extra-destination/selectextradestination.png');
const BACK_BUTTON_ICON = require('../../assets/icons/back_button/back_button2x.png');
const DEFAULT_FALLBACK_COORDS = { latitude: 12.1364, longitude: -86.2514 };
const MAX_EXTRA_STOPS = 3;
const VEHICLE_TYPES: VehicleType[] = ['moto', 'auto', 'designated_driver'];
const REGION_IDLE_DELAY_MS = 900;

interface VehicleEstimate {
  price: number | null;
  breakdown: PriceBreakdown | null;
}

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';
type PaymentMethod = 'cash' | 'card';

interface Coords {
  latitude: number;
  longitude: number;
}

interface SavedLocation {
  label: string;
  coords: Coords;
}

interface LocationValidationResult {
  allowed: boolean;
  serviceAreaId: string | null;
  areaName?: string;
  message?: string;
}

interface NormalizedSuggestion {
  mainText: string;
  secondaryText: string;
  fullText: string;
  placeId: string | null;
  coords: Coords | null;
}

type MapSelectionState =
  | 'origin'
  | 'destination'
  | 'extra-new'
  | { type: 'extra-edit'; index: number }
  | null;

const formatCoords = (coords: Coords) => `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;

function isValidCoordLocal(value: Coords | null | undefined): value is Coords {
  if (!value) return false;
  const { latitude, longitude } = value;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  return true;
}

function metersBetween(a: Coords, b: Coords) {
  const R = 6371000; // meters
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function extractCoordsFromSuggestion(suggestion: any): Coords | null {
  if (!suggestion) return null;

  const directLat = suggestion.latitude ?? suggestion.lat;
  const directLng = suggestion.longitude ?? suggestion.lng ?? suggestion.lon;
  if (typeof directLat === 'number' && typeof directLng === 'number') {
    return { latitude: directLat, longitude: directLng };
  }

  if (suggestion.coordinates) {
    const { latitude, longitude, lat, lng } = suggestion.coordinates;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng };
    }
  }

  if (Array.isArray(suggestion.center) && suggestion.center.length >= 2) {
    return { latitude: suggestion.center[1], longitude: suggestion.center[0] };
  }

  if (Array.isArray(suggestion.geometry?.coordinates) && suggestion.geometry.coordinates.length >= 2) {
    return { latitude: suggestion.geometry.coordinates[1], longitude: suggestion.geometry.coordinates[0] };
  }

  const location = suggestion.geometry?.location || suggestion.location || suggestion.position;
  if (location) {
    const lat = location.lat ?? location.latitude;
    const lng = location.lng ?? location.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng };
    }
  }

  if (Array.isArray(suggestion.coordinates) && suggestion.coordinates.length >= 2) {
    return { latitude: suggestion.coordinates[1], longitude: suggestion.coordinates[0] };
  }

  return null;
}

function normalizeSuggestion(suggestion: any, fallbackLabel: string): NormalizedSuggestion {
  const structured = suggestion?.structured_formatting || suggestion?.structuredFormatting;
  const descriptor =
    suggestion?.description ||
    suggestion?.place_name ||
    suggestion?.display_name ||
    suggestion?.title ||
    suggestion?.name ||
    suggestion?.text ||
    suggestion?.label;

  const mainText =
    structured?.main_text ||
    suggestion?.main_text ||
    suggestion?.primary_text ||
    suggestion?.text ||
    suggestion?.title ||
    suggestion?.name ||
    descriptor ||
    fallbackLabel;

  const secondaryText =
    structured?.secondary_text ||
    suggestion?.secondary_text ||
    suggestion?.secondary ||
    suggestion?.subtitle ||
    suggestion?.vicinity ||
    suggestion?.formatted_address ||
    suggestion?.address ||
    suggestion?.place_address ||
    '';

  const fullText = descriptor || (secondaryText ? `${mainText}, ${secondaryText}` : mainText);
  const placeId = suggestion?.place_id || suggestion?.placeId || suggestion?.id || suggestion?.reference || null;
  const coords = extractCoordsFromSuggestion(suggestion);

  return { mainText, secondaryText, fullText, placeId, coords };
}

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
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originCoords, setOriginCoords] = useState<Coords | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<Coords | null>(null);
  const [extraDestinations, setExtraDestinations] = useState<Array<{ address: string; coords: Coords | null }>>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<Coords[]>([]);
  const locationValidationCacheRef = useRef<Record<string, LocationValidationResult>>({});
  const [originServiceAreaId, setOriginServiceAreaId] = useState<string | null>(null);
  const [destinationServiceAreaId, setDestinationServiceAreaId] = useState<string | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);

  const [manualOriginDraft, setManualOriginDraft] = useState<Coords | null>(null);
  const [manualOriginAddress, setManualOriginAddress] = useState('');
  const [manualOriginLoading, setManualOriginLoading] = useState(false);
  const [manualOriginDragging, setManualOriginDragging] = useState(false);
  const [manualDestinationDraft, setManualDestinationDraft] = useState<Coords | null>(null);
  const [manualDestinationLoading, setManualDestinationLoading] = useState(false);
  const [manualDestinationDragging, setManualDestinationDragging] = useState(false);
  const [extraStopSelectionLoading, setExtraStopSelectionLoading] = useState(false);
  const [hasManualOriginOverride, setHasManualOriginOverride] = useState(false);
  const [hasPinnedOrigin, setHasPinnedOrigin] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<Coords | null>(null);

  const [estimatedDistance, setEstimatedDistance] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);

  const [passengersByVehicle, setPassengersByVehicle] = useState<Record<VehicleType, number>>({
    moto: 1,
    auto: 1,
    designated_driver: 1,
  });
  const [vehicleType, setVehicleType] = useState<VehicleType>('auto');
  const [designatedDriverMode, setDesignatedDriverMode] = useState<DesignatedDriverMode>('auto');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [priceSuggestion, setPriceSuggestion] = useState('');
  const [rideComment, setRideComment] = useState('');

  const [clientVehiclePhoto, setClientVehiclePhoto] = useState<string | null>(null);
  const [clientVehiclePhotoLocalUri, setClientVehiclePhotoLocalUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [driversAvailable, setDriversAvailable] = useState<boolean | null>(null);
  const [checkingDrivers, setCheckingDrivers] = useState(false);

  const [vehicleEstimates, setVehicleEstimates] = useState<Record<VehicleType, VehicleEstimate>>({
    moto: { price: null, breakdown: null },
    auto: { price: null, breakdown: null },
    designated_driver: { price: null, breakdown: null },
  });
  const [designatedDriverEstimates, setDesignatedDriverEstimates] = useState<Record<DesignatedDriverMode, VehicleEstimate>>({
    auto: { price: null, breakdown: null },
    moto: { price: null, breakdown: null },
  });
  const [recommendedVehicle, setRecommendedVehicle] = useState<VehicleType | null>(null);

  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NormalizedSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentLocations, setRecentLocations] = useState<SavedLocation[]>([]);
  const [favoriteLocations, setFavoriteLocations] = useState<SavedLocation[]>([]);
  const [activeSelection, setActiveSelection] = useState<'origin' | 'destination' | number | 'new-stop' | null>(null);

  const [mapSelectionMode, setMapSelectionMode] = useState<MapSelectionState | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<number | null>(null);
  const [scheduleDayIndex, setScheduleDayIndex] = useState(0);
  const [scheduleHour, setScheduleHour] = useState<number>(0);
  const [scheduleMinute, setScheduleMinute] = useState<number>(0);
  const [bottomPanelExpanded, setBottomPanelExpanded] = useState(true);
  const bottomPanelAnim = useRef(new Animated.Value(0)).current;

  // Pequeña animación de rebote para indicar que se está resolviendo / guardando
  // la ubicación seleccionada (origen o destino) en el mapa.
  const markerBounce = useRef(new Animated.Value(0)).current;
  const markerBounceTranslateY = markerBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

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

    if (message) {
      alertService.showInfoAlert(title, message);
    }
  }, [mapSelectionMode, extraDestinations.length]);

  const orderedRouteRows = useMemo(() => {
    const rows: Array<{ kind: 'origin' | 'destination' | 'extra'; index?: number }> = [{ kind: 'origin' }];
    extraDestinations.forEach((_, index) => rows.push({ kind: 'extra', index }));
    rows.push({ kind: 'destination' });
    return rows;
  }, [extraDestinations]);

  const canAddExtraStop = useMemo(() => extraDestinations.length < MAX_EXTRA_STOPS, [extraDestinations.length]);

  useEffect(() => {
    servicesService.listServices().then(setServicesCatalog).catch(() => undefined);
    mapsService.fetchProviderFromBackend().catch(() => undefined);
  }, []);

  const ensureLocationAllowed = useCallback(
    async (coordsToCheck: Coords): Promise<LocationValidationResult> => {
      const cacheKey = `${coordsToCheck.latitude.toFixed(5)},${coordsToCheck.longitude.toFixed(5)}`;
      const cached = locationValidationCacheRef.current[cacheKey];
      if (cached) {
        return cached;
      }

      try {
        const response = await client.post('/checkRegionAvailabilityHttp', {
          latitude: coordsToCheck.latitude,
          longitude: coordsToCheck.longitude,
          platform: Platform.OS,
        });
        const data = response.data || {};
        const result: LocationValidationResult = {
          allowed: !!data.allowed,
          serviceAreaId:
            typeof data.serviceAreaId === 'string' && data.serviceAreaId.trim().length > 0
              ? data.serviceAreaId.trim()
              : null,
          areaName: typeof data.areaName === 'string' ? data.areaName : undefined,
          message: typeof data.message === 'string' ? data.message : undefined,
        };
        locationValidationCacheRef.current[cacheKey] = result;
        return result;
      } catch (error: any) {
        console.warn('[SearchRide] Error verificando área de servicio:', error?.response?.data || error);
        return {
          allowed: false,
          serviceAreaId: null,
          message: tr('alerts.serviceValidationFailed'),
        };
      }
    },
    [tr],
  );

  const validateLocationForContext = useCallback(
    async (coordsToCheck: Coords, context: 'origin' | 'destination' | 'stop') => {
      const validation = await ensureLocationAllowed(coordsToCheck);
      if (!validation.allowed) {
        alertService.showInfoAlert(
          tr('alerts.unavailableZoneTitle'),
          validation.message || tr('alerts.unavailableZoneMessage'),
        );
        return null;
      }

      if (context === 'origin') {
        setOriginServiceAreaId(validation.serviceAreaId ?? null);
      } else if (context === 'destination') {
        setDestinationServiceAreaId(validation.serviceAreaId ?? null);
      }

      return validation;
    },
    [ensureLocationAllowed, tr],
  );

  const { data: savedLocation } = useFirebaseItem<any>('clientsLocations', user?.id || '', { once: true });

  useEffect(() => {
    if (hasManualOriginOverride) {
      return;
    }

    if (savedLocation?.coords) {
      const firebaseCoords = {
        latitude: savedLocation.coords.latitude,
        longitude: savedLocation.coords.longitude,
      };
      const sameAsCurrent =
        originCoords &&
        Math.abs(originCoords.latitude - firebaseCoords.latitude) < 0.000001 &&
        Math.abs(originCoords.longitude - firebaseCoords.longitude) < 0.000001;
      if (!sameAsCurrent) {
        setOriginCoords(firebaseCoords);
        const savedAddress = savedLocation.address || formatCoords(firebaseCoords);
        setOrigin(savedAddress);
        setManualOriginAddress(savedAddress);
        setManualOriginDraft(firebaseCoords);
        setHasPinnedOrigin(true);
        setCameraTarget(firebaseCoords);
      }
      return;
    }

    if (!originCoords && coords) {
      const gpsCoords = { latitude: coords.latitude, longitude: coords.longitude };
      setOriginCoords(gpsCoords);
      setOrigin(defaultLabels.origin);
      setManualOriginAddress(defaultLabels.origin);
      setManualOriginDraft(gpsCoords);
      setHasPinnedOrigin(true);
      setCameraTarget(gpsCoords);
    }
  }, [coords, hasManualOriginOverride, originCoords, savedLocation, defaultLabels.origin]);

  useEffect(() => {
    const base = originCoords || savedLocation?.coords || coords;
    if (!manualOriginDraft && base) {
      setManualOriginDraft(base);
      if (!manualOriginAddress) {
        setManualOriginAddress(origin || formatCoords(base));
      }
      if (!hasPinnedOrigin) {
        setHasPinnedOrigin(true);
      }
    }
  }, [originCoords, coords, manualOriginDraft, manualOriginAddress, origin, savedLocation?.coords, hasPinnedOrigin]);

  useEffect(() => {
    if (mapSelectionMode === 'destination') {
      setManualDestinationDragging(false);
      if (!manualDestinationDraft) {
        const baseDestination =
          destinationCoords ??
          manualOriginDraft ??
          originCoords ??
          coords ??
          DEFAULT_FALLBACK_COORDS;
        setManualDestinationDraft(baseDestination);
      }
    } else if (manualDestinationDragging) {
      setManualDestinationDragging(false);
    }
  }, [mapSelectionMode, manualDestinationDraft, destinationCoords, manualOriginDraft, originCoords, coords, manualDestinationDragging]);

  useEffect(() => {
    if (vehicleType === 'moto' && passengersByVehicle.moto > 1) {
      setPassengersByVehicle(prev => ({ ...prev, moto: 1 }));
      alertService.showInfoAlert(tr('alerts.motoSelectedTitle'), tr('alerts.singlePassengerMessage'));
    }
  }, [vehicleType, passengersByVehicle.moto, tr]);

  useEffect(() => {
    if (!coords) return;
    const check = async () => {
      setCheckingDrivers(true);
      try {
        const designatedDriverVehicle =
          vehicleType === 'designated_driver' ? designatedDriverMode : undefined;
        const result = await driversService.checkAvailableDrivers(
          coords,
          15,
          vehicleType,
          designatedDriverVehicle,
        );
        setDriversAvailable(result.available && result.count > 0);
      } catch {
        setDriversAvailable(null);
      } finally {
        setCheckingDrivers(false);
      }
    };
    check();
  }, [coords, vehicleType, designatedDriverMode]);

  const capacityByVehicle: Record<VehicleType, number> = useMemo(
    () => ({
      moto: 1,
      auto: 4,
      designated_driver: designatedDriverMode === 'moto' ? 1 : 4,
    }),
    [designatedDriverMode],
  );

  const preferServiceCatalogCopy = useMemo(() => {
    const lang = i18n.language || 'en';
    return lang.toLowerCase().startsWith('es');
  }, [i18n.language]);

  const vehicleOptions = useMemo(() => {
    const defaults: Record<VehicleType, { label: string; subtitle: string; emoji: string }> = {
      moto: { label: tr('vehicle.motoLabel'), subtitle: tr('vehicle.motoSubtitle'), emoji: '🏍️' },
      auto: { label: tr('vehicle.autoLabel'), subtitle: tr('vehicle.autoSubtitle'), emoji: '🚘' },
      designated_driver: { label: tr('vehicle.designatedLabel'), subtitle: tr('vehicle.designatedSubtitle'), emoji: '🧑‍✈️' },
    };

    const findMatch = (type: VehicleType) => {
      const target = servicesCatalog.find((service) => {
        const code = service.code?.toLowerCase() || '';
        const name = service.name?.toLowerCase() || '';
        if (type === 'designated_driver') {
          return code.includes('design') || name.includes('design');
        }
        return code.includes(type) || name.includes(type);
      });
      return target;
    };

    return VEHICLE_TYPES.map((type) => {
      const match = findMatch(type);
      const shouldUseCatalogCopy = preferServiceCatalogCopy && match;
      return {
        type,
        label: shouldUseCatalogCopy && match?.name ? match.name : defaults[type].label,
        subtitle: shouldUseCatalogCopy && match?.description ? match.description : defaults[type].subtitle,
        emoji: defaults[type].emoji,
      };
    });
  }, [servicesCatalog, tr, preferServiceCatalogCopy]);

  const formatPriceValue = useCallback(
    (value: number | null | undefined) => {
      if (value == null || Number.isNaN(value)) return tr('labels.calculating');
      return tr('labels.priceApproximation', { value: Math.round(value) });
    },
    [tr],
  );

  const updateVehicleEstimates = useCallback(
    async (distanceMeters: number, durationSeconds: number, stopsCount: number, startPoint: Coords) => {
      try {
        const pricing = await Promise.all(
          VEHICLE_TYPES.map(async (type) => {
            try {
              const breakdown = await calculateRidePrice(
                distanceMeters,
                durationSeconds,
                type === 'moto' ? 'motorcycle' : 'car',
                type === 'designated_driver' ? 'designated_driver' : 'normal',
                startPoint.latitude,
                startPoint.longitude,
                { extraStops: stopsCount },
              );
              return { type, price: breakdown.finalPrice, breakdown } as const;
            } catch (error) {
              console.warn('calculateRidePrice failed for', type, error);
              return { type, price: null, breakdown: null } as const;
            }
          }),
        );

        const mapped = pricing.reduce<Record<VehicleType, VehicleEstimate>>((acc, item) => {
          acc[item.type] = { price: item.price, breakdown: item.breakdown };
          return acc;
        }, { moto: { price: null, breakdown: null }, auto: { price: null, breakdown: null }, designated_driver: { price: null, breakdown: null } });

        setVehicleEstimates(mapped);

        let designatedDriverMotoBreakdown: PriceBreakdown | null = null;
        try {
          designatedDriverMotoBreakdown = await calculateRidePrice(
            distanceMeters,
            durationSeconds,
            'motorcycle',
            'designated_driver',
            startPoint.latitude,
            startPoint.longitude,
            { extraStops: stopsCount },
          );
        } catch (error) {
          console.warn('calculateRidePrice failed for designated_driver moto', error);
        }

        const designatedDriverAutoEstimate = mapped.designated_driver || { price: null, breakdown: null };
        const designatedDriverMotoEstimate: VehicleEstimate = {
          price: designatedDriverMotoBreakdown?.finalPrice ?? null,
          breakdown: designatedDriverMotoBreakdown,
        };
        setDesignatedDriverEstimates({
          auto: designatedDriverAutoEstimate,
          moto: designatedDriverMotoEstimate,
        });

        const valid = pricing.filter((item) => typeof item.price === 'number' && item.price !== null && !Number.isNaN(item.price));
        if (valid.length > 0) {
          const lowest = valid.reduce((prev, current) => (prev.price! <= current.price! ? prev : current));
          setRecommendedVehicle(lowest.type);
        } else {
          setRecommendedVehicle(null);
        }

        const current =
          vehicleType === 'designated_driver'
            ? designatedDriverMode === 'moto'
              ? designatedDriverMotoEstimate
              : designatedDriverAutoEstimate
            : mapped[vehicleType];

        if (current?.price != null) {
          setEstimatedPrice(current.price);
          setPriceBreakdown(current.breakdown);
        } else {
          setEstimatedPrice(0);
          setPriceBreakdown(null);
        }
      } catch (error) {
        console.warn('updateVehicleEstimates', error);
      }
    },
    [vehicleType, designatedDriverMode],
  );

  useEffect(() => {
    if (vehicleType === 'designated_driver') {
      const current = designatedDriverEstimates[designatedDriverMode];
      if (current?.price != null) {
        setEstimatedPrice(current.price);
        setPriceBreakdown(current.breakdown);
      } else {
        setEstimatedPrice(0);
        setPriceBreakdown(null);
      }
      return;
    }

    const current = vehicleEstimates[vehicleType];
    if (current?.price != null) {
      setEstimatedPrice(current.price);
      setPriceBreakdown(current.breakdown);
    }
  }, [vehicleType, vehicleEstimates, designatedDriverMode, designatedDriverEstimates]);

  const calculateRouteWithStops = useCallback(
    async (startPoint: Coords | null, stops: Coords[], endPoint: Coords | null) => {
      if (!startPoint || !endPoint) return;

      try {
        setCalculatingRoute(true);
        const all = [startPoint, ...stops, endPoint];
        let totalDistance = 0;
        let totalDuration = 0;
        let poly: Coords[] = [];

        for (let i = 0; i < all.length - 1; i += 1) {
          const segment = await mapsService.getDirections(all[i], all[i + 1]);
          if (!segment) throw new Error('Routing failed');
          totalDistance += segment.distance;
          totalDuration += segment.duration;
          poly = poly.concat(segment.polyline);
        }

        setRouteCoordinates(poly);

        const distanceKm = totalDistance / 1000;
        const durationMin = Math.ceil(totalDuration / 60);
        setEstimatedDistance(Number(distanceKm.toFixed(2)));
        setEstimatedDuration(durationMin);

        const useMotorcycle = vehicleType === 'moto' || (vehicleType === 'designated_driver' && designatedDriverMode === 'moto');
        const vehicleTypeForCalc = useMotorcycle ? 'motorcycle' : 'car';
        const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';
        const breakdown = await calculateRidePrice(
          totalDistance,
          totalDuration,
          vehicleTypeForCalc,
          rideTypeForCalc,
          startPoint.latitude,
          startPoint.longitude,
          { extraStops: stops.length },
        );
        setEstimatedPrice(breakdown.finalPrice);
        setPriceBreakdown(breakdown);
        await updateVehicleEstimates(totalDistance, totalDuration, stops.length, startPoint);
      } catch (error) {
        console.warn('calculateRouteWithStops', error);
        alertService.showErrorAlert(tr('alerts.priceCalculationFailed'));
      } finally {
        setCalculatingRoute(false);
      }
    },
    [vehicleType],
  );

  const calculateSimpleRoute = useCallback(
    async (start: Coords, end: Coords, stopsCount: number) => {
      try {
        setCalculatingRoute(true);
        const route = await mapsService.getDirections(start, end);
        if (!route) throw new Error('Routing failed');
        setRouteCoordinates(route.polyline);

        const distanceKm = route.distance / 1000;
        const durationMin = Math.ceil(route.duration / 60);
        setEstimatedDistance(Number(distanceKm.toFixed(2)));
        setEstimatedDuration(durationMin);

        const vehicleTypeForCalc = vehicleType === 'moto' ? 'motorcycle' : 'car';
        const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';
        const breakdown = await calculateRidePrice(
          route.distance,
          route.duration,
          vehicleTypeForCalc,
          rideTypeForCalc,
          start.latitude,
          start.longitude,
          { extraStops: stopsCount },
        );
        setEstimatedPrice(breakdown.finalPrice);
        setPriceBreakdown(breakdown);
        await updateVehicleEstimates(route.distance, route.duration, stopsCount, start);
      } catch (error) {
        console.warn('calculateSimpleRoute', error);
        alertService.showErrorAlert(tr('alerts.priceCalculationFailed'));
      } finally {
        setCalculatingRoute(false);
      }
    },
    [vehicleType],
  );

  const recomputeRouteWith = useCallback(
    async (
      overrideOrigin?: Coords | null,
      overrideDestination?: Coords | null,
      overrideStops?: Array<{ address: string; coords: Coords | null }>,
    ) => {
      const originPoint = overrideOrigin ?? originCoords ?? manualOriginDraft ?? coords ?? null;
      const destinationPoint = overrideDestination ?? destinationCoords ?? null;
      const stopsSource = overrideStops ?? extraDestinations;
      const stopsCoords = stopsSource.map((stop) => stop.coords).filter(Boolean) as Coords[];

      if (!originPoint || !destinationPoint) return;

      if (stopsCoords.length > 0) {
        await calculateRouteWithStops(originPoint, stopsCoords, destinationPoint);
      } else {
        await calculateSimpleRoute(originPoint, destinationPoint, 0);
      }
    },
    [originCoords, manualOriginDraft, coords, destinationCoords, extraDestinations, calculateRouteWithStops, calculateSimpleRoute],
  );

  const rememberRecentLocation = useCallback((label: string, coordsValue: Coords | null) => {
    if (!coordsValue) return;
    setRecentLocations((prev) => {
      const existingIndex = prev.findIndex(
        (loc) =>
          Math.abs(loc.coords.latitude - coordsValue.latitude) < 0.0001 &&
          Math.abs(loc.coords.longitude - coordsValue.longitude) < 0.0001,
      );
      const filtered = existingIndex >= 0 ? prev.filter((_, idx) => idx !== existingIndex) : prev;
      return [{ label, coords: coordsValue }, ...filtered].slice(0, 8);
    });
  }, []);

  const applySelectionForTarget = useCallback(
    async (target: 'origin' | 'destination' | number | 'new-stop', label: string, coordsValue: Coords | null) => {
      if (!target) return;
      const sanitizedLabel = label.trim() || defaultLabels.locationFallback;

      if (target === 'origin') {
        if (!coordsValue) {
          alertService.showInfoAlert(
            tr('alerts.selectValidPointTitle'),
            tr('alerts.selectValidOriginMessage'),
          );
          return;
        }
        const validation = await validateLocationForContext(coordsValue, 'origin');
        if (!validation) {
          return;
        }
        setOrigin(sanitizedLabel);
        setManualOriginAddress(sanitizedLabel);
        setManualOriginDraft(coordsValue);
        setOriginCoords(coordsValue);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        setHasPinnedOrigin(true);
        setHasManualOriginOverride(true);
        setCameraTarget(coordsValue);
        await recomputeRouteWith(coordsValue, undefined, undefined);
        return;
      }

      if (target === 'destination') {
        if (!coordsValue) {
          alertService.showInfoAlert(
            tr('alerts.selectValidPointTitle'),
            tr('alerts.selectValidDestinationMessage'),
          );
          return;
        }
        const validation = await validateLocationForContext(coordsValue, 'destination');
        if (!validation) {
          return;
        }
        setDestination(sanitizedLabel);
        setDestinationCoords(coordsValue);
        setManualDestinationDraft(null);
        setManualDestinationLoading(false);
        setManualDestinationDragging(false);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        setCameraTarget(coordsValue);
        await recomputeRouteWith(undefined, coordsValue, undefined);
        return;
      }

      if (target === 'new-stop') {
        if (!isValidCoordLocal(coordsValue)) {
          alertService.showInfoAlert(
            tr('alerts.selectValidPointTitle'),
            tr('alerts.selectValidStopMessage'),
          );
          return;
        }
        const safeCoords = coordsValue as Coords;
        const validation = await validateLocationForContext(safeCoords, 'stop');
        if (!validation) {
          return;
        }
        const nextStops = [...extraDestinations, { address: sanitizedLabel, coords: safeCoords }];
        setExtraDestinations(nextStops);
        rememberRecentLocation(sanitizedLabel, safeCoords);
        setCameraTarget(safeCoords);
        await recomputeRouteWith(undefined, undefined, nextStops);
        return;
      }

      if (typeof target === 'number') {
        if (!isValidCoordLocal(coordsValue)) {
          alertService.showInfoAlert(
            tr('alerts.selectValidPointTitle'),
            tr('alerts.selectValidStopMessage'),
          );
          return;
        }
        const safeCoords = coordsValue as Coords;
        const validation = await validateLocationForContext(safeCoords, 'stop');
        if (!validation) {
          return;
        }
        const nextStops = extraDestinations.map((stop, index) =>
          index === target ? { address: sanitizedLabel, coords: safeCoords } : stop,
        );
        setExtraDestinations(nextStops);
        rememberRecentLocation(sanitizedLabel, safeCoords);
        setCameraTarget(safeCoords);
        await recomputeRouteWith(undefined, undefined, nextStops);
      }
    },
    [
      extraDestinations,
      rememberRecentLocation,
      recomputeRouteWith,
      setCameraTarget,
      setHasPinnedOrigin,
      setHasManualOriginOverride,
      validateLocationForContext,
    ],
  );

  const openLocationSearch = useCallback(
    (target: 'origin' | 'destination' | number | 'new-stop') => {
      setActiveSelection(target);
      setShowSearchOverlay(true);
      setSearchError(null);
      setSearchResults([]);
      setMapSelectionMode(null);

      let initialQuery = '';
      if (target === 'origin') {
        initialQuery = manualOriginAddress || origin;
      } else if (target === 'destination') {
        initialQuery = destination;
      } else if (typeof target === 'number') {
        initialQuery = extraDestinations[target]?.address || '';
      }
      setSearchQuery(initialQuery);
    },
    [manualOriginAddress, origin, destination, extraDestinations],
  );

  useEffect(() => {
    if (!showSearchOverlay) {
      setDebouncedSearch('');
      return;
    }

    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 450);

    return () => clearTimeout(handler);
  }, [searchQuery, showSearchOverlay]);

  useEffect(() => {
    if (!showSearchOverlay || debouncedSearch.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      if (debouncedSearch.length === 0) {
        setSearchError(null);
      }
      return;
    }

    let cancelled = false;
    const fetchSuggestions = async () => {
      try {
        setSearchLoading(true);
        const results = await mapsService.autocomplete(debouncedSearch, coords ?? undefined, {
          forceProvider: 'google',
        });
        if (!cancelled) {
          setSearchResults(results.map((item) => normalizeSuggestion(item, defaultLabels.locationFallback)));
          setSearchError(results.length === 0 ? tr('labels.noResults') : null);
        }
      } catch (error) {
        console.warn('autocomplete failed', error);
        if (!cancelled) {
          setSearchError(tr('search.error'));
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };

    fetchSuggestions();
    return () => {
      cancelled = true;
    };
  }, [showSearchOverlay, debouncedSearch, coords, tr, defaultLabels.locationFallback]);

  const closeSearchOverlay = useCallback(() => {
    setShowSearchOverlay(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setActiveSelection(null);
  }, []);

  const handleSelectSuggestion = useCallback(
    async (suggestion: NormalizedSuggestion) => {
      const target = activeSelection || 'destination';
      try {
        setSearchLoading(true);
        let coordsValue = suggestion.coords;
        if (!coordsValue && suggestion.placeId) {
          coordsValue =
            (await mapsService.getPlaceDetails(suggestion.placeId, undefined, {
              forceProvider: 'google',
            })) || null;
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
      alertService.showInfoAlert(
        tr('alerts.locationUnavailableTitle'),
        tr('alerts.locationUnavailableMessage'),
      );
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
      setExtraDestinations(updatedStops);
      void recomputeRouteWith(undefined, undefined, updatedStops);
    },
    [extraDestinations, recomputeRouteWith],
  );

  const handlePickFromMap = useCallback(() => {
    if (!activeSelection) return;
    if (activeSelection === 'origin') {
      setHasPinnedOrigin(false);
      setMapSelectionMode('origin');
    }
    else if (activeSelection === 'destination') setMapSelectionMode('destination');
    else if (activeSelection === 'new-stop') setMapSelectionMode('extra-new');
    else if (typeof activeSelection === 'number') setMapSelectionMode({ type: 'extra-edit', index: activeSelection });

    setShowSearchOverlay(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
  }, [activeSelection]);

  const cancelMapSelection = useCallback(() => {
    setMapSelectionMode(null);
  }, []);

  const handleMapPress = useCallback(
    async (event: { latitude: number; longitude: number }) => {
      if (mapSelectionMode === 'origin' || mapSelectionMode === 'destination') {
        // In origin selection mode, we use center-pin + region change, so ignore taps
        return;
      }
      const selectedPoint: Coords = { latitude: event.latitude, longitude: event.longitude };
      const isExtraStopMode =
        mapSelectionMode === 'extra-new' ||
        (mapSelectionMode && typeof mapSelectionMode === 'object' && mapSelectionMode.type === 'extra-edit');

      if (isExtraStopMode) {
        setExtraStopSelectionLoading(true);
      }

      try {
        const address = (await mapsService.reverseGeocode(selectedPoint)) || formatCoords(selectedPoint);

        if (mapSelectionMode === 'extra-new') {
          await applySelectionForTarget('new-stop', address, selectedPoint);
          setMapSelectionMode(null);
          return;
        }

        if (mapSelectionMode && typeof mapSelectionMode === 'object' && mapSelectionMode.type === 'extra-edit') {
          await applySelectionForTarget(mapSelectionMode.index, address, selectedPoint);
          setMapSelectionMode(null);
          return;
        }

        if (!destinationCoords) {
          await applySelectionForTarget('destination', address, selectedPoint);
          return;
        }

        if (!originCoords) {
          await applySelectionForTarget('origin', address, selectedPoint);
          return;
        }

        if (canAddExtraStop) {
          await applySelectionForTarget('new-stop', address, selectedPoint);
        }
      } finally {
        if (isExtraStopMode) {
          setExtraStopSelectionLoading(false);
        }
      }
    },
    [mapSelectionMode, applySelectionForTarget, destinationCoords, originCoords, canAddExtraStop],
  );

  const recalcPriceOnly = useCallback(async () => {
    const start = originCoords || coords;
    if (!start || !destinationCoords) return;

    const useMotorcycle = vehicleType === 'moto' || (vehicleType === 'designated_driver' && designatedDriverMode === 'moto');
    const vehicleTypeForCalc = useMotorcycle ? 'motorcycle' : 'car';
    const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';

    const distMeters = Math.max(1, Math.round(estimatedDistance * 1000));
    const durSeconds = Math.max(1, Math.round(estimatedDuration * 60));
    const stopsCount = extraDestinations.filter((d) => d.coords).length;

    try {
      const breakdown = await calculateRidePrice(
        distMeters,
        durSeconds,
        vehicleTypeForCalc,
        rideTypeForCalc,
        start.latitude,
        start.longitude,
        { extraStops: stopsCount },
      );
      setEstimatedPrice(breakdown.finalPrice);
      setPriceBreakdown(breakdown);
    } catch (error) {
      console.warn('recalcPriceOnly', error);
    }
  }, [
    coords,
    destinationCoords,
    designatedDriverMode,
    estimatedDistance,
    estimatedDuration,
    extraDestinations,
    originCoords,
    vehicleType,
  ]);

  useEffect(() => {
    if (estimatedDistance > 0 && (originCoords || coords)) {
      recalcPriceOnly();
    }
  }, [coords, estimatedDistance, originCoords, recalcPriceOnly]);

  useEffect(() => {
    if (vehicleType === 'designated_driver' && designatedDriverMode === 'moto' && passengersByVehicle.designated_driver > 1) {
      setPassengersByVehicle((prev) => ({ ...prev, designated_driver: 1 }));
      alertService.showInfoAlert(
        tr('alerts.designatedDriverMotoTitle'),
        tr('alerts.singlePassengerMessage'),
      );
    }
  }, [vehicleType, designatedDriverMode, passengersByVehicle.designated_driver, tr]);

  const handleManualOriginDragStart = useCallback((startCoords: Coords) => {
    setManualOriginDragging(true);
    setManualOriginDraft((prev) => prev ?? startCoords);
  }, []);

  const destinationPromptShownRef = useRef(false);
  const previousStopsCountRef = useRef(0);

  const promptDestinationSelection = useCallback(() => {
    if (destinationPromptShownRef.current) return;
    if (destination?.trim()?.length) return;
    destinationPromptShownRef.current = true;
    alertService.showInfoAlert(tr('alerts.destinationPromptTitle'), tr('alerts.destinationPromptMessage'));
  }, [destination, tr]);

  useEffect(() => {
    if (!destination && !destinationCoords) {
      destinationPromptShownRef.current = false;
    }
  }, [destination, destinationCoords]);

  useEffect(() => {
    const stopsWithCoords = extraDestinations.filter((stop) => !!stop.coords).length;
    if (stopsWithCoords > previousStopsCountRef.current && !destination && !destinationCoords) {
      promptDestinationSelection();
    }
    previousStopsCountRef.current = stopsWithCoords;
  }, [extraDestinations, destination, destinationCoords, promptDestinationSelection]);

  const handleManualOriginDragEnd = useCallback(
    async (newCoords: Coords) => {
      setManualOriginDraft(newCoords);
      setManualOriginDragging(false);
      setManualOriginLoading(true);
      setHasManualOriginOverride(true);
      try {
        const validation = await validateLocationForContext(newCoords, 'origin');
        if (!validation) {
          return;
        }
        const coordLabel = formatCoords(newCoords);
        let address: string | null = null;
        try {
          address = await mapsService.reverseGeocode(newCoords);
        } catch (reverseError) {
          console.warn('reverseGeocode origin (drag) failed', reverseError);
        }
        const displayAddress = address?.trim()?.length ? address : coordLabel;

        setManualOriginAddress(displayAddress);
        setOriginCoords(newCoords);
        setOrigin(displayAddress);
        rememberRecentLocation(displayAddress, newCoords);
        setCameraTarget(newCoords);
        await recomputeRouteWith(newCoords, undefined, undefined);
        promptDestinationSelection();
      } catch (error) {
        console.warn('Manual origin geocode failed', error);
        const fallbackAddress = formatCoords(newCoords);
        setManualOriginAddress(fallbackAddress);
        setOriginCoords(newCoords);
        setOrigin(fallbackAddress);
        rememberRecentLocation(fallbackAddress, newCoords);
        setCameraTarget(newCoords);
        await recomputeRouteWith(newCoords, undefined, undefined);
        promptDestinationSelection();
      } finally {
        setManualOriginLoading(false);
        // Clear draft to rely on committed originCoords
        setManualOriginDraft(null);
      }
    },
    [
      rememberRecentLocation,
      recomputeRouteWith,
      promptDestinationSelection,
      setCameraTarget,
      setHasManualOriginOverride,
      validateLocationForContext,
    ],
  );

  const manualOriginMarkerPosition = useMemo(() => {
    if (manualOriginDraft) return manualOriginDraft;
    if (originCoords) return originCoords;
    if (coords) return coords;
    return DEFAULT_FALLBACK_COORDS;
  }, [manualOriginDraft, originCoords, coords]);

  // Static center-pin selection (only for origin)
  const lastAppliedOriginCenterRef = useRef<Coords | null>(null);
  const originCenterIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedDestinationCenterRef = useRef<Coords | null>(null);
  const destinationCenterIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOriginIdleTimeout = useCallback(() => {
    if (originCenterIdleTimeoutRef.current) {
      clearTimeout(originCenterIdleTimeoutRef.current);
      originCenterIdleTimeoutRef.current = null;
    }
  }, []);

  const clearDestinationIdleTimeout = useCallback(() => {
    if (destinationCenterIdleTimeoutRef.current) {
      clearTimeout(destinationCenterIdleTimeoutRef.current);
      destinationCenterIdleTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearOriginIdleTimeout();
      clearDestinationIdleTimeout();
    };
  }, [clearDestinationIdleTimeout, clearOriginIdleTimeout]);

  const handleRegionChangeCenter = useCallback(
    (center: Coords) => {
      if (mapSelectionMode === 'origin') {
        clearOriginIdleTimeout();
        setManualOriginDragging(true);
        setManualOriginDraft(center);
      } else if (mapSelectionMode === 'destination') {
        clearDestinationIdleTimeout();
        setManualDestinationDragging(true);
        setManualDestinationDraft(center);
      }
    },
    [clearDestinationIdleTimeout, clearOriginIdleTimeout, mapSelectionMode],
  );

  const handleRegionChangeCompleteCenter = useCallback(
    (center: Coords) => {
      if (mapSelectionMode === 'origin') {
        setManualOriginDragging(false);
        clearOriginIdleTimeout();
        originCenterIdleTimeoutRef.current = setTimeout(async () => {
          const last = lastAppliedOriginCenterRef.current;
          if (last && metersBetween(last, center) < 20) return; // ignore tiny moves
          setManualOriginLoading(true);
          try {
            const validation = await validateLocationForContext(center, 'origin');
            if (!validation) {
              return;
            }
            const coordLabel = formatCoords(center);
            let address: string | null = null;
            try {
              address = await mapsService.reverseGeocode(center);
            } catch (reverseError) {
              console.warn('reverseGeocode origin (center pin) failed', reverseError);
            }
            const displayAddress = address?.trim()?.length ? address : coordLabel;

            setManualOriginAddress(displayAddress);
            setOriginCoords(center);
            setOrigin(displayAddress);
            setHasManualOriginOverride(true);
            rememberRecentLocation(displayAddress, center);
            lastAppliedOriginCenterRef.current = center;
            await recomputeRouteWith(center, undefined, undefined);
            promptDestinationSelection();
          } catch (err) {
            console.warn('center-pin origin selection failed', err);
            const fallback = formatCoords(center);
            setManualOriginAddress(fallback);
            setOriginCoords(center);
            setOrigin(fallback);
            setHasManualOriginOverride(true);
            rememberRecentLocation(fallback, center);
            await recomputeRouteWith(center, undefined, undefined);
            promptDestinationSelection();
          } finally {
            setManualOriginLoading(false);
            setMapSelectionMode(null);
            setManualOriginDraft(null);
            setHasPinnedOrigin(true);
            clearOriginIdleTimeout();
          }
        }, REGION_IDLE_DELAY_MS);
        return;
      }

      if (mapSelectionMode !== 'destination') return;
      setManualDestinationDragging(false);
      clearDestinationIdleTimeout();
      destinationCenterIdleTimeoutRef.current = setTimeout(async () => {
        const last = lastAppliedDestinationCenterRef.current;
        if (last && metersBetween(last, center) < 20) return;
        setManualDestinationLoading(true);
        try {
          const coordLabel = formatCoords(center);
          let address: string | null = null;
          try {
            address = await mapsService.reverseGeocode(center);
          } catch (reverseError) {
            console.warn('reverseGeocode destination (center pin) failed', reverseError);
          }
          const displayAddress = address?.trim()?.length ? address : coordLabel;

          setDestination(displayAddress);
          setDestinationCoords(center);
          rememberRecentLocation(displayAddress, center);
          lastAppliedDestinationCenterRef.current = center;
          await recomputeRouteWith(undefined, center, undefined);
        } catch (err) {
          console.warn('center-pin destination selection failed', err);
          const fallback = formatCoords(center);
          setDestination(fallback);
          setDestinationCoords(center);
          rememberRecentLocation(fallback, center);
          await recomputeRouteWith(undefined, center, undefined);
        } finally {
          setManualDestinationLoading(false);
          setMapSelectionMode(null);
          setManualDestinationDraft(null);
          clearDestinationIdleTimeout();
        }
      }, REGION_IDLE_DELAY_MS);
    },
    [
      clearDestinationIdleTimeout,
      clearOriginIdleTimeout,
      mapSelectionMode,
      rememberRecentLocation,
      recomputeRouteWith,
      promptDestinationSelection,
    ],
  );

  const handleTakeVehiclePhoto = useCallback(async () => {
    if (!user?.id) {
      alertService.showErrorAlert(tr('alerts.photoLoginRequired'));
      return;
    }

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alertService.showInfoAlert(tr('alerts.photoPermissionsTitle'), tr('alerts.photoPermissionsMessage'));
        return;
      }

      const pickFrom = async (fromCamera: boolean) => {
        try {
          const result = fromCamera
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
              });

          if (!result.canceled && result.assets?.[0]) {
            setClientVehiclePhotoLocalUri(result.assets[0].uri);
            setClientVehiclePhoto(null);
            alertService.showSuccessAlert(tr('alerts.photoSelectedTitle'), tr('alerts.photoSelectedMessage'), { duration: 2000 });
          }
        } finally {
          setUploadingPhoto(false);
        }
      };

      alertService.showOptionsAlert(tr('alerts.photoOptionsTitle'), tr('alerts.photoOptionsMessage'), [
        { text: tr('alerts.photoOptionsCamera'), onPress: () => pickFrom(true) },
        { text: tr('alerts.photoOptionsGallery'), onPress: () => pickFrom(false) },
        { text: tr('alerts.photoOptionsCancel'), style: 'cancel' },
      ]);
    } catch (error) {
      alertService.showErrorAlert(tr('alerts.photoCaptureFailed'));
    }
  }, [tr, user?.id]);

  const runDesignatedDriverBiometricVerification = useCallback(async () => {
    try {
      const result = await BiometricService.authenticateAndLog({
        reason: tr('alerts.identityRequired'),
        fallbackLabel: Platform.OS === 'ios' ? tr('alerts.biometricFallbackLabel') : tr('alerts.photoOptionsCancel'),
        context: 'designated_driver_request',
        userType: 'client',
      });

      if (!result.success) {
        const errorMessage = result.error || '';
        const noBiometricError =
          errorMessage.includes('no soporta biometría') ||
          errorMessage.includes('No hay biometría registrada');

        if (noBiometricError) {
          alertService.showInfoAlert(tr('alerts.biometricUnavailableTitle'), tr('alerts.biometricUnavailableMessage'));
          const fallbackTimestamp = new Date().toISOString();
          return {
            biometricAcceptanceRequired: true,
            biometricAcceptanceType: 'device_biometric_not_found',
            biometricAcceptanceVerified: false,
            biometricAcceptanceAt: fallbackTimestamp,
          };
        }

        alertService.showInfoAlert(tr('alerts.biometricRequiredTitle'), errorMessage || tr('alerts.identityRequired'));
        return null;
      }

      if (result.biometryType !== 'fingerprint') {
        alertService.showInfoAlert(tr('alerts.biometricRequiredTitle'), tr('alerts.biometricRequiredMessage'));
        return null;
      }

      const verifiedAt = result.verifiedAt || new Date().toISOString();
      return {
        biometricAcceptanceRequired: true,
        biometricAcceptanceType: 'fingerprint',
        biometricAcceptanceVerified: true,
        biometricAcceptanceAt: verifiedAt,
      };
    } catch (error) {
      console.warn('[biometric] Error verificando huella', error);
      alertService.showErrorAlert(tr('alerts.biometricGenericError'));
      return null;
    }
  }, [tr]);

  const onConfirmRequest = useCallback(async () => {
    if (submittingRequest) return;
    if (!user) {
      alertService.showErrorAlert(tr('alerts.loginRequired'));
      return;
    }
    const startPoint = originCoords || coords;
    if (!startPoint || !destinationCoords) {
      alertService.showErrorAlert(tr('alerts.destinationRequired'));
      return;
    }

    const validatedOrigin = await validateLocationForContext(startPoint, 'origin');
    if (!validatedOrigin) {
      return;
    }

    const validatedDestination = await validateLocationForContext(destinationCoords, 'destination');
    if (!validatedDestination) {
      return;
    }

    let clientSuggestedPrice: number | undefined;
    if (priceSuggestion.trim().length > 0) {
      const value = Number(priceSuggestion);
      if (!Number.isFinite(value) || value <= 0) {
        alertService.showErrorAlert(tr('alerts.invalidAmount'));
        return;
      }
      clientSuggestedPrice = value;
    }

    let biometricAcceptancePayload: Record<string, any> | null = null;
    let vehiclePhotoUrl = clientVehiclePhoto;
    if (vehicleType === 'designated_driver') {
      if (uploadingPhoto) {
        alertService.showInfoAlert(tr('alerts.vehiclePhotoProcessTitle'), tr('alerts.vehiclePhotoProcess'));
        return;
      }
      if (!vehiclePhotoUrl && !clientVehiclePhotoLocalUri) {
        alertService.showErrorAlert(tr('alerts.vehiclePhotoRequired'));
        return;
      }
      biometricAcceptancePayload = await runDesignatedDriverBiometricVerification();
      if (!biometricAcceptancePayload) {
        return;
      }

      if (!vehiclePhotoUrl && clientVehiclePhotoLocalUri) {
        setUploadingPhoto(true);
        try {
          vehiclePhotoUrl = await uploadClientVehiclePhoto(user.id, clientVehiclePhotoLocalUri);
          setClientVehiclePhoto(vehiclePhotoUrl);
          alertService.showSuccessAlert(tr('alerts.photoUploadedTitle'), tr('alerts.photoUploadedMessage'), { duration: 2000 });
        } catch (uploadError) {
          console.error('[vehiclePhotoUpload] Error', uploadError);
          alertService.showErrorAlert(tr('alerts.photoUploadFailed'));
          setUploadingPhoto(false);
          return;
        }
        setUploadingPhoto(false);
      }

      if (!vehiclePhotoUrl) {
        alertService.showErrorAlert(tr('alerts.photoUploadFailed'));
        return;
      }
    }

    let requestData: any;

    try {
      setSubmittingRequest(true);
      requestData = {
        clientId: user.id,
        origin: {
          lat: startPoint.latitude,
          lng: startPoint.longitude,
          address: origin || defaultLabels.myLocation,
        },
        destination: {
          lat: destinationCoords.latitude,
          lng: destinationCoords.longitude,
          address: destination || defaultLabels.destination,
        },
        estimatedDistance: Math.max(1, Math.round(estimatedDistance * 1000)),
        estimatedDuration: Math.max(1, Math.round(estimatedDuration * 60)),
        estimatedPrice: Math.max(1, Math.round(estimatedPrice)),
        rideType: vehicleType === 'designated_driver' ? 'designated_driver' : 'normal',
        vehicleType,
        paymentMethod,
        passengers: passengersByVehicle[vehicleType] || 1,
        serviceAreaId: validatedOrigin.serviceAreaId ?? validatedDestination.serviceAreaId ?? null,
      };

      if (clientSuggestedPrice) requestData.clientSuggestedPrice = clientSuggestedPrice;
      if (rideComment.trim()) {
        requestData.clientComment = rideComment.trim();
        requestData.notes = rideComment.trim();
      }
      if (extraDestinations.length > 0) {
        requestData.extraDestinations = extraDestinations
          .filter((stop) => stop.coords)
          .map((stop) => ({
            lat: stop.coords!.latitude,
            lng: stop.coords!.longitude,
            address: stop.address,
          }));
      }
      if (vehicleType === 'designated_driver' && vehiclePhotoUrl) {
        requestData.clientVehiclePhoto = vehiclePhotoUrl;
        requestData.notes = tr('notes.designatedDriver');
        requestData.designatedDriverVehicle = designatedDriverMode;
      }
      if (biometricAcceptancePayload) {
        Object.assign(requestData, biometricAcceptancePayload);
      }

      const codeMap: Record<VehicleType, string> = {
        moto: 'motorcycle',
        auto: 'normal',
        designated_driver: 'designated_driver',
      };
      const matched = servicesCatalog.find((service) => service.code === codeMap[vehicleType]);
      if (matched?.id) requestData.serviceId = matched.id;

      if (scheduledAt) {
        const programmed = await ridesService.createProgrammedRide({
          ...requestData,
          scheduledAt,
        });
        const scheduledText = new Date(programmed.scheduledAt).toLocaleString();
        const rideId = programmed.id;
        alertService.showSuccessAlert(
          tr('scheduling.successTitle'),
          tr('scheduling.successMessageWithId', { date: scheduledText, id: rideId }),
          { duration: 3500 },
        );
        try {
          await Share.share({
            message: tr('scheduling.shareMessage', { date: scheduledText, id: rideId }),
          });
        } catch (shareError) {
          console.warn('Error sharing scheduled ride ID', shareError);
        }
        navigation?.navigate?.('ClientHome');
        return;
      }

      const ride = await ridesService.requestRide(requestData);
      navigation?.navigate?.('HomeOffers', { rideId: ride.id });
    } catch (error: any) {
      const details: any = (error && (error.details || (error as any).data)) || null;
      const errorCode: string | null =
        (error && (error.code || (error as any).errorInfo?.code)) || null;

      const isFailedPrecondition =
        errorCode === 'functions/failed-precondition' || errorCode === 'failed-precondition';

      const isConflict =
        isFailedPrecondition && details && details.code === 'CLIENT_PROGRAMMED_RIDE_CONFLICT';

      if (isConflict && details?.existingRideId && details?.existingScheduledAt && requestData) {
        const conflictDate = new Date(details.existingScheduledAt).toLocaleString();
        const title = tr('scheduling.conflictTitle');
        const body = scheduledAt
          ? tr('scheduling.conflictBodyScheduled', { date: conflictDate })
          : tr('scheduling.conflictBodyImmediate', { date: conflictDate });
        const replaceLabel = tr('scheduling.conflictReplaceButton');
        const keepLabel = tr('scheduling.conflictKeepButton');

        setSubmittingRequest(false);

        const shouldReplace = await new Promise<boolean>((resolve) => {
          alertService.showConfirmAlert(
            title,
            body,
            () => resolve(true),
            () => resolve(false),
            replaceLabel,
            keepLabel,
          );
        });

        if (!shouldReplace) {
          return;
        }

        setSubmittingRequest(true);

        try {
          await ridesService.cancelProgrammedRide(
            details.existingRideId,
            scheduledAt ? 'replaced_by_new_programmed_ride' : 'replaced_by_new_immediate_ride',
          );

          if (scheduledAt) {
            const programmed = await ridesService.createProgrammedRide({
              ...requestData,
              scheduledAt,
            });
            const scheduledText = new Date(programmed.scheduledAt).toLocaleString();
            const rideId = programmed.id;
            alertService.showSuccessAlert(
              tr('scheduling.successTitle'),
              tr('scheduling.successMessageWithId', { date: scheduledText, id: rideId }),
              { duration: 3500 },
            );
            try {
              await Share.share({
                message: tr('scheduling.shareMessage', { date: scheduledText, id: rideId }),
              });
            } catch (shareError) {
              console.warn('Error sharing scheduled ride ID', shareError);
            }
            navigation?.navigate?.('ClientHome');
          } else {
            const ride = await ridesService.requestRide(requestData);
            navigation?.navigate?.('HomeOffers', { rideId: ride.id });
          }
        } catch (retryError: any) {
          alertService.showErrorAlert(retryError?.message || tr('alerts.requestError'));
        }

        return;
      }

      alertService.showErrorAlert(error?.message || tr('alerts.requestError'));
    } finally {
      setSubmittingRequest(false);
    }
  }, [
    user,
    originCoords,
    coords,
    destinationCoords,
    origin,
    destination,
    estimatedDistance,
    estimatedDuration,
    estimatedPrice,
    vehicleType,
    paymentMethod,
    passengersByVehicle,
    priceSuggestion,
    rideComment,
    extraDestinations,
    clientVehiclePhoto,
    clientVehiclePhotoLocalUri,
    servicesCatalog,
    navigation,
    submittingRequest,
    uploadingPhoto,
    runDesignatedDriverBiometricVerification,
    defaultLabels.destination,
    defaultLabels.myLocation,
    tr,
    scheduledAt,
  ]);

  const scheduleDayOptions = useMemo(() => {
    const days: Array<{ label: string; date: Date }> = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i <= 20; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const label = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
      });
      days.push({ label, date: d });
    }
    return days;
  }, []);

  const scheduleMinuteOptions = useMemo(() => {
    const values: number[] = [];
    for (let m = 0; m < 60; m += 5) {
      values.push(m);
    }
    return values;
  }, []);

  const openScheduleModal = useCallback(() => {
    const base = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 30 * 60 * 1000);
    const roundedMinutes = Math.ceil(base.getMinutes() / 5) * 5;
    base.setMinutes(roundedMinutes >= 60 ? 0 : roundedMinutes);
    if (roundedMinutes >= 60) {
      base.setHours(base.getHours() + 1);
    }
    base.setSeconds(0, 0);

    const dayIndex = scheduleDayOptions.findIndex((opt) => {
      return (
        opt.date.getFullYear() === base.getFullYear() &&
        opt.date.getMonth() === base.getMonth() &&
        opt.date.getDate() === base.getDate()
      );
    });

    setScheduleDayIndex(dayIndex >= 0 ? dayIndex : 0);
    setScheduleHour(base.getHours());
    setScheduleMinute(base.getMinutes() - (base.getMinutes() % 5));
    setScheduleModalVisible(true);
  }, [scheduledAt, scheduleDayOptions]);

  const applyScheduleSelection = useCallback(() => {
    const day = scheduleDayOptions[scheduleDayIndex]?.date;
    if (!day) {
      return;
    }

    const candidate = new Date(day);
    candidate.setHours(scheduleHour, scheduleMinute, 0, 0);
    const ms = candidate.getTime();
    const now = Date.now();
    const minMs = now + 30 * 60 * 1000;
    const maxMs = now + 20 * 24 * 60 * 60 * 1000;

    if (ms < minMs || ms > maxMs) {
      alertService.showErrorAlert(tr('scheduling.invalidRange'));
      return;
    }

    setScheduledAt(ms);
    setScheduleModalVisible(false);
  }, [scheduleDayOptions, scheduleDayIndex, scheduleHour, scheduleMinute]);

  const selectionTitle = useMemo(() => {
    if (activeSelection === 'origin') return tr('search.selectionOriginTitle');
    if (activeSelection === 'destination') return tr('search.selectionDestinationTitle');
    if (activeSelection === 'new-stop') {
      return tr('search.selectionNewStopTitle', { current: extraDestinations.length + 1, max: MAX_EXTRA_STOPS });
    }
    if (typeof activeSelection === 'number') {
      return tr('search.selectionEditStopTitle', { index: activeSelection + 1 });
    }
    return tr('search.selectionGenericTitle');
  }, [activeSelection, extraDestinations.length, tr]);

  const selectionDescription = useMemo(() => {
    if (activeSelection === 'origin') return tr('search.descriptionOrigin');
    if (activeSelection === 'destination') return tr('search.descriptionDestination');
    if (activeSelection === 'new-stop' || typeof activeSelection === 'number') return tr('search.descriptionExtra');
    return tr('search.descriptionGeneric');
  }, [activeSelection, tr]);
  const requiresVehiclePhoto = vehicleType === 'designated_driver';
  const hasVehiclePhotoSelection = !!clientVehiclePhoto || !!clientVehiclePhotoLocalUri;
  const isRequestReady =
    !!destinationCoords &&
    estimatedPrice > 0 &&
    (!requiresVehiclePhoto || (hasVehiclePhotoSelection && !uploadingPhoto));
  const maxPassengersByType: Record<VehicleType, number> = useMemo(
    () => ({
      moto: 1,
      auto: 4,
      designated_driver: designatedDriverMode === 'moto' ? 1 : 4,
    }),
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
    mapSelectionMode === 'origin' ||
    mapSelectionMode === 'destination' ||
    mapSelectionMode === 'extra-new' ||
    (typeof mapSelectionMode === 'object' && mapSelectionMode?.type === 'extra-edit');
  const autoFitEnabled =
    !centerPinActive &&
    !manualOriginDragging &&
    !manualOriginLoading &&
    !manualDestinationDragging &&
    !manualDestinationLoading;
  const showManualOriginMarker =
    (!centerPinActive && (hasPinnedOrigin || !!originCoords || !!manualOriginDraft)) ||
    mapSelectionMode === 'destination';
  const bottomPanelReady =
    hasRouteMetrics &&
    !calculatingRoute &&
    !centerPinActive &&
    !manualOriginDragging &&
    !manualDestinationDragging &&
    !manualOriginLoading &&
    !manualDestinationLoading;
  const bottomPanelTranslate = useMemo(
    () =>
      bottomPanelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [320, 0],
      }),
    [bottomPanelAnim],
  );

  const isLocationLoading = manualOriginLoading || manualDestinationLoading || extraStopSelectionLoading;

  useEffect(() => {
    if (isLocationLoading) {
      markerBounce.setValue(0);
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(markerBounce, {
            toValue: 1,
            duration: 350,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(markerBounce, {
            toValue: 0,
            duration: 350,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }

    markerBounce.stopAnimation(() => {
      markerBounce.setValue(0);
    });
  }, [isLocationLoading, markerBounce]);

  useEffect(() => {
    Animated.timing(bottomPanelAnim, {
      toValue: bottomPanelReady ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [bottomPanelAnim, bottomPanelReady]);

  useEffect(() => {
    if (!bottomPanelReady) {
      setBottomPanelExpanded((prev) => {
        if (prev) return prev;
        return true;
      });
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
          destinationMarker={destinationCoords || undefined}
          extraStopMarkers={extraDestinations
            .map((stop, index) => (stop.coords ? { latitude: stop.coords.latitude, longitude: stop.coords.longitude, index } : null))
            .filter(Boolean) as Array<{ latitude: number; longitude: number; index: number }>}
          routeCoordinates={routeCoordinates}
          showUserLocation
          userLocation={coords || undefined}
          showTraffic
          showMarker={showManualOriginMarker}
          markerPosition={manualOriginMarkerPosition}
          markerType="manual_origin"
          draggableMarker
          manualOriginIcon={MANUAL_ORIGIN_ICON}
          manualOriginHoldIcon={MANUAL_ORIGIN_HOLD_ICON}
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
                    ? MANUAL_ORIGIN_HOLD_ICON
                    : MANUAL_ORIGIN_ICON
                  : mapSelectionMode === 'destination'
                  ? DESTINATION_PIN_ICON
                  : STOP_PIN_ICON
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
                ? ORIGIN_PIN_ICON
                : row.kind === 'destination'
                ? DESTINATION_PIN_ICON
                : STOP_PIN_ICON;

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
              
            <View style={styles.section}>

              <View style={styles.vehicleOptionsList}>
                {vehicleOptions.map((option) => {
                  const estimate = vehicleEstimates[option.type];
                  const designatedEstimate = option.type === 'designated_driver' ? designatedDriverEstimates[designatedDriverMode] : null;
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

            <View style={[styles.section, styles.sectionCompact]}>
              <Text style={styles.sectionTitle}>{tr('summary.title')}</Text>

              <View style={styles.estimateCard}>
                {calculatingRoute ? (
                  <View style={styles.centeredRow}>
                    <ActivityIndicator color={colors.primary} />
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
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
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

            <View style={styles.searchInputWrapper}>
              <Text style={styles.searchInputLabel}>{tr('search.inputLabel')}</Text>
              <View style={styles.searchInputContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder={(() => {
                    if (activeSelection === 'origin') return tr('search.placeholderOrigin');
                    if (activeSelection === 'destination') return tr('search.placeholderDestination');
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
              <TouchableOpacity style={[styles.searchActionChip, styles.searchActionPrimary]} onPress={handleUseCurrentLocation}>
                <Text style={[styles.searchActionText, styles.searchActionTextPrimary]}>{tr('search.useCurrentLocation')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchActionChip} onPress={handlePickFromMap}>
                <Text style={styles.searchActionText}>{tr('search.pickOnMap')}</Text>
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
                    <ActivityIndicator color={colors.primary || '#2196F3'} />
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
            <ActivityIndicator color={colors.primary || '#2196F3'} size="large" />
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
                  {Array.from({ length: 24 }, (_, h) => (
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
                  {scheduleMinuteOptions.map((m) => (
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
      backgroundColor: colors.surface || '#f8f8f8',
      borderWidth: 1,
      borderColor: colors.border || '#e0e0e0',
      marginBottom: 12,
    },
    collapsedSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    collapsedSummaryIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#fff',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: Platform.OS === 'ios' ? 0.08 : 0,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    collapsedSummaryText: { flex: 1 },
    collapsedSummaryTitle: { fontSize: 15, fontWeight: '700', color: colors.text || '#111' },
    collapsedSummaryMeta: { fontSize: 12, color: colors.textSecondary || '#666', marginTop: 2 },
    collapsedSummaryPrice: { fontSize: 18, fontWeight: '800', color: '#c87a1a' },
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
    sectionCompact: { marginBottom: 14 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text || '#111', marginBottom: 6 },
    sectionHint: { fontSize: 12, color: colors.textSecondary || '#666' },
    sectionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border || '#ddd', marginVertical: 12 },

    vehicleOptionsList: { gap: 10 },
    vehicleOptionCard: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.card || (isDark ? '#2a2a2a' : '#FFFAF5'),
      borderWidth: 1,
      borderColor: colors.border || (isDark ? '#444' : '#e1e1e1'),
      gap: 8,
    },
    vehicleOptionCardSelected: {
      borderColor: isDark ? '#9e8e7a' : '#cfa146',
      backgroundColor: isDark ? 'rgb(206, 161, 106)'  : '#fff7df',
      shadowColor: '#cfa146',
      shadowOpacity: Platform.OS === 'ios' ? 0.12 : 0,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    vehicleOptionTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
    vehicleOptionTitleBlock: { flex: 1, gap: 2 },
    vehicleOptionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    vehicleOptionTitle: { fontSize: 20, fontWeight: '700', color: colors.text || '#111' },
    vehicleOptionTitleSelected: { color: '#111' },
    vehicleOptionSubtitle: { fontSize: 16, color: colors.textSecondary || '#666', marginTop: 1 },
    vehicleOptionSubtitleSelected: { color: '#222' },
    vehicleOptionPriceBlock: { alignItems: 'flex-end', gap: 6 },
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
    vehicleOptionPrice: { fontSize: 20, fontWeight: '800', color: '#c87a1a' },
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
      color: colors.text || '#222',
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

    photoRow: { marginTop: 8 },
    photoHint: { fontSize: 12, color: colors.textSecondary || '#666', marginBottom: 8, textAlign: 'center' },
    photoButton: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.surface || '#f1f1f1' },
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

    ctaContainer: { paddingTop: 12 },

    scheduleCta: {
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.SecondBorder || (isDark ? '#444444ff' : '#ddd'),
      marginBottom: 10,
      backgroundColor: colors.card || (isDark ? '#2a2a2a' : '#f7f7f7'),
    },
    scheduleCtaDisabled: { opacity: 0.65 },
    scheduleCtaText: { textAlign: 'center', fontWeight: '800', color: colors.text },
    scheduleClearCta: {
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border || (isDark ? '#444' : '#ddd'),
      marginBottom: 10,
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

    estimateCard: { borderRadius: 12, padding: 10, backgroundColor: colors.card || (isDark ? '#2a2a2a' : '#f5f5f5'), borderWidth: 1, borderColor: colors.border || (isDark ? '#444' : 'transparent'), marginBottom: 8 },
    centeredRow: { flexDirection: 'row', alignItems: 'center' },
    estimateText: { marginLeft: 8, color: colors.textSecondary || '#666' },
    estimateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    estimateLabel: { color: colors.textSecondary || '#666' },
    estimateValue: { color: colors.text || '#111', fontWeight: '700' , fontSize: 20},

    paymentRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 6 },
    paymentChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface || '#eee' },
    paymentChipSelected: { backgroundColor: colors.primary || '#2196F3' },
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
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.card || (isDark ? '#2a2a2a' : '#f5f5f5'),
      borderWidth: 1.5,
      borderColor: colors.border || (isDark ? '#444' : '#ddd'),
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

    searchInputWrapper: { marginBottom: 16 },
    searchInputLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary || '#777', marginBottom: 6, textTransform: 'uppercase' },
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