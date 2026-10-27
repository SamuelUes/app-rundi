import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import * as ExpoLocation from 'expo-location';
import notificationService from './notificationService';
import ridesService from './ridesService';
import driverAvailabilityService from './driverAvailabilityService';
import { navigate, navigationRef } from '../navigation/NavigationService';
import { getFirebaseAuth, getFirebaseDatabase, getFirebaseFunctions } from '../config/firebase';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { overlayManager } from '../native/overlay';
import { get, ref } from 'firebase/database';
import { NEARBY_RIDES_RADIUS_KM, RIDES_RADIUS_KM } from '../constants/rideRadius';
import { getActiveRidesByAreaPath } from '../utils/serviceArea';
import { haversineMeters } from '../utils/distance';

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
  autoDismissedRides: 'proximity:autoDismissedRides',
  overlayEnabled: 'proximity:overlayEnabled',
  overlayPayload: 'proximity:lastOverlayPayload',
  registrationUploadsInProgress: 'proximity:registrationUploadsInProgress',
  registrationUploadsSetAt: 'proximity:registrationUploadsSetAt',
};

const THROTTLE_MS = 15000; // no más de 1 chequeo cada 15s
const SUPPRESSION_MS = 60000; // suprime notificación 60s después de disparar una
const DISMISS_TTL_MS = 5 * 60 * 1000; // mantener rides rechazados fuera por 5 minutos
const AUTO_DISMISS_TTL_MS = 60 * 1000; // tras auto-cierre, no re-mostrar por aproximación durante 1 minuto
// Rutas que no deben ser interrumpidas por una auto-apertura de RidePreview
const SUPPRESS_AUTO_OPEN_ROUTES = new Set(['RidePreview', 'ActiveRide', 'WaitingClientConfirmation', 'PaymentConfirmation']);
const REGISTRATION_UPLOADS_TTL_MS = 10 * 60 * 1000; // caducar flag tras 10 minutos
const PROXIMITY_PUSH_RETRY_INTERVAL_MS = 5 * 60 * 1000;

let overlayEnabledCache: boolean | null = null;
let registrationUploadsCache: boolean | null = null;
let proximityPushCallableDisabled = false;
let proximityPushRetryAt: number | null = null;
type RegistrationUploadsListener = (value: boolean) => void;
const registrationUploadsListeners = new Set<RegistrationUploadsListener>();

async function notifyProximityRideViaBackend(
  driverId: string,
  ride: ProximityRidePreview,
  nearbyRides: ProximityRidePreview[],
): Promise<void> {
  const now = Date.now();
  if (proximityPushCallableDisabled) {
    if (proximityPushRetryAt && now < proximityPushRetryAt) {
      return;
    }
    proximityPushCallableDisabled = false;
    proximityPushRetryAt = null;
  }

  try {
    const functions = await getFirebaseFunctions();
    const notifyFn = httpsCallable(functions, 'notifyProximityRide');
    await notifyFn({
      driverId,
      ride,
      nearbyRides,
    });
  } catch (error: any) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    if (code.includes('functions/not-found') || (message.includes('not found') && message.includes('notifyproximityride'))) {
      proximityPushCallableDisabled = true;
      proximityPushRetryAt = Date.now() + PROXIMITY_PUSH_RETRY_INTERVAL_MS;
      console.warn(
        `[proximity] notifyProximityRide no disponible. Reintento en ${Math.round(
          PROXIMITY_PUSH_RETRY_INTERVAL_MS / 1000,
        )}s`,
      );
      return;
    }
    throw error;
  }
}

function notifyRegistrationUploadsListeners(value: boolean) {
  registrationUploadsListeners.forEach((listener) => {
    try {
      listener(value);
    } catch (err) {
      console.warn('[proximity] Listener registrationUploads error:', err);
    }
  });
}

type OverlayEnabledListener = (enabled: boolean) => void;
const overlayEnabledListeners = new Set<OverlayEnabledListener>();

const notifyOverlayEnabled = (enabled: boolean) => {
  overlayEnabledListeners.forEach((listener) => {
    try {
      listener(enabled);
    } catch (err) {
      console.warn('[proximity] overlayEnabled listener error:', err);
    }
  });
};

const subscribeOverlayEnabled = (listener: OverlayEnabledListener) => {
  overlayEnabledListeners.add(listener);
  return () => {
    overlayEnabledListeners.delete(listener);
  };
};

type OverlayPayload = {
  rideId: string;
  price: number;
  distanceKm: number;
  clientName?: string | null;
  isFallback?: boolean;
  variant?: 'app' | 'nearby_ride';
};

export const FALLBACK_OVERLAY_RIDE_ID = '__overlay_home__';

const createFallbackOverlayPayload = (): OverlayPayload => ({
  rideId: FALLBACK_OVERLAY_RIDE_ID,
  price: 0,
  distanceKm: 0.03,
  clientName: '',
  isFallback: true,
  variant: 'app',
});

const sanitizeOverlayPayload = (payload: OverlayPayload): OverlayPayload => ({
  ...payload,
  price: Number.isFinite(payload.price) ? payload.price : 0,
  distanceKm: Math.max(0.03, Number.isFinite(payload.distanceKm) ? payload.distanceKm : 0.03),
});

async function saveOverlayPayload(payload: OverlayPayload | null) {
  try {
    if (!payload) {
      await AsyncStorage.removeItem(STORAGE_KEYS.overlayPayload);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEYS.overlayPayload, JSON.stringify(sanitizeOverlayPayload(payload)));
  } catch (error) {
    console.warn('[proximity] No se pudo guardar overlayPayload:', error);
  }
}

async function loadOverlayPayload(): Promise<OverlayPayload | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.overlayPayload);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as OverlayPayload;
    if (!parsed || typeof parsed.rideId !== 'string') {
      return null;
    }
    return sanitizeOverlayPayload(parsed);
  } catch (error) {
    console.warn('[proximity] No se pudo cargar overlayPayload:', error);
    return null;
  }
}

async function loadTimestampMap(storageKey: string, ttlMs: number): Promise<Record<string, number>> {
  try {
    const stored = await AsyncStorage.getItem(storageKey);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as Record<string, number>;
    const now = Date.now();
    const cleaned: Record<string, number> = {};

    for (const [rideId, rawTs] of Object.entries(parsed)) {
      const ts = typeof rawTs === 'number' ? rawTs : Number(rawTs);
      if (!Number.isFinite(ts)) continue;
      if (now - ts <= ttlMs) {
        cleaned[rideId] = ts;
      }
    }

    const cleanedKeys = Object.keys(cleaned);
    if (cleanedKeys.length === 0) {
      await AsyncStorage.removeItem(storageKey);
    } else if (cleanedKeys.length !== Object.keys(parsed).length) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(cleaned));
    }

    return cleaned;
  } catch (err) {
    console.warn('[proximity] No se pudo cargar mapa de rides:', err);
    return {};
  }
}

async function loadDismissedRides(): Promise<Record<string, number>> {
  return loadTimestampMap(STORAGE_KEYS.dismissedRides, DISMISS_TTL_MS);
}

async function loadAutoDismissedRides(): Promise<Record<string, number>> {
  return loadTimestampMap(STORAGE_KEYS.autoDismissedRides, AUTO_DISMISS_TTL_MS);
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

async function markRideAutoDismissed(rideId: string) {
  try {
    const current = await loadAutoDismissedRides();
    current[rideId] = Date.now();
    await AsyncStorage.setItem(STORAGE_KEYS.autoDismissedRides, JSON.stringify(current));
  } catch (err) {
    console.warn('[proximity] No se pudo marcar ride como auto-descartado:', err);
  }
}

const isOverlaySupportedPlatform = Platform.OS === 'android' || Platform.OS === 'ios';

async function getOverlayEnabled(): Promise<boolean> {
  if (!isOverlaySupportedPlatform) {
    overlayEnabledCache = false;
    return false;
  }
  if (overlayEnabledCache !== null) {
    console.log('🫧 [overlay] getOverlayEnabled() cache hit:', overlayEnabledCache);
    return overlayEnabledCache;
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.overlayEnabled);
    if (stored === null) {
      overlayEnabledCache = false;
    } else {
      overlayEnabledCache = stored === 'true';
    }
  } catch (err) {
    console.warn('[proximity] No se pudo leer preferencia de overlay:', err);
    overlayEnabledCache = false;
  }

  console.log('🫧 [overlay] getOverlayEnabled() storage value:', overlayEnabledCache);
  return overlayEnabledCache;
}

/**
 * Invalida el cache y fuerza recarga desde AsyncStorage
 */
function invalidateOverlayCache() {
  overlayEnabledCache = null;
}

async function isRegistrationUploadsInProgress(): Promise<boolean> {
  if (registrationUploadsCache !== null) {
    return registrationUploadsCache;
  }
  try {
    const [stored, ts] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.registrationUploadsInProgress),
      AsyncStorage.getItem(STORAGE_KEYS.registrationUploadsSetAt),
    ]);

    if (stored === 'true') {
      const setAt = ts ? Number(ts) : NaN;
      const expired = Number.isFinite(setAt) && Date.now() - setAt > REGISTRATION_UPLOADS_TTL_MS;
      if (expired) {
        console.warn('[proximity] registrationUploadsInProgress caducado, limpiando flag');
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.registrationUploadsInProgress,
          STORAGE_KEYS.registrationUploadsSetAt,
        ]);
        registrationUploadsCache = false;
      } else {
        registrationUploadsCache = true;
      }
    } else {
      registrationUploadsCache = false;
    }
  } catch (err) {
    console.warn('[proximity] No se pudo leer flag registrationUploadsInProgress:', err);
    registrationUploadsCache = false;
  }
  return registrationUploadsCache;
}

async function setRegistrationUploadsInProgress(value: boolean): Promise<void> {
  registrationUploadsCache = value;
  try {
    if (value) {
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.registrationUploadsInProgress, 'true'],
        [STORAGE_KEYS.registrationUploadsSetAt, String(Date.now())],
      ]);
    } else {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.registrationUploadsInProgress,
        STORAGE_KEYS.registrationUploadsSetAt,
      ]);
    }
  } catch (err) {
    console.warn('[proximity] No se pudo guardar flag registrationUploadsInProgress:', err);
  }
  notifyRegistrationUploadsListeners(value);
}

function subscribeRegistrationUploadsInProgress(listener: RegistrationUploadsListener) {
  registrationUploadsListeners.add(listener);
  return () => registrationUploadsListeners.delete(listener);
}

async function setOverlayEnabled(enabled: boolean): Promise<void> {
  if (!isOverlaySupportedPlatform) {
    overlayEnabledCache = false;
    return;
  }

  overlayEnabledCache = enabled;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.overlayEnabled, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[proximity] No se pudo guardar preferencia de overlay:', err);
  }

  if (!enabled) {
    await hideOverlayBubble('disabledByUser');
  }

  console.log('🫧 [overlay] setOverlayEnabled():', enabled);
  notifyOverlayEnabled(enabled);
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

async function getNearbyRides(
  lat: number,
  lng: number,
  thresholdMeters = RIDES_RADIUS_KM * 1000,
  max = 3,
  driverId?: string,
): Promise<ProximityRidePreview[]> {
  const hasAuth = await ensureFirebaseAuthSession();

  // 1) Intentar por Cloud Function (si existe en backend)
  if (hasAuth) {
    try {
      const rides = await ridesService.getAvailableRides(lat, lng, NEARBY_RIDES_RADIUS_KM);
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
    const snap = await get(ref(db, getActiveRidesByAreaPath()));
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

const COORDINATE_TEXT_RE = /^\s*-?\d{1,3}(?:\.\d+)?\s*[,;]\s*-?\d{1,3}(?:\.\d+)?\s*$/;

/**
 * Resuelve una etiqueta textual del origen del viaje.
 * Si la dirección guardada es texto real se usa tal cual; si falta o es un
 * par de coordenadas, se intenta reverse geocoding. Las coordenadas crudas
 * solo quedan como último recurso.
 */
async function resolveRideOriginLabel(ride: ProximityRidePreview): Promise<string> {
  const rawAddress = typeof ride.origin?.address === 'string' ? ride.origin.address.trim() : '';
  if (rawAddress && !COORDINATE_TEXT_RE.test(rawAddress)) {
    return rawAddress;
  }

  const lat = ride.origin?.lat;
  const lng = ride.origin?.lng;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      const results = await Promise.race([
        ExpoLocation.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('reverseGeocode timeout')), 4000),
        ),
      ]);
      const best = results?.[0];
      if (best) {
        const street = [best.name, best.street].find(
          (v) => typeof v === 'string' && v.trim() && !COORDINATE_TEXT_RE.test(v),
        );
        const place = [best.district, best.subregion, best.city, best.region].find(
          (v) => typeof v === 'string' && v.trim(),
        );
        const label = [street, place].filter(Boolean).join(', ').trim();
        if (label) return label;
      }
    } catch (geoErr) {
      console.warn('[proximity] Reverse geocode falló:', (geoErr as any)?.message || geoErr);
    }
  }

  return rawAddress || 'Cerca de ti';
}

function navigateToRidePreview(ride: ProximityRidePreview, nearbyRides: ProximityRidePreview[]) {
  const params = { ride, nearbyRides, proximity: true, autoPresented: true } as const;
  const attempt = () => {
    const currentRoute = navigationRef.getCurrentRoute();
    if (currentRoute && SUPPRESS_AUTO_OPEN_ROUTES.has(currentRoute.name)) {
      console.log(
        `[proximity] ${currentRoute.name} ya está visible, se omite auto-apertura de RidePreview`,
      );
      return;
    }
    console.log('🚀 [proximity] Navegando a RidePreview', { rideId: ride.id });
    navigate('RidePreview', params);
  };
  if (navigationRef.isReady()) {
    attempt();
  } else {
    console.log('⚠️ [proximity] Navigation not ready, retrying in 500ms');
    setTimeout(attempt, 500);
  }
}

type HandleProximityOptions = {
  appStateOverride?: AppStateStatus;
};

async function handleLocationForProximity(
  userId: string,
  lat: number,
  lng: number,
  options?: HandleProximityOptions
) {
  try {
    const effectiveAppState = options?.appStateOverride ?? AppState.currentState;
    console.log('🔍 [proximity] handleLocationForProximity()', {
      userId,
      lat,
      lng,
      appState: effectiveAppState,
      overrideProvided: options?.appStateOverride ? true : false,
      actualAppState: AppState.currentState,
    });
    const applyThrottle = effectiveAppState !== 'active';
    if (applyThrottle && (await shouldThrottle())) return;

    const overlayEnabled = await getOverlayEnabled();
    console.log('🔍 [proximity] overlayEnabled:', overlayEnabled);

    // Conductor offline: no buscar ni notificar viajes cercanos (misma
    // regla que en foreground, donde DriverHomeScreen gatea en isAvailable).
    // Se mantiene el payload fallback para que el overlay, si está
    // habilitado, funcione solo como acceso rápido a la app.
    const availability = await driverAvailabilityService.getAvailabilityState();
    const isManuallyAvailable = Boolean(availability?.isAvailable);
    console.log('🔍 [proximity] driver isAvailable:', isManuallyAvailable);

    if (!isManuallyAvailable) {
      const fallbackPayload = createFallbackOverlayPayload();
      await saveOverlayPayload(fallbackPayload);

      if (overlayEnabled) {
        if (effectiveAppState === 'active') {
          await hideOverlayBubble('driverOffline');
        } else if (await overlayManager.hasPermission()) {
          await overlayManager.showRideOverlay({
            rideId: fallbackPayload.rideId,
            price: fallbackPayload.price,
            distanceKm: fallbackPayload.distanceKm,
            clientName: fallbackPayload.clientName,
            variant: 'app',
          });
        }
      }

      await markCheck(false);
      return;
    }

    const maxNearbyDistanceMeters = NEARBY_RIDES_RADIUS_KM * 1000;
    const nearby = await getNearbyRides(lat, lng, maxNearbyDistanceMeters, 3, userId);
    console.log('🔍 [proximity] nearby rides found:', nearby?.length || 0);

    if (!nearby || nearby.length === 0) {
      console.log('⚠️ [proximity] No hay viajes cercanos');

      // Siempre guardar fallback para que se muestre cuando la app se minimice
      const fallbackPayload = createFallbackOverlayPayload();
      await saveOverlayPayload(fallbackPayload);

      if (overlayEnabled) {
        if (effectiveAppState === 'active') {
          await hideOverlayBubble('noNearbyRides');
        } else if (await overlayManager.hasPermission()) {
          // En background el overlay ya está visible: refrescar a fallback
          // para no dejar un viaje obsoleto en la burbuja/Live Activity
          await overlayManager.showRideOverlay({
            rideId: fallbackPayload.rideId,
            price: fallbackPayload.price,
            distanceKm: fallbackPayload.distanceKm,
            clientName: fallbackPayload.clientName,
            variant: 'app',
          });
        }
      }

      await markCheck(false);
      return;
    }

    const [dismissedMap, autoDismissedMap] = await Promise.all([
      loadDismissedRides(),
      loadAutoDismissedRides(),
    ]);
    const filterNow = Date.now();
    const availableRides = nearby.filter((ride) => {
      const dismissedAt = dismissedMap[ride.id];
      const autoDismissedAt = autoDismissedMap[ride.id];
      if (!dismissedAt && !autoDismissedAt) return true;

      // Re-oferta del cliente: si hay rechazo previo y el precio cambió,
      // el dismiss local no debe ocultar la nueva oferta.
      const hasRejection = Boolean(ride.rejections?.[userId]);
      const priceChanged = hasRejection && hasPriceChangedForDriver(ride, userId);
      if (priceChanged) {
        console.log(`💰 [proximity] Ride ${ride.id} estaba descartado pero el precio cambió - se re-muestra`);
        return true;
      }

      const remainingDismissed = dismissedAt
        ? Math.max(0, Math.round((DISMISS_TTL_MS - (filterNow - dismissedAt)) / 1000))
        : null;
      const remainingAuto = autoDismissedAt
        ? Math.max(0, Math.round((AUTO_DISMISS_TTL_MS - (filterNow - autoDismissedAt)) / 1000))
        : null;
      console.log(
        `⏳ [proximity] Ride ${ride.id} filtrado:` +
          (dismissedAt ? ` dismissed (quedan ~${remainingDismissed}s)` : '') +
          (autoDismissedAt ? ` autoDismissed (quedan ~${remainingAuto}s)` : ''),
      );
      return false;
    });
    console.log('🔍 [proximity] availableRides after filter:', availableRides.length);

    if (availableRides.length === 0) {
      console.log('⚠️ [proximity] Todas las solicitudes disponibles fueron rechazadas recientemente.');

      // Siempre guardar fallback para que se muestre cuando la app se minimice
      const fallbackPayload = createFallbackOverlayPayload();
      await saveOverlayPayload(fallbackPayload);

      if (overlayEnabled) {
        if (effectiveAppState === 'active') {
          await hideOverlayBubble('allRidesDismissed');
        } else if (await overlayManager.hasPermission()) {
          // En background el overlay ya está visible: refrescar a fallback
          // para no dejar un viaje obsoleto en la burbuja/Live Activity
          await overlayManager.showRideOverlay({
            rideId: fallbackPayload.rideId,
            price: fallbackPayload.price,
            distanceKm: fallbackPayload.distanceKm,
            clientName: fallbackPayload.clientName,
            variant: 'app',
          });
        }
      }

      await markCheck(false);
      return;
    }

    const [closest, ...rest] = availableRides;
    const clientDisplayName = closest.clientName || 'Cliente';
    const closestDistanceKm = (closest.distanceMeters ?? 0) / 1000;
    const closestPrice = Math.round(closest.clientSuggestedPrice ?? closest.estimatedPrice ?? 0);

    if (effectiveAppState === 'active') {
      console.log('✅ [proximity] FOREGROUND - nearby found:', {
        count: availableRides.length,
        firstId: closest.id,
        distance: closest.distanceMeters,
        price: closestPrice,
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
      // Navegar directamente a RidePreview (auto-apertura: se auto-cierra a los 6s sin cambios)
      navigateToRidePreview(closest, rest);
      await AsyncStorage.setItem(STORAGE_KEYS.lastRideId, closest.id);
      await AsyncStorage.setItem(STORAGE_KEYS.lastShownAt, String(Date.now()));

      // Guardar payload del viaje actual para cuando la app se minimice
      const overlayPayload: OverlayPayload = {
        rideId: closest.id,
        price: closestPrice,
        distanceKm: Math.max(0.1, Number.isFinite(closestDistanceKm) ? closestDistanceKm : 0.1),
        clientName: clientDisplayName,
        variant: 'nearby_ride',
      };
      await saveOverlayPayload(overlayPayload);

      // Ocultar burbuja si está mostrándose (app en foreground)
      if (overlayEnabled) {
        await hideOverlayBubble('foregroundRideNavigation');
      }
    } else {
      // BACKGROUND - Mostrar notificación + overlay
      console.log('✅ [proximity] BACKGROUND - showing notification + overlay');
      console.log('🔍 [proximity] Background ride details:', {
        rideId: closest.id,
        distance: closest.distanceMeters,
        price: closestPrice,
        clientName: clientDisplayName,
      });

      const distance = Math.max(1, Math.round((closest.distanceMeters || 0)));
      const price = Math.round(closest.estimatedPrice || 0);
      let localNotificationSent = false;

      // Resolver etiqueta textual del origen (coords solo como último recurso)
      const originLabel = await resolveRideOriginLabel(closest);
      closest.origin.address = originLabel;

      // 1. Notificación local (administrada con auto-dismiss)
      try {
        console.log('🔔 [proximity] ANTES de showManagedNotification...');
        await notificationService.showManagedNotification(
          'Solicitud cercana',
          `${distance}m • C$${price} • ${originLabel}`,
          { type: 'proximity_ride', ride: closest, nearbyRides: rest },
          `proximity-ride-${closest.id}`,
          120_000 // 120 segundos
        );
        localNotificationSent = true;
        console.log('📢 [proximity] Notificación administrada mostrada (120s auto-dismiss)');
      } catch (error) {
        console.error('❌ [proximity] Error mostrando notificación:', error);
        console.error('❌ [proximity] Error stack:', error instanceof Error ? error.stack : 'No stack');
      }

      if (!localNotificationSent) {
        try {
          await notifyProximityRideViaBackend(userId, closest, rest);
        } catch (pushErr) {
          console.warn('[proximity] No se pudo enviar fallback push proximity:', pushErr);
        }
      }

      await AsyncStorage.setItem(STORAGE_KEYS.lastRideId, closest.id);

      const overlayPayload: OverlayPayload = {
        rideId: closest.id,
        price: closestPrice,
        distanceKm: Math.max(0.1, Number.isFinite(closestDistanceKm) ? closestDistanceKm : 0.1),
        clientName: clientDisplayName,
        variant: 'nearby_ride',
      };
      await saveOverlayPayload(overlayPayload);
      console.log('💾 [proximity] Overlay payload guardado:', overlayPayload);

      // 2. Overlay (si está habilitado)
      if (overlayEnabled) {
        console.log('🫧 [proximity] Overlay habilitado - Verificando permiso...');
        const hasPermission = await overlayManager.hasPermission();
        console.log(`🫧 [proximity] hasPermission: ${hasPermission}`);

        if (hasPermission) {
          const overlayData = {
            rideId: closest.id,
            price: closestPrice,
            distanceKm: Math.max(0.1, Number.isFinite(closestDistanceKm) ? closestDistanceKm : 0),
            clientName: clientDisplayName,
            variant: 'nearby_ride' as const,
          };
          console.log('🫧 [proximity] Llamando a overlayManager.showRideOverlay con:', overlayData);
          console.log('🫧 [proximity] overlayManager object:', overlayManager);
          console.log('🫧 [proximity] showRideOverlay function:', typeof overlayManager.showRideOverlay);

          try {
            console.log('🫧 [proximity] ANTES de await overlayManager.showRideOverlay()');
            const result = await overlayManager.showRideOverlay(overlayData);
            console.log('✅ [proximity] overlayManager.showRideOverlay() completado con result:', result);
          } catch (error) {
            console.error('❌ [proximity] Error mostrando overlay:', error);
            console.error('❌ [proximity] Error stack:', error instanceof Error ? error.stack : 'No stack');
          }

          // 3. Android: traer la app al frente con el preview del viaje
          // (SYSTEM_ALERT_WINDOW exime la restricción de background-activity-start).
          // En iOS no existe API equivalente: Live Activity + notificación es lo máximo.
          if (Platform.OS === 'android') {
            try {
              const brought = await overlayManager.bringAppToFront(closest.id);
              if (brought) {
                console.log('🚀 [proximity] App traída al frente, abriendo RidePreview');
                navigateToRidePreview(closest, rest);
              }
            } catch (frontErr) {
              console.warn('[proximity] No se pudo traer la app al frente:', frontErr);
            }
          }
        } else {
          console.warn('⚠️ [proximity] No hay permiso de overlay - solo notificación');
        }
      } else {
        console.log('ℹ️ [proximity] Overlay deshabilitado en preferencias');
      }
      // FCM desde backend está deshabilitado para evitar duplicados
      // La notificación local administrada es suficiente
    }

    await markCheck(effectiveAppState !== 'active');
  } catch (e) {
    // No romper la tarea de background
    await markCheck(false);
  }
}

async function ensureOverlayBubbleForBackground() {
  console.log('🫧 [overlay] ensureOverlayBubbleForBackground() INICIANDO');
  
  if (!isOverlaySupportedPlatform) {
    console.log('🫧 [overlay] Plataforma sin soporte de overlay, saltando');
    return;
  }

  console.log('🫧 [overlay] Step 1: Verificando si overlay está habilitado...');
  const overlayEnabled = await getOverlayEnabled();
  console.log('🫧 [overlay] overlayEnabled:', overlayEnabled);
  
  if (!overlayEnabled) {
    console.log('🫧 [overlay] ensureOverlayBubbleForBackground: overlay disabled, skipping');
    return;
  }

  console.log('🫧 [overlay] Step 2: Verificando permiso del sistema...');
  const hasPermission = await overlayManager.hasPermission();
  console.log('🫧 [overlay] hasPermission:', hasPermission);
  
  if (!hasPermission) {
    console.log('🫧 [overlay] ensureOverlayBubbleForBackground: system permission missing');
    return;
  }

  console.log('🫧 [overlay] Step 3: Cargando payload...');
  let payload = await loadOverlayPayload();
  console.log('🫧 [overlay] Payload cargado:', payload);
  
  if (!payload) {
    console.log('🫧 [overlay] No hay payload, creando fallback...');
    payload = createFallbackOverlayPayload();
    console.log('🫧 [overlay] Payload fallback creado:', payload);
  }

  try {
    console.log('🫧 [overlay] Step 4: Mostrando overlay con payload:', JSON.stringify(payload));
    await overlayManager.showRideOverlay({
      rideId: payload.rideId,
      price: payload.price,
      distanceKm: Math.max(0.1, payload.distanceKm),
      clientName: payload.clientName ?? null,
      variant: payload.variant ?? 'app',
    });
    console.log('🫧 [overlay] Step 5: Overlay mostrado exitosamente, guardando payload...');
    await saveOverlayPayload(payload);
    console.log('✅ [overlay] ensureOverlayBubbleForBackground COMPLETADO');
  } catch (error) {
    console.error('❌ [overlay] ERROR en ensureOverlayBubbleForBackground:', error);
    console.warn('[proximity] No se pudo restaurar overlay en background:', error);
  }
}

/**
 * Oculta la burbuja flotante.
 * 
 * Comportamiento del payload:
 * - En foreground: limpia el payload (la burbuja no se necesita)
 * - En background: mantiene el payload (para restaurar al volver a minimizar)
 * 
 * Nota: En la práctica, esta función se llama principalmente cuando la app
 * está en foreground, ya que el hook automáticamente oculta la burbuja
 * al detectar que la app vuelve a primer plano.
 */
async function hideOverlayBubble(reason: string = 'unspecified') {
  try {
    console.log('🫧 [overlay] hideOverlayBubble reason:', reason);
    await overlayManager.hideOverlay();
    
    // Solo limpiar el payload si la app está en foreground
    // Si está en background, mantener el payload para restaurar después
    if (AppState.currentState === 'active') {
      console.log('🧹 [overlay] App en foreground - limpiando payload');
      await saveOverlayPayload(null);
    } else {
      console.log('💾 [overlay] App en background - manteniendo payload');
    }
  } catch (error) {
    console.warn('[proximity] No se pudo ocultar overlay:', error);
  }
}

async function debugLogOverlayState(context: string = 'debug') {
  const overlayEnabled = await getOverlayEnabled();
  const payload = await loadOverlayPayload();
  const hasPermission = await overlayManager.hasPermission();
  console.log('🫧 [overlay:debug]', context, {
    overlayEnabled,
    hasPermission,
    payload,
    appState: AppState.currentState,
  });
}

async function debugTriggerFallbackOverlay(context: string = 'debugFallback') {
  console.log('🫧 [overlay:debug] Trigger fallback overlay test:', context);
  await setOverlayEnabled(true);
  await saveOverlayPayload(createFallbackOverlayPayload());
  await ensureOverlayBubbleForBackground();
}

async function dismissProximityNotification(rideId: string) {
  try {
    const key = `proximity-ride-${rideId}`;
    await notificationService.dismissManagedNotification(key);
    console.log(`🔕 [proximity] Notificación descartada para viaje: ${rideId}`);
  } catch (error) {
    console.warn('[proximity] Error descartando notificación:', error);
  }
}

export {
  handleLocationForProximity,
  markRideDismissed,
  markRideAutoDismissed,
  getOverlayEnabled,
  setOverlayEnabled,
  invalidateOverlayCache,
  isRegistrationUploadsInProgress,
  setRegistrationUploadsInProgress,
  subscribeRegistrationUploadsInProgress,
  subscribeOverlayEnabled,
  ensureOverlayBubbleForBackground,
  hideOverlayBubble,
  debugLogOverlayState,
  debugTriggerFallbackOverlay,
  dismissProximityNotification,
};

// Default export to preserve existing default imports across the app
const proximityService = {
  handleLocationForProximity,
  markRideDismissed,
  markRideAutoDismissed,
  getOverlayEnabled,
  setOverlayEnabled,
  invalidateOverlayCache,
  isRegistrationUploadsInProgress,
  setRegistrationUploadsInProgress,
  subscribeRegistrationUploadsInProgress,
  subscribeOverlayEnabled,
  ensureOverlayBubbleForBackground,
  hideOverlayBubble,
  debugLogOverlayState,
  debugTriggerFallbackOverlay,
  dismissProximityNotification,
};

export default proximityService;
