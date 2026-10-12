/**
 * Drivers API - Versión Sequelize
 * Gestión completa de conductores:
 * - Crear perfil de conductor
 * - Obtener información de conductor
 * - Actualizar perfil
 * - Listar conductores activos
 * - Filtrar por calificación
 * - Obtener estadísticas
 * - Cambiar estado
 * - Verificar conductor
 */

import * as functions from 'firebase-functions/v1';
import { DriverRepository } from '../sequelize/repositories/DriverRepository';
import { logAuditEvent } from '../helpers/auditLog';
import { 
  CreateDriverProfileSchema, 
  validateData,
  CreateDriverProfile
} from '../sequelize/validators';
import { requireDriver, requireAdmin } from '../utils/sessionUtils';

const driverRepo = new DriverRepository();

/**
 * Crear perfil de conductor
 * Requiere: licenseNumber, licenseExpiry
 * Opcional: profilePhoto, department, municipality
 */
export const createDriverProfile = functions.https.onCall(async (data, context) => {
  const userId = await requireDriver(context);

  try {
    // ✅ Validación con Zod
    const validatedData = validateData<CreateDriverProfile>(CreateDriverProfileSchema, data);
    const { licenseNumber, licenseExpiry, profilePhoto, department, municipality } = validatedData;

    console.log(`👤 [createDriverProfile] Creando perfil para conductor: ${userId}`);

    const driver = await driverRepo.create({
      user_id: userId,
      license_number: licenseNumber,
      license_expiry: new Date(licenseExpiry),
      profile_photo: profilePhoto || null,
      department: department || null,
      municipality: municipality || null,
      status: 'pending',
    });

    return {
      success: true,
      driver: {
        id: driver.id,
        userId: driver.user_id,
        licenseNumber: driver.license_number,
        licenseExpiry: driver.license_expiry,
        profilePhoto: driver.profile_photo,
        department: driver.department,
        municipality: driver.municipality,
        status: driver.status,
        createdAt: driver.created_at,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [createDriverProfile] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener perfil de conductor por ID
 */
export const getDriverProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`👤 [getDriverProfile] Obteniendo perfil del conductor: ${driverId}`);

    const driver = await driverRepo.findById(driverId);

    if (!driver) {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // Verificar ownership: campos sensibles solo para el propio conductor
    const isOwner = driver.user_id === context.auth.uid;

    return {
      success: true,
      driver: {
        id: driver.id,
        userId: driver.user_id,
        licenseNumber: isOwner ? driver.license_number : undefined,
        licenseExpiry: isOwner ? driver.license_expiry : undefined,
        profilePhoto: driver.profile_photo,
        licensePhotoFront: isOwner ? driver.license_photo_front : undefined,
        licensePhotoBack: isOwner ? driver.license_photo_back : undefined,
        department: driver.department,
        municipality: driver.municipality,
        status: driver.status,
        verifiedAt: driver.verified_at,
        averageRating: driver.average_rating,
        totalRides: driver.total_rides,
        totalEarnings: isOwner ? driver.total_earnings : undefined,
        createdAt: driver.created_at,
        updatedAt: driver.updated_at,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [getDriverProfile] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener perfil de conductor por user_id (Firebase UID)
 */
export const getDriverByUserId = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { userId } = data;

    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'userId es requerido');
    }

    console.log(`👤 [getDriverByUserId] Obteniendo conductor con userId: ${userId}`);

    const driver = await driverRepo.findByUserId(userId);

    if (!driver) {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // Verificar ownership: earnings solo para el propio conductor
    const isOwner = driver.user_id === context.auth.uid;

    return {
      success: true,
      driver: {
        id: driver.id,
        userId: driver.user_id,
        licenseNumber: isOwner ? driver.license_number : undefined,
        licenseExpiry: isOwner ? driver.license_expiry : undefined,
        profilePhoto: driver.profile_photo,
        status: driver.status,
        averageRating: driver.average_rating,
        totalRides: driver.total_rides,
        totalEarnings: isOwner ? driver.total_earnings : undefined,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [getDriverByUserId] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Actualizar perfil de conductor
 * Puede actualizar: licenseNumber, licenseExpiry, profilePhoto, department, municipality, licensePhotoFront, licensePhotoBack
 */
export const updateDriverProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, licenseNumber, licenseExpiry, profilePhoto, department, municipality, licensePhotoFront, licensePhotoBack } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    // Verificar ownership: solo el conductor dueño del perfil puede actualizarlo
    const existingDriver = await driverRepo.findById(driverId);
    if (!existingDriver) {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }
    if (existingDriver.user_id !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para actualizar este perfil');
    }

    console.log(`✏️ [updateDriverProfile] Actualizando perfil del conductor: ${driverId}`);

    const updateData: any = {};
    if (licenseNumber) updateData.license_number = licenseNumber;
    if (licenseExpiry) updateData.license_expiry = new Date(licenseExpiry);
    if (profilePhoto !== undefined) updateData.profile_photo = profilePhoto;
    if (department !== undefined) updateData.department = department;
    if (municipality !== undefined) updateData.municipality = municipality;
    if (licensePhotoFront !== undefined) updateData.license_photo_front = licensePhotoFront;
    if (licensePhotoBack !== undefined) updateData.license_photo_back = licensePhotoBack;

    const driver = await driverRepo.update(driverId, updateData);

    return {
      success: true,
      driver: {
        id: driver.id,
        userId: driver.user_id,
        licenseNumber: driver.license_number,
        licenseExpiry: driver.license_expiry,
        profilePhoto: driver.profile_photo,
        department: driver.department,
        municipality: driver.municipality,
        status: driver.status,
        updatedAt: driver.updated_at,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [updateDriverProfile] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener conductores activos
 */
export const getActiveDrivers = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    console.log(`📋 [getActiveDrivers] Obteniendo conductores activos`);

    const drivers = await driverRepo.findActive();

    return {
      success: true,
      count: drivers.length,
      drivers: drivers.map((d: any) => ({
        id: d.id,
        userId: d.user_id,
        licenseNumber: d.license_number,
        profilePhoto: d.profile_photo,
        averageRating: d.average_rating,
        totalRides: d.total_rides,
        totalEarnings: d.total_earnings,
        status: d.status,
        department: d.department,
        municipality: d.municipality,
      })),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [getActiveDrivers] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener conductores por calificación mínima
 */
export const getDriversByRating = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { minRating = 4.0 } = data;

    if (minRating < 1 || minRating > 5) {
      throw new functions.https.HttpsError('invalid-argument', 'minRating debe estar entre 1 y 5');
    }

    console.log(`⭐ [getDriversByRating] Obteniendo conductores con calificación >= ${minRating}`);

    const drivers = await driverRepo.findByRating(minRating);

    return {
      success: true,
      count: drivers.length,
      minRating,
      drivers: drivers.map((d: any) => ({
        id: d.id,
        userId: d.user_id,
        licenseNumber: d.license_number,
        profilePhoto: d.profile_photo,
        averageRating: d.average_rating,
        totalRides: d.total_rides,
        totalEarnings: d.total_earnings,
        status: d.status,
      })),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [getDriversByRating] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener conductores por departamento
 */
export const getDriversByDepartment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { department } = data;

    if (!department) {
      throw new functions.https.HttpsError('invalid-argument', 'department es requerido');
    }

    console.log(`📍 [getDriversByDepartment] Obteniendo conductores del departamento: ${department}`);

    const drivers = await driverRepo.findByDepartment(department);

    return {
      success: true,
      count: drivers.length,
      department,
      drivers: drivers.map((d: any) => ({
        id: d.id,
        userId: d.user_id,
        licenseNumber: d.license_number,
        profilePhoto: d.profile_photo,
        averageRating: d.average_rating,
        totalRides: d.total_rides,
        municipality: d.municipality,
        status: d.status,
      })),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [getDriversByDepartment] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener estadísticas del conductor
 */
export const getDriverStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`📊 [getDriverStats] Obteniendo estadísticas del conductor: ${driverId}`);

    const driver = await driverRepo.findById(driverId);

    if (!driver) {
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // Verificar ownership: stats financieras solo para el propio conductor
    const isOwner = driver.user_id === context.auth.uid;

    return {
      success: true,
      stats: {
        driverId: driver.id,
        userId: driver.user_id,
        averageRating: driver.average_rating,
        totalRides: driver.total_rides,
        totalEarnings: isOwner ? driver.total_earnings : undefined,
        status: driver.status,
        verifiedAt: driver.verified_at,
        createdAt: driver.created_at,
        updatedAt: driver.updated_at,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [getDriverStats] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Cambiar estado del conductor (active, suspended, rejected, pending)
 */
export const changeDriverStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, status } = data;

    if (!driverId || !status) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId y status son requeridos');
    }

    const validStatuses = ['pending', 'active', 'suspended', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new functions.https.HttpsError('invalid-argument', `Status debe ser uno de: ${validStatuses.join(', ')}`);
    }

    console.log(`🔄 [changeDriverStatus] Cambiando estado del conductor ${driverId} a ${status}`);

    const oldDriver = await driverRepo.findById(driverId);
    const previousStatus = oldDriver?.status;

    const driver = await driverRepo.update(driverId, { status });

    await logAuditEvent({
      actorUid: context.auth.uid,
      actorRole: 'admin',
      action: 'update',
      entityType: 'driver',
      entityId: driverId,
      changes: { before: { status: previousStatus }, after: { status } },
    });

    return {
      success: true,
      driver: {
        id: driver.id,
        userId: driver.user_id,
        status: driver.status,
        updatedAt: driver.updated_at,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [changeDriverStatus] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Verificar conductor (marcar como verificado)
 */
export const verifyDriver = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  try {
    const { driverId } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`✅ [verifyDriver] Verificando conductor: ${driverId}`);

    const oldDriver = await driverRepo.findById(driverId);
    const previousStatus = oldDriver?.status;

    const driver = await driverRepo.update(driverId, {
      status: 'active',
      verified_at: new Date(),
    });

    await logAuditEvent({
      actorUid: context.auth!.uid,
      actorRole: 'admin',
      action: 'update',
      entityType: 'driver',
      entityId: driverId,
      changes: { before: { status: previousStatus }, after: { status: 'active', verified_at: new Date().toISOString() } },
    });

    return {
      success: true,
      driver: {
        id: driver.id,
        userId: driver.user_id,
        status: driver.status,
        verifiedAt: driver.verified_at,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [verifyDriver] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Rechazar conductor
 */
export const rejectDriver = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  try {
    const { driverId, reason } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`❌ [rejectDriver] Rechazando conductor: ${driverId}, Razón: ${reason || 'Sin especificar'}`);

    const oldDriver = await driverRepo.findById(driverId);
    const previousStatus = oldDriver?.status;

    const driver = await driverRepo.update(driverId, {
      status: 'rejected',
    });

    await logAuditEvent({
      actorUid: context.auth!.uid,
      actorRole: 'admin',
      action: 'update',
      entityType: 'driver',
      entityId: driverId,
      changes: { before: { status: previousStatus }, after: { status: 'rejected', reason: reason || null } },
    });

    return {
      success: true,
      driver: {
        id: driver.id,
        userId: driver.user_id,
        status: driver.status,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [rejectDriver] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Suspender conductor
 */
export const suspendDriver = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  try {
    const { driverId, reason } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`⏸️ [suspendDriver] Suspendiendo conductor: ${driverId}, Razón: ${reason || 'Sin especificar'}`);

    const oldDriver = await driverRepo.findById(driverId);
    const previousStatus = oldDriver?.status;

    const driver = await driverRepo.update(driverId, {
      status: 'suspended',
    });

    await logAuditEvent({
      actorUid: context.auth!.uid,
      actorRole: 'admin',
      action: 'update',
      entityType: 'driver',
      entityId: driverId,
      changes: { before: { status: previousStatus }, after: { status: 'suspended', reason: reason || null } },
    });

    return {
      success: true,
      driver: {
        id: driver.id,
        userId: driver.user_id,
        status: driver.status,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [suspendDriver] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Actualizar estadísticas del conductor (llamado desde otros servicios)
 */
export const updateDriverStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, totalRides, averageRating, totalEarnings } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`📈 [updateDriverStats] Actualizando estadísticas del conductor: ${driverId}`);

    const updateData: any = {};
    if (totalRides !== undefined) updateData.total_rides = totalRides;
    if (averageRating !== undefined) updateData.average_rating = averageRating;
    if (totalEarnings !== undefined) updateData.total_earnings = totalEarnings;

    const driver = await driverRepo.update(driverId, updateData);

    return {
      success: true,
      stats: {
        driverId: driver.id,
        totalRides: driver.total_rides,
        averageRating: driver.average_rating,
        totalEarnings: driver.total_earnings,
      },
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [updateDriverStats] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});

/**
 * Obtener todos los conductores (con paginación)
 */
export const getAllDrivers = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);

  try {
    const { limit = 150, offset = 0, status } = data;

    console.log(`📋 [getAllDrivers] Obteniendo conductores - limit: ${limit}, offset: ${offset}, status: ${status || 'todos'}`);

    // ✅ Grupo 7 (H4): Paginación en BD en lugar de cargar todos y hacer slice en memoria
    const where = status ? { status } : undefined;
    const drivers = await driverRepo.findAll({ limit, offset, where });
    const total = await driverRepo.count(where);

    return {
      success: true,
      total,
      limit,
      offset,
      count: drivers.length,
      drivers: drivers.map((d: any) => ({
        id: d.id,
        userId: d.user_id,
        licenseNumber: d.license_number,
        profilePhoto: d.profile_photo,
        averageRating: d.average_rating,
        totalRides: d.total_rides,
        totalEarnings: d.total_earnings,
        status: d.status,
        department: d.department,
        municipality: d.municipality,
      })),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('❌ [getAllDrivers] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});
