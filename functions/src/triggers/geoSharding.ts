import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

import { DEFAULT_SERVICE_AREA_ID } from '../config/constants';

const db = admin.database();

type ServiceAreaPoint = {
  lat: number;
  lng: number;
};

interface ServiceAreaDoc {
  id: string;
  active?: boolean;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  points?: ServiceAreaPoint[];
}

const DEFAULT_MANAGUA_POLYGON: ServiceAreaPoint[] = [
  { lat: 12.2, lng: -86.35 },
  { lat: 12.2, lng: -86.15 },
  { lat: 12.05, lng: -86.15 },
  { lat: 12.05, lng: -86.35 },
  { lat: 12.2, lng: -86.35 },
];

const SERVICE_AREAS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedServiceAreas: ServiceAreaDoc[] | null = null;
let serviceAreasFetchedAt = 0;

function isFiniteNumber(value: any): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePolygon(points: unknown): ServiceAreaPoint[] | undefined {
  if (!Array.isArray(points)) {
    return undefined;
  }

  const normalized: ServiceAreaPoint[] = [];
  for (const rawPoint of points) {
    const lat = toFiniteNumber((rawPoint as any)?.lat);
    const lng = toFiniteNumber((rawPoint as any)?.lng);
    if (lat == null || lng == null) {
      continue;
    }
    normalized.push({ lat, lng });
  }

  if (normalized.length < 3) {
    return undefined;
  }

  return normalized;
}

function hasValidPolygon(points?: ServiceAreaPoint[]): points is ServiceAreaPoint[] {
  return Array.isArray(points) && points.length >= 3;
}

function isPointInPolygon(lat: number, lng: number, polygon: ServiceAreaPoint[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > lat !== yj > lat &&
      lng <
        ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isValidCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPointInServiceArea(lat: number, lng: number, area: ServiceAreaDoc): boolean {
  if (hasValidPolygon(area.points)) {
    return isPointInPolygon(lat, lng, area.points);
  }

  if (
    isValidCoordinate(area.centerLat) &&
    isValidCoordinate(area.centerLng) &&
    isValidCoordinate(area.radiusKm)
  ) {
    const R = 6371; // km
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat - (area.centerLat as number));
    const dLon = toRad(lng - (area.centerLng as number));
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const a =
      sinLat * sinLat +
      Math.cos(toRad(area.centerLat as number)) *
        Math.cos(toRad(lat)) *
        sinLon * sinLon;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    return distanceKm <= (area.radiusKm ?? 0);
  }

  return false;
}

function isInDefaultManagua(lat: number, lng: number): boolean {
  return isPointInPolygon(lat, lng, DEFAULT_MANAGUA_POLYGON);
}

async function loadServiceAreas(): Promise<ServiceAreaDoc[]> {
  const now = Date.now();
  if (cachedServiceAreas && now - serviceAreasFetchedAt < SERVICE_AREAS_CACHE_TTL_MS) {
    return cachedServiceAreas;
  }

  try {
    const snapshot = await admin
      .firestore()
      .collection('service_areas')
      .where('active', '==', true)
      .get();

    const areas: ServiceAreaDoc[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Partial<ServiceAreaDoc>;
      return {
        id: doc.id,
        active: data.active,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        radiusKm: data.radiusKm,
        points: normalizePolygon((data as any)?.points),
      };
    });

    cachedServiceAreas = areas;
    serviceAreasFetchedAt = now;
    return cachedServiceAreas;
  } catch (error) {
    console.warn('[geoSharding] Error cargando service_areas:', error);
  }

  cachedServiceAreas = [];
  serviceAreasFetchedAt = now;
  return cachedServiceAreas;
}

async function deriveServiceAreaIdFromCoords(latRaw: any, lngRaw: any): Promise<string | null> {
  const lat = typeof latRaw === 'string' ? Number(latRaw) : latRaw;
  const lng = typeof lngRaw === 'string' ? Number(lngRaw) : lngRaw;

  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return null;
  }

  const areas = await loadServiceAreas();
  for (const area of areas) {
    if (isPointInServiceArea(lat, lng, area)) {
      return area.id;
    }
  }

  if (isInDefaultManagua(lat, lng)) {
    return DEFAULT_SERVICE_AREA_ID;
  }

  return null;
}

export const syncActiveRidesByArea = functions.database
  .ref('activeRides/{rideId}')
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId as string;
    const after = change.after.val();
    const before = change.before.val();

    const rideData = after || before;
    if (!rideData) {
      return null;
    }

    const origin = rideData.origin || {};
    const originLat = origin.lat ?? origin.latitude ?? rideData.originLat;
    const originLng = origin.lng ?? origin.longitude ?? rideData.originLng;

    const serviceAreaId = await deriveServiceAreaIdFromCoords(originLat, originLng);

    if (!serviceAreaId) {
      // Si no podemos determinar un área, no shardear (queda solo en activeRides)
      return null;
    }

    const shardRef = db.ref(`activeRidesByArea/${serviceAreaId}/${rideId}`);

    if (!after) {
      // Eliminación: limpiar nodo shard
      await shardRef.remove();
      return null;
    }

    // El shard es legible por cualquier usuario autenticado (drivers haciendo
    // discovery): solo exponer lo que la card de disponibles necesita.
    // NO copiar clientPhone, offers, driver/driverLocation, negotiation ni
    // payment — el conductor los obtiene de activeRides/{id} tras aceptar.
    // driverId sí se incluye: el conductor asignado lo necesita para detectar
    // que un viaje promovido/aceptado es suyo (activeRideGuard).
    const payload = {
      id: after.id ?? rideId,
      clientId: after.clientId ?? null,
      driverId: after.driverId ?? null,
      status: after.status ?? null,
      origin: after.origin ?? null,
      destination: after.destination ?? null,
      extraDestinations: after.extraDestinations ?? null,
      estimatedPrice: after.estimatedPrice ?? null,
      estimatedDistance: after.estimatedDistance ?? null,
      estimatedDuration: after.estimatedDuration ?? null,
      clientSuggestedPrice: after.clientSuggestedPrice ?? null,
      dynamicMinimumFare: Number.isFinite(after.pricingSnapshot?.dynamicMinimumFare)
        ? after.pricingSnapshot.dynamicMinimumFare
        : null,
      clientName: after.clientName ?? null,
      clientRating: after.clientRating ?? null,
      clientTotalRatings: after.clientTotalRatings ?? null,
      clientComment: after.clientComment ?? null,
      clientVehiclePhoto: after.clientVehiclePhoto ?? null,
      designatedDriverVehicle: after.designatedDriverVehicle ?? null,
      rideType: after.rideType ?? null,
      vehicleType: after.vehicleType ?? null,
      serviceCode: after.pricingSnapshot?.serviceCode ?? after.serviceCode ?? null,
      featureCodes: Array.isArray(after.featureCodes) ? after.featureCodes : [],
      passengers: after.passengers ?? null,
      paymentMethod: after.paymentMethod ?? null,
      serviceId: after.serviceId ?? null,
      hasMultipleDestinations: after.hasMultipleDestinations ?? null,
      waypointsCount: after.waypointsCount ?? null,
      requestedAt: after.requestedAt ?? null,
      createdAt: after.createdAt ?? null,
      updatedAt: after.updatedAt ?? null,
      serviceAreaId,
    };

    await shardRef.set(payload);
    return null;
  });

export const syncProgrammedRidesByArea = functions.database
  .ref('programmedRides/{rideId}')
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId as string;
    const after = change.after.val();
    const before = change.before.val();

    const rideData = after || before;
    if (!rideData) {
      return null;
    }

    const origin = rideData.origin || {};
    const originLat = origin.lat ?? origin.latitude ?? rideData.originLat;
    const originLng = origin.lng ?? origin.longitude ?? rideData.originLng;

    const serviceAreaId = await deriveServiceAreaIdFromCoords(originLat, originLng);

    if (!serviceAreaId) {
      return null;
    }

    const shardRef = db.ref(`programmedRidesByArea/${serviceAreaId}/${rideId}`);

    if (!after) {
      await shardRef.remove();
      return null;
    }

    // Mismo criterio que activeRidesByArea: sin clientPhone ni datos del
    // conductor — legible por cualquier usuario autenticado.
    const payload = {
      id: after.id ?? rideId,
      clientId: after.clientId ?? null,
      status: after.status ?? null,
      isProgrammed: true,
      scheduledAt: after.scheduledAt ?? null,
      origin: after.origin ?? null,
      destination: after.destination ?? null,
      extraDestinations: after.extraDestinations ?? null,
      estimatedPrice: after.estimatedPrice ?? null,
      estimatedDistance: after.estimatedDistance ?? null,
      estimatedDuration: after.estimatedDuration ?? null,
      clientSuggestedPrice: after.clientSuggestedPrice ?? null,
      clientName: after.clientName ?? null,
      clientRating: after.clientRating ?? null,
      clientTotalRatings: after.clientTotalRatings ?? null,
      clientComment: after.clientComment ?? null,
      clientVehiclePhoto: after.clientVehiclePhoto ?? null,
      designatedDriverVehicle: after.designatedDriverVehicle ?? null,
      rideType: after.rideType ?? null,
      vehicleType: after.vehicleType ?? null,
      passengers: after.passengers ?? null,
      paymentMethod: after.paymentMethod ?? null,
      serviceId: after.serviceId ?? null,
      serviceCode: after.pricingSnapshot?.serviceCode ?? after.serviceCode ?? null,
      featureCodes: Array.isArray(after.featureCodes) ? after.featureCodes : [],
      surgeMultiplier: Number(after.surgeMultiplier ?? after.pricingSnapshot?.surgeMultiplier ?? 1),
      createdAt: after.createdAt ?? null,
      updatedAt: after.updatedAt ?? null,
      serviceAreaId,
    };

    await shardRef.set(payload);
    return null;
  });

export const syncDriverLocationsByArea = functions.database
  .ref('driverLocations/{driverId}')
  .onWrite(async (change, context) => {
    const driverId = context.params.driverId as string;
    const after = change.after.val();
    const before = change.before.val();

    // Área previa: preferir serviceAreaId ya persistido; si no, derivarlo de
    // las coords anteriores. Necesario para limpiar el shard viejo al moverse
    // de área o al eliminar el nodo (antes solo se limpiaba el área DEFAULT).
    const previousAreaId =
      (typeof before?.serviceAreaId === 'string' && before.serviceAreaId) ||
      (await deriveServiceAreaIdFromCoords(
        before?.lat ?? before?.latitude ?? before?.coords?.latitude,
        before?.lng ?? before?.longitude ?? before?.coords?.longitude,
      ));

    if (!after) {
      if (previousAreaId) {
        await db.ref(`driverLocationsByArea/${previousAreaId}/${driverId}`).remove();
      }
      return null;
    }

    const lat = after.lat ?? after.latitude ?? after.coords?.latitude;
    const lng = after.lng ?? after.longitude ?? after.coords?.longitude;

    const serviceAreaId = await deriveServiceAreaIdFromCoords(lat, lng);

    // Si cambió de área (o salió de todas), limpiar el shard anterior para no
    // dejar conductores fantasma en áreas donde ya no están.
    if (previousAreaId && previousAreaId !== serviceAreaId) {
      await db.ref(`driverLocationsByArea/${previousAreaId}/${driverId}`).remove();
    }

    if (!serviceAreaId) {
      return null;
    }

    const shardRef = db.ref(`driverLocationsByArea/${serviceAreaId}/${driverId}`);
    // Whitelist explícita: el shard es legible por cualquier usuario
    // autenticado — no copiar currentRideId ni campos futuros del nodo fuente.
    const payload = {
      lat: after.lat ?? null,
      lng: after.lng ?? null,
      heading: after.heading ?? null,
      speed: after.speed ?? null,
      accuracy: after.accuracy ?? null,
      status: after.status ?? null,
      timestamp: after.timestamp ?? null,
      lastUpdate: after.lastUpdate ?? null,
      updatedAt: after.updatedAt ?? null,
      serviceAreaId,
    };

    await shardRef.set(payload);

    try {
      await db.ref(`sessions/${driverId}`).update({ serviceAreaId });
    } catch (err) {
      console.warn('[syncDriverLocationsByArea] No se pudo actualizar serviceAreaId en sesión', {
        driverId,
        error: (err as any)?.message || err,
      });
    }

    return null;
  });

export const syncClientsLocationsByArea = functions.database
  .ref('clientsLocations/{userId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId as string;
    const after = change.after.val();
    const before = change.before.val();

    const previousAreaId =
      (typeof before?.serviceAreaId === 'string' && before.serviceAreaId) ||
      (await deriveServiceAreaIdFromCoords(
        before?.latitude ?? before?.lat ?? before?.coords?.latitude,
        before?.longitude ?? before?.lng ?? before?.coords?.longitude,
      ));

    if (!after) {
      if (previousAreaId) {
        await db.ref(`clientsLocationsByArea/${previousAreaId}/${userId}`).remove();
      }
      return null;
    }

    const lat = after.latitude ?? after.lat ?? after.coords?.latitude;
    const lng = after.longitude ?? after.lng ?? after.coords?.longitude;

    const serviceAreaId = await deriveServiceAreaIdFromCoords(lat, lng);

    if (previousAreaId && previousAreaId !== serviceAreaId) {
      await db.ref(`clientsLocationsByArea/${previousAreaId}/${userId}`).remove();
    }

    if (!serviceAreaId) {
      // Fuera de cualquier área conocida: limpiar shard por defecto (actualmente Managua)
      const defaultShardRef = db.ref(`clientsLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${userId}`);
      await defaultShardRef.remove();
      return null;
    }

    const shardRef = db.ref(`clientsLocationsByArea/${serviceAreaId}/${userId}`);
    // Whitelist: solo lo necesario para ubicar al cliente — sin address ni
    // manualOverride (PII/estado interno) en un shard legible por conductores.
    const payload = {
      latitude: after.latitude ?? after.lat ?? after.coords?.latitude ?? null,
      longitude: after.longitude ?? after.lng ?? after.coords?.longitude ?? null,
      coords: after.coords ?? null,
      isManual: after.isManual ?? null,
      timestamp: after.timestamp ?? null,
      source: after.source ?? null,
      serviceAreaId,
    };

    await shardRef.set(payload);

    try {
      await db.ref(`sessions/${userId}`).update({ serviceAreaId });
    } catch (err) {
      console.warn('[syncClientsLocationsByArea] No se pudo actualizar serviceAreaId en sesión', {
        userId,
        error: (err as any)?.message || err,
      });
    }

    return null;
  });
