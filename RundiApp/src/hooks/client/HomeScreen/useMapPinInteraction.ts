import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import mapsService from '../../../services/map/mapsService';
import alertService from '../../../services/notification/alertService';
import type { TFunction } from 'i18next';
import type { ManualOverrideState } from './useClientLocation';
import type { RegionStatus } from './useRegionAvailability';

const COORDS_EPSILON = 0.00002;
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
  checkRegionForCoords: (lat: number, lng: number) => Promise<RegionStatus>,
  setRegionStatus: (status: RegionStatus) => void,
  resolveAddressText: (lat: number, lng: number, fallback?: string) => string,
  t: TFunction,
  selectionDisabled: boolean,
  onRestoreLocation: (location: CommittedCoords) => void,
) {
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingAddress, setPendingAddress] = useState(() => t('client.home.map.loadingAddress'));
  const [hasPendingManualSelection, setHasPendingManualSelection] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isHoldingPin, setIsHoldingPin] = useState(false);
  const [isPinLocked, setIsPinLocked] = useState(true);

  const mapGestureActiveRef = useRef(false);
  const lastCommittedCoordsRef = useRef<CommittedCoords | null>(null);
  const regionIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionGenerationRef = useRef(0);
  const savingRef = useRef(false);
  const centerPinBounce = useRef(new Animated.Value(0)).current;
  const markerBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      selectionGenerationRef.current += 1;
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

  const restoreCommitted = useCallback(() => {
    setMapCenter(lastCommittedCoordsRef.current);
    if (lastCommittedCoordsRef.current) onRestoreLocation(lastCommittedCoordsRef.current);
    setHasPendingManualSelection(false);
    setIsResolvingAddress(false);
    setIsPinLocked(true);
  }, [onRestoreLocation]);

  const confirmSelection = useCallback(async (location: CommittedCoords, generation: number) => {
    const isCurrent = () => generation === selectionGenerationRef.current;
    if (!isCurrent() || savingRef.current) return;
    let startedSaving = false;
    setIsResolvingAddress(true);
    try {
      const [region, address] = await Promise.all([
        checkRegionForCoords(location.latitude, location.longitude),
        mapsService.reverseGeocode(location).catch(() => null),
      ]);
      if (!isCurrent()) return;
      if (!region.allowed) {
        restoreCommitted();
        alertService.showInfoAlert(
          t('client.home.alerts.regionUnavailableTitle'),
          t('client.home.alerts.regionUnavailableMessage'),
        );
        return;
      }

      const finalAddress = address || resolveAddressText(location.latitude, location.longitude);
      savingRef.current = true;
      startedSaving = true;
      setIsSavingLocation(true);
      await saveClientLocation(location, finalAddress, {
        source: 'manual',
        manualOverride: { active: true, updatedAt: new Date().toISOString() },
      });
      if (!isCurrent()) return;
      lastCommittedCoordsRef.current = location;
      setRegionStatus(region);
      setPendingAddress(finalAddress);
      setHasPendingManualSelection(false);
      setIsPinLocked(true);
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[useMapPinInteraction] Error confirming location:', error);
      alertService.showConfirmAlert(
        t('client.home.alerts.locationRetryTitle'),
        t('client.home.alerts.locationRetryMessage'),
        () => {
          if (!isCurrent()) return;
          setMapCenter(location);
          onRestoreLocation(location);
          setHasPendingManualSelection(true);
          setIsPinLocked(false);
          void confirmSelection(location, generation);
        },
        () => { if (isCurrent()) restoreCommitted(); },
        t('client.home.errors.retry'),
        t('client.home.alerts.locationRetryCancel'),
      );
    } finally {
      if (startedSaving) savingRef.current = false;
      if (isCurrent()) {
        setIsResolvingAddress(false);
        setIsSavingLocation(false);
      }
    }
  }, [checkRegionForCoords, onRestoreLocation, resolveAddressText, restoreCommitted, saveClientLocation, setRegionStatus, t]);

  const beginGesture = useCallback(() => {
    if (selectionDisabled || savingRef.current) return;
    if (mapGestureActiveRef.current) return;
    selectionGenerationRef.current += 1;
    clearRegionIdleTimeout();
    mapGestureActiveRef.current = true;
    setIsPinLocked(false);
    setIsHoldingPin(true);
    setHasPendingManualSelection(true);
    setIsResolvingAddress(false);
  }, [clearRegionIdleTimeout, selectionDisabled]);

  const handlePanDrag = useCallback(() => {
    beginGesture();
  }, [beginGesture]);

  useEffect(() => {
    if (!selectionDisabled) return;
    selectionGenerationRef.current += 1;
    clearRegionIdleTimeout();
    mapGestureActiveRef.current = false;
    setIsHoldingPin(false);
    setIsPinLocked(true);
    setHasPendingManualSelection(false);
    setIsResolvingAddress(false);
    setIsSavingLocation(false);
  }, [clearRegionIdleTimeout, selectionDisabled]);

  const handleRegionChangeCenter = useCallback((center?: { latitude: number; longitude: number; isGesture?: boolean }) => {
    if (!center) return;
    if (center.isGesture === false) return;
    if (center.isGesture) beginGesture();

    if (!mapGestureActiveRef.current || selectionDisabled) return;
    setMapCenter({ latitude: center.latitude, longitude: center.longitude });
  }, [beginGesture, selectionDisabled]);

  const handleRegionChangeCompleteCenter = useCallback((center?: { latitude: number; longitude: number; isGesture?: boolean }) => {
    if (!center) return;

    if (!mapGestureActiveRef.current || selectionDisabled) return;
    mapGestureActiveRef.current = false;
    setIsHoldingPin(false);

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
      setIsPinLocked(true);
      clearRegionIdleTimeout();
      return;
    }

    setHasPendingManualSelection(true);

    clearRegionIdleTimeout();
    const generation = selectionGenerationRef.current;
    regionIdleTimeoutRef.current = setTimeout(() => {
      regionIdleTimeoutRef.current = null;
      void confirmSelection(normalizedCenter, generation);
    }, REGION_IDLE_DELAY_MS);
  }, [
    clearRegionIdleTimeout,
    selectionDisabled,
    confirmSelection,
    resolveAddressText,
    savedAddress,
    t,
  ]);

  const handleMarkerPress = useCallback(async () => {
    if (!mapCenter || isSavingLocation || selectionDisabled) return;

    if (isPinLocked) {
      setIsPinLocked(false);
      return;
    }

    if (isHoldingPin) return;

    if (!hasPendingManualSelection) {
      setIsPinLocked(true);
      return;
    }
    clearRegionIdleTimeout();
    await confirmSelection(mapCenter, ++selectionGenerationRef.current);
  }, [mapCenter, isHoldingPin, isPinLocked, isSavingLocation, hasPendingManualSelection, clearRegionIdleTimeout, confirmSelection, selectionDisabled]);

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
    handlePanDrag,
    handleMarkerPress,
  };
}
