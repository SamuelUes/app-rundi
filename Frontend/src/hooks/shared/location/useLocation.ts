import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useForegroundLocation } from './useForegroundLocation';
import { useLocationTracking } from './useLocationTracking';
import { useBackgroundTracking } from './useBackgroundTracking';

export interface Coordinates {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  timestamp?: number;
}

export interface UseLocationOptions {
  highAccuracy?: boolean;
  backgroundTracking?: boolean;
  interval?: number;
  minDistance?: number;
  initialCoords?: Coordinates;
}

export const DRIVER_LOCATION_OPTIONS: UseLocationOptions = {
  highAccuracy: true,
  interval: 2500,
  minDistance: 5,
};

export function useLocation(options: UseLocationOptions = {}) {
  const {
    highAccuracy = false,
    backgroundTracking = false,
    interval = 5000,
    minDistance = 10,
    initialCoords,
  } = options;

  const {
    coords,
    coordsRef,
    error,
    setError,
    loading,
    isUsingMockLocation,
    updateCoords,
    getLocation,
    seedInitialCoords,
    loadStoredLocation,
    lastSuccessfulRefresh,
    isRefreshingLocation,
  } = useForegroundLocation({ highAccuracy, initialCoords });

  const { startTracking, stopTracking } = useLocationTracking({
    highAccuracy,
    interval,
    minDistance,
    enabled: !backgroundTracking,
    onLocationUpdate: (nextCoords) => {
      updateCoords(nextCoords, { isMock: false });
      setError(null);
    },
  });

  const {
    isBackgroundTrackingActive,
    startBackgroundTracking,
    stopBackgroundTracking,
    checkActive,
  } = useBackgroundTracking();

  const appState = useRef(AppState.currentState);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active' &&
      !backgroundTracking
    ) {
      console.log('📱 App volvió a primer plano, actualizando ubicación...');
      const now = Date.now();
      if (!isRefreshingLocation.current && now - lastSuccessfulRefresh.current > 5000) {
        getLocation();
      }
    }
    appState.current = nextAppState;
  };

  useEffect(() => {
    (async () => {
      seedInitialCoords();
      await loadStoredLocation();
      await getLocation();
    })();

    if (backgroundTracking) {
      checkActive();
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      stopTracking();
    };
  }, []);

  return {
    coords,
    error,
    loading,
    refreshLocation: getLocation,
    isUsingMockLocation,
    isBackgroundTrackingActive,
    startBackgroundTracking,
    stopBackgroundTracking,
  };
}
