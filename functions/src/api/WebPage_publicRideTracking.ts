import * as functions from 'firebase-functions/v1';
import admin from '../config/firebase';
import { regionConfig, DEFAULT_REGION } from '../config/functions-config';
import { DEFAULT_SERVICE_AREA_ID } from '../config/constants';
import { calculateRideProgress } from '../utils/rideProgressUtils';
import { checkRateLimit } from '../utils/rateLimiter';

interface PublicRideLocation {
  latitude: number;
  longitude: number;
  [key: string]: any;
}

interface PublicRideTrackingRide {
  rideId: string | null;
  source: 'active' | 'completed';
  status: string | null;
  serviceType: string | null;
  vehicleType: string | null;
  origin: any | null;
  destination: any | null;
  extraDestination: any | null;
  extraDestinations: any[] | null;
  finalDestination: any | null;
  vehicleLocation: PublicRideLocation | null;
  driverId: string | null;
  driverInfo: any | null;
  vehicleHeading: number | null;
  estimatedDistance: number | null;
  estimatedDuration: number | null;
  estimatedPrice: number | null;
  progress: number | null;
  hasTracking: boolean;
}

interface PublicRideTrackingResponse {
  success: boolean;
  ride?: PublicRideTrackingRide;
  error?: string;
  code?: string;
}

function sanitizeLocation(raw: any | null | undefined): PublicRideLocation | null {
  if (!raw) return null;

  const lat = typeof raw.latitude === 'number' ? raw.latitude : raw.lat;
  const lng = typeof raw.longitude === 'number' ? raw.longitude : raw.lng;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return {
    latitude: lat,
    longitude: lng,
  };
}

function pick<T = any>(obj: any, keys: string[]): T | null {
  if (!obj || typeof obj !== 'object') return null;
  const result: any = {};
  let hasAny = false;

  for (const key of keys) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
      hasAny = true;
    }
  }

  return hasAny ? (result as T) : null;
}

function extractDriverId(rideData: any): string | null {
  if (!rideData || typeof rideData !== 'object') return null;

  const candidates: Array<string | null | undefined> = [
    rideData.driverId,
    rideData.driver_id,
    rideData.driverUID,
    rideData.driverUid,
    rideData.driverUuid,
    rideData.driver?.id,
    rideData.driver?.uid,
    rideData.driver?.uuid,
    rideData.currentDriverId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

// Cachés en memoria por instancia caliente: el trigger espejo llama al
// builder en cada escritura de driverLocation (cada pocos segundos), y ni
// driverInfo ni el progreso cambian tan rápido.
const DRIVER_INFO_TTL_MS = 5 * 60 * 1000;
const PROGRESS_TTL_MS = 15 * 1000;
const driverInfoCache = new Map<string, { at: number; value: any | null }>();
const progressCache = new Map<string, { at: number; progress: number | null; hasTracking: boolean }>();

async function getDriverInfoCached(db: admin.database.Database, driverId: string): Promise<any | null> {
  const hit = driverInfoCache.get(driverId);
  if (hit && Date.now() - hit.at < DRIVER_INFO_TTL_MS) return hit.value;
  let value: any | null = null;
  try {
    const driverSnap = await db.ref(`driversInfo/${driverId}`).once('value');
    const rawDriver = driverSnap.val();
    if (rawDriver && typeof rawDriver === 'object') {
      value = pick(rawDriver, [
        'name',
        'fullName',
        'displayName',
        'firstName',
        'lastName',
        'phone',
        'phoneNumber',
        'phone_number',
        'mobile',
        'photoURL',
        'photoUrl',
        'profilePhoto',
        'profile_photo',
        'avatarUrl',
        'avatar',
        'imageUrl',
        'rating',
        'average_rating',
        'stars',
        'score',
        'vehicleType',
        'vehicle_type',
        'currentVehicle',
        'activeVehicle',
        'vehicle',
        'vehicleInfo',
        'vehicles',
        'active_vehicle',
      ]);
    }
  } catch (driverError) {
    console.warn('⚠️ [publicRideTracking] Error obteniendo driversInfo:', driverError);
  }
  driverInfoCache.set(driverId, { at: Date.now(), value });
  return value;
}

async function getProgressCached(
  rideId: string,
  estimatedDistance: number,
): Promise<{ progress: number | null; hasTracking: boolean }> {
  const hit = progressCache.get(rideId);
  if (hit && Date.now() - hit.at < PROGRESS_TTL_MS) {
    return { progress: hit.progress, hasTracking: hit.hasTracking };
  }
  let progress: number | null = null;
  let hasTracking = false;
  try {
    const computedProgress = await calculateRideProgress(rideId, estimatedDistance);
    if (Number.isFinite(computedProgress)) {
      progress = Math.min(Math.max(computedProgress, 0), 100);
      hasTracking = true;
    }
  } catch (progressError) {
    console.warn('⚠️ [publicRideTracking] Error calculando progreso:', progressError);
  }
  progressCache.set(rideId, { at: Date.now(), progress, hasTracking });
  return { progress, hasTracking };
}

/**
 * Construye la proyección pública y saneada de un viaje. La comparten el
 * endpoint HTTP y el espejo RTDB `publicTracking/{code}`: cualquier cambio en
 * `activeRides` se refleja casi en tiempo real para quien tenga el código.
 * `resolvedViaCode` oculta identificadores internos (rideId/driverId).
 */
export async function buildPublicTrackingRide(
  db: admin.database.Database,
  rideId: string,
  rideData: any,
  source: 'active' | 'completed',
  resolvedViaCode: boolean,
): Promise<PublicRideTrackingRide> {
  const status: string | null = (rideData.status as string | undefined) ?? null;
  const serviceType: string | null =
    (rideData.serviceType as string | undefined) || (rideData.service_type as string | undefined) || null;
  // 'auto' | 'moto' | 'designated_driver' — el tipo real del viaje.
  // En designated_driver el icono debe reflejar el vehículo del cliente
  // (designatedDriverVehicle: 'auto' | 'moto' | 'motorcycle').
  let vehicleType: string | null =
    (rideData.vehicleType as string | undefined) ||
    (rideData.vehicle_type as string | undefined) ||
    null;
  if (vehicleType === 'designated_driver') {
    vehicleType =
      (rideData.designatedDriverVehicle as string | undefined) ||
      (rideData.designated_driver_vehicle as string | undefined) ||
      vehicleType;
  }
  vehicleType = vehicleType || (rideData.rideType as string | undefined) || null;

  const origin =
    rideData.origin || rideData.originLocation || rideData.pickup || pick(rideData, ['originLat', 'originLng']);
  const destination =
    rideData.destination ||
    rideData.destinationLocation ||
    rideData.dropoff ||
    pick(rideData, ['destinationLat', 'destinationLng']);
  const extraDestination =
    rideData.extraDestination ||
    rideData.extra_destination ||
    pick(rideData, ['extraDestinationLat', 'extraDestinationLng']);

  // Los viajes con paradas guardan un array `extraDestinations`
  // ([{lat,lng,address}]); normalizamos a {latitude, longitude, address}.
  const rawStops =
    rideData.extraDestinations ??
    rideData.extra_destinations ??
    (Array.isArray(extraDestination) ? extraDestination : null) ??
    (extraDestination && typeof extraDestination === 'object' &&
    !('latitude' in extraDestination) &&
    !('lat' in extraDestination) &&
    !('longitude' in extraDestination) &&
    !('lng' in extraDestination)
      ? Object.values(extraDestination)
      : null);
  const extraDestinations: any[] | null = Array.isArray(rawStops)
    ? rawStops
        .map((stop: any) => {
          const lat = typeof stop?.latitude === 'number' ? stop.latitude : stop?.lat;
          const lng = typeof stop?.longitude === 'number' ? stop.longitude : stop?.lng;
          if (typeof lat !== 'number' || typeof lng !== 'number') return null;
          return {
            latitude: lat,
            longitude: lng,
            ...(typeof stop?.address === 'string' && stop.address.trim()
              ? { address: stop.address }
              : {}),
            ...(typeof stop?.title === 'string' && stop.title.trim()
              ? { title: stop.title }
              : {}),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
    : null;
  const finalDestination =
    rideData.finalDestination ||
    rideData.final_destination ||
    pick(rideData, ['finalDestinationLat', 'finalDestinationLng']);

  const driverId: string | null = extractDriverId(rideData);

  // La app nueva escribe la posición por viaje en activeRides/{rideId}/driverLocation
  // ({latitude, longitude, heading, ...}); builds viejas solo actualizan el
  // shard global driverLocations{,ByArea}/{driverId} con {lat, lng, heading}.
  let vehicleLocation: PublicRideLocation | null = sanitizeLocation(rideData.driverLocation);
  let vehicleHeading: number | null =
    typeof rideData.driverLocation?.heading === 'number'
      ? rideData.driverLocation.heading
      : typeof rideData.driverHeading === 'number'
      ? rideData.driverHeading
      : typeof rideData.heading === 'number'
      ? rideData.heading
      : null;

  if (!vehicleLocation && source === 'active') {
    try {
      const trackingSnap = await db.ref(`activeRides/${rideId}/tracking`).limitToLast(1).once('value');
      const trackingVal = trackingSnap.val();
      if (trackingVal && typeof trackingVal === 'object') {
        const lastPoint = Object.values(trackingVal)[Object.values(trackingVal).length - 1] as any;
        vehicleLocation = sanitizeLocation(lastPoint);
        if (vehicleHeading === null && typeof lastPoint?.heading === 'number') {
          vehicleHeading = lastPoint.heading;
        }
      }
    } catch (trackingError) {
      console.warn('⚠️ [publicRideTracking] Error obteniendo último punto de tracking:', trackingError);
    }
  }

  if (!vehicleLocation && source === 'active' && driverId) {
    try {
      const areaId =
        typeof rideData.serviceAreaId === 'string' && rideData.serviceAreaId.trim()
          ? rideData.serviceAreaId.trim()
          : DEFAULT_SERVICE_AREA_ID;
      let loc: any = (
        await db.ref(`driverLocationsByArea/${areaId}/${driverId}`).once('value')
      ).val();
      if (!loc) {
        loc = (await db.ref(`driverLocations/${driverId}`).once('value')).val();
      }
      vehicleLocation = sanitizeLocation(loc);
      if (vehicleHeading === null && typeof loc?.heading === 'number') {
        vehicleHeading = loc.heading;
      }
    } catch (locError) {
      console.warn('⚠️ [publicRideTracking] Error obteniendo driverLocations:', locError);
    }
  }

  const estimatedDistance: number | null =
    typeof rideData.estimatedDistance === 'number'
      ? rideData.estimatedDistance
      : typeof rideData.distance === 'number'
      ? rideData.distance
      : null;

  const estimatedDuration: number | null =
    typeof rideData.estimatedDuration === 'number'
      ? rideData.estimatedDuration
      : typeof rideData.duration === 'number'
      ? rideData.duration
      : null;

  const estimatedPrice: number | null =
    typeof rideData.estimatedPrice === 'number'
      ? rideData.estimatedPrice
      : typeof rideData.finalFare === 'number'
      ? rideData.finalFare
      : typeof rideData.fare === 'number'
      ? rideData.fare
      : null;

  const driverInfo = driverId ? await getDriverInfoCached(db, driverId) : null;

  let progress: number | null = null;
  let hasTracking = false;

  if (source === 'active' && typeof estimatedDistance === 'number' && estimatedDistance > 0) {
    const computed = await getProgressCached(rideId, estimatedDistance);
    progress = computed.progress;
    hasTracking = computed.hasTracking;
  }

  return {
    // Con acceso por código no devolvemos identificadores internos: así un
    // código compartido no puede convertirse en acceso permanente por rideId.
    rideId: resolvedViaCode ? null : rideId,
    source,
    status,
    serviceType,
    vehicleType,
    origin: origin ?? null,
    destination: destination ?? null,
    extraDestination: extraDestination ?? null,
    extraDestinations: extraDestinations && extraDestinations.length > 0 ? extraDestinations : null,
    finalDestination: finalDestination ?? null,
    vehicleLocation,
    driverId: resolvedViaCode ? null : driverId,
    driverInfo,
    vehicleHeading,
    estimatedDistance,
    estimatedDuration,
    estimatedPrice,
    progress,
    hasTracking,
  };
}

export const getPublicRideTracking = functions
  .region(DEFAULT_REGION)
  .runWith(regionConfig)
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Método no permitido', code: 'method-not-allowed' });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const rateLimit = checkRateLimit(`tracking:${clientIp}`, 60);
    if (!rateLimit.allowed) {
      res.status(429).json({ success: false, error: 'Too many requests', retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) });
      return;
    }

    try {
      const rideIdRaw =
        (req.method === 'GET' ? (req.query.rideId as string | undefined) : req.body?.rideId) ?? null;
      const codeRaw =
        (req.method === 'GET' ? (req.query.code as string | undefined) : req.body?.code) ?? null;
      const code = (codeRaw || '').toString().trim().toUpperCase();

      let rideId = (rideIdRaw || '').trim();
      let resolvedViaCode = false;

      const db = admin.database();

      // Acceso por código de compartición (preferido): el código es una
      // capability expirable que resuelve internamente el rideId — el
      // identificador real no se expone ni se devuelve en la respuesta.
      if (!rideId && code) {
        const codeSnapshot = await db.ref(`rideTrackingCodes/${code}`).once('value');
        const entry = codeSnapshot.val();

        if (!entry || typeof entry.rideId !== 'string') {
          res.status(404).json({
            success: false,
            error: 'Código de seguimiento inválido',
            code: 'invalid-code',
          } as PublicRideTrackingResponse);
          return;
        }

        if (typeof entry.expiresAt === 'number' && entry.expiresAt < Date.now()) {
          res.status(410).json({
            success: false,
            error: 'El código de seguimiento expiró',
            code: 'code-expired',
          } as PublicRideTrackingResponse);
          return;
        }

        rideId = entry.rideId;
        resolvedViaCode = true;
      }

      if (!rideId) {
        res.status(400).json({
          success: false,
          error: 'rideId o code es requerido',
          code: 'invalid-argument',
        } as PublicRideTrackingResponse);
        return;
      }


      let source: 'active' | 'completed' = 'active';
      let rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
      let rideData: any = rideSnapshot.val();

      if (!rideData) {
        source = 'completed';
        rideSnapshot = await db.ref(`completedRides/${rideId}`).once('value');
        rideData = rideSnapshot.val();
      }

      if (!rideData) {
        res.status(404).json({
          success: false,
          error: 'Viaje no encontrado',
          code: 'not-found',
        } as PublicRideTrackingResponse);
        return;
      }

      const ride = await buildPublicTrackingRide(db, rideId, rideData, source, resolvedViaCode);

      const response: PublicRideTrackingResponse = {
        success: true,
        ride,
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error('❌ [getPublicRideTracking] Error inesperado:', error);

      const message = typeof error?.message === 'string' ? error.message : 'Error interno obteniendo tracking público';

      const response: PublicRideTrackingResponse = {
        success: false,
        error: message,
        code: 'internal',
      };

      res.status(500).json(response);
    }
  });
