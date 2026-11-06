import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, where } from 'firebase/firestore';
import * as ExpoLocation from 'expo-location';
import notificationService from '../notification/notificationService';
import ridesService from './ridesService';
import driverAvailabilityService from '../driver/driverAvailabilityService';
import { navigate, navigationRef } from '../../navigation/NavigationService';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { overlayManager } from '../../native/overlay';
import { notifyProximityRide } from '../../api/rides';
import { FS_COL } from '../../constants/firestore';
import { NEARBY_RIDES_RADIUS_KM, RIDES_RADIUS_KM } from '../../constants/rideRadius';
import { haversineMeters } from '../../utils/geo/distance';
import { checkRideDriverCompatibility, extractRequestedFeatureCodes, resolveSelectedDriverVehicleType } from '../../utils/ride/availableRidesHelpers';
import { getPremiumStatus } from '../../utils/driver/premiumStatus';
import { compareRideOrder, rideRequestedAtMillis } from '../../utils/ride/rideOrder';

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
  serviceCode?: string;
  featureCodes?: string[];
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  paymentMethod?: 'cash' | 'card';
  negotiationStatus?: string | null;
  distanceMeters?: number; // distancia desde el conductor al origen
  requestedAt?: number | null;
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

const THROTTLE_MS = 15000; // no más de 1 chequeo cada 15s en background
const FOREGROUND_THROTTLE_MS = 30000; // en foreground limitar a 1 chequeo cada 30s
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
    // v2: POST /v1/rides/{id}/proximity-notify por viaje cercano (driverId va por JWT).
    const targets = (nearbyRides?.length ? nearbyRides : [ride]).slice(0, 5);
    await Promise.all(targets.map((r) => notifyProximityRide(r.id)));
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
  featureCodes?: string[];
  isFallback?: boolean;
  engagement?: 'negotiation' | 'active';
  variant?: 'app' | 'nearby_ride';
  shownAt?: number;
};

export type EngagementOverlayRide = {
  rideId: string;
  clientName?: string | null;
  price?: number | null;
  distanceKm?: number | null;
  kind: 'negotiation' | 'active';
};

let currentEngagementRide: EngagementOverlayRide | null = null;

// Una oferta en el overlay/Live Activity es un "glance" de pocos segundos:
// pasado este tiempo vuelve al estado fallback (logo + "Listo para nuevos viajes").
const OVERLAY_OFFER_GLANCE_MS = 5_000;
const SEQUENCE_PAUSE_MS = 2_000;
let overlayOfferRevertTimer: ReturnType<typeof setTimeout> | null = null;
type ProximitySequence = {
  userId: string;
  lat: number;
  lng: number;
  shown: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
};
let activeSequence: ProximitySequence | null = null;
let checkingProximity = false;
let sequenceGeneration = 0;

function cancelProximitySequence() {
  sequenceGeneration += 1;
  const sequence = activeSequence;
  activeSequence = null;
  if (sequence?.timer) clearTimeout(sequence.timer);
  if (overlayOfferRevertTimer) clearTimeout(overlayOfferRevertTimer);
  overlayOfferRevertTimer = null;
}

function scheduleNextProximityRide(rideId: string) {
  const sequence = activeSequence;
  if (!sequence || sequence.timer) return;
  sequence.shown.add(rideId);
  // Capture the route after the preview has been removed, not before goBack.
  let routeKey: string | undefined;
  setTimeout(() => {
    if (activeSequence === sequence && AppState.currentState === 'active') {
      routeKey = navigationRef.getCurrentRoute()?.key;
    }
  }, 0);
  sequence.timer = setTimeout(() => {
    sequence.timer = null;
    if (activeSequence !== sequence) return;
    if (checkingProximity) {
      scheduleNextProximityRide(rideId);
      return;
    }
    if (AppState.currentState === 'active') {
      const route = navigationRef.getCurrentRoute();
      if (!route || !routeKey || route.key !== routeKey || SUPPRESS_AUTO_OPEN_ROUTES.has(route.name)) {
        cancelProximitySequence();
        return;
      }
    }
    void handleLocationForProximity(sequence.userId, sequence.lat, sequence.lng, { sequence, routeKey });
  }, SEQUENCE_PAUSE_MS);
}

const isOverlayOfferStale = (payload: OverlayPayload | null): boolean =>
  Boolean(
    payload &&
      payload.variant === 'nearby_ride' &&
      (!payload.shownAt || Date.now() - payload.shownAt >= OVERLAY_OFFER_GLANCE_MS)
  );

// Revierte la oferta a fallback si sigue siendo el payload vigente. El timer
// puede no disparar mientras la app está suspendida, por eso los puntos que
// leen el payload también aplican isOverlayOfferStale.
function scheduleOverlayOfferRevert(rideId: string, shownAt: number) {
  if (overlayOfferRevertTimer) {
    clearTimeout(overlayOfferRevertTimer);
    overlayOfferRevertTimer = null;
  }
  const delay = Math.max(0, OVERLAY_OFFER_GLANCE_MS - (Date.now() - shownAt));
  overlayOfferRevertTimer = setTimeout(async () => {
    try {
      const saved = await loadOverlayPayload();
      if (
        saved?.variant === 'nearby_ride' &&
        saved.rideId === rideId &&
        saved.shownAt === shownAt &&
        (await getOverlayEnabled())
      ) {
        const fallback = createIdleOverlayPayload();
        await saveOverlayPayload(fallback);
        await overlayManager.showRideOverlay({
          rideId: fallback.rideId,
          price: fallback.price,
          distanceKm: fallback.distanceKm,
          clientName: fallback.clientName ?? null,
          variant: 'app',
        });
        if (AppState.currentState !== 'active') scheduleNextProximityRide(rideId);
      } else if (AppState.currentState !== 'active') {
        cancelProximitySequence();
      }
    } catch (error) {
      console.warn('[proximity] No se pudo revertir oferta a fallback:', error);
    }
  }, delay);
}

export const FALLBACK_OVERLAY_RIDE_ID = '__overlay_home__';

const createFallbackOverlayPayload = (): OverlayPayload => ({
  rideId: FALLBACK_OVERLAY_RIDE_ID,
  price: 0,
  distanceKm: 0.03,
  clientName: '',
  isFallback: true,
  variant: 'app',
});

const createEngagementOverlayPayload = (ride: EngagementOverlayRide): OverlayPayload => ({
  rideId: ride.rideId,
  price: Number.isFinite(ride.price) ? Number(ride.price) : 0,
  distanceKm: Math.max(0.03, Number.isFinite(ride.distanceKm) ? Number(ride.distanceKm) : 0.03),
  clientName: ride.clientName ?? '',
  engagement: ride.kind,
  variant: 'app',
});

// Estado de reposo de la burbuja: el viaje comprometido (negociación propia
// o viaje activo) si existe; si no, el fallback idle.
const createIdleOverlayPayload = (): OverlayPayload =>
  currentEngagementRide ? createEngagementOverlayPayload(currentEngagementRide) : createFallbackOverlayPayload();

const sanitizeOverlayPayload = (payload: OverlayPayload): OverlayPayload => ({
  ...payload,
  price: Number.isFinite(payload.price) ? payload.price : 0,
  distanceKm: Math.max(0.03, Number.isFinite(payload.distanceKm) ? payload.distanceKm : 0.03),
  featureCodes: payload.variant === 'nearby_ride' && Array.isArray(payload.featureCodes)
    ? payload.featureCodes.filter((code): code is string => typeof code === 'string')
    : [],
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

// Estados del doc de oferta donde el conductor ya no está comprometido.
const ENGAGEMENT_TERMINAL_STATUSES = new Set([
  'rejected', 'rejected_offer', 'cancelled', 'canceled', 'expired', 'closed', 'rescinded',
]);

// Un payload de engagement es válido mientras el doc de oferta propio siga
// abierto (pending/accepted/etc). El doc es legible por el conductor — no
// requiere ser participante del viaje.
const isEngagementPayloadValid = async (payload: OverlayPayload): Promise<boolean> => {
  const auth = await getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const db = await getFirebaseFirestore();
  const offer = await getDocFromServer(doc(db, FS_COL.driverOffers, `${payload.rideId}_${uid}`));
  if (!offer.exists()) return false;
  return !ENGAGEMENT_TERMINAL_STATUSES.has(String(offer.data()?.status ?? '').toLowerCase());
};

/**
 * Contexto de engagement para la burbuja/Live Activity: con negociación
 * propia o viaje activo el overlay muestra el viaje real (cliente + precio)
 * en vez del fallback idle. Lo alimenta useDriverActiveRides en cada
 * snapshot de Firestore; en background el overlay visible se refresca.
 */
async function setEngagementOverlay(ride: EngagementOverlayRide | null) {
  const prev = currentEngagementRide;
  currentEngagementRide = ride;
  const unchanged =
    (!ride && !prev) ||
    (ride && prev &&
      ride.rideId === prev.rideId &&
      ride.kind === prev.kind &&
      ride.price === prev.price &&
      ride.clientName === prev.clientName);
  if (unchanged) return;
  try {
    const saved = await loadOverlayPayload();
    if (!ride) {
      if (saved?.engagement) {
        await saveOverlayPayload(createFallbackOverlayPayload());
        if (AppState.currentState !== 'active') {
          await ensureOverlayBubbleForBackground();
        }
      }
      return;
    }
    // No pisar el glance de una solicitud nueva: al expirar, el revert
    // cae sobre el payload de engagement vía createIdleOverlayPayload.
    if (saved?.variant === 'nearby_ride' && !isOverlayOfferStale(saved)) {
      return;
    }
    await saveOverlayPayload(createEngagementOverlayPayload(ride));
    if (AppState.currentState !== 'active') {
      await ensureOverlayBubbleForBackground();
    }
  } catch (error) {
    console.warn('[overlay] No se pudo actualizar overlay de engagement:', error);
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
    cancelProximitySequence();
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
    clientName: ride.client?.name ?? ride.clientName,
    clientPhone: ride.client?.phone ?? ride.clientPhone,
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
    serviceCode: ride.serviceCode ?? ride.pricingSnapshot?.serviceCode,
    requestedAt: rideRequestedAtMillis(ride.requestedAt ?? ride.createdAt ?? ride.created_at),
    featureCodes: extractRequestedFeatureCodes(ride),
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

export async function getNearbyRides(
  lat: number,
  lng: number,
  thresholdMeters = RIDES_RADIUS_KM * 1000,
  max = 3,
  driverId?: string,
): Promise<ProximityRidePreview[]> {
  const hasAuth = await ensureFirebaseAuthSession();
  if (!hasAuth || !driverId) return [];
  let compatible: (ride: any) => boolean;
  try {
    const db = await getFirebaseFirestore();
    const [profile, vehicle, saved] = await Promise.all([
      getDocFromServer(doc(db, FS_COL.drivers, driverId)),
      getDocFromServer(doc(db, FS_COL.driversLive, driverId, 'vehicles', 'active')),
      driverAvailabilityService.getAvailabilityState(),
    ]);
    const vehicleData = vehicle.data();
    const vehicleType = vehicleData?.vehicleId
      ? resolveSelectedDriverVehicleType({ vehicle: vehicleData })
      : null;
    if (!vehicleType) return [];
    const features: string[] = Array.isArray(profile.data()?.features) ? profile.data()?.features : [];
    const millis = (value: any): number | null =>
      typeof value?.toMillis === 'function' ? value.toMillis() : null;
    const premium = getPremiumStatus(
      millis(vehicleData?.premiumFrom), millis(vehicleData?.premiumGraceFrom),
      millis(vehicleData?.premiumUntil), Date.now(),
    );
    compatible = (ride) => checkRideDriverCompatibility(
      ride, vehicleType, Boolean(saved?.isDesignatedDriverMode),
      features, premium.eligible ? ['premium'] : [],
    ).ok;
  } catch (error) {
    console.warn('[proximity] No se pudo comprobar la compatibilidad:', error);
    return [];
  }

  try {
      const rides = await ridesService.getAvailableRides(lat, lng, NEARBY_RIDES_RADIUS_KM, undefined, true);
      const withDistance = (rides || []).filter((ride: any) => !ride.driverId && compatible(ride))
        .map((r: any) => {
          const preview = toPreview(r);
          const d = haversineMeters(lat, lng, preview.origin.lat, preview.origin.lng);
          return { ...preview, distanceMeters: d } as ProximityRidePreview;
        })
        .sort((a: ProximityRidePreview, b: ProximityRidePreview) => compareRideOrder(
          { ...a, distance: a.distanceMeters }, { ...b, distance: b.distanceMeters },
        ));

      const filtered = withDistance.filter((ride: ProximityRidePreview) => (ride.distanceMeters ?? 999999) <= thresholdMeters);
      const nearby = driverId ? filtered.filter((ride: ProximityRidePreview) => hasPriceChangedForDriver(ride, driverId)).slice(0, max) : filtered.slice(0, max);
      return nearby;
  } catch (e: any) {
    console.warn('[proximity] No se pudo confirmar solicitudes en el servidor.', e?.message || e);
    return [];
  }
}

async function shouldThrottle(minIntervalMs: number): Promise<boolean> {
  const now = Date.now();
  const lastCheck = Number(await AsyncStorage.getItem(STORAGE_KEYS.lastCheckAt)) || 0;
  const suppressionUntil = Number(await AsyncStorage.getItem(STORAGE_KEYS.suppressionUntil)) || 0;
  if (now - lastCheck < minIntervalMs) return true;
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

function navigateToRidePreview(ride: ProximityRidePreview, nearbyRides: ProximityRidePreview[]): boolean {
  const params = { ride, nearbyRides, proximity: true, autoPresented: true } as const;
  if (!navigationRef.isReady()) return false;
  const currentRoute = navigationRef.getCurrentRoute();
  if (!currentRoute || SUPPRESS_AUTO_OPEN_ROUTES.has(currentRoute.name)) {
    return false;
  }
  console.log('🚀 [proximity] Navegando a RidePreview', { rideId: ride.id });
  navigate('RidePreview', params);
  return true;
}

type HandleProximityOptions = {
  appStateOverride?: AppStateStatus;
  sequence?: ProximitySequence;
  routeKey?: string;
};

async function handleLocationForProximity(
  userId: string,
  lat: number,
  lng: number,
  options?: HandleProximityOptions
) {
  if (checkingProximity) {
    if (!options?.sequence && activeSequence?.userId === userId) {
      activeSequence.lat = lat;
      activeSequence.lng = lng;
    }
    return;
  }
  checkingProximity = true;
  const generation = sequenceGeneration;
  try {
    const effectiveAppState = options?.appStateOverride ?? AppState.currentState;
    if (options?.sequence && activeSequence !== options.sequence) return;
    if (!options?.sequence && activeSequence) {
      if (activeSequence.userId !== userId) {
        cancelProximitySequence();
      } else {
        activeSequence.lat = lat;
        activeSequence.lng = lng;
        return;
      }
    }
    console.log('🔍 [proximity] handleLocationForProximity()', {
      userId,
      lat,
      lng,
      appState: effectiveAppState,
      overrideProvided: options?.appStateOverride ? true : false,
      actualAppState: AppState.currentState,
    });
    // Throttle en ambos estados: en foreground el DriverHomeScreen invoca
    // esto en cada fix de GPS (~2.5s) — sin límite eran ~20-24 callable/min.
    const throttleMs = effectiveAppState === 'active' ? FOREGROUND_THROTTLE_MS : THROTTLE_MS;
    if (!options?.sequence && await shouldThrottle(throttleMs)) return;

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
      cancelProximitySequence();
      const fallbackPayload = createIdleOverlayPayload();
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
    const auth = await getFirebaseAuth();
    const db = await getFirebaseFirestore();
    if (auth.currentUser?.uid !== userId) {
      cancelProximitySequence();
      return;
    }
    const liveDriver = await getDocFromServer(doc(db, FS_COL.driversLive, userId));
    if (!['online', 'available'].includes(String(liveDriver.data()?.status ?? '').toLowerCase())) {
      cancelProximitySequence();
      return;
    }
    const nearby = await getNearbyRides(lat, lng, maxNearbyDistanceMeters, Infinity, userId);
    if (options?.sequence && activeSequence !== options.sequence) return;
    const currentAvailability = await driverAvailabilityService.getAvailabilityState();
    const currentAuth = await getFirebaseAuth();
    const currentLiveDriver = await getDocFromServer(doc(db, FS_COL.driversLive, userId));
    const assignedTrips = await getDocsFromServer(query(
      collection(db, FS_COL.tripsLive),
      where('driverId', '==', userId),
      where('status', 'in', ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress', 'driver_offered']),
      limit(1),
    ));
    const hasActiveRide = assignedTrips.docs.length > 0;
    if (generation !== sequenceGeneration || (options?.sequence && activeSequence !== options.sequence)) return;
    if (hasActiveRide || !currentAvailability?.isAvailable || currentAuth.currentUser?.uid !== userId ||
        !['online', 'available'].includes(String(currentLiveDriver.data()?.status ?? '').toLowerCase()) ||
        (options?.sequence && AppState.currentState !== effectiveAppState)) {
      cancelProximitySequence();
      return;
    }
    console.log('🔍 [proximity] nearby rides found:', nearby?.length || 0);

    if (!nearby || nearby.length === 0) {
      cancelProximitySequence();
      console.log('⚠️ [proximity] No hay viajes cercanos');

      // Siempre guardar el estado de reposo para que se muestre al minimizar
      const fallbackPayload = createIdleOverlayPayload();
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
    if (generation !== sequenceGeneration) return;
    const filterNow = Date.now();
    const availableRides = nearby.filter((ride) => {
      if (options?.sequence?.shown.has(ride.id)) return false;
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
    }).slice(0, 3);
    console.log('🔍 [proximity] availableRides after filter:', availableRides.length);

    if (availableRides.length === 0) {
      cancelProximitySequence();
      console.log('⚠️ [proximity] Todas las solicitudes disponibles fueron rechazadas recientemente.');

      // Siempre guardar el estado de reposo para que se muestre al minimizar
      const fallbackPayload = createIdleOverlayPayload();
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
    if (effectiveAppState === 'active') {
      const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : null;
      if (!route || SUPPRESS_AUTO_OPEN_ROUTES.has(route.name) ||
          (options?.routeKey && route.key !== options.routeKey)) {
        cancelProximitySequence();
        return;
      }
    }
    if (!activeSequence) activeSequence = { userId, lat, lng, shown: new Set(), timer: null };
    activeSequence.shown.add(closest.id);
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
          cancelProximitySequence();
          return;
        }
      } catch {
        // noop
      }
      if (generation !== sequenceGeneration) return;
      // La siguiente vista se reconfirma después de cerrar esta.
      if (!navigateToRidePreview(closest, rest)) {
        cancelProximitySequence();
        return;
      }
      await AsyncStorage.setItem(STORAGE_KEYS.lastRideId, closest.id);
      await AsyncStorage.setItem(STORAGE_KEYS.lastShownAt, String(Date.now()));

      // Guardar payload del viaje actual para cuando la app se minimice.
      // Si es el mismo viaje se conserva shownAt; si la
      // ventana de glance ya expiró se guarda fallback (la oferta fue efímera).
      const prevPayload = await loadOverlayPayload();
      const offerShownAt =
        prevPayload?.variant === 'nearby_ride' && prevPayload.rideId === closest.id
          ? prevPayload.shownAt ?? Date.now()
          : Date.now();
      const overlayPayload: OverlayPayload = {
        rideId: closest.id,
        price: closestPrice,
        distanceKm: Math.max(0.1, Number.isFinite(closestDistanceKm) ? closestDistanceKm : 0.1),
        clientName: clientDisplayName,
        featureCodes: closest.featureCodes ?? [],
        variant: 'nearby_ride',
        shownAt: offerShownAt,
      };
      if (isOverlayOfferStale(overlayPayload)) {
        await saveOverlayPayload(createIdleOverlayPayload());
      } else {
        await saveOverlayPayload(overlayPayload);
        scheduleOverlayOfferRevert(closest.id, offerShownAt);
      }

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
      if (generation !== sequenceGeneration) return;
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
      if (generation !== sequenceGeneration) return;

      await AsyncStorage.setItem(STORAGE_KEYS.lastRideId, closest.id);

      const prevPayload = await loadOverlayPayload();
      const offerShownAt =
        prevPayload?.variant === 'nearby_ride' && prevPayload.rideId === closest.id
          ? prevPayload.shownAt ?? Date.now()
          : Date.now();
      const overlayPayload: OverlayPayload = {
        rideId: closest.id,
        price: closestPrice,
        distanceKm: Math.max(0.1, Number.isFinite(closestDistanceKm) ? closestDistanceKm : 0.1),
        clientName: clientDisplayName,
        featureCodes: closest.featureCodes ?? [],
        variant: 'nearby_ride',
        shownAt: offerShownAt,
      };
      const offerExpired = isOverlayOfferStale(overlayPayload);
      await saveOverlayPayload(offerExpired ? createIdleOverlayPayload() : overlayPayload);
      console.log('💾 [proximity] Overlay payload guardado:', overlayPayload, { offerExpired });

      // 2. Overlay (si está habilitado)
      if (overlayEnabled) {
        console.log('🫧 [proximity] Overlay habilitado - Verificando permiso...');
        const hasPermission = await overlayManager.hasPermission();
        console.log(`🫧 [proximity] hasPermission: ${hasPermission}`);

        if (hasPermission) {
          // Si la oferta ya expiró, mostrar el estado de reposo
          // (engagement si hay viaje comprometido; fallback si no).
          const fallbackPayload = createIdleOverlayPayload();
          const overlayData = offerExpired
            ? {
                rideId: fallbackPayload.rideId,
                price: fallbackPayload.price,
                distanceKm: fallbackPayload.distanceKm,
                clientName: fallbackPayload.clientName ?? null,
                variant: 'app' as const,
              }
            : {
                rideId: closest.id,
                price: closestPrice,
                distanceKm: Math.max(0.1, Number.isFinite(closestDistanceKm) ? closestDistanceKm : 0),
                clientName: clientDisplayName,
                featureCodes: closest.featureCodes ?? [],
                variant: 'nearby_ride' as const,
              };
          console.log('🫧 [proximity] Llamando a overlayManager.showRideOverlay con:', overlayData);
          console.log('🫧 [proximity] overlayManager object:', overlayManager);
          console.log('🫧 [proximity] showRideOverlay function:', typeof overlayManager.showRideOverlay);

          try {
            console.log('🫧 [proximity] ANTES de await overlayManager.showRideOverlay()');
            const result = await overlayManager.showRideOverlay(overlayData);
            console.log('✅ [proximity] overlayManager.showRideOverlay() completado con result:', result);
            if (!offerExpired) {
              scheduleOverlayOfferRevert(closest.id, offerShownAt);
            } else {
              scheduleNextProximityRide(closest.id);
            }
          } catch (error) {
            cancelProximitySequence();
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
          cancelProximitySequence();
        }
      } else {
        console.log('ℹ️ [proximity] Overlay deshabilitado en preferencias');
        cancelProximitySequence();
      }
      // FCM desde backend está deshabilitado para evitar duplicados
      // La notificación local administrada es suficiente
    }

    await markCheck(effectiveAppState !== 'active');
  } catch (e) {
    // No romper la tarea de background
    cancelProximitySequence();
    await markCheck(false);
  } finally {
    checkingProximity = false;
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
  const expiredRideId = payload?.variant === 'nearby_ride' && isOverlayOfferStale(payload) ? payload.rideId : null;
  console.log('🫧 [overlay] Payload cargado:', payload);
  
  if (!payload || isOverlayOfferStale(payload)) {
    console.log('🫧 [overlay] No hay payload vigente, usando estado de reposo...');
    payload = createIdleOverlayPayload();
    console.log('🫧 [overlay] Payload de reposo creado:', payload);
  }
  if (payload.variant === 'nearby_ride') {
    try {
      const auth = await getFirebaseAuth();
      const uid = auth.currentUser?.uid;
      const availability = await driverAvailabilityService.getAvailabilityState();
      const coords = availability?.coords;
      if (!uid || !availability?.isAvailable || !coords) {
        payload = createIdleOverlayPayload();
      } else {
        const db = await getFirebaseFirestore();
        const driver = await getDocFromServer(doc(db, FS_COL.driversLive, uid));
        const eligible = ['online', 'available'].includes(String(driver.data()?.status ?? '').toLowerCase())
          ? await getNearbyRides(coords.latitude, coords.longitude, NEARBY_RIDES_RADIUS_KM * 1000, Infinity, uid)
          : [];
        const confirmed = eligible.find((ride) => ride.id === payload?.rideId);
        if (!confirmed || isOverlayOfferStale(payload)) {
          payload = createIdleOverlayPayload();
          cancelProximitySequence();
        } else {
          payload = { ...payload, featureCodes: confirmed.featureCodes ?? [] };
        }
      }
    } catch {
      payload = createIdleOverlayPayload();
      cancelProximitySequence();
    }
  }
  // Engagement: el listener pudo estar suspendido en background — verificar
  // contra el doc de oferta que la negociación/viaje siga vigente.
  if (payload.engagement) {
    try {
      if (!(await isEngagementPayloadValid(payload))) {
        currentEngagementRide = null;
        payload = createFallbackOverlayPayload();
      }
    } catch {
      payload = createFallbackOverlayPayload();
    }
  }

  try {
    console.log('🫧 [overlay] Step 4: Mostrando overlay con payload:', JSON.stringify(payload));
    await overlayManager.showRideOverlay({
      rideId: payload.rideId,
      price: payload.price,
      distanceKm: Math.max(0.1, payload.distanceKm),
      clientName: payload.clientName ?? null,
      featureCodes: payload.featureCodes,
      variant: payload.variant ?? 'app',
    });
    console.log('🫧 [overlay] Step 5: Overlay mostrado exitosamente, guardando payload...');
    await saveOverlayPayload(payload);
    if (expiredRideId && AppState.currentState !== 'active') scheduleNextProximityRide(expiredRideId);
    if (payload.variant === 'nearby_ride' && payload.shownAt) {
      scheduleOverlayOfferRevert(payload.rideId, payload.shownAt);
    }
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
// Razones "soft": en iOS no se termina la Live Activity (una vez finalizada no
// se puede recrear desde background — Activity.request exige foreground).
// En su lugar se actualiza al estado fallback "Listo para nuevos viajes".
const IOS_SOFT_HIDE_REASONS = new Set([
  'noNearbyRides',
  'allRidesDismissed',
  'foregroundRideNavigation',
  'appReturnedToForeground',
  'driverOffline',
]);

async function hideOverlayBubble(reason: string = 'unspecified') {
  try {
    if (reason === 'acceptedRide' || reason === 'driverOffline') cancelProximitySequence();
    console.log('🫧 [overlay] hideOverlayBubble reason:', reason);

    if (
      Platform.OS === 'ios' &&
      IOS_SOFT_HIDE_REASONS.has(reason) &&
      (await getOverlayEnabled())
    ) {
      const saved = await loadOverlayPayload();
      const payload = sanitizeOverlayPayload(
        !saved || isOverlayOfferStale(saved) ? createIdleOverlayPayload() : saved,
      );
      await overlayManager.showRideOverlay({
        rideId: payload.rideId,
        price: payload.price,
        distanceKm: payload.distanceKm,
        clientName: payload.clientName,
        featureCodes: payload.featureCodes,
        variant: payload.variant ?? 'app',
      });
      await saveOverlayPayload(payload);
      return;
    }

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
  setEngagementOverlay,
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
  scheduleNextProximityRide,
  cancelProximitySequence,
};

// Default export to preserve existing default imports across the app
const proximityService = {
  handleLocationForProximity,
  markRideDismissed,
  markRideAutoDismissed,
  getOverlayEnabled,
  setOverlayEnabled,
  setEngagementOverlay,
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
  scheduleNextProximityRide,
  cancelProximitySequence,
};

export default proximityService;
