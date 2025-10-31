/**
 * Ride Locations API - Versión Sequelize
 * Gestión de ubicaciones de viajes
 */

import * as functions from 'firebase-functions';
import { RideLocationRepository } from '../sequelize/repositories/RideLocationRepository';

const locationRepo = new RideLocationRepository();

/**
 * Crear ubicación de viaje
 */
export const createRideLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, latitude, longitude, locationType, waypointOrder, address } = data;

    if (!rideId || latitude === undefined || longitude === undefined || !locationType) {
      throw new functions.https.HttpsError('invalid-argument', 'Parámetros requeridos faltantes');
    }

    console.log(`📍 [createRideLocation] Creando ubicación para viaje: ${rideId}`);

    const location = await locationRepo.create({
      ride_id: rideId,
      latitude,
      longitude,
      location_type: locationType,
      waypoint_order: waypointOrder || null,
      address: address || null,
    });

    return {
      success: true,
      location: {
        id: location.id,
        rideId: location.ride_id,
        latitude: location.latitude,
        longitude: location.longitude,
        locationType: location.location_type,
        locationOrder: location.location_order,
        address: location.address,
        createdAt: location.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [createRideLocation] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener ubicaciones de un viaje
 */
export const getRideLocations = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId } = data;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`📍 [getRideLocations] Obteniendo ubicaciones del viaje: ${rideId}`);

    const locations = await locationRepo.findByRideId(rideId);

    return {
      success: true,
      count: locations.length,
      locations: locations.map((l: any) => ({
        id: l.id,
        rideId: l.ride_id,
        latitude: l.latitude,
        longitude: l.longitude,
        locationType: l.location_type,
        waypointOrder: l.waypoint_order,
        address: l.address,
        createdAt: l.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getRideLocations] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar ubicación
 */
export const updateRideLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { locationId, latitude, longitude, address } = data;

    if (!locationId) {
      throw new functions.https.HttpsError('invalid-argument', 'locationId es requerido');
    }

    console.log(`✏️ [updateRideLocation] Actualizando ubicación: ${locationId}`);

    const updateData: any = {};
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (address) updateData.address = address;

    const location = await locationRepo.update(locationId, updateData);

    return {
      success: true,
      location: {
        id: location.id,
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      },
    };
  } catch (error: any) {
    console.error('❌ [updateRideLocation] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Eliminar ubicación
 */
export const deleteRideLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { locationId } = data;

    if (!locationId) {
      throw new functions.https.HttpsError('invalid-argument', 'locationId es requerido');
    }

    console.log(`🗑️ [deleteRideLocation] Eliminando ubicación: ${locationId}`);

    const deleted = await locationRepo.delete(locationId);

    if (!deleted) {
      throw new functions.https.HttpsError('not-found', 'Ubicación no encontrada');
    }

    return {
      success: true,
      message: 'Ubicación eliminada correctamente',
    };
  } catch (error: any) {
    console.error('❌ [deleteRideLocation] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Eliminar todas las ubicaciones de un viaje
 */
export const deleteRideLocationsByRideId = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId } = data;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`🗑️ [deleteRideLocationsByRideId] Eliminando ubicaciones del viaje: ${rideId}`);

    const count = await locationRepo.deleteByRideId(rideId);

    return {
      success: true,
      deletedCount: count,
      message: `${count} ubicaciones eliminadas`,
    };
  } catch (error: any) {
    console.error('❌ [deleteRideLocationsByRideId] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
