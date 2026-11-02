import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapsService from '../../../services/map/mapsService';
import alertService from '../../../services/notification/alertService';
import { formatCoords, isValidCoordLocal, metersBetween, type Coords } from '../../../utils/geo/rideCoords';
import { checkLocationAllowed, type LocationValidationResult } from '../../../utils/geo/locationValidation';
import type { TFunction } from 'i18next';
import type { SearchRideState } from './useSearchRideState';

const DEFAULT_FALLBACK_COORDS = { latitude: 12.1364, longitude: -86.2514 };
const REGION_IDLE_DELAY_MS = 900;

type MapSelectionState =
  | 'origin'
  | 'destination'
  | 'extra-new'
  | { type: 'extra-edit'; index: number }
  | null;

interface DefaultLabels {
  origin: string;
  destination: string;
  locationFallback: string;
  currentLocation: string;
  myLocation: string;
  service: string;
}

interface RecomputeRouteFn {
  (
    overrideOrigin?: Coords | null,
    overrideDestination?: Coords | null,
    overrideStops?: Array<{ address: string; coords: Coords | null }>,
  ): Promise<void>;
}

export function useSearchRideLocation(
  state: SearchRideState,
  userId: string | undefined,
  coords: Coords | null,
  defaultLabels: DefaultLabels,
  tr: (path: string, options?: Record<string, any>) => string,
  recomputeRouteWith: RecomputeRouteFn,
) {
  const {
    origin, setOrigin,
    destination, setDestination,
    originCoords, setOriginCoords,
    destinationCoords, setDestinationCoords,
    extraDestinations, setExtraDestinations,
    originServiceAreaId, setOriginServiceAreaId,
    destinationServiceAreaId, setDestinationServiceAreaId,
    manualOriginDraft, setManualOriginDraft,
    manualOriginAddress, setManualOriginAddress,
    manualOriginLoading, setManualOriginLoading,
    manualOriginDragging, setManualOriginDragging,
    manualDestinationDraft, setManualDestinationDraft,
    manualDestinationLoading, setManualDestinationLoading,
    manualDestinationDragging, setManualDestinationDragging,
    extraStopSelectionLoading, setExtraStopSelectionLoading,
    hasManualOriginOverride, setHasManualOriginOverride,
    hasPinnedOrigin, setHasPinnedOrigin,
    cameraTarget, setCameraTarget,
    mapSelectionMode, setMapSelectionMode,
    recentLocations, setRecentLocations,
  } = state;

  const locationValidationCacheRef = useRef<Record<string, LocationValidationResult>>({});

  // v2: ubicación manual del cliente es local (AsyncStorage) — ver useClientLocation.
  const [savedLocation, setSavedLocation] = useState<any>(null);
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) =>
      AsyncStorage.getItem(`clientLocation:${userId}`),
    ).then((raw) => {
      if (mounted && raw) setSavedLocation(JSON.parse(raw));
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [userId]);

  const ensureLocationAllowed = useCallback(
    async (coordsToCheck: Coords): Promise<LocationValidationResult> => {
      return checkLocationAllowed(
        coordsToCheck,
        locationValidationCacheRef.current,
        tr('alerts.serviceValidationFailed'),
      );
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
  }, [setRecentLocations]);

  // Initialize origin from saved location or GPS
  useEffect(() => {
    if (hasManualOriginOverride) return;

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

  // Ensure manualOriginDraft has a base value
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

  // Destination selection mode: set initial draft once per entry.
  // No re-seedear mientras el usuario mueve el mapa: cada frame de pan
  // actualiza manualDestinationDraft con el centro y este efecto lo
  // restauraría al origen, produciendo un bucle ping-pong de setState
  // ("Maximum update depth exceeded").
  const destinationDraftSeededRef = useRef(false);
  useEffect(() => {
    if (mapSelectionMode === 'destination') {
      if (destinationDraftSeededRef.current) return;
      destinationDraftSeededRef.current = true;
      setManualDestinationDragging(false);
      const baseDestination =
        destinationCoords ?? manualOriginDraft ?? originCoords ?? coords ?? DEFAULT_FALLBACK_COORDS;
      if (!manualDestinationDraft || metersBetween(manualDestinationDraft, baseDestination) > 5) {
        setManualDestinationDraft(baseDestination);
      }
    } else {
      destinationDraftSeededRef.current = false;
      if (manualDestinationDragging) {
        setManualDestinationDragging(false);
      }
    }
  }, [mapSelectionMode, manualDestinationDraft, destinationCoords, manualOriginDraft, originCoords, coords, manualDestinationDragging]);

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

  const applySelectionForTarget = useCallback(
    async (target: 'origin' | 'destination' | number | 'new-stop', label: string, coordsValue: Coords | null) => {
      if (!target) return;
      const sanitizedLabel = label.trim() || defaultLabels.locationFallback;

      if (target === 'origin') {
        if (!coordsValue) {
          alertService.showInfoAlert(tr('alerts.selectValidPointTitle'), tr('alerts.selectValidOriginMessage'));
          return;
        }
        const validation = await validateLocationForContext(coordsValue, 'origin');
        if (!validation) return;
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
          alertService.showInfoAlert(tr('alerts.selectValidPointTitle'), tr('alerts.selectValidDestinationMessage'));
          return;
        }
        const validation = await validateLocationForContext(coordsValue, 'destination');
        if (!validation) return;
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
          alertService.showInfoAlert(tr('alerts.selectValidPointTitle'), tr('alerts.selectValidStopMessage'));
          return;
        }
        const safeCoords = coordsValue as Coords;
        const validation = await validateLocationForContext(safeCoords, 'stop');
        if (!validation) return;
        const nextStops = [...extraDestinations, { address: sanitizedLabel, coords: safeCoords }];
        setExtraDestinations(nextStops);
        rememberRecentLocation(sanitizedLabel, safeCoords);
        setCameraTarget(safeCoords);
        await recomputeRouteWith(undefined, undefined, nextStops);
        return;
      }

      if (typeof target === 'number') {
        if (!isValidCoordLocal(coordsValue)) {
          alertService.showInfoAlert(tr('alerts.selectValidPointTitle'), tr('alerts.selectValidStopMessage'));
          return;
        }
        const safeCoords = coordsValue as Coords;
        const validation = await validateLocationForContext(safeCoords, 'stop');
        if (!validation) return;
        const nextStops = extraDestinations.map((stop, index) =>
          index === target ? { address: sanitizedLabel, coords: safeCoords } : stop,
        );
        setExtraDestinations(nextStops);
        rememberRecentLocation(sanitizedLabel, safeCoords);
        setCameraTarget(safeCoords);
        await recomputeRouteWith(undefined, undefined, nextStops);
      }
    },
    [extraDestinations, rememberRecentLocation, recomputeRouteWith, validateLocationForContext, defaultLabels.locationFallback, tr],
  );

  const handleManualOriginDragStart = useCallback((startCoords: Coords) => {
    setManualOriginDragging(true);
    setManualOriginDraft((prev) => prev ?? startCoords);
  }, []);

  const handleManualOriginDragEnd = useCallback(
    async (newCoords: Coords) => {
      setManualOriginDraft(newCoords);
      setManualOriginDragging(false);
      setManualOriginLoading(true);
      setHasManualOriginOverride(true);
      try {
        const validation = await validateLocationForContext(newCoords, 'origin');
        if (!validation) return;
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
        setManualOriginDraft(null);
      }
    },
    [rememberRecentLocation, recomputeRouteWith, promptDestinationSelection, validateLocationForContext],
  );

  // Center-pin selection
  const lastAppliedOriginCenterRef = useRef<Coords | null>(null);
  const originCenterIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedDestinationCenterRef = useRef<Coords | null>(null);
  const destinationCenterIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastExtraCenterRef = useRef<Coords | null>(null);

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
      } else if (mapSelectionMode) {
        // Modos de parada extra: el pin central también está activo,
        // guardamos el último centro para la confirmación manual.
        lastExtraCenterRef.current = center;
      }
    },
    [clearDestinationIdleTimeout, clearOriginIdleTimeout, mapSelectionMode],
  );

  const applyCenterPinOrigin = useCallback(
    async (center: Coords) => {
      const last = lastAppliedOriginCenterRef.current;
      if (last && metersBetween(last, center) < 20) return;
      setManualOriginLoading(true);
      try {
        const validation = await validateLocationForContext(center, 'origin');
        if (!validation) return;
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
    },
    [clearOriginIdleTimeout, rememberRecentLocation, recomputeRouteWith, promptDestinationSelection, validateLocationForContext],
  );

  const applyCenterPinDestination = useCallback(
    async (center: Coords) => {
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
    },
    [clearDestinationIdleTimeout, rememberRecentLocation, recomputeRouteWith],
  );

  const handleRegionChangeCompleteCenter = useCallback(
    (center: Coords) => {
      if (mapSelectionMode === 'origin') {
        setManualOriginDragging(false);
        clearOriginIdleTimeout();
        originCenterIdleTimeoutRef.current = setTimeout(() => {
          void applyCenterPinOrigin(center);
        }, REGION_IDLE_DELAY_MS);
        return;
      }

      if (mapSelectionMode !== 'destination') return;
      setManualDestinationDragging(false);
      clearDestinationIdleTimeout();
      destinationCenterIdleTimeoutRef.current = setTimeout(() => {
        void applyCenterPinDestination(center);
      }, REGION_IDLE_DELAY_MS);
    },
    [applyCenterPinDestination, applyCenterPinOrigin, clearDestinationIdleTimeout, clearOriginIdleTimeout, mapSelectionMode],
  );

  // Confirmación manual del pin central: mismo flujo que el auto-idle,
  // pero inmediato — respaldo por si el gesto/idle no responde.
  // Definido más abajo (tras handleMapPress) para poder reutilizarlo
  // también en los modos de paradas extra.


  const handleMapPress = useCallback(
    async (event: { latitude: number; longitude: number }) => {
      if (mapSelectionMode === 'origin' || mapSelectionMode === 'destination') return;
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

        const canAddExtraStop = extraDestinations.length < 3;
        if (canAddExtraStop) {
          await applySelectionForTarget('new-stop', address, selectedPoint);
        }
      } finally {
        if (isExtraStopMode) {
          setExtraStopSelectionLoading(false);
        }
      }
    },
    [mapSelectionMode, applySelectionForTarget, destinationCoords, originCoords, extraDestinations.length],
  );

  // Confirmación manual del pin central: mismo flujo que el auto-idle/tap,
  // pero inmediato — respaldo por si el gesto no responde.
  const confirmCenterPinSelection = useCallback(() => {
    if (mapSelectionMode === 'origin') {
      const center = manualOriginDraft ?? originCoords ?? coords;
      if (!center) return;
      setManualOriginDragging(false);
      clearOriginIdleTimeout();
      void applyCenterPinOrigin(center);
      return;
    }
    if (mapSelectionMode === 'destination') {
      const center =
        manualDestinationDraft ?? destinationCoords ?? manualOriginDraft ?? originCoords ?? coords;
      if (!center) return;
      setManualDestinationDragging(false);
      clearDestinationIdleTimeout();
      void applyCenterPinDestination(center);
      return;
    }
    if (mapSelectionMode) {
      const center = lastExtraCenterRef.current ?? manualOriginDraft ?? originCoords ?? coords;
      if (!center) return;
      void handleMapPress(center);
    }
  }, [
    mapSelectionMode,
    manualOriginDraft,
    manualDestinationDraft,
    originCoords,
    destinationCoords,
    coords,
    clearOriginIdleTimeout,
    clearDestinationIdleTimeout,
    applyCenterPinOrigin,
    applyCenterPinDestination,
    handleMapPress,
  ]);

  const manualOriginMarkerPosition = useMemo(() => {
    if (manualOriginDraft) return manualOriginDraft;
    if (originCoords) return originCoords;
    if (coords) return coords;
    return DEFAULT_FALLBACK_COORDS;
  }, [manualOriginDraft, originCoords, coords]);

  return {
    savedLocation,
    validateLocationForContext,
    rememberRecentLocation,
    applySelectionForTarget,
    handleManualOriginDragStart,
    handleManualOriginDragEnd,
    handleRegionChangeCenter,
    handleRegionChangeCompleteCenter,
    confirmCenterPinSelection,
    handleMapPress,
    manualOriginMarkerPosition,
    promptDestinationSelection,
  };
}
