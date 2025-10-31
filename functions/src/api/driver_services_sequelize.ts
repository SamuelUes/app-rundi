/**
 * Driver Services API - Versión Sequelize
 * Gestión de servicios de conductores
 */

import * as functions from 'firebase-functions';
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
      status: 'active',
    });

    return {
      success: true,
      driverService: {
        id: driverService.id,
        driverId: driverService.driver_id,
        serviceId: driverService.service_id,
        status: driverService.status,
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
        status: s.status,
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
      status: 'approved',
      approved_at: new Date(),
    });

    return {
      success: true,
      driverService: {
        id: driverService.id,
        status: driverService.status,
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

    const driverService = await driverServiceRepo.update(driverServiceId, { status: 'inactive' });

    return {
      success: true,
      driverService: {
        id: driverService.id,
        status: driverService.status,
      },
    };
  } catch (error: any) {
    console.error('❌ [deactivateDriverService] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
