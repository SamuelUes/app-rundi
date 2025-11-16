import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import ridesService from './ridesService';
import notificationService from './notificationService';
import { navigate, navigationRef } from '../navigation/NavigationService';
import { getFirebaseAuth, getFirebaseFunctions, getFirebaseDatabase } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { get, ref } from 'firebase/database';
import { signInAnonymously } from 'firebase/auth';

export interface ProximityRidePreview {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  estimatedPrice: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  paymentMethod?: 'cash' | 'card';
  negotiationStatus?: string | null;
  distanceMeters?: number; // distancia desde el conductor al origen
  rejections?: Record<string, {
    clientSuggestedPriceAtRejection?: number | null;
    estimatedPriceAtRejection?: number | null;
  }>;
}

const STORAGE_KEYS = {
  lastCheckAt: 'proximity:lastCheckAt',
  lastRideId: 'proximity:lastRideId',
  suppressionUntil: 'proximity:suppressionUntil',
  lastShownAt: 'proximity:lastShownAt',
  dismissedRides: 'proximity:dismissedRides',
};

const THROTTLE_MS = 15000; // no más de 1 chequeo cada 15s
const SUPPRESSION_MS = 60000; // suprime notificación 60s después de disparar una
const DISMISS_TTL_MS = 5 * 60 * 1000; // mantener rides rechazados fuera por 5 minutos

async function loadDismissedRides(): Promise<Record<string, number>> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.dismissedRides);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as Record<string, number>;
    const now = Date.now();
    const cleaned: Record<string, number> = {};

    for (const [rideId, rawTs] of Object.entries(parsed)) {
      const ts = typeof rawTs === 'number' ? rawTs : Number(rawTs);
      if (!Number.isFinite(ts)) continue;
      if (now - ts <= DISMISS_TTL_MS) {
        cleaned[rideId] = ts;
      }
    }

    const cleanedKeys = Object.keys(cleaned);
    if (cleanedKeys.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEYS.dismissedRides);
    } else if (cleanedKeys.length !== Object.keys(parsed).length) {
      await AsyncStorage.setItem(STORAGE_KEYS.dismissedRides, JSON.stringify(cleaned));
    }

    return cleaned;
  } catch (err) {
    console.warn('[proximity] No se pudo cargar dismissed rides:', err);
    return {};
  }
}

async function saveDismissedRides(map: Record<string, number>) {
  const keys = Object.keys(map);
  if (keys.length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEYS.dismissedRides);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.dismissedRides, JSON.stringify(map));
}

async function markRideDismissed(rideId: string) {
  try {
    const current = await loadDismissedRides();
    current[rideId] = Date.now();
    await saveDismissedRides(current);
  } catch (err) {
    console.warn('[proximity] No se pudo marcar ride como descartado:', err);
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function ensureFirebaseAuthSession(): Promise<boolean> {
  try {
    const auth = await getFirebaseAuth();
    if (!auth.currentUser) {
      console.warn('[proximity] Usuario no autenticado, omitiendo consulta de rides cercanos');
      return false;
    }
    await auth.currentUser.getIdToken();
    return true;
  } catch (e: any) {
  if (e?.code === 'functions/not-found') {
    console.log('[proximity] Cloud Function getAvailableRides no implementada; usando fallback Firebase.');
  } else {
    console.warn('[proximity] Error getAvailableRides:', e?.message || e);
    }
  }
  return false;
}

function toPreview(ride: any): ProximityRidePreview {
  const origin = ride.origin || (ride.originLat && ride.originLng ? { lat: ride.originLat, lng: ride.originLng, address: ride.originAddress } : undefined);
  const destination = ride.destination || (ride.destinationLat && ride.destinationLng ? { lat: ride.destinationLat, lng: ride.destinationLng, address: ride.destinationAddress } : undefined);

  return {
    id: String(ride.id),
    clientId: ride.clientId || ride.client_id || '',
    clientName: ride.client?.name,
    clientPhone: ride.client?.phone,
    origin: {
      lat: origin?.latitude ?? origin?.lat ?? ride.origin?.lat ?? 0,
      lng: origin?.longitude ?? origin?.lng ?? ride.origin?.lng ?? 0,
      address: origin?.address ?? ride.origin?.address,
    },
    destination: {
      lat: destination?.latitude ?? destination?.lat ?? ride.destination?.lat ?? 0,
      lng: destination?.longitude ?? destination?.lng ?? ride.destination?.lng ?? 0,
      address: destination?.address ?? ride.destination?.address,
    },
    extraDestinations: Array.isArray(ride.extraDestinations)
      ? ride.extraDestinations.map((s: any) => ({ lat: s.lat, lng: s.lng, address: s.address }))
      : undefined,
    estimatedPrice: ride.estimatedPrice ?? ride.estimatedFare ?? ride.payment?.estimatedPrice ?? 0,
    estimatedDistance: ride.estimatedDistance ?? ride.distance,
    estimatedDuration: ride.estimatedDuration ?? ride.duration,
    clientSuggestedPrice: ride.clientSuggestedPrice,
    driverOfferedPrice: ride.driverOfferedPrice ?? null,
    paymentMethod: ride.paymentMethod ?? ride.payment?.paymentMethod,
    negotiationStatus: ride.negotiationStatus ?? null,
    rejections: ride.rejections || undefined,
  } as ProximityRidePreview;
}

function hasPriceChangedForDriver(ride: ProximityRidePreview, driverId: string): boolean {
  const rejection = ride.rejections?.[driverId];
  if (!rejection) return true;

  const currentSuggested = ride.clientSuggestedPrice ?? null;
  const currentEstimated = ride.estimatedPrice ?? null;

  const savedSuggested = rejection.clientSuggestedPriceAtRejection ?? null;
  const savedEstimated = rejection.estimatedPriceAtRejection ?? null;

  const sameSuggested = (currentSuggested === null && savedSuggested === null)
    || (Number(currentSuggested) === Number(savedSuggested));
  const sameEstimated = (currentEstimated === null && savedEstimated === null)
    || (Number(currentEstimated) === Number(savedEstimated));

  return !(sameSuggested && sameEstimated);
}

async function getNearbyRides(lat: number, lng: number, thresholdMeters = 450, max = 3, driverId?: string): Promise<ProximityRidePreview[]> {
  const hasAuth = await ensureFirebaseAuthSession();

  // 1) Intentar por Cloud Function (si existe en backend)
  if (hasAuth) {
    try {
      const rides = await ridesService.getAvailableRides(lat, lng, 0.5);
      const withDistance = (rides || [])
        .map((r: any) => {
          const preview = toPreview(r);
          const d = haversineMeters(lat, lng, preview.origin.lat, preview.origin.lng);
          return { ...preview, distanceMeters: Math.round(d) } as ProximityRidePreview;
        })
        .sort((a: ProximityRidePreview, b: ProximityRidePreview) => (a.distanceMeters || 0) - (b.distanceMeters || 0));

      const filtered = withDistance.filter((ride: ProximityRidePreview) => (ride.distanceMeters ?? 999999) <= thresholdMeters);
      const nearby = driverId ? filtered.filter((ride: ProximityRidePreview) => hasPriceChangedForDriver(ride, driverId)).slice(0, max) : filtered.slice(0, max);
      if (nearby.length > 0) return nearby;
    } catch (e: any) {
      console.warn('[proximity] getAvailableRides no disponible, usando fallback Firebase.', e?.message || e);
    }
  }

  // 2) Fallback: leer últimos viajes desde Realtime DB y filtrar a mano
  try {
    const db = await getFirebaseDatabase();
    const snap = await get(ref(db, 'activeRides'));
    const value = snap.val() || {};
    const rides = Object.values<any>(value)
      .filter((r) => !r.driverId && String(r.status || 'requested').toLowerCase() === 'requested');

    const withDistance = rides
      .map((r) => {
        const preview = toPreview(r);
        const d = haversineMeters(lat, lng, preview.origin.lat, preview.origin.lng);
        return { ...preview, distanceMeters: Math.round(d) } as ProximityRidePreview;
      })
      .sort((a: ProximityRidePreview, b: ProximityRidePreview) => (a.distanceMeters || 0) - (b.distanceMeters || 0));

    const filtered = withDistance.filter((ride: ProximityRidePreview) => (ride.distanceMeters ?? 999999) <= thresholdMeters);
    return driverId ? filtered.filter((ride: ProximityRidePreview) => hasPriceChangedForDriver(ride, driverId)).slice(0, max) : filtered.slice(0, max);
  } catch (fbErr) {
    console.warn('[proximity] Fallback Firebase falló:', (fbErr as any)?.message || fbErr);
    return [];
  }
}

async function shouldThrottle(): Promise<boolean> {
  const now = Date.now();
  const lastCheck = Number(await AsyncStorage.getItem(STORAGE_KEYS.lastCheckAt)) || 0;
  const suppressionUntil = Number(await AsyncStorage.getItem(STORAGE_KEYS.suppressionUntil)) || 0;
  if (now - lastCheck < THROTTLE_MS) return true;
  if (now < suppressionUntil) return true;
  return false;
}

async function markCheck(successTriggered: boolean) {
  const now = Date.now();
  await AsyncStorage.setItem(STORAGE_KEYS.lastCheckAt, String(now));
  if (successTriggered) {
    await AsyncStorage.setItem(STORAGE_KEYS.suppressionUntil, String(now + SUPPRESSION_MS));
  }
}

async function handleLocationForProximity(userId: string, lat: number, lng: number) {
  try {
    console.log('[proximity] handleLocationForProximity()', {
      userId,
      lat,
      lng,
      appState: AppState.currentState,
    });
    const appState = AppState.currentState;
    const applyThrottle = appState !== 'active';
    if (applyThrottle && (await shouldThrottle())) return;

    const nearby = await getNearbyRides(lat, lng, undefined as any, 3, userId);
    if (!nearby || nearby.length === 0) {
      await markCheck(false);
      return;
    }

    const dismissedMap = await loadDismissedRides();
    const availableRides = nearby.filter((ride) => !dismissedMap[ride.id]);

    if (availableRides.length === 0) {
      console.log('[proximity] Todas las solicitudes disponibles fueron rechazadas recientemente.');
      await markCheck(false);
      return;
    }

    const [closest, ...rest] = availableRides;

    if (appState === 'active') {
      console.log('[proximity] nearby found in foreground:', {
        count: availableRides.length,
        firstId: closest.id,
        distance: closest.distanceMeters,
      });
      try {
        const prevId = await AsyncStorage.getItem(STORAGE_KEYS.lastRideId);
        const lastShownAt = Number(await AsyncStorage.getItem(STORAGE_KEYS.lastShownAt)) || 0;
        const now = Date.now();
        if (prevId === closest.id && now - lastShownAt < 10_000) {
          console.log('[proximity] Ride ya mostrada en los últimos 10s, se omite.');
          return;
        }
      } catch {
        // noop
      }
      // Navegar directamente
      const ready = navigationRef.isReady();
      const params = { ride: closest, nearbyRides: rest, proximity: true } as const;
      console.log('[proximity] navigating to RidePreview', { ready });
      if (ready) {
        navigate('RidePreview', params);
      } else {
        setTimeout(() => navigate('RidePreview', params), 500);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.lastRideId, closest.id);
      await AsyncStorage.setItem(STORAGE_KEYS.lastShownAt, String(Date.now()));
    } else {
      // Notificación local de alta prioridad con deep link
      const distance = Math.max(1, Math.round((closest.distanceMeters || 0)));
      const price = Math.round(closest.estimatedPrice || 0);
      await notificationService.showLocalNotification(
        'Solicitud cercana',
        `${distance}m • C$${price} • ${closest.origin.address || 'Cerca de ti'}`,
        { type: 'proximity_ride', ride: closest, nearbyRides: rest }
      );
      console.log('[proximity] local notification shown (background)');
      await AsyncStorage.setItem(STORAGE_KEYS.lastRideId, closest.id);
      // Enviar también por FCM desde backend (TTL 10s) como refuerzo
      try {
        const functions = await getFirebaseFunctions();
        const notifyFn = httpsCallable(functions, 'notifyProximityRide');
        await notifyFn({ ride: closest, nearbyRides: rest });
      } catch (_err) {
        // silencioso
      }
    }

    await markCheck(appState !== 'active');
  } catch (e) {
    // No romper la tarea de background
    await markCheck(false);
  }
}

export default {
  handleLocationForProximity,
  markRideDismissed,
};
