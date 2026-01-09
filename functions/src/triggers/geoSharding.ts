import * as functions from 'firebase-functions';
import admin from 'firebase-admin';

const db = admin.database();

const DEFAULT_SERVICE_AREA_ID = 'ni-managua';

function isFiniteNumber(value: any): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function deriveServiceAreaIdFromCoords(latRaw: any, lngRaw: any): string | null {
  const lat = typeof latRaw === 'string' ? Number(latRaw) : latRaw;
  const lng = typeof lngRaw === 'string' ? Number(lngRaw) : lngRaw;

  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return null;
  }

  // Bounding box aproximado de Managua
  const MANAGUA_BOUNDS = {
    north: 12.20,
    south: 12.05,
    east: -86.15,
    west: -86.35,
  };

  const inBounds =
    lat >= MANAGUA_BOUNDS.south &&
    lat <= MANAGUA_BOUNDS.north &&
    lng >= MANAGUA_BOUNDS.west &&
    lng <= MANAGUA_BOUNDS.east;

  if (inBounds) {
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

    const serviceAreaId = deriveServiceAreaIdFromCoords(originLat, originLng);

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

    const payload = {
      ...after,
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

    if (!after) {
      // Limpiar todas las shards conocidas (actualmente solo Managua)
      const shardRef = db.ref(`driverLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${driverId}`);
      await shardRef.remove();
      return null;
    }

    const lat = after.lat ?? after.latitude ?? after.coords?.latitude;
    const lng = after.lng ?? after.longitude ?? after.coords?.longitude;

    const serviceAreaId = deriveServiceAreaIdFromCoords(lat, lng);

    if (!serviceAreaId) {
      // Si no se puede determinar área, no shardear
      return null;
    }

    const shardRef = db.ref(`driverLocationsByArea/${serviceAreaId}/${driverId}`);
    const payload = {
      ...after,
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

    if (!after) {
      const shardRef = db.ref(`clientsLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${userId}`);
      await shardRef.remove();
      return null;
    }

    const lat = after.latitude ?? after.lat ?? after.coords?.latitude;
    const lng = after.longitude ?? after.lng ?? after.coords?.longitude;

    const serviceAreaId = deriveServiceAreaIdFromCoords(lat, lng);

    if (!serviceAreaId) {
      // Fuera de cualquier área conocida: limpiar shard por defecto (actualmente Managua)
      const defaultShardRef = db.ref(`clientsLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${userId}`);
      await defaultShardRef.remove();
      return null;
    }

    const shardRef = db.ref(`clientsLocationsByArea/${serviceAreaId}/${userId}`);
    const payload = {
      ...after,
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
