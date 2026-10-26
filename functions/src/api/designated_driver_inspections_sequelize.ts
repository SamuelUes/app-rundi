/**
 * Designated Driver Inspections API - Versión Sequelize
 * Gestión de inspecciones de conductor designado
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { DesignatedDriverInspectionRepository } from '../sequelize/repositories/DesignatedDriverInspectionRepository';
import { ensureActiveSession, requireDriver } from '../utils/sessionUtils';

const inspectionRepo = new DesignatedDriverInspectionRepository();
const REQUIRED_PHOTO_TYPES = [
  'insurance_document',
  'registration_document',
  'front_driver_seat',
  'front_passenger_seat',
  'rear_left_seat',
  'rear_right_seat',
] as const;

/**
 * Crear inspección
 */
export const createInspection = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, driverId, inspectionPhoto, vehicleFrontPhoto, vehicleRearPhoto, interiorFrontPhoto, interiorRearPhoto } = data;

    if (!rideId || !driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y driverId son requeridos');
    }

    console.log(`🔍 [createInspection] Creando inspección para viaje: ${rideId}`);

    const inspection = await inspectionRepo.create({
      ride_id: rideId,
      driver_id: driverId,
      vehicle_front_photo: vehicleFrontPhoto || inspectionPhoto || null,
      vehicle_rear_photo: vehicleRearPhoto || null,
      interior_front_photo: interiorFrontPhoto || null,
      interior_rear_photo: interiorRearPhoto || null,
      status: 'pending',
    });

    return {
      success: true,
      inspection: {
        id: inspection.id,
        rideId: inspection.ride_id,
        driverId: inspection.driver_id,
        vehicleFrontPhoto: inspection.vehicle_front_photo,
        vehicleRearPhoto: inspection.vehicle_rear_photo,
        interiorFrontPhoto: inspection.interior_front_photo,
        interiorRearPhoto: inspection.interior_rear_photo,
        status: inspection.status,
        createdAt: inspection.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [createInspection] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const submitDesignatedDriverRideInspection = functions.https.onCall(async (data, context) => {
  const driverId = await requireDriver(context);
  await ensureActiveSession(context, data);

  const rideId = typeof data?.rideId === 'string' ? data.rideId.trim() : '';
  const photos = data?.photos;
  if (!rideId || !photos || typeof photos !== 'object' || data?.documentsConfirmed !== true) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan fotos o confirmación de documentos');
  }

  try {
    const rideSnapshot = await admin.database().ref(`activeRides/${rideId}`).once('value');
    const ride = rideSnapshot.val();
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    if (ride.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'No eres el conductor asignado a este viaje');
    }
    if (String(ride.rideType || '').toLowerCase() !== 'designated_driver') {
      throw new functions.https.HttpsError('failed-precondition', 'La inspección solo aplica a viajes de conductor designado');
    }
    if (ride.status !== 'driver_arrived') {
      throw new functions.https.HttpsError('failed-precondition', 'Marca tu llegada antes de completar la inspección');
    }

    const inspectionPhotos: Record<string, string> = {};
    for (const type of REQUIRED_PHOTO_TYPES) {
      const url = photos[type];
      if (typeof url !== 'string' || url.length > 2000) {
        throw new functions.https.HttpsError('invalid-argument', `Falta la foto requerida: ${type}`);
      }
      let parsedUrl: URL;
      let configuredStorageOrigin: string | null = null;
      try {
        parsedUrl = new URL(url);
        configuredStorageOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;
      } catch {
        throw new functions.https.HttpsError('invalid-argument', `La foto no es válida: ${type}`);
      }
      const expectedPath = `/storage/v1/object/public/rides-documents/rides-inspection/${rideId}/${type}_${driverId}_`;
      if (
        !['http:', 'https:'].includes(parsedUrl.protocol) ||
        (configuredStorageOrigin && parsedUrl.origin !== configuredStorageOrigin) ||
        !parsedUrl.pathname.startsWith(expectedPath)
      ) {
        throw new functions.https.HttpsError('invalid-argument', `La foto no corresponde a este viaje: ${type}`);
      }
      inspectionPhotos[type] = url;
    }

    const inspectedAt = new Date();
    const inspection = await inspectionRepo.upsertByRideId({
      ride_id: rideId,
      driver_id: driverId,
      insurance_document_photo: inspectionPhotos.insurance_document,
      registration_document_photo: inspectionPhotos.registration_document,
      front_driver_seat_photo: inspectionPhotos.front_driver_seat,
      front_passenger_seat_photo: inspectionPhotos.front_passenger_seat,
      rear_left_seat_photo: inspectionPhotos.rear_left_seat,
      rear_right_seat_photo: inspectionPhotos.rear_right_seat,
      documents_confirmed: true,
      documents_confirmed_at: inspectedAt,
      status: 'completed',
      inspected_at: inspectedAt,
    });

    await admin.database().ref(`activeRides/${rideId}/vehicleInspection`).update({
      completed: true,
      documentsConfirmed: true,
      driver_id: driverId,
      inspection_id: inspection.id,
      completedAt: admin.database.ServerValue.TIMESTAMP,
    });

    return {
      success: true,
      inspection: {
        id: inspection.id,
        completed: true,
        documentsConfirmed: true,
        completedAt: inspectedAt.toISOString(),
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('[submitDesignatedDriverRideInspection] Error:', error);
    throw new functions.https.HttpsError('internal', 'No se pudo guardar la inspección');
  }
});

/**
 * Obtener inspección de viaje
 */
export const getRideInspection = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId } = data;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`🔍 [getRideInspection] Obteniendo inspección del viaje: ${rideId}`);

    const inspection = await inspectionRepo.findByRideId(rideId);

    if (!inspection) {
      throw new functions.https.HttpsError('not-found', 'Inspección no encontrada');
    }

    return {
      success: true,
      inspection: {
        id: inspection.id,
        rideId: inspection.ride_id,
        driverId: inspection.driver_id,
        vehicleFrontPhoto: inspection.vehicle_front_photo,
        vehicleRearPhoto: inspection.vehicle_rear_photo,
        interiorFrontPhoto: inspection.interior_front_photo,
        interiorRearPhoto: inspection.interior_rear_photo,
        status: inspection.status,
        createdAt: inspection.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [getRideInspection] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar inspección
 */
export const updateInspection = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { inspectionId, inspectionPhoto, vehicleFrontPhoto, vehicleRearPhoto, interiorFrontPhoto, interiorRearPhoto, status } = data;

    if (!inspectionId) {
      throw new functions.https.HttpsError('invalid-argument', 'inspectionId es requerido');
    }

    console.log(`✏️ [updateInspection] Actualizando inspección: ${inspectionId}`);

    const updateData: any = {};
    if (vehicleFrontPhoto || inspectionPhoto) updateData.vehicle_front_photo = vehicleFrontPhoto || inspectionPhoto;
    if (vehicleRearPhoto) updateData.vehicle_rear_photo = vehicleRearPhoto;
    if (interiorFrontPhoto) updateData.interior_front_photo = interiorFrontPhoto;
    if (interiorRearPhoto) updateData.interior_rear_photo = interiorRearPhoto;
    if (status) updateData.status = status;

    const inspection = await inspectionRepo.update(inspectionId, updateData);

    return {
      success: true,
      inspection: {
        id: inspection.id,
        status: inspection.status,
      },
    };
  } catch (error: any) {
    console.error('❌ [updateInspection] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
