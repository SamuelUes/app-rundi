import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import mapsService from '../../../services/map/mapsService';
import alertService from '../../../services/notification/alertService';
import type { TFunction } from 'i18next';
import type { ManualOverrideState } from './useClientLocation';

const COORDS_EPSILON = 0.0002;
const REGION_IDLE_DELAY_MS = 900;

const areCoordsEqual = (
  a?: { latitude: number; longitude: number } | null,
  b?: { latitude: number; longitude: number } | null,
  epsilon: number = COORDS_EPSILON,
) => {
  if (!a || !b) return false;
  return (
    Math.abs(a.latitude - b.latitude) <= epsilon &&
    Math.abs(a.longitude - b.longitude) <= epsilon
  );
};

interface CommittedCoords {
  latitude: number;
  longitude: number;
}

export function useMapPinInteraction(
  committedCoords: CommittedCoords,
  manualOverride: ManualOverrideState | null,
  clientLocationData: any,
  savedAddress: string,
  saveClientLocation: (
    location: { latitude: number; longitude: number },
    address: string,
    options?: { source?: 'manual' | 'gps'; manualOverride?: { active: boolean; updatedAt?: string } },
  ) => Promise<void>,
  updateRegionForCoords: (lat: number, lng: number) => Promise<void>,
  resolveAddressText: (lat: number, lng: number, fallback?: string) => string,
  t: TFunction,
) {
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingAddress, setPendingAddress] = useState(() => t('client.home.map.loadingAddress'));
  const [hasPendingManualSelection, setHasPendingManualSelection] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isHoldingPin, setIsHoldingPin] = useState(false);
  const [isPinLocked, setIsPinLocked] = useState(true);

  const ignoreNextRegionChangeRef = useRef(false);
  const mapGestureActiveRef = useRef(false);
  const lastCommittedCoordsRef = useRef<CommittedCoords | null>(null);
  const regionIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerPinBounce = useRef(new Animated.Value(0)).current;
  const markerBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    ignoreNextRegionChangeRef.current = true;
  }, []);

  useEffect(() => {
    return () => {
      if (regionIdleTimeoutRef.current) {
        clearTimeout(regionIdleTimeoutRef.current);
        regionIdleTimeoutRef.current = null;
      }
    };
  }, []);

  const clearRegionIdleTimeout = useCallback(() => {
    if (regionIdleTimeoutRef.current) {
      clearTimeout(regionIdleTimeoutRef.current);
      regionIdleTimeoutRef.current = null;
    }
  }, []);

  // Sync mapCenter when committedCoords changes
  useEffect(() => {
    if (committedCoords) {
      lastCommittedCoordsRef.current = committedCoords;
    }

    if (isSavingLocation || hasPendingManualSelection) return;

    if (!mapCenter || !areCoordsEqual(mapCenter, committedCoords)) {
      ignoreNextRegionChangeRef.current = true;
      setMapCenter(committedCoords);
    }

    const baseAddress =
      manualOverride?.address ||
      clientLocationData?.address ||
      savedAddress ||
      resolveAddressText(committedCoords.latitude, committedCoords.longitude, savedAddress);

    setPendingAddress(baseAddress);
    setHasPendingManualSelection(false);
  }, [
    committedCoords.latitude,
    committedCoords.longitude,
    manualOverride?.address,
    clientLocationData?.address,
    savedAddress,
    mapCenter,
    hasPendingManualSelection,
    isSavingLocation,
  ]);

  const persistManualLocation = useCallback(
    async (coordsToSave: { latitude: number; longitude: number } | null, preferredAddress?: string | null) => {
      if (!coordsToSave || isSavingLocation) return;

      setIsSavingLocation(true);

      try {
        let addressToSave = preferredAddress;
        if (!addressToSave || addressToSave === t('client.home.map.loadingAddress')) {
          addressToSave =
            (await mapsService.reverseGeocode({
              latitude: coordsToSave.latitude,
              longitude: coordsToSave.longitude,
            })) || resolveAddressText(coordsToSave.latitude, coordsToSave.longitude, savedAddress);
        }

        await saveClientLocation(coordsToSave, addressToSave, {
          source: 'manual',
          manualOverride: { active: true, updatedAt: new Date().toISOString() },
        });

        ignoreNextRegionChangeRef.current = true;
        lastCommittedCoordsRef.current = coordsToSave;

        setManualOverrideLocal({
          active: true,
          coords: coordsToSave,
          address: addressToSave,
          updatedAt: Date.now(),
          source: 'local',
        });
        setPendingAddress(addressToSave);
        setHasPendingManualSelection(false);
        setIsPinLocked(true);

        alertService.showSuccessAlert(
          t('client.home.alerts.locationSavedTitle'),
          t('client.home.alerts.locationSavedMessage'),
        );
      } catch (error) {
        console.error('❌ [useMapPinInteraction] Error guardando nueva ubicación:', error);
        alertService.showErrorAlert(t('client.home.alerts.locationSaveError'));
      } finally {
        setIsHoldingPin(false);
        setIsSavingLocation(false);
      }
    },
    [isSavingLocation, saveClientLocation, resolveAddressText, savedAddress, t],
  );

  // We need setManualOverride from useClientLocation, but we don't want to create a circular dep.
  // Instead, we accept it as a parameter via a setter callback.
  const [manualOverrideLocal, setManualOverrideLocal] = useState<ManualOverrideState | null>(null);

  const handleRegionChangeCenter = useCallback((center?: { latitude: number; longitude: number }) => {
    if (!center) return;

    if (ignoreNextRegionChangeRef.current) {
      ignoreNextRegionChangeRef.current = false;
      return;
    }

    clearRegionIdleTimeout();

    if (isPinLocked) return;

    if (!mapGestureActiveRef.current) {
      mapGestureActiveRef.current = true;
      setIsHoldingPin(true);
      setHasPendingManualSelection(true);
    }

    setMapCenter({ latitude: center.latitude, longitude: center.longitude });
  }, [clearRegionIdleTimeout, isPinLocked]);

  const handleRegionChangeCompleteCenter = useCallback((center?: { latitude: number; longitude: number }) => {
    if (!center) return;

    mapGestureActiveRef.current = false;
    setIsHoldingPin(false);

    if (ignoreNextRegionChangeRef.current) {
      ignoreNextRegionChangeRef.current = false;
      return;
    }

    if (isPinLocked) {
      clearRegionIdleTimeout();
      return;
    }

    const normalizedCenter = { latitude: center.latitude, longitude: center.longitude };

    setMapCenter(normalizedCenter);

    const lastCommitted = lastCommittedCoordsRef.current;
    const movedFromCommitted = !lastCommitted || !areCoordsEqual(lastCommitted, normalizedCenter, COORDS_EPSILON);

    if (!movedFromCommitted) {
      setHasPendingManualSelection(false);
      setPendingAddress((prev) =>
        prev && prev !== t('client.home.map.loadingAddress')
          ? prev
          : resolveAddressText(normalizedCenter.latitude, normalizedCenter.longitude, savedAddress),
      );
      setIsResolvingAddress(false);
      setIsHoldingPin(false);
      clearRegionIdleTimeout();
      return;
    }

    setHasPendingManualSelection(true);

    clearRegionIdleTimeout();
    regionIdleTimeoutRef.current = setTimeout(() => {
      (async () => {
        setIsResolvingAddress(true);
        let resolvedAddress: string | null = null;

        try {
          resolvedAddress = await mapsService.reverseGeocode({
            latitude: normalizedCenter.latitude,
            longitude: normalizedCenter.longitude,
          });
        } catch (error) {
          console.error('❌ [useMapPinInteraction] Error resolviendo dirección:', error);
        }

        const finalAddress =
          resolvedAddress || resolveAddressText(normalizedCenter.latitude, normalizedCenter.longitude, savedAddress);
        setPendingAddress(finalAddress);
        setIsResolvingAddress(false);

        await updateRegionForCoords(normalizedCenter.latitude, normalizedCenter.longitude);

        await persistManualLocation(normalizedCenter, finalAddress);
      })()
        .catch((error) => {
          console.error('❌ [useMapPinInteraction] Error completando selección manual:', error);
        })
        .finally(() => {
          regionIdleTimeoutRef.current = null;
        });
    }, REGION_IDLE_DELAY_MS);
  }, [
    clearRegionIdleTimeout,
    isPinLocked,
    persistManualLocation,
    resolveAddressText,
    savedAddress,
    updateRegionForCoords,
    t,
  ]);

  const handleMarkerPress = useCallback(async () => {
    if (!mapCenter || isSavingLocation) return;

    if (isPinLocked) {
      setIsPinLocked(false);
      return;
    }

    if (isHoldingPin) return;

    await persistManualLocation(mapCenter, pendingAddress);
  }, [mapCenter, isHoldingPin, isPinLocked, isSavingLocation, pendingAddress, persistManualLocation]);

  return {
    mapCenter,
    pendingAddress,
    hasPendingManualSelection,
    isResolvingAddress,
    isSavingLocation,
    isHoldingPin,
    isPinLocked,
    setIsPinLocked,
    centerPinBounce,
    markerBounce,
    handleRegionChangeCenter,
    handleRegionChangeCompleteCenter,
    handleMarkerPress,
    persistManualLocation,
  };
}
