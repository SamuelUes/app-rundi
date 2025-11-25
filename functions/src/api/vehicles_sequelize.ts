/**
 * Vehicles API - Versión Sequelize
 * Gestión de vehículos de conductores
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { VehicleRepository } from '../sequelize/repositories/VehicleRepository';
import Driver from '../sequelize/models/Driver';

const vehicleRepo = new VehicleRepository();
const db = admin.database();

/**
 * Crear vehículo (versión básica)
 */
export const createVehicle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, plate, make, model, year, color, vehicleType } = data;

    if (!driverId || !plate || !make || !model || !year || !color || !vehicleType) {
      throw new functions.https.HttpsError('invalid-argument', 'Parámetros requeridos faltantes');
    }

    console.log(`🚗 [createVehicle] Creando vehículo: ${plate}`);

    const vehicle = await vehicleRepo.create({
      driver_id: driverId,
      plate,
      brand: make,
      model,
      year,
      color,
      type: vehicleType,
      is_active: true,
    });

    return {
      success: true,
      vehicle: {
        id: vehicle.id,
        driverId: vehicle.driver_id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        type: vehicle.type,
        isActive: vehicle.is_active,
        createdAt: vehicle.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [createVehicle] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Crear vehículo completo (con todos los campos)
 */
export const createVehicleComplete = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const firebaseUserId = context.auth.uid;
    console.log(`🚗 [createVehicleComplete] Creando vehículo completo para: ${firebaseUserId}`);
    console.log(`📋 Datos recibidos:`, data);

    // Campos requeridos
    const { plate, brand, model, year, color, type } = data;
    if (!plate || !brand || !model || !year || !color || !type) {
      throw new functions.https.HttpsError('invalid-argument', 'Campos requeridos faltantes: plate, brand, model, year, color, type');
    }

    // Obtener el UUID del conductor desde la tabla drivers usando user_id (Firebase UID)
    console.log(`🔍 Buscando conductor con user_id: ${firebaseUserId}`);
    const driver = await Driver.findOne({
      where: { user_id: firebaseUserId },
      attributes: ['id']
    });

    if (!driver) {
      throw new functions.https.HttpsError('not-found', `Conductor no encontrado con user_id: ${firebaseUserId}`);
    }

    const driverId = driver.id;
    console.log(`✅ Conductor encontrado con UUID: ${driverId}`);

    // Campos opcionales
    const vehicleData: any = {
      driver_id: driverId,
      plate: plate.toUpperCase(),
      brand,
      model,
      year: parseInt(year),
      color,
      type,
      is_active: true,
      // Especificaciones técnicas
      motor: data.motor || null,
      chasis: data.chasis || null,
      vin: data.vin || null,
      cylinders: data.cylinders ? parseInt(data.cylinders) : null,
      passengers: data.passengers ? parseInt(data.passengers) : null,
      fuel_type: data.fuel_type || null,
      tonnage: data.tonnage ? parseFloat(data.tonnage) : null,
      vehicle_class: data.vehicle_class || null,
      service_type: data.service_type || null,
      lien: data.lien || 'NINGUNO',
      // Documentos
      emission_date: data.emission_date || null,
      registration_number: data.registration_number || null,
      registration_expiry: data.registration_expiry || null,
      registration_photo_front: data.registration_photo_front || null,
      registration_photo_back: data.registration_photo_back || null,
      // Seguro
      insurance_number: data.insurance_number || null,
      insurance_company: data.insurance_company || null,
      insurance_start_date: data.insurance_start_date || null,
      insurance_expiry: data.insurance_expiry || null,
      insurance_photo: data.insurance_photo || null,
      // Fotos
      vehicle_photo: data.vehicle_photo || null,
      is_4x4: data.is_4x4 || false,
    };

    console.log(`📝 Creando vehículo con datos:`, vehicleData);

    try {
      const vehicle = await vehicleRepo.create(vehicleData);
      console.log(`✅ Vehículo creado exitosamente:`, vehicle.id);
      
      return {
        success: true,
        vehicle: {
          id: vehicle.id,
          driverId: vehicle.driver_id,
          plate: vehicle.plate,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          type: vehicle.type,
          isActive: vehicle.is_active,
          createdAt: vehicle.created_at,
        },
      };
    } catch (dbError: any) {
      console.error('❌ Error en vehicleRepo.create:', dbError);
      console.error('Stack:', dbError.stack);
      throw new functions.https.HttpsError('internal', `Error creando vehículo en BD: ${dbError.message}`);
    }
  } catch (error: any) {
    console.error('❌ [createVehicleComplete] Error:', error);
    console.error('Stack:', error.stack);
    throw new functions.https.HttpsError('internal', error.message || 'Error al crear vehículo');
  }
});

/**
 * Obtener vehículo por ID
 */
export const getVehicle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { vehicleId } = data;

    if (!vehicleId) {
      throw new functions.https.HttpsError('invalid-argument', 'vehicleId es requerido');
    }

    console.log(`🚗 [getVehicle] Obteniendo vehículo: ${vehicleId}`);

    const vehicle = await vehicleRepo.findById(vehicleId);

    if (!vehicle) {
      throw new functions.https.HttpsError('not-found', 'Vehículo no encontrado');
    }

    return {
      success: true,
      vehicle: {
        id: vehicle.id,
        driverId: vehicle.driver_id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        type: vehicle.type,
        registrationPhotoFront: vehicle.registration_photo_front,
        registrationPhotoBack: vehicle.registration_photo_back,
        isActive: vehicle.is_active,
        createdAt: vehicle.created_at,
        updatedAt: vehicle.updated_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [getVehicle] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener vehículos de un conductor
 */
export const getDriverVehicles = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    let { driverId } = data;

    if (!driverId) {
      console.log('ℹ️ [getDriverVehicles] driverId no proporcionado, buscando por user_id...');
      const driverRecord = await Driver.findOne({
        where: { user_id: context.auth.uid },
        attributes: ['id'],
      });

      if (!driverRecord) {
        throw new functions.https.HttpsError(
          'not-found',
          `Conductor no encontrado con user_id: ${context.auth.uid}`,
        );
      }

      driverId = driverRecord.id;
      console.log(`✅ [getDriverVehicles] driverId derivado: ${driverId}`);
    }

    console.log(`🚗 [getDriverVehicles] Obteniendo vehículos del conductor: ${driverId}`);

    const vehicles = await vehicleRepo.findByDriverId(driverId);

    return {
      success: true,
      count: vehicles.length,
      vehicles: vehicles.map((v: any) => ({
        id: v.id,
        driverId: v.driver_id,
        plate: v.plate,
        brand: v.brand,
        model: v.model,
        year: v.year,
        color: v.color,
        type: v.type,
        isActive: v.is_active,
        registrationNumber: v.registration_number,
        registrationExpiry: v.registration_expiry,
        registrationPhotoFront: v.registration_photo_front,
        registrationPhotoBack: v.registration_photo_back,
        insuranceNumber: v.insurance_number,
        insuranceCompany: v.insurance_company,
        insuranceExpiry: v.insurance_expiry,
        insurancePhoto: v.insurance_photo,
        vehiclePhoto: v.vehicle_photo,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getDriverVehicles] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar vehículo
 */
export const updateVehicle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { 
      vehicleId, 
      plate, 
      make, 
      model, 
      year, 
      color, 
      vehicleType, 
      status,
      // Campos de fotos
      registration_photo_front,
      registration_photo_back,
      insurance_photo,
      vehicle_photo
    } = data;

    if (!vehicleId) {
      throw new functions.https.HttpsError('invalid-argument', 'vehicleId es requerido');
    }

    console.log(`✏️ [updateVehicle] Actualizando vehículo: ${vehicleId}`);
    console.log(`📋 Datos a actualizar:`, data);

    const updateData: any = {};
    if (plate) updateData.plate = plate;
    if (make) updateData.brand = make;
    if (model) updateData.model = model;
    if (year) updateData.year = year;
    if (color) updateData.color = color;
    if (vehicleType) updateData.type = vehicleType;
    if (status) updateData.is_active = status === 'active';
    
    // Agregar campos de fotos si están presentes
    if (registration_photo_front !== undefined) updateData.registration_photo_front = registration_photo_front;
    if (registration_photo_back !== undefined) updateData.registration_photo_back = registration_photo_back;
    if (insurance_photo !== undefined) updateData.insurance_photo = insurance_photo;
    if (vehicle_photo !== undefined) updateData.vehicle_photo = vehicle_photo;

    console.log(`📝 Datos a guardar en BD:`, updateData);

    const vehicle = await vehicleRepo.update(vehicleId, updateData);

    console.log(`✅ Vehículo actualizado:`, vehicle.id);

    return {
      success: true,
      vehicle: {
        id: vehicle.id,
        driverId: vehicle.driver_id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        type: vehicle.type,
        isActive: vehicle.is_active,
        registrationPhotoFront: vehicle.registration_photo_front,
        registrationPhotoBack: vehicle.registration_photo_back,
        insurancePhoto: vehicle.insurance_photo,
        vehiclePhoto: vehicle.vehicle_photo,
        updatedAt: vehicle.updated_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [updateVehicle] Error:', error);
    console.error('Stack:', error.stack);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Eliminar vehículo
 */
export const deleteVehicle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { vehicleId } = data;

    if (!vehicleId) {
      throw new functions.https.HttpsError('invalid-argument', 'vehicleId es requerido');
    }

    console.log(`🗑️ [deleteVehicle] Eliminando vehículo: ${vehicleId}`);

    const deleted = await vehicleRepo.delete(vehicleId);

    if (!deleted) {
      throw new functions.https.HttpsError('not-found', 'Vehículo no encontrado');
    }

    return {
      success: true,
      message: 'Vehículo eliminado correctamente',
    };
  } catch (error: any) {
    console.error('❌ [deleteVehicle] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Cambiar vehículo activo
 * Actualiza el vehículo activo en Firebase Realtime Database (driversInfo)
 */
export const switchVehicle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const firebaseUserId = context.auth.uid;
    const { vehicleId } = data;

    if (!vehicleId) {
      throw new functions.https.HttpsError('invalid-argument', 'vehicleId es requerido');
    }

    console.log(`🔄 [switchVehicle] Cambiando vehículo activo para: ${firebaseUserId} -> ${vehicleId}`);

    // Obtener el UUID del conductor desde la tabla drivers
    const driver = await Driver.findOne({
      where: { user_id: firebaseUserId },
      attributes: ['id']
    });

    if (!driver) {
      throw new functions.https.HttpsError('not-found', `Conductor no encontrado con user_id: ${firebaseUserId}`);
    }

    const driverId = driver.id;
    console.log(`✅ Conductor encontrado con UUID: ${driverId}`);

    // Obtener datos del vehículo
    const vehicle = await vehicleRepo.findById(vehicleId);

    if (!vehicle) {
      throw new functions.https.HttpsError('not-found', `Vehículo no encontrado: ${vehicleId}`);
    }

    if (!vehicle.is_active) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Este vehículo aún no ha sido aprobado por el equipo administrativo'
      );
    }

    console.log(`📋 Vehículo encontrado:`, vehicle.plate);

    // Actualizar en Firebase Realtime Database - driversInfo
    const vehicleData = {
      id: vehicle.id,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      type: vehicle.type,
      is_4x4: vehicle.is_4x4,
      is_active: true,
    };

    console.log(`📤 Actualizando driversInfo/${firebaseUserId}/vehicle con:`, vehicleData);

    const driverInfoRef = db.ref(`driversInfo/${firebaseUserId}`);

    await driverInfoRef.child('vehicle').set({
      ...vehicleData,
      updated_at: admin.database.ServerValue.TIMESTAMP,
    });

    // No actualizar 'status' en driversInfo aquí. 'account_status' es administrativo y
    // 'status' de disponibilidad se maneja exclusivamente en driverLocations.

    console.log(`✅ Vehículo activo actualizado en Realtime DB`);

    return {
      success: true,
      message: 'Vehículo activo actualizado correctamente',
      vehicle: vehicleData,
    };
  } catch (error: any) {
    console.error('❌ [switchVehicle] Error:', error);
    console.error('Stack:', error.stack);
    throw new functions.https.HttpsError('internal', error.message || 'Error al cambiar vehículo');
  }
});
