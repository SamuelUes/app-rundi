/**
 * Drivers Compatibility API
 * Funciones para compatibilidad con el Frontend
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { MIGRATION_FLAGS } from '../config/migration-flags';
import { DriverServiceRepository } from '../sequelize/repositories/DriverServiceRepository';
import { ServiceRepository } from '../sequelize/repositories/ServiceRepository';
import { DriverRepository } from '../sequelize/repositories/DriverRepository';
import { supabaseGet, supabasePost, supabaseUpdate } from '../supabase/client';

const db = admin.database();
const DEFAULT_SERVICE_AREA_ID = 'ni-managua';
const driverServiceRepo = new DriverServiceRepository();
const serviceRepo = new ServiceRepository();
const driverRepo = new DriverRepository();

async function upsertDriverViaSupabaseRest(userId: string, data: Record<string, any>) {
  if (!data || Object.keys(data).length === 0) {
    return;
  }

  try {
    const existing = await supabaseGet(
      'drivers',
      { user_id: userId },
      'id',
      { requireServiceRole: true, limit: 1 },
    );

    const driverRow = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;

    if (driverRow?.id) {
      await supabaseUpdate('drivers', driverRow.id, data);
      console.log(`✅ [updateDriver] Supabase REST actualizado (driver_id=${driverRow.id})`);
    } else {
      await supabasePost('drivers', {
        user_id: userId,
        ...data,
      });
      console.log('✅ [updateDriver] Supabase REST creó registro de driver');
    }
  } catch (error) {
    console.error('❌ [updateDriver] Fallback Supabase REST falló:', error);
    throw error;
  }
}

async function markDesignatedRoleRequested(userId: string) {
  try {
    await driverRepo.updateByUserId(userId, { designated_rol_requested: 'requested' });
    console.log(`✅ [requestDesignatedDriverAccess] Flag actualizado en drivers.designated_rol_requested`);
  } catch (error: any) {
    console.warn('⚠️ [requestDesignatedDriverAccess] No se pudo actualizar vía Sequelize, intentando Supabase REST', {
      userId,
      message: error?.message || error,
    });

    try {
      const driverRecord = await driverRepo.findByUserId(userId);
      const driverId = (driverRecord as any)?.id;
      if (driverId) {
        await supabaseUpdate('drivers', driverId, { designated_rol_requested: 'requested' });
        console.log('✅ [requestDesignatedDriverAccess] Flag actualizado vía Supabase REST');
        return;
      }
    } catch (fallbackError: any) {
      console.error('❌ [requestDesignatedDriverAccess] Fallback Supabase falló', fallbackError);
    }
  }
}

async function getDesignatedServiceId(): Promise<string | null> {
  try {
    const svc = await serviceRepo.findByName('designated_driver');
    return (svc as any)?.id || null;
  } catch {
    return null;
  }
}

/**
 * Actualizar ubicación del conductor
 */
export const updateDriverLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;
    const { latitude, longitude, heading, speed, accuracy } = data;

    console.log(`📍 [updateDriverLocation] Actualizando ubicación del conductor: ${driverId}`);

    // Actualizar en Realtime DB - driverLocations (coords + timestamps; NO disponibilidad aquí)
    const driverLocPayload: Record<string, any> = {
      lastSeen: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };
    if (typeof latitude === 'number') driverLocPayload.lat = latitude;
    if (typeof longitude === 'number') driverLocPayload.lng = longitude;
    if (typeof heading === 'number') driverLocPayload.heading = heading;
    if (typeof speed === 'number') driverLocPayload.speed = speed;
    if (typeof accuracy === 'number') driverLocPayload.accuracy = accuracy;
    await db.ref(`driverLocations/${driverId}`).update(driverLocPayload);

    // Actualizar en Realtime DB - driversInfo
    await db.ref(`driversInfo/${driverId}`).update({
      lat: latitude,
      lng: longitude,
      heading: heading || 0,
      speed: speed || 0,
      accuracy: accuracy || 0,
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ [updateDriverLocation] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener conductores disponibles en un área
 */
export const getAvailableDrivers = functions.https.onCall(async (data, context) => {
  try {
    const { latitude, longitude, radius = 15, vehicleType, designatedDriverVehicle } = data;

    console.log(`🚗 [getAvailableDrivers] Buscando conductores disponibles en: ${latitude}, ${longitude}, vehicleType: ${vehicleType}`);

    // Resolver área de servicio del usuario (si está autenticado)
    const uid = context.auth?.uid || null;
    let serviceAreaId = DEFAULT_SERVICE_AREA_ID;

    if (uid) {
      try {
        const sessionSnap = await db.ref(`sessions/${uid}`).once('value');
        const sessionVal = sessionSnap.val();
        if (sessionVal && typeof sessionVal.serviceAreaId === 'string' && sessionVal.serviceAreaId.trim().length > 0) {
          serviceAreaId = sessionVal.serviceAreaId.trim();
        }
      } catch (e) {
        console.warn('[getAvailableDrivers] No se pudo leer serviceAreaId de sesión, usando default', {
          uid,
          error: (e as any)?.message || e,
        });
      }
    }

    // Obtener driversInfo (metadata) y driverLocations desde shard por área con fallback global
    const driversSnapshotPromise = db.ref('driversInfo').once('value');

    let driverLocations: any = {};
    let locationsPath = '';

    try {
      const areaSnap = await db.ref(`driverLocationsByArea/${serviceAreaId}`).once('value');
      driverLocations = areaSnap.val() || {};
      locationsPath = `driverLocationsByArea/${serviceAreaId}`;

      if (!driverLocations || (typeof driverLocations === 'object' && Object.keys(driverLocations).length === 0)) {
        const fallbackSnap = await db.ref('driverLocations').once('value');
        driverLocations = fallbackSnap.val() || {};
        locationsPath = 'driverLocations';
      }
    } catch (err) {
      console.warn('[getAvailableDrivers] Error leyendo driverLocationsByArea, usando driverLocations global', {
        uid,
        serviceAreaId,
        error: (err as any)?.message || err,
      });
      const fallbackSnap = await db.ref('driverLocations').once('value');
      driverLocations = fallbackSnap.val() || {};
      locationsPath = 'driverLocations';
    }

    const driversSnapshot = await driversSnapshotPromise;
    const driversInfo = driversSnapshot.val() || {};

    console.log(`📊 [getAvailableDrivers] driversInfo: ${Object.keys(driversInfo).length}, driverLocations(${locationsPath}): ${Object.keys(driverLocations).length}`, {
      serviceAreaId,
      locationsPath,
    });

    const allDriverIds = new Set<string>([
      ...Object.keys(driversInfo || {}),
      ...Object.keys(driverLocations || {}),
    ]);

    const availableDrivers: any[] = [];

    for (const driverId of allDriverIds) {
      const info = (driversInfo as any)[driverId] || {};
      const loc = (driverLocations as any)[driverId] || {};

      const status = String(loc?.status || '').toLowerCase();
      console.log(`🔍 [getAvailableDrivers] ${driverId}: status=${status}, type=${info?.vehicle?.type}`);

      // Verificar disponibilidad solo desde driverLocations
      if (status !== 'available') {
        console.log(`  ⏭️ Saltando: status no es 'available' (es: ${status || 'unknown'})`);
        continue;
      }

      // Coordenadas: preferir driverLocations
      const lat = Number.isFinite(loc?.lat) ? loc.lat : info?.lat;
      const lng = Number.isFinite(loc?.lng) ? loc.lng : info?.lng;
      if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
        console.log('  ⏭️ Saltando: sin ubicación válida');
        continue;
      }

      // Calcular distancia
      const distance = calculateDistance(latitude, longitude, lat, lng);

      console.log(`  📍 Distancia: ${distance.toFixed(2)}km (radio: ${radius}km)`);

      // Filtrar por radio
      if (distance > radius) {
        console.log(`  ⏭️ Saltando: fuera del radio`);
        continue;
      }

      const driverVehicleType = String(info?.vehicle?.type || '').toLowerCase();
      const isDesignatedDriverMode = Boolean(info?.isDesignatedDriverMode);

      if (vehicleType) {
        if (vehicleType === 'designated_driver') {
          if (!isDesignatedDriverMode) {
            console.log('  ⏭️ Saltando: conductor no está en modo designado');
            continue;
          }

          if (designatedDriverVehicle) {
            if (!driverVehicleType) {
              console.log('  ⏭️ Saltando: conductor sin tipo de vehículo definido para designado');
              continue;
            }

            if (driverVehicleType !== designatedDriverVehicle) {
              console.log(
                `  ⏭️ Saltando: conductor designado no coincide. Cliente: ${designatedDriverVehicle}, conductor: ${driverVehicleType}`,
              );
              continue;
            }
          }
        } else if (vehicleType !== 'auto') {
          if (driverVehicleType !== vehicleType) {
            console.log(
              `  ⏭️ Saltando: tipo de vehículo no coincide (buscando: ${vehicleType}, tiene: ${driverVehicleType || 'desconocido'})`,
            );
            continue;
          }
        }
      }

      console.log(`  ✅ Conductor disponible agregado`);

      availableDrivers.push({
        id: driverId,
        name: info.fullName || info.name || 'Conductor',
        rating: parseFloat(info.averageRating) || parseFloat(info.rating) || 0,
        latitude: lat,
        longitude: lng,
        distance,
        vehicle: info.vehicle || {},
        isAvailable: true,
        lastUpdate: loc?.updatedAt || info?.lastUpdate || null,
      });
    }

    // Ordenar por distancia
    availableDrivers.sort((a, b) => a.distance - b.distance);

    console.log(`✅ [getAvailableDrivers] Encontrados ${availableDrivers.length} conductores`);

    return {
      success: true,
      available: availableDrivers.length > 0,
      count: availableDrivers.length,
      drivers: availableDrivers,
    };
  } catch (error: any) {
    console.error('❌ [getAvailableDrivers] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener perfil del conductor
 */
export const getDriverProfile = functions.https.onCall(async (data, context) => {
  try {
    const { driverId } = data;

    console.log(`👤 [getDriverProfile] Obteniendo perfil del conductor: ${driverId}`);

    // Obtener datos de Realtime DB - driversInfo
    const snapshot = await db.ref(`driversInfo/${driverId}`).once('value');
    const driverInfo = snapshot.val();

    if (!driverInfo) {
      console.warn(`⚠️ [getDriverProfile] Conductor no encontrado en driversInfo: ${driverId}`);
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // Obtener stats de Realtime DB - drivers
    const statsSnapshot = await db.ref(`drivers/${driverId}/stats`).once('value');
    let stats = statsSnapshot.val() || {};
    // Fallback a Supabase si no existen stats en RTDB
    if (!stats || Object.keys(stats).length === 0) {
      try {
        const driver = await driverRepo.findByUserId(driverId);
        if (driver) {
          stats = {
            totalRides: (driver as any).total_rides ?? 0,
            totalEarnings: (driver as any).total_earnings ?? 0,
            averageRating: (driver as any).average_rating ?? 0,
          };
        }
      } catch (err) {
        console.warn('[getDriverProfile] Fallback a Supabase para stats falló:', err);
      }
    }

    return {
      success: true,
      driver: {
        id: driverId,
        fullName: driverInfo.fullName,
        phone: driverInfo.phone,
        status: driverInfo.status,
        averageRating: parseFloat(driverInfo.averageRating) || 0,
        vehicle: driverInfo.vehicle || {},
        lat: driverInfo.lat,
        lng: driverInfo.lng,
        lastUpdate: driverInfo.lastUpdate,
        // Stats
        total_rides: Number(stats.totalRides || 0),
        total_earnings: Number(stats.totalEarnings || 0),
        average_rating: typeof stats.averageRating === 'number'
          ? Number(stats.averageRating)
          : (parseFloat(driverInfo.averageRating) || 0),
      },
    };
  } catch (error: any) {
    console.error('❌ [getDriverProfile] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar modo conductor designado
 */
export const updateDesignatedDriverMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, isActive } = data;
    const currentUserId = context.auth.uid;

    // Verificar que sea el mismo conductor o admin
    if (driverId !== currentUserId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para actualizar este conductor');
    }

    console.log(`🚗 [updateDesignatedDriverMode] Actualizando modo conductor designado: ${driverId} -> ${isActive}`);

    // Actualizar en Realtime DB - driversInfo
    await db.ref(`driversInfo/${driverId}`).update({
      isDesignatedDriverMode: isActive,
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ [updateDesignatedDriverMode] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar información del conductor
 */
export const updateDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;
    const {
      license_photo_front,
      license_photo_back,
      license_number,
      license_expiry,
      profile_photo,
      department,
      municipality,
    } = data;

    console.log(`👤 [updateDriver] Actualizando información del conductor: ${driverId}`);

    // Actualizar en Realtime DB - driversInfo
    const updateData: any = {};
    
    if (license_photo_front) updateData.license_photo_front = license_photo_front;
    if (license_photo_back) updateData.license_photo_back = license_photo_back;
    if (license_number) updateData.license_number = license_number;
    if (license_expiry) updateData.license_expiry = license_expiry;
    if (profile_photo) updateData.profile_photo = profile_photo;
    if (department) updateData.department = department;
    if (municipality) updateData.municipality = municipality;

    updateData.lastUpdate = admin.database.ServerValue.TIMESTAMP;

    await db.ref(`driversInfo/${driverId}`).update(updateData);

    const supabaseUpdateData: any = {};
    if (license_photo_front) supabaseUpdateData.license_photo_front = license_photo_front;
    if (license_photo_back) supabaseUpdateData.license_photo_back = license_photo_back;
    if (license_number) supabaseUpdateData.license_number = license_number;
    if (license_expiry) supabaseUpdateData.license_expiry = license_expiry;
    if (profile_photo) supabaseUpdateData.profile_photo = profile_photo;
    if (department) supabaseUpdateData.department = department;
    if (municipality) supabaseUpdateData.municipality = municipality;

    if (Object.keys(supabaseUpdateData).length > 0) {
      let updatedViaSequelize = false;

      try {
        const updateResult: any = await driverRepo.updateByUserId(driverId, supabaseUpdateData);
        const affected = Array.isArray(updateResult) ? updateResult[0] : updateResult;
        updatedViaSequelize = Boolean(affected);

        if (!updatedViaSequelize) {
          console.warn('⚠️ [updateDriver] Sequelize no actualizó registros, usando fallback REST', {
            driverId,
            payloadKeys: Object.keys(supabaseUpdateData),
          });
        }
      } catch (supabaseError: any) {
        console.warn('⚠️ [updateDriver] Error actualizando conductor vía Sequelize:', {
          driverId,
          message: supabaseError?.message || supabaseError,
        });
      }

      if (!updatedViaSequelize) {
        await upsertDriverViaSupabaseRest(driverId, supabaseUpdateData);
      }
    }

    return {
      success: true,
      driver: {
        id: driverId,
        ...updateData,
      },
    };
  } catch (error: any) {
    console.error('❌ [updateDriver] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Solicitar acceso a Conductor Designado
 */
export const requestDesignatedDriverAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;

    console.log(`🚙 [requestDesignatedDriverAccess] Solicitando acceso para conductor: ${driverId}`);

    // Si mantenemos RTDB para solicitudes
    if (MIGRATION_FLAGS.USE_RTDB_DESIGNATED_DRIVER_REQUESTS) {
      await db.ref(`designatedDriverRequests/${driverId}`).set({
        driverId,
        status: 'pending',
        requestedAt: admin.database.ServerValue.TIMESTAMP,
        approvedAt: null,
        rejectedAt: null,
      });

      await markDesignatedRoleRequested(driverId);
      return { success: true, message: 'Solicitud enviada exitosamente', status: 'pending' };
    }

    // Migrado a Supabase: crear/asegurar registro en driver_services con estado pending
    const serviceId = await getDesignatedServiceId();
    if (!serviceId) {
      throw new functions.https.HttpsError('failed-precondition', 'Servicio designated_driver no configurado');
    }

    const existing = await driverServiceRepo.findByDriverAndService(driverId, serviceId);
    if (existing) {
      await markDesignatedRoleRequested(driverId);
      return { success: true, message: 'Solicitud existente', status: (existing as any).status || 'pending' };
    }

    const created = await driverServiceRepo.create({
      driver_id: driverId,
      service_id: serviceId,
      status: 'pending',
    });

    await markDesignatedRoleRequested(driverId);
    return { success: true, message: 'Solicitud enviada exitosamente', status: created.status || 'pending' };
  } catch (error: any) {
    console.error('❌ [requestDesignatedDriverAccess] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener estado de solicitud de Conductor Designado
 */
export const getDesignatedDriverRequestStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;

    console.log(`📋 [getDesignatedDriverRequestStatus] Obteniendo estado para conductor: ${driverId}`);

    if (MIGRATION_FLAGS.USE_RTDB_DESIGNATED_DRIVER_REQUESTS) {
      const snapshot = await db.ref(`designatedDriverRequests/${driverId}`).once('value');
      const requestData = snapshot.val();
      if (!requestData) {
        return { success: true, status: 'not_requested', message: 'No hay solicitud previa' };
      }
      return {
        success: true,
        status: requestData.status || 'unknown',
        requestedAt: requestData.requestedAt,
        approvedAt: requestData.approvedAt,
        rejectedAt: requestData.rejectedAt,
        message: requestData.rejectionReason || null,
      };
    }

    // Migrado a Supabase
    const serviceId = await getDesignatedServiceId();
    if (!serviceId) {
      throw new functions.https.HttpsError('failed-precondition', 'Servicio designated_driver no configurado');
    }
    const existing = await driverServiceRepo.findByDriverAndService(driverId, serviceId);
    if (!existing) {
      return { success: true, status: 'not_requested', message: 'No hay solicitud previa' };
    }
    return {
      success: true,
      status: (existing as any).status || 'unknown',
      approvedAt: (existing as any).approved_at || null,
    };
  } catch (error: any) {
    console.error('❌ [getDesignatedDriverRequestStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Calcular distancia entre dos puntos (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
