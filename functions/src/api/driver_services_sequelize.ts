/**
 * Driver Services API - Versión Sequelize
 * Gestión de servicios de conductores
 */

import * as functions from 'firebase-functions/v1';
import { DriverServiceRepository } from '../sequelize/repositories/DriverServiceRepository';

const driverServiceRepo = new DriverServiceRepository();

/**
 * Asignar servicio a conductor
 */
export const assignServiceToDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, serviceId } = data;

    if (!driverId || !serviceId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId y serviceId son requeridos');
    }

    console.log(`🎯 [assignServiceToDriver] Asignando servicio ${serviceId} al conductor ${driverId}`);

    const driverService = await driverServiceRepo.create({
      driver_id: driverId,
      service_id: serviceId,
      is_active: true,
      is_approved: false,
    });

    return {
      success: true,
      driverService: {
        id: driverService.id,
        driverId: driverService.driver_id,
        serviceId: driverService.service_id,
        isActive: driverService.is_active,
        isApproved: driverService.is_approved,
        createdAt: driverService.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [assignServiceToDriver] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener servicios de un conductor
 */
export const getDriverServices = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`🎯 [getDriverServices] Obteniendo servicios del conductor: ${driverId}`);

    const services = await driverServiceRepo.findByDriverId(driverId);

    return {
      success: true,
      count: services.length,
      services: services.map((s: any) => ({
        id: s.id,
        serviceId: s.service_id,
        isActive: s.is_active,
        isApproved: s.is_approved,
        approvedAt: s.approved_at,
        createdAt: s.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getDriverServices] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Aprobar servicio de conductor
 */
export const approveDriverService = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverServiceId } = data;

    if (!driverServiceId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverServiceId es requerido');
    }

    console.log(`✅ [approveDriverService] Aprobando servicio: ${driverServiceId}`);

    const driverService = await driverServiceRepo.update(driverServiceId, {
      is_approved: true,
      approved_at: new Date(),
    });

    return {
      success: true,
      driverService: {
        id: driverService.id,
        isActive: driverService.is_active,
        isApproved: driverService.is_approved,
        approvedAt: driverService.approved_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [approveDriverService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Desactivar servicio de conductor
 */
export const deactivateDriverService = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverServiceId } = data;

    if (!driverServiceId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverServiceId es requerido');
    }

    console.log(`⏸️ [deactivateDriverService] Desactivando servicio: ${driverServiceId}`);

    const driverService = await driverServiceRepo.update(driverServiceId, { is_active: false });

    return {
      success: true,
      driverService: {
        id: driverService.id,
        isActive: driverService.is_active,
        isApproved: driverService.is_approved,
      },
    };
  } catch (error: any) {
    console.error('❌ [deactivateDriverService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
