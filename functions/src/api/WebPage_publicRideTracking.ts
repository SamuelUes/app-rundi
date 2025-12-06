import * as functions from 'firebase-functions';
import admin from '../config/firebase';
import { regionConfig, DEFAULT_REGION } from '../config/functions-config';
import { calculateRideProgress } from '../utils/rideProgressUtils';

interface PublicRideLocation {
  latitude: number;
  longitude: number;
  [key: string]: any;
}

interface PublicRideTrackingRide {
  rideId: string;
  source: 'active' | 'completed';
  status: string | null;
  serviceType: string | null;
  origin: any | null;
  destination: any | null;
  extraDestination: any | null;
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

    try {
      const rideIdRaw =
        (req.method === 'GET' ? (req.query.rideId as string | undefined) : req.body?.rideId) ?? null;
      const rideId = (rideIdRaw || '').trim();

      if (!rideId) {
        res.status(400).json({
          success: false,
          error: 'rideId es requerido',
          code: 'invalid-argument',
        } as PublicRideTrackingResponse);
        return;
      }

      const db = admin.database();

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

      const status: string | null = (rideData.status as string | undefined) ?? null;
      const serviceType: string | null =
        (rideData.serviceType as string | undefined) || (rideData.service_type as string | undefined) || null;

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
      const finalDestination =
        rideData.finalDestination ||
        rideData.final_destination ||
        pick(rideData, ['finalDestinationLat', 'finalDestinationLng']);

      let vehicleLocation: PublicRideLocation | null = sanitizeLocation(rideData.driverLocation);

      if (!vehicleLocation && source === 'active') {
        try {
          const trackingSnap = await db.ref(`activeRides/${rideId}/tracking`).limitToLast(1).once('value');
          const trackingVal = trackingSnap.val();
          if (trackingVal && typeof trackingVal === 'object') {
            const lastPoint = Object.values(trackingVal)[Object.values(trackingVal).length - 1] as any;
            vehicleLocation = sanitizeLocation(lastPoint);
          }
        } catch (trackingError) {
          console.warn('⚠️ [getPublicRideTracking] Error obteniendo último punto de tracking:', trackingError);
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

      const driverId: string | null = extractDriverId(rideData);

      let driverInfo: any | null = null;

      if (driverId) {
        try {
          const driverSnap = await db.ref(`driversInfo/${driverId}`).once('value');
          const rawDriver = driverSnap.val();
          if (rawDriver && typeof rawDriver === 'object') {
            driverInfo = pick(rawDriver, [
              'vehicleType',
              'vehicle_type',
              'currentVehicle',
              'activeVehicle',
              'vehicle',
              'vehicles',
              'active_vehicle',
            ]);
          }
        } catch (driverError) {
          console.warn('⚠️ [getPublicRideTracking] Error obteniendo driversInfo:', driverError);
        }
      }

      let progress: number | null = null;
      let hasTracking = false;

      if (source === 'active' && typeof estimatedDistance === 'number' && estimatedDistance > 0) {
        try {
          const computedProgress = await calculateRideProgress(rideId, estimatedDistance);
          if (Number.isFinite(computedProgress)) {
            progress = Math.min(Math.max(computedProgress, 0), 100);
            hasTracking = true;
          }
        } catch (progressError) {
          console.warn('⚠️ [getPublicRideTracking] Error calculando progreso:', progressError);
        }
      }

      const vehicleHeading: number | null =
        typeof rideData.driverHeading === 'number'
          ? rideData.driverHeading
          : typeof rideData.heading === 'number'
          ? rideData.heading
          : null;

      const ride: PublicRideTrackingRide = {
        rideId,
        source,
        status,
        serviceType,
        origin: origin ?? null,
        destination: destination ?? null,
        extraDestination: extraDestination ?? null,
        finalDestination: finalDestination ?? null,
        vehicleLocation,
        driverId,
        driverInfo,
        vehicleHeading,
        estimatedDistance,
        estimatedDuration,
        estimatedPrice,
        progress,
        hasTracking,
      };

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
