/**
 * Designated Driver Inspections API - Versión Sequelize
 * Gestión de inspecciones de conductor designado
 */

import * as functions from 'firebase-functions/v1';
import { DesignatedDriverInspectionRepository } from '../sequelize/repositories/DesignatedDriverInspectionRepository';

const inspectionRepo = new DesignatedDriverInspectionRepository();

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
