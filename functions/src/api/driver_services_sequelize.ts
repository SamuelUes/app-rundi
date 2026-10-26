/**
 * Driver Services API - Versión Sequelize
 * Gestión de servicios de conductores
 */

import * as functions from 'firebase-functions/v1';
import { DriverServiceRepository } from '../sequelize/repositories/DriverServiceRepository';
import { DriverRepository } from '../sequelize/repositories/DriverRepository';
import { getUserRole, requireAdmin } from '../utils/sessionUtils';

const driverServiceRepo = new DriverServiceRepository();
const driverRepo = new DriverRepository();

/**
 * Autorización para operaciones sobre driver_services:
 * - admin: acceso total
 * - conductor: solo sobre su propio registro (driverId = drivers.id interno
 *   asociado a su Firebase UID)
 */
const assertDriverServiceAccess = async (
  context: functions.https.CallableContext,
  driverId: string,
): Promise<void> => {
  const uid = context.auth!.uid;
  const role = await getUserRole(uid);
  if (role === 'admin') return;

  const driver = await driverRepo.findByUserId(uid);
  if (!driver || String((driver as any).id) !== String(driverId)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Solo puedes gestionar tus propios servicios de conductor',
    );
  }
};

/**
 * Asignar servicio a conductor (queda pendiente de aprobación admin)
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

    await assertDriverServiceAccess(context, driverId);

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

    await assertDriverServiceAccess(context, driverId);

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
 * Aprobar servicio de conductor — solo admin (evita auto-aprobación)
 */
export const approveDriverService = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

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

    const existing = await driverServiceRepo.findById(driverServiceId);
    if (!existing) {
      throw new functions.https.HttpsError('not-found', 'Servicio de conductor no encontrado');
    }
    await assertDriverServiceAccess(context, String((existing as any).driver_id));

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
