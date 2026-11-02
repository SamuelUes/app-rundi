import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '../auth/useAuth';
import { ensureActivityRecognitionPermission } from '../../../utils/system/activityPermission';
import { persistLastKnownLocation } from './useForegroundLocation';
import type { Coordinates } from './useLocation';

export interface UseLocationTrackingOptions {
  highAccuracy?: boolean;
  interval?: number;
  minDistance?: number;
  enabled?: boolean;
  onLocationUpdate?: (coords: Coordinates) => void;
}

export function useLocationTracking(options: UseLocationTrackingOptions = {}) {
  const {
    highAccuracy = false,
    interval = 5000,
    minDistance = 10,
    enabled = true,
    onLocationUpdate,
  } = options;

  const { user } = useAuth();
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const callbackRef = useRef(onLocationUpdate);
  callbackRef.current = onLocationUpdate;

  const locationOptions = {
    accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
    timeInterval: interval,
    distanceInterval: minDistance,
  };

  const startTracking = async () => {
    if (locationSubscription.current) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      if (user?.role === 'driver' || user?.role === 'designated_driver') {
        await ensureActivityRecognitionPermission();
      }

      locationSubscription.current = await Location.watchPositionAsync(
        locationOptions,
        (location) => {
          console.log('📱 Nueva ubicación (foreground):', {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });

          const nextCoords: Coordinates = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
            accuracy: location.coords.accuracy,
            timestamp: location.timestamp,
          };

          callbackRef.current?.(nextCoords);
          persistLastKnownLocation(nextCoords).catch(() => undefined);
        },
      );

      console.log('✅ Tracking de ubicación iniciado (foreground)');
    } catch (err: any) {
      console.error('❌ Error iniciando tracking:', err);
    }
  };

  const stopTracking = async () => {
    if (locationSubscription.current) {
      await locationSubscription.current.remove();
      locationSubscription.current = null;
      console.log('🛑 Tracking de ubicación detenido');
    }
  };

  useEffect(() => {
    if (enabled) {
      startTracking();
    }

    return () => {
      stopTracking();
    };
  }, [enabled, interval, minDistance, highAccuracy]);

  return { startTracking, stopTracking };
}
