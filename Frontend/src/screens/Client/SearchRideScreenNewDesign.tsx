import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import mapsService from '../../services/mapsService';
import driversService from '../../services/driversService';
import ridesService from '../../services/ridesService';
import servicesService, { ServiceItem } from '../../services/servicesService';
import { calculateRidePrice, formatPriceBreakdown, type PriceBreakdown } from '../../utils/priceCalculator';
import alertService from '../../services/alertService';

const MANUAL_ORIGIN_ICON = require('../../assets/icons/select-origin-position/selectoriginposition_2x.png');
const MANUAL_ORIGIN_HOLD_ICON = require('../../assets/icons/select-origin-position-holding/selectoriginpositionholding_2x.png');
const ORIGIN_PIN_ICON = require('../../assets/icons/origin_marker/origin_marker.png');
const DESTINATION_PIN_ICON = require('../../assets/icons/desti_locationmarker/desti_locationmarker.png');
const STOP_PIN_ICON = require('../../assets/icons/multiplelocationmarker/multiplelocationmarker.png');
const BACK_BUTTON_ICON = require('../../assets/icons/back_button/back_button2x.png');
const DEFAULT_FALLBACK_COORDS = { latitude: 12.1364, longitude: -86.2514 };
const MAX_EXTRA_STOPS = 3;

type Step = 1 | 2 | 3;
type VehicleType = 'moto' | 'auto' | 'designated_driver';
type PaymentMethod = 'cash' | 'card';

interface Coords {
  latitude: number;
  longitude: number;
}

interface SavedLocation {
  label: string;
  coords: Coords;
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

function normalizeSuggestion(suggestion: any): NormalizedSuggestion {
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
    'Ubicación';

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
  const { user } = useAuth();
  const { colors } = useTheme();
  const { coords } = useLocation();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
  const [calculatingRoute, setCalculatingRoute] = useState(false);

  const [manualOriginDraft, setManualOriginDraft] = useState<Coords | null>(null);
  const [manualOriginAddress, setManualOriginAddress] = useState('');
  const [manualOriginLoading, setManualOriginLoading] = useState(false);
  const [manualOriginDragging, setManualOriginDragging] = useState(false);

  const [estimatedDistance, setEstimatedDistance] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);

  const [uiStep, setUiStep] = useState<Step>(1);
  const [passengers, setPassengers] = useState(1);
  const [vehicleType, setVehicleType] = useState<VehicleType>('auto');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [priceSuggestion, setPriceSuggestion] = useState('');

  const [clientVehiclePhoto, setClientVehiclePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [driversAvailable, setDriversAvailable] = useState<boolean | null>(null);
  const [checkingDrivers, setCheckingDrivers] = useState(false);

  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<NormalizedSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentLocations, setRecentLocations] = useState<SavedLocation[]>([]);
  const [favoriteLocations, setFavoriteLocations] = useState<SavedLocation[]>([]);
  const [activeSelection, setActiveSelection] = useState<'origin' | 'destination' | number | 'new-stop' | null>(null);

  const [mapSelectionMode, setMapSelectionMode] = useState<MapSelectionState>('origin');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    if (!mapSelectionMode) return;

    let title = 'Selecciona una ubicación';
    let message: string | null = null;

    if (mapSelectionMode === 'origin') {
      title = 'Fija el origen';
      message = 'Mueve el mapa hasta tu punto de partida.';
    } else if (mapSelectionMode === 'destination') {
      title = 'Selecciona tu destino';
      message = 'Toca el mapa para elegir tu destino final.';
    } else if (mapSelectionMode === 'extra-new') {
      title = 'Nueva parada';
      message = `Toca el mapa para agregar la parada ${extraDestinations.length + 1}.`;
    } else if (typeof mapSelectionMode === 'object' && mapSelectionMode.type === 'extra-edit') {
      title = 'Editar parada';
      message = `Toca el mapa para actualizar la parada ${mapSelectionMode.index + 1}.`;
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

  useEffect(() => {
    if (coords && !originCoords) {
      setOriginCoords({ latitude: coords.latitude, longitude: coords.longitude });
      setOrigin('Mi ubicación actual');
    }
  }, [coords, originCoords]);

  useEffect(() => {
    const base = originCoords || coords;
    if (!manualOriginDraft && base) {
      setManualOriginDraft(base);
      if (!manualOriginAddress) {
        setManualOriginAddress(origin || 'Mi ubicación actual');
      }
      if (!originCoords) {
        setOriginCoords(base);
      }
    }
  }, [originCoords, coords, manualOriginDraft, manualOriginAddress, origin]);

  useEffect(() => {
    if (vehicleType === 'moto' && passengers > 1) {
      setPassengers(1);
      alertService.showInfoAlert('Moto seleccionada', 'Las motos solo pueden llevar 1 pasajero.');
    }
  }, [vehicleType, passengers]);

  useEffect(() => {
    if (!coords) return;
    const check = async () => {
      setCheckingDrivers(true);
      try {
        const result = await driversService.checkAvailableDrivers(coords, 15, vehicleType);
        setDriversAvailable(result.available && result.count > 0);
      } catch {
        setDriversAvailable(null);
      } finally {
        setCheckingDrivers(false);
      }
    };
    check();
  }, [coords, vehicleType]);

  const capacityByVehicle: Record<VehicleType, number> = useMemo(
    () => ({
      moto: 1,
      auto: 4,
      designated_driver: 4,
    }),
    [],
  );

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

        const vehicleTypeForCalc = vehicleType === 'moto' ? 'motorcycle' : 'car';
        const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';
        const breakdown = await calculateRidePrice(
          totalDistance,
          totalDuration,
          vehicleTypeForCalc,
          rideTypeForCalc,
          startPoint.latitude,
          startPoint.longitude,
          stops.length,
        );
        setEstimatedPrice(breakdown.finalPrice);
        setPriceBreakdown(breakdown);
      } catch (error) {
        console.warn('calculateRouteWithStops', error);
        alertService.showErrorAlert('No se pudo calcular la ruta.');
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
          stopsCount,
        );
        setEstimatedPrice(breakdown.finalPrice);
        setPriceBreakdown(breakdown);
      } catch (error) {
        console.warn('calculateSimpleRoute', error);
        alertService.showErrorAlert('No se pudo calcular la ruta.');
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
      const sanitizedLabel = label.trim() || 'Ubicación seleccionada';

      if (target === 'origin') {
        if (!coordsValue) {
          alertService.showInfoAlert('Selecciona un punto válido', 'Necesitas elegir la ubicación exacta del origen.');
          return;
        }
        setOrigin(sanitizedLabel);
        setManualOriginAddress(sanitizedLabel);
        setManualOriginDraft(coordsValue);
        setOriginCoords(coordsValue);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        await recomputeRouteWith(coordsValue, undefined, undefined);
        return;
      }

      if (target === 'destination') {
        if (!coordsValue) {
          alertService.showInfoAlert('Selecciona un punto válido', 'Necesitas elegir la ubicación exacta del destino.');
          return;
        }
        setDestination(sanitizedLabel);
        setDestinationCoords(coordsValue);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        await recomputeRouteWith(undefined, coordsValue, undefined);
        return;
      }

      if (target === 'new-stop') {
        if (!coordsValue) {
          alertService.showInfoAlert('Selecciona un punto válido', 'Necesitas elegir la ubicación exacta de la parada.');
          return;
        }
        const nextStops = [...extraDestinations, { address: sanitizedLabel, coords: coordsValue }];
        setExtraDestinations(nextStops);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        await recomputeRouteWith(undefined, undefined, nextStops);
        return;
      }

      if (typeof target === 'number') {
        if (!coordsValue) {
          alertService.showInfoAlert('Selecciona un punto válido', 'Necesitas elegir la ubicación exacta de la parada.');
          return;
        }
        const nextStops = extraDestinations.map((stop, index) =>
          index === target ? { address: sanitizedLabel, coords: coordsValue } : stop,
        );
        setExtraDestinations(nextStops);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        await recomputeRouteWith(undefined, undefined, nextStops);
      }
    },
    [extraDestinations, rememberRecentLocation, recomputeRouteWith],
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
        const results = await mapsService.autocomplete(debouncedSearch, coords ?? undefined);
        if (!cancelled) {
          setSearchResults(results.map(normalizeSuggestion));
          setSearchError(results.length === 0 ? 'No encontramos coincidencias.' : null);
        }
      } catch (error) {
        console.warn('autocomplete failed', error);
        if (!cancelled) {
          setSearchError('No se pudo buscar ubicaciones.');
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
  }, [showSearchOverlay, debouncedSearch, coords]);

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
          coordsValue = (await mapsService.getPlaceDetails(suggestion.placeId)) || null;
        }

        if (!coordsValue) {
          alertService.showErrorAlert('No se pudo obtener la ubicación seleccionada. Intenta con otra búsqueda.');
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
      alertService.showInfoAlert('Ubicación no disponible', 'Activa tu ubicación o intenta nuevamente.');
      return;
    }
    const target = activeSelection || 'origin';
    const label = target === 'origin' ? 'Mi ubicación actual' : 'Ubicación actual';
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
    if (activeSelection === 'origin') setMapSelectionMode('origin');
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
      if (mapSelectionMode === 'origin') {
        // In origin selection mode, we use center-pin + region change, so ignore taps
        return;
      }
      const selectedPoint: Coords = { latitude: event.latitude, longitude: event.longitude };
      const address = (await mapsService.reverseGeocode(selectedPoint)) || formatCoords(selectedPoint);

      if (mapSelectionMode === 'destination') {
        await applySelectionForTarget('destination', address, selectedPoint);
        setMapSelectionMode(null);
        return;
      }

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
    },
    [mapSelectionMode, applySelectionForTarget, destinationCoords, originCoords, canAddExtraStop],
  );

  const recalcPriceOnly = useCallback(async () => {
    const start = originCoords || coords;
    if (!start || !destinationCoords) return;

    const vehicleTypeForCalc = vehicleType === 'moto' ? 'motorcycle' : 'car';
    const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';

    const distMeters = Math.max(1, Math.round(estimatedDistance * 1000));
    const durSeconds = Math.max(1, Math.round(estimatedDuration * 60));
    const stopsCount = extraDestinations.filter((d) => d.coords).length;

    const breakdown = await calculateRidePrice(
      distMeters,
      durSeconds,
      vehicleTypeForCalc,
      rideTypeForCalc,
      start.latitude,
      start.longitude,
      stopsCount,
    );
    setEstimatedPrice(breakdown.finalPrice);
    setPriceBreakdown(breakdown);
  }, [originCoords, coords, destinationCoords, vehicleType, estimatedDistance, estimatedDuration, extraDestinations]);

  useEffect(() => {
    if (estimatedDistance > 0 && (originCoords || coords)) {
      recalcPriceOnly();
    }
  }, [vehicleType]);

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
    alertService.showInfoAlert('Selecciona tu destino', 'Ya puedes elegir tu destino final buscándolo o en el mapa.');
  }, [destination]);

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
      try {
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
        await recomputeRouteWith(newCoords, undefined, undefined);
        promptDestinationSelection();
      } catch (error) {
        console.warn('Manual origin geocode failed', error);
        const fallbackAddress = formatCoords(newCoords);
        setManualOriginAddress(fallbackAddress);
        setOriginCoords(newCoords);
        setOrigin(fallbackAddress);
        rememberRecentLocation(fallbackAddress, newCoords);
        await recomputeRouteWith(newCoords, undefined, undefined);
        promptDestinationSelection();
      } finally {
        setManualOriginLoading(false);
        // Clear draft to rely on committed originCoords
        setManualOriginDraft(null);
      }
    },
    [rememberRecentLocation, recomputeRouteWith, promptDestinationSelection],
  );

  const manualOriginMarkerPosition = useMemo(() => {
    if (manualOriginDraft) return manualOriginDraft;
    if (originCoords) return originCoords;
    if (coords) return coords;
    return DEFAULT_FALLBACK_COORDS;
  }, [manualOriginDraft, originCoords, coords]);

  // Static center-pin selection (only for origin)
  const lastAppliedOriginCenterRef = useRef<Coords | null>(null);
  const originCenterDebounceRef = useRef<any>(null);

  const handleRegionChangeCenter = useCallback(
    (center: Coords) => {
      if (mapSelectionMode !== 'origin') return;
      setManualOriginDragging(true);
      setManualOriginDraft(center);
    },
    [mapSelectionMode],
  );

  const handleRegionChangeCompleteCenter = useCallback(
    (center: Coords) => {
      if (mapSelectionMode !== 'origin') return;
      setManualOriginDragging(false);
      if (originCenterDebounceRef.current) clearTimeout(originCenterDebounceRef.current);
      originCenterDebounceRef.current = setTimeout(async () => {
        const last = lastAppliedOriginCenterRef.current;
        if (last && metersBetween(last, center) < 20) return; // ignore tiny moves
        setManualOriginLoading(true);
        try {
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
          rememberRecentLocation(fallback, center);
          await recomputeRouteWith(center, undefined, undefined);
          promptDestinationSelection();
        } finally {
          setManualOriginLoading(false);
          setMapSelectionMode(null);
          setManualOriginDraft(null);
        }
      }, 300);
    },
    [mapSelectionMode, rememberRecentLocation, recomputeRouteWith, promptDestinationSelection],
  );

  const handleTakeVehiclePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alertService.showInfoAlert('Permisos necesarios', 'Se requiere acceso a la cámara.');
        return;
      }

      const pickFrom = async (fromCamera: boolean) => {
        setUploadingPhoto(true);
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
            setClientVehiclePhoto(result.assets[0].uri);
          }
        } finally {
          setUploadingPhoto(false);
        }
      };

      alertService.showOptionsAlert('Foto del vehículo', 'Selecciona una opción', [
        { text: 'Tomar foto', onPress: () => pickFrom(true) },
        { text: 'Galería', onPress: () => pickFrom(false) },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    } catch (error) {
      alertService.showErrorAlert('No se pudo tomar la foto');
    }
  }, []);

  const onConfirmRequest = useCallback(async () => {
    if (submittingRequest) return;
    if (!user) {
      alertService.showErrorAlert('Inicia sesión para solicitar un viaje.');
      return;
    }
    const startPoint = originCoords || coords;
    if (!startPoint || !destinationCoords) {
      alertService.showErrorAlert('Selecciona tu destino tocando el mapa.');
      return;
    }

    let clientSuggestedPrice: number | undefined;
    if (priceSuggestion.trim().length > 0) {
      const value = Number(priceSuggestion);
      if (!Number.isFinite(value) || value <= 0) {
        alertService.showErrorAlert('Ingresa un monto válido.');
        return;
      }
      clientSuggestedPrice = value;
    }

    try {
      setSubmittingRequest(true);
      const requestData: any = {
        clientId: user.id,
        origin: {
          lat: startPoint.latitude,
          lng: startPoint.longitude,
          address: origin || 'Mi ubicación',
        },
        destination: {
          lat: destinationCoords.latitude,
          lng: destinationCoords.longitude,
          address: destination || 'Destino',
        },
        estimatedDistance: Math.max(1, Math.round(estimatedDistance * 1000)),
        estimatedDuration: Math.max(1, Math.round(estimatedDuration * 60)),
        estimatedPrice: Math.max(1, Math.round(estimatedPrice)),
        rideType: vehicleType === 'designated_driver' ? 'designated_driver' : 'normal',
        vehicleType,
        paymentMethod,
        passengers,
      };

      if (clientSuggestedPrice) requestData.clientSuggestedPrice = clientSuggestedPrice;
      if (extraDestinations.length > 0) {
        requestData.extraDestinations = extraDestinations
          .filter((stop) => stop.coords)
          .map((stop) => ({
            lat: stop.coords!.latitude,
            lng: stop.coords!.longitude,
            address: stop.address,
          }));
      }
      if (vehicleType === 'designated_driver' && clientVehiclePhoto) {
        requestData.clientVehiclePhoto = clientVehiclePhoto;
        requestData.notes = 'Conductor Designado';
      }

      const codeMap: Record<VehicleType, string> = {
        moto: 'motorcycle',
        auto: 'normal',
        designated_driver: 'designated_driver',
      };
      const matched = servicesCatalog.find((service) => service.code === codeMap[vehicleType]);
      if (matched?.id) requestData.serviceId = matched.id;

      const ride = await ridesService.requestRide(requestData);
      navigation?.navigate?.('HomeOffers', { rideId: ride.id });
    } catch (error: any) {
      alertService.showErrorAlert(error?.message || 'No se pudo solicitar el viaje');
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
    passengers,
    priceSuggestion,
    extraDestinations,
    clientVehiclePhoto,
    servicesCatalog,
    navigation,
    submittingRequest,
  ]);

  const selectionTitle = useMemo(() => {
    if (activeSelection === 'origin') return 'Origen';
    if (activeSelection === 'destination') return 'Destino final';
    if (activeSelection === 'new-stop') return `Nueva parada (${extraDestinations.length + 1}/${MAX_EXTRA_STOPS})`;
    if (typeof activeSelection === 'number') return `Editar parada ${activeSelection + 1}`;
    return 'Ubicación';
  }, [activeSelection, extraDestinations.length]);

  const selectionDescription = useMemo(() => {
    if (activeSelection === 'origin') return 'Escribe una dirección o usa tu ubicación actual.';
    if (activeSelection === 'destination') return 'Busca una dirección o elige en el mapa.';
    return 'Puedes buscar o escoger en el mapa la parada intermedia.';
  }, [activeSelection]);

  const canGoNextFromStep1 = passengers >= 1 && passengers <= capacityByVehicle[vehicleType];
  const canGoNextFromStep2 = !!vehicleType;
  const canConfirmOnStep3 = !!destinationCoords && estimatedPrice > 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack?.()} accessibilityLabel="Regresar">
        <Image source={BACK_BUTTON_ICON} style={styles.backButtonIcon} resizeMode="contain" />
      </TouchableOpacity>

      <View style={StyleSheet.absoluteFill}>
        <DynamicMap
          latitude={(originCoords || coords)?.latitude || DEFAULT_FALLBACK_COORDS.latitude}
          longitude={(originCoords || coords)?.longitude || DEFAULT_FALLBACK_COORDS.longitude}
          onMapPress={({ latitude, longitude }) => handleMapPress({ latitude, longitude })}
          onRegionChangeCenter={mapSelectionMode === 'origin' ? handleRegionChangeCenter : undefined}
          onRegionChangeCompleteCenter={mapSelectionMode === 'origin' ? handleRegionChangeCompleteCenter : undefined}
          destinationMarker={destinationCoords || undefined}
          extraStopMarkers={extraDestinations
            .map((stop, index) => (stop.coords ? { latitude: stop.coords.latitude, longitude: stop.coords.longitude, index } : null))
            .filter(Boolean) as Array<{ latitude: number; longitude: number; index: number }>}
          routeCoordinates={routeCoordinates}
          showUserLocation
          userLocation={coords || undefined}
          showTraffic
          showMarker={mapSelectionMode !== 'origin'}
          markerPosition={manualOriginMarkerPosition}
          markerType="manual_origin"
          draggableMarker
          manualOriginIcon={MANUAL_ORIGIN_ICON}
          manualOriginHoldIcon={MANUAL_ORIGIN_HOLD_ICON}
          onMarkerDragStart={handleManualOriginDragStart}
          onMarkerDragEnd={handleManualOriginDragEnd}
        />
        {mapSelectionMode === 'origin' && (
          <View pointerEvents="none" style={styles.centerPinContainer}>
            <Image
              source={manualOriginDragging ? MANUAL_ORIGIN_HOLD_ICON : MANUAL_ORIGIN_ICON}
              style={styles.centerPinImage}
              resizeMode="contain"
            />
          </View>
        )}
      </View>

      <View style={styles.routeBubble}>
        <View style={styles.routeBubbleHeaderRow}>
          <Text style={styles.routeBubbleTitle}>Escoge tu viaje</Text>
          {mapSelectionMode ? (
            <TouchableOpacity style={styles.inlineCancelButton} onPress={cancelMapSelection}>
              <Text style={styles.inlineCancelText}>Cancelar</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.routeTimeline}>
          {orderedRouteRows.map((row, idx) => {
            const isLast = idx === orderedRouteRows.length - 1;
            const isExtra = row.kind === 'extra';
            let label = '';
            let subtitle = '';
            if (row.kind === 'origin') {
              label = manualOriginLoading ? 'Buscando dirección…' : manualOriginAddress || 'Selecciona el origen';
              if (manualOriginDraft) subtitle = formatCoords(manualOriginDraft);
            } else if (row.kind === 'destination') {
              label = destination || 'Selecciona tu destino';
              if (destinationCoords) subtitle = formatCoords(destinationCoords);
            } else if (typeof row.index === 'number') {
              const stop = extraDestinations[row.index];
              label = stop?.address || `Parada ${row.index + 1}`;
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

                <TouchableOpacity style={styles.timelineContent} onPress={() => handleRouteRowPress(row)}>
                  <Text style={styles.timelineLabel} numberOfLines={1}>
                    {label}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.timelineSubtitle} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </TouchableOpacity>

                {isExtra && typeof row.index === 'number' ? (
                  <TouchableOpacity style={styles.timelineRemove} onPress={() => handleRemoveStop(row.index!)}>
                    <Text style={styles.timelineRemoveText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>

        {canAddExtraStop ? (
          <TouchableOpacity style={styles.addStopButton} onPress={beginAddExtraStop}>
            <Text style={styles.addStopButtonText}>¿Quieres un destino extra?</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.addStopLimitText}>Has alcanzado el máximo de paradas extra.</Text>
        )}
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.stepper}>
          <Text style={styles.stepText}>Paso {uiStep}/3</Text>
        </View>

        {uiStep === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Selecciona cuantos pasajeros</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                accessibilityLabel="disminuir"
                style={[styles.counterButton, passengers <= 1 && styles.counterButtonDisabled]}
                disabled={passengers <= 1}
                onPress={() => setPassengers(Math.max(1, passengers - 1))}
              >
                <Text style={styles.counterButtonText}>-</Text>
              </TouchableOpacity>
              <View style={styles.counterValueBox}>
                <Text style={styles.counterValue}>{passengers}</Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="aumentar"
                style={[styles.counterButton, passengers >= capacityByVehicle[vehicleType] && styles.counterButtonDisabled]}
                disabled={passengers >= capacityByVehicle[vehicleType]}
                onPress={() => setPassengers(Math.min(capacityByVehicle[vehicleType], passengers + 1))}
              >
                <Text style={styles.counterButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.cta, !canGoNextFromStep1 && styles.ctaDisabled]}
              disabled={!canGoNextFromStep1}
              onPress={() => setUiStep(2)}
            >
              <Text style={styles.ctaText}>Confirmar información del viaje</Text>
            </TouchableOpacity>
          </View>
        )}

        {uiStep === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Tipo de vehículo</Text>
            <View style={styles.vehicleRow}>
              {(['moto', 'auto', 'designated_driver'] as VehicleType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.vehicleCard, vehicleType === type && styles.vehicleCardSelected]}
                  onPress={() => setVehicleType(type)}
                >
                  <Text style={styles.vehicleEmoji}>{type === 'moto' ? '🏍️' : type === 'auto' ? '🚘' : '🧑‍✈️'}</Text>
                  <Text style={styles.vehicleLabel}>{type === 'moto' ? 'Moto' : type === 'auto' ? 'Auto' : 'Conductor Designado'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {vehicleType === 'designated_driver' && (
              <View style={styles.photoRow}>
                <Text style={styles.photoHint}>Foto del vehículo (opcional para identificación):</Text>
                <TouchableOpacity style={styles.photoButton} onPress={handleTakeVehiclePhoto} disabled={uploadingPhoto}>
                  <Text style={styles.photoButtonText}>
                    {uploadingPhoto ? 'Cargando…' : clientVehiclePhoto ? 'Cambiar foto' : 'Tomar/Seleccionar foto'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inlineRow}>
              <TouchableOpacity style={styles.secondaryNav} onPress={() => setUiStep(1)}>
                <Text style={styles.secondaryNavText}>Anterior</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cta, styles.ctaSecondary, !canGoNextFromStep2 && styles.ctaDisabled]}
                disabled={!canGoNextFromStep2}
                onPress={() => setUiStep(3)}
              >
                <Text style={styles.ctaText}>Confirmar tipo de vehículo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {uiStep === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Resumen y precio</Text>

            <View style={styles.estimateCard}>
              {calculatingRoute ? (
                <View style={styles.centeredRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.estimateText}> Calculando ruta…</Text>
                </View>
              ) : (
                <>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateLabel}>Distancia</Text>
                    <Text style={styles.estimateValue}>{estimatedDistance.toFixed(2)} km</Text>
                  </View>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateLabel}>Tiempo</Text>
                    <Text style={styles.estimateValue}>{estimatedDuration} min</Text>
                  </View>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateLabel}>Estimado</Text>
                    <Text style={styles.estimateValue}>C${estimatedPrice.toFixed(2)}</Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.paymentRow}>
              <TouchableOpacity
                style={[styles.paymentChip, paymentMethod === 'cash' && styles.paymentChipSelected]}
                onPress={() => setPaymentMethod('cash')}
              >
                <Text style={[styles.paymentChipText, paymentMethod === 'cash' && styles.paymentChipTextSelected]}>Efectivo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.paymentChip, paymentMethod === 'card' && styles.paymentChipSelected]}
                onPress={() => setPaymentMethod('card')}
              >
                <Text style={[styles.paymentChipText, paymentMethod === 'card' && styles.paymentChipTextSelected]}>Tarjeta</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.suggestRow}>
              <Text style={styles.suggestLabel}>Sugerir mi precio (opcional):</Text>
              <View style={styles.suggestInputRow}>
                <TextInput
                  keyboardType={Platform.select({
                    ios: 'numbers-and-punctuation',
                    android: 'numeric',
                    default: 'numeric',
                  })}
                  placeholder="C$0.00"
                  value={priceSuggestion}
                  onChangeText={setPriceSuggestion}
                  style={styles.suggestInput}
                />
                <TouchableOpacity style={styles.suggestButton}>
                  <Text style={styles.suggestButtonText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {priceBreakdown ? (
              <View style={styles.breakdownBox}>
                <Text style={styles.breakdownText}>{formatPriceBreakdown(priceBreakdown)}</Text>
              </View>
            ) : null}

            <View style={styles.availabilityRow}>
              {checkingDrivers ? (
                <Text style={styles.availabilityText}>Buscando conductores cerca…</Text>
              ) : driversAvailable === false ? (
                <Text style={styles.availabilityWarn}>Pocos o ningún conductor cercano ahora</Text>
              ) : driversAvailable === true ? (
                <Text style={styles.availabilityOk}>Conductores disponibles</Text>
              ) : (
                <Text style={styles.availabilityText}>Disponibilidad desconocida</Text>
              )}
            </View>

            <View style={styles.inlineRow}>
              <TouchableOpacity style={styles.secondaryNav} onPress={() => setUiStep(2)}>
                <Text style={styles.secondaryNavText}>Anterior</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cta, (!canConfirmOnStep3 || submittingRequest) && styles.ctaDisabled]}
                disabled={!canConfirmOnStep3 || submittingRequest}
                onPress={onConfirmRequest}
              >
                {submittingRequest ? (
                  <View style={styles.ctaLoadingRow}>
                    <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                    <Text style={styles.ctaText}>Enviando solicitud…</Text>
                  </View>
                ) : (
                  <Text style={styles.ctaText}>Confirmar y solicitar viaje</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {showSearchOverlay && (
        <View style={styles.searchOverlay}>
          <View style={styles.searchCard}>
            <View style={styles.searchHeader}>
              <View style={styles.searchHeaderTextBlock}>
                <Text style={styles.searchTitle}>{selectionTitle}</Text>
                <Text style={styles.searchDescription}>{selectionDescription}</Text>
              </View>
              <TouchableOpacity onPress={closeSearchOverlay} style={styles.searchCloseButton}>
                <Text style={styles.searchCloseText}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchInputWrapper}>
              <Text style={styles.searchInputLabel}>Buscar ubicación</Text>
              <View style={styles.searchInputContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder={`Buscar ${selectionTitle.toLowerCase()}…`}
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
                <Text style={[styles.searchActionText, styles.searchActionTextPrimary]}>Usar mi ubicación</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchActionChip} onPress={handlePickFromMap}>
                <Text style={styles.searchActionText}>Seleccionar en mapa</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.searchScroll} keyboardShouldPersistTaps="handled">
              {favoriteLocations.length > 0 && (
                <View style={styles.savedSection}>
                  <Text style={styles.savedSectionTitle}>Favoritos</Text>
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
                  <Text style={styles.savedSectionTitle}>Recientes</Text>
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
                    <Text style={styles.searchLoadingText}>Buscando ubicaciones…</Text>
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
            <Text style={styles.submittingLabel}>Enviando tu solicitud…</Text>
          </View>
        </View>
      )}

    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background || '#fff' },

    backButton: {
      position: 'absolute',
      top: 50,
      left: 16,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.card || '#fff',
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
      left: 72,
      right: 16,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.card || 'rgba(255,255,255,0.96)',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 6,
    },
    routeBubbleHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    routeBubbleTitle: { fontSize: 16, fontWeight: '700', color: colors.text || '#111' },
    inlineCancelButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.surface || '#ececec',
    },
    inlineCancelText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary || '#555' },

    routeTimeline: { marginTop: 4 },
    timelineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    timelineLeft: { width: 30, alignItems: 'center' },
    timelineIcon: { width: 20, height: 20 },
    timelineConnector: { flex: 1, width: 2, backgroundColor: colors.border || '#ddd', marginTop: 4 },
    timelineContent: {
      flex: 1,
      marginHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border || '#ddd',
    },
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
      paddingTop: 12,
      paddingHorizontal: 16,
      paddingBottom: 20,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      backgroundColor: colors.card || '#fff',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 12,
    },

    stepper: { alignItems: 'center', marginBottom: 8 },
    stepText: { fontSize: 12, color: colors.textSecondary || '#666' },

    stepContent: {},
    stepTitle: { fontSize: 16, fontWeight: '700', color: colors.text || '#111', marginBottom: 12, textAlign: 'center' },

    counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
    counterButton: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#2b2b2b', alignItems: 'center', justifyContent: 'center' },
    counterButtonDisabled: { opacity: 0.4 },
    counterButtonText: { color: '#fff', fontSize: 22, fontWeight: '700' },
    counterValueBox: {
      marginHorizontal: 12,
      minWidth: 56,
      height: 40,
      borderRadius: 8,
      backgroundColor: colors.background || '#f2f2f2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    counterValue: { fontSize: 18, fontWeight: '700', color: colors.text || '#111' },

    vehicleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    vehicleCard: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: colors.surface || '#f1f1f1',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border || '#e0e0e0',
    },
    vehicleCardSelected: { borderColor: colors.primary || '#2196F3', borderWidth: 2, backgroundColor: colors.surface || '#f1f1f1' },
    vehicleEmoji: { fontSize: 22, marginBottom: 6 },
    vehicleLabel: { fontSize: 13, color: colors.text || '#111', fontWeight: '600', textAlign: 'center' },

    photoRow: { marginTop: 12 },
    photoHint: { fontSize: 12, color: colors.textSecondary || '#666', marginBottom: 8, textAlign: 'center' },
    photoButton: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.surface || '#f1f1f1' },
    photoButtonText: { color: colors.text || '#111', fontWeight: '600' },

    inlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },

    cta: {
      flex: 1,
      marginTop: 12,
      backgroundColor: '#c9782d',
      paddingVertical: 14,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaSecondary: { backgroundColor: '#6e44ff' },
    ctaDisabled: { opacity: 0.5 },
    ctaLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },

    secondaryNav: { paddingVertical: 12, paddingHorizontal: 16 },
    secondaryNavText: { color: colors.textSecondary || '#666', fontWeight: '600' },

    estimateCard: { borderRadius: 12, padding: 12, backgroundColor: colors.surface || '#f5f5f5', marginBottom: 10 },
    centeredRow: { flexDirection: 'row', alignItems: 'center' },
    estimateText: { marginLeft: 8, color: colors.textSecondary || '#666' },
    estimateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    estimateLabel: { color: colors.textSecondary || '#666' },
    estimateValue: { color: colors.text || '#111', fontWeight: '700' },

    paymentRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 8 },
    paymentChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface || '#eee' },
    paymentChipSelected: { backgroundColor: colors.primary || '#2196F3' },
    paymentChipText: { color: colors.text || '#111', fontWeight: '600' },
    paymentChipTextSelected: { color: '#fff' },

    suggestRow: { marginTop: 4 },
    suggestLabel: { color: colors.textSecondary || '#666', marginBottom: 6 },
    suggestInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    suggestInput: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.surface || '#f1f1f1',
      color: colors.text || '#111',
    },
    suggestButton: {
      paddingHorizontal: 14,
      height: 42,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary || '#2196F3',
    },
    suggestButtonText: { color: '#fff', fontWeight: '700' },

    breakdownBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: colors.surface || '#f1f1f1' },
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