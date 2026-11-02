import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import mapsService from '../../../services/map/mapsService';
import alertService from '../../../services/notification/alertService';
import { haversineKm } from '../../../utils/geo/distance';
import type { TFunction } from 'i18next';

export type ManualOverrideState = {
  active: boolean;
  coords: { latitude: number; longitude: number };
  address?: string;
  updatedAt: number;
  source: 'local' | 'remote';
};

const MANUAL_OVERRIDE_RELEASE_DISTANCE_KM = 0.2;
const DEFAULT_CLIENT_LOCATION = {
  latitude: 12.1364,
  longitude: -86.2514,
};

const resolveAddressText = (lat: number, lng: number, fallback?: string) =>
  fallback || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

export function useClientLocation(
  userId: string | undefined,
  coords: { latitude: number; longitude: number } | null,
  initialCoords: { latitude: number; longitude: number } | null,
  t: TFunction,
) {
  // v2: no hay colección para ubicación manual del cliente pre-viaje —
  // se persiste local por dispositivo (AsyncStorage), mismo shape que
  // el antiguo clientsLocations/{uid}.
  const [clientLocationData, setClientLocationData] = useState<any>(null);
  const [loadingClientLocation, setLoadingClientLocation] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoadingClientLocation(false);
      return;
    }
    let mounted = true;
    AsyncStorage.getItem(`clientLocation:${userId}`)
      .then((raw) => {
        if (mounted) {
          setClientLocationData(raw ? JSON.parse(raw) : null);
          setLoadingClientLocation(false);
        }
      })
      .catch(() => mounted && setLoadingClientLocation(false));
    return () => {
      mounted = false;
    };
  }, [userId]);

  const [savedAddress, setSavedAddress] = useState('');
  const [manualOverride, setManualOverride] = useState<ManualOverrideState | null>(null);
  const initialClientLocationBootstrapRef = useRef(false);

  const saveClientLocation = useCallback(
    async (
      newLocation: { latitude: number; longitude: number },
      address: string,
      options?: { source?: 'manual' | 'gps'; manualOverride?: { active: boolean; updatedAt?: string } },
    ) => {
      if (!userId) return;

      try {
        const now = Date.now();
        const record = {
          latitude: newLocation.latitude,
          longitude: newLocation.longitude,
          coords: {
            latitude: newLocation.latitude,
            longitude: newLocation.longitude,
          },
          address,
          source: options?.source || 'manual',
          isManual: (options?.source || 'manual') !== 'gps',
          timestamp: now,
          manualOverride:
            options?.manualOverride || {
              active: options?.source === 'manual',
              updatedAt: new Date(now).toISOString(),
            },
        };
        await AsyncStorage.setItem(`clientLocation:${userId}`, JSON.stringify(record));
        setClientLocationData(record);
      } catch (error) {
        console.error('❌ Error guardando ubicación:', error);
        alertService.showErrorAlert(t('client.home.alerts.locationSaveError'));
        throw error;
      }
    },
    [userId, t],
  );

  // Reconocer override manual proveniente de Firebase
  useEffect(() => {
    if (!clientLocationData?.coords) return;

    if (clientLocationData?.manualOverride?.active) {
      setManualOverride((prev) => {
        if (prev && prev.active && prev.source === 'local') return prev;
        return {
          active: true,
          coords: {
            latitude: clientLocationData.coords.latitude,
            longitude: clientLocationData.coords.longitude,
          },
          address: clientLocationData.address,
          updatedAt: Date.now(),
          source: 'remote',
        };
      });
    } else {
      setManualOverride((prev) => {
        if (!prev || prev.source === 'local') return prev;
        return null;
      });
    }
  }, [clientLocationData?.coords, clientLocationData?.manualOverride?.active, clientLocationData?.address]);

  // Cargar dirección guardada
  useEffect(() => {
    if (!userId || !clientLocationData) return;
    try {
      if (clientLocationData.address) {
        setSavedAddress(clientLocationData.address);
      }
    } catch (error) {
      console.error('❌ Error cargando ubicación guardada:', error);
    }
  }, [userId, clientLocationData]);

  // Bootstrap inicial
  useEffect(() => {
    if (!userId) return;
    if (!coords && !clientLocationData?.coords) return;
    if (initialClientLocationBootstrapRef.current) return;

    const hasValidSavedCoords =
      !!clientLocationData?.coords &&
      typeof clientLocationData.coords.latitude === 'number' &&
      typeof clientLocationData.coords.longitude === 'number' &&
      Number.isFinite(clientLocationData.coords.latitude) &&
      Number.isFinite(clientLocationData.coords.longitude);

    if (hasValidSavedCoords) {
      initialClientLocationBootstrapRef.current = true;
      return;
    }

    const sourceCoords = clientLocationData?.coords || coords;
    if (!sourceCoords) return;

    initialClientLocationBootstrapRef.current = true;

    (async () => {
      try {
        const coordsToSave = {
          latitude: sourceCoords.latitude,
          longitude: sourceCoords.longitude,
        };
        const addressToSave =
          clientLocationData?.address ||
          savedAddress ||
          resolveAddressText(coordsToSave.latitude, coordsToSave.longitude, savedAddress);

        await saveClientLocation(coordsToSave, addressToSave, {
          source: 'gps',
          manualOverride: { active: false, updatedAt: new Date().toISOString() },
        });
      } catch (err) {
        console.error('❌ [useClientLocation] Error bootstrapping ubicación inicial:', err);
      }
    })();
  }, [userId, coords?.latitude, coords?.longitude, clientLocationData?.coords, clientLocationData?.address, savedAddress, saveClientLocation]);

  // Liberar override manual si el usuario se mueve > 200m
  useEffect(() => {
    if (!manualOverride?.active || !coords) return;
    if (manualOverride.source === 'local') return;
    if (clientLocationData?.isManual) return;

    const distance = haversineKm(
      manualOverride.coords.latitude,
      manualOverride.coords.longitude,
      coords.latitude,
      coords.longitude,
    );

    if (distance < MANUAL_OVERRIDE_RELEASE_DISTANCE_KM) return;

    setManualOverride(null);

    (async () => {
      const address =
        (await mapsService.reverseGeocode({ latitude: coords.latitude, longitude: coords.longitude })) ||
        resolveAddressText(coords.latitude, coords.longitude, savedAddress);

      setSavedAddress(address);

      await saveClientLocation(
        { latitude: coords.latitude, longitude: coords.longitude },
        address,
        {
          source: 'gps',
          manualOverride: { active: false, updatedAt: new Date().toISOString() },
        },
      );
    })().catch((error) =>
      console.error('❌ [useClientLocation] Error sincronizando ubicación tras liberar override:', error),
    );
  }, [coords, manualOverride, clientLocationData?.isManual, saveClientLocation, savedAddress]);

  const committedCoords = useMemo(() => {
    if (manualOverride?.active) return manualOverride.coords;
    if (clientLocationData?.coords) {
      return {
        latitude: clientLocationData.coords.latitude,
        longitude: clientLocationData.coords.longitude,
      };
    }
    if (coords) {
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
    return DEFAULT_CLIENT_LOCATION;
  }, [manualOverride?.active, manualOverride?.coords, clientLocationData?.coords, coords?.latitude, coords?.longitude]);

  const storedCoords = clientLocationData?.coords || null;

  const effectiveCoords = useMemo(() => {
    if (manualOverride?.active) return manualOverride.coords;
    if (coords) return coords;
    if (storedCoords) return storedCoords;
    return DEFAULT_CLIENT_LOCATION;
  }, [manualOverride?.active, manualOverride?.coords, coords, storedCoords]);

  return {
    clientLocationData,
    loadingClientLocation,
    savedAddress,
    setSavedAddress,
    manualOverride,
    setManualOverride,
    saveClientLocation,
    committedCoords,
    effectiveCoords,
    storedCoords,
    resolveAddressText,
  };
}
