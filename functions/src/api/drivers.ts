/**
 * Drivers API - Migrado de Backend/src/drivers/drivers.service.ts
 * Firebase Functions implementation
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";
import { validateData } from "../utils/validation";
import { UpdateDriverInputSchema, UpdateDriverLocationInputSchema } from "../schemas/driver.schema";

/**
 * Registrar conductor (ya se hace en auth.register, esto es para actualizar)
 * Migrado de: Backend/src/drivers/drivers.service.ts -> create()
 */
export const registerDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  // ✅ VALIDACIÓN CON ZOD
  const validatedData = validateData(UpdateDriverInputSchema, data);
  const { licenseNumber, licenseExpiry, licenseFront, licenseBack, profilePhoto } = validatedData;

  const client = await pool.connect();
  try {
    // Actualizar datos de conductor en PostgreSQL
    const result = await client.query(
      `UPDATE drivers 
       SET license_number = $1, license_expiry = $2, license_photo_front = $3, license_photo_back = $4, profile_photo = $5, updated_at = NOW()
       WHERE user_id = $6
       RETURNING *`,
      [licenseNumber, licenseExpiry, licenseFront, licenseBack, profilePhoto, context.auth.uid]
    );

    if (result.rows.length === 0) {
      throw new Error("Conductor no encontrado");
    }

    console.log(`✅ Datos de conductor actualizados: ${context.auth.uid}`);

    return {
      success: true,
      driver: result.rows[0],
    };
  } catch (error: any) {
    console.error("❌ Error actualizando conductor:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Actualizar ubicación del conductor
 * Migrado de: Backend/src/drivers/drivers.service.ts -> updateLocation()
 */
export const updateDriverLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  // ✅ VALIDACIÓN CON ZOD
  const validatedData = validateData(UpdateDriverLocationInputSchema, data);
  const { lat: latitude, lng: longitude, heading, speed, accuracy } = validatedData;

  // Actualizar en Firebase Realtime Database (tiempo real)
  await admin.database().ref(`driverLocations/${context.auth.uid}`).set({
    lat: latitude,
    lng: longitude,
    heading: heading || 0,
    speed: speed || 0,
    accuracy: accuracy || 0,
    timestamp: Date.now(),
    lastUpdate: Date.now(),
  });

  console.log(`📍 Ubicación actualizada: ${context.auth.uid}`);

  return {
    success: true,
  };
});

/**
 * Obtener perfil de conductor
 * Migrado de: Backend/src/drivers/drivers.service.ts -> findOne()
 */
export const getDriverProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { driverId } = data;
  const targetDriverId = driverId || context.auth.uid;

  console.log(`🔍 Obteniendo perfil de conductor: ${targetDriverId}`);

  const client = await pool.connect();
  try {
    console.log(`📊 Consultando datos en PostgreSQL para user_id: ${targetDriverId}`);

    // Obtener datos de PostgreSQL con JOIN explícito
    const driverResult = await client.query(
      `SELECT
        d.*,
        v.id as vehicle_id, v.plate, v.brand, v.model, v.year, v.color, v.type,
        v.is_4x4, v.motor, v.chasis, v.vin, v.cylinders, v.passengers, v.fuel_type,
        v.tonnage, v.vehicle_class, v.service_type, v.lien, v.emission_date,
        v.registration_number, v.registration_expiry, v.registration_photo,
        v.registration_photo_front, v.registration_photo_back,
        v.insurance_number, v.insurance_company, v.insurance_expiry, v.insurance_photo,
        v.insurance_start_date, v.vehicle_photo,
        v.is_active, v.created_at as vehicle_created_at, v.updated_at as vehicle_updated_at
       FROM drivers d
       LEFT JOIN vehicles v ON v.driver_id = d.id AND v.is_active = true
       WHERE d.user_id = $1`,
      [targetDriverId]
    );

    console.log(`📊 Resultados encontrados: ${driverResult.rows.length} filas`);

    if (driverResult.rows.length === 0) {
      console.log(`❌ Conductor no encontrado en PostgreSQL para user_id: ${targetDriverId}`);

      // Verificar si existe el user en Firebase Auth
      try {
        const userRecord = await admin.auth().getUser(targetDriverId);
        console.log(`ℹ️ Usuario existe en Firebase Auth: ${userRecord.email}`);
      } catch (authError) {
        console.log(`❌ Usuario NO existe en Firebase Auth: ${targetDriverId}`);
      }

      // Verificar si existe el user en Firestore
      const userDoc = await admin.firestore().collection("users").doc(targetDriverId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log(`ℹ️ Usuario existe en Firestore con rol: ${userData?.role}`);
      } else {
        console.log(`❌ Usuario NO existe en Firestore`);
      }

      throw new Error("Conductor no encontrado en la base de datos");
    }

    const driverData = driverResult.rows[0];
    
    // Helper para convertir fechas de PostgreSQL a strings YYYY-MM-DD
    const formatDateToString = (dateValue: any): string | null => {
      if (!dateValue) return null;
      
      // Si ya es un string, devolverlo
      if (typeof dateValue === 'string') {
        return dateValue;
      }
      
      // Si es un objeto Date, convertirlo a YYYY-MM-DD
      if (dateValue instanceof Date) {
        return dateValue.toISOString().split('T')[0];
      }
      
      // Intentar crear Date y convertir
      try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (e) {
        console.error('Error convirtiendo fecha:', e);
      }
      
      return null;
    };
    
    console.log(`✅ Datos del conductor encontrados:`, {
      driver_id: driverData.id,
      license: driverData.license_number,
      department: driverData.department,
      municipality: driverData.municipality,
      license_expiry: driverData.license_expiry,
      license_expiry_type: typeof driverData.license_expiry,
      vehicle_exists: !!driverData.vehicle_id,
      vehicle_plate: driverData.plate
    });

    // Log detallado de las fotos del conductor
    console.log(`📸 Fotos del conductor en BD:`, {
      license_photo: driverData.license_photo,
      license_photo_front: driverData.license_photo_front,
      license_photo_back: driverData.license_photo_back,
      profile_photo: driverData.profile_photo,
    });

    // Log de todos los campos disponibles en driverData
    console.log(`🔍 Campos disponibles en driverData:`, Object.keys(driverData));
    console.log(`🔍 Valores de campos de licencia:`, {
      license_photo: driverData.license_photo,
      license_photo_front: driverData.license_photo_front,
      license_photo_back: driverData.license_photo_back,
      license_photo_front_exists: driverData.hasOwnProperty('license_photo_front'),
      license_photo_back_exists: driverData.hasOwnProperty('license_photo_back'),
    });

    // Obtener datos de Firestore
    const userDoc = await admin.firestore().collection("users").doc(targetDriverId).get();
    const userData = userDoc.data();

    // Obtener ubicación actual de Realtime DB
    const locationSnapshot = await admin.database().ref(`driverLocations/${targetDriverId}`).once("value");
    const locationData = locationSnapshot.val();

    const profile = {
      success: true,
      driver: {
        id: driverData.id,
        user_id: driverData.user_id,
        license_number: driverData.license_number,
        license_expiry: formatDateToString(driverData.license_expiry),
        license_photo: driverData.license_photo,
        license_photo_front: driverData.license_photo_front,
        license_photo_back: driverData.license_photo_back,
        department: driverData.department,
        municipality: driverData.municipality,
        profile_photo: driverData.profile_photo,
        status: driverData.status,
        total_rides: driverData.total_rides,
        average_rating: driverData.average_rating,
        total_earnings: driverData.total_earnings,
        verified_at: formatDateToString(driverData.verified_at),
        created_at: formatDateToString(driverData.created_at),
        updated_at: formatDateToString(driverData.updated_at),
        // Datos del vehículo (si existe)
        vehicle: driverData.vehicle_id ? {
          id: driverData.vehicle_id,
          plate: driverData.plate,
          brand: driverData.brand,
          model: driverData.model,
          year: driverData.year,
          color: driverData.color,
          type: driverData.type,
          is_4x4: driverData.is_4x4,
          motor: driverData.motor,
          chasis: driverData.chasis,
          vin: driverData.vin,
          cylinders: driverData.cylinders,
          passengers: driverData.passengers,
          fuel_type: driverData.fuel_type,
          tonnage: driverData.tonnage,
          vehicle_class: driverData.vehicle_class,
          service_type: driverData.service_type,
          lien: driverData.lien,
          emission_date: formatDateToString(driverData.emission_date),
          registration_number: driverData.registration_number,
          registration_expiry: formatDateToString(driverData.registration_expiry),
          registration_photo: driverData.registration_photo,
          registration_photo_front: driverData.registration_photo_front,
          registration_photo_back: driverData.registration_photo_back,
          insurance_number: driverData.insurance_number,
          insurance_company: driverData.insurance_company,
          insurance_start_date: formatDateToString(driverData.insurance_start_date),
          insurance_expiry: formatDateToString(driverData.insurance_expiry),
          insurance_photo: driverData.insurance_photo,
          vehicle_photo: driverData.vehicle_photo,
          is_active: driverData.is_active,
          created_at: formatDateToString(driverData.vehicle_created_at),
          updated_at: formatDateToString(driverData.vehicle_updated_at),
        } : null,
        // Datos de usuario de Firestore (name, email, phone, role, etc.)
        ...userData,
        // Ubicación actual
        currentLocation: locationData,
      },
    };

    console.log(`✅ Perfil de conductor obtenido exitosamente para: ${targetDriverId}`);
    console.log(`📤 Respuesta final - Campos del conductor:`, {
      department: profile.driver.department,
      municipality: profile.driver.municipality,
      license_expiry: profile.driver.license_expiry,
      license_expiry_type: typeof profile.driver.license_expiry,
    });
    
    if (profile.driver.vehicle) {
      console.log(`📤 Respuesta final - Fechas del vehículo (convertidas a strings):`, {
        registration_expiry: profile.driver.vehicle.registration_expiry,
        insurance_expiry: profile.driver.vehicle.insurance_expiry,
        insurance_start_date: profile.driver.vehicle.insurance_start_date,
        emission_date: profile.driver.vehicle.emission_date,
      });
    }
    
    return profile;

  } catch (error: any) {
    console.error("❌ Error obteniendo perfil de conductor:", error);
    throw new functions.https.HttpsError("internal", `Error obteniendo perfil: ${error.message}`);
  } finally {
    client.release();
  }
});

/**
 * Actualizar estado del conductor
 * Migrado de: Backend/src/drivers/drivers.service.ts -> updateStatus()
 */
export const updateDriverStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { status, latitude, longitude } = data;

  if (!["offline", "available", "busy"].includes(status)) {
    throw new functions.https.HttpsError("invalid-argument", "Estado inválido");
  }

  let client: any;
  try {
    // Actualizar en Firestore (crítico)
    try {
      await admin.firestore().collection("users").doc(context.auth.uid).update({
        driverStatus: status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (firestoreError: any) {
      console.warn("⚠️ Error actualizando Firestore:", firestoreError.message);
      // Continuar aunque falle Firestore
    }

    // Obtener datos del conductor y vehículo de PostgreSQL (no crítico)
    let driverResult: any = { rows: [] };
    try {
      client = await pool.connect();
      driverResult = await client.query(
        `SELECT 
          d.id, d.user_id, d.average_rating, d.profile_photo,
          v.type, v.brand, v.model, v.year, v.color, v.plate, v.is_4x4
         FROM drivers d
         LEFT JOIN vehicles v ON v.driver_id = d.id AND v.is_active = true
         WHERE d.user_id = $1`,
        [context.auth.uid]
      );
    } catch (pgError: any) {
      console.warn("⚠️ Error consultando PostgreSQL:", pgError.message);
      // Continuar sin datos de PostgreSQL
    }

    // Obtener datos de Firestore
    let userData: any = {};
    try {
      const userDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
      userData = userDoc.data() || {};
    } catch (userError: any) {
      console.warn("⚠️ Error obteniendo datos de usuario:", userError.message);
    }

    // Preparar datos para Realtime DB
    const updateData: any = {
      status,
      lastUpdate: Date.now(),
      fullName: userData?.fullName || userData?.name || 'Conductor',
      phone: userData?.phone || '',
      averageRating: driverResult.rows[0]?.average_rating || 0,
      photoURL: driverResult.rows[0]?.profile_photo || userData?.profilePhoto || null,
    };

    // Si se proporciona ubicación, actualizarla también
    if (latitude !== undefined && longitude !== undefined) {
      updateData.lat = latitude;
      updateData.lng = longitude;
    }

    // Si tiene vehículo, agregarlo
    if (driverResult.rows.length > 0 && driverResult.rows[0].type) {
      const vehicleData = driverResult.rows[0];
      updateData.vehicle = {
        type: vehicleData.type,
        brand: vehicleData.brand,
        model: vehicleData.model,
        year: vehicleData.year,
        color: vehicleData.color,
        plate: vehicleData.plate,
        is4x4: vehicleData.is_4x4 || false,
      };
      console.log(`🚗 Vehículo agregado: ${vehicleData.type} ${vehicleData.brand} ${vehicleData.model}`);
    }

    // Actualizar en Realtime DB (crítico)
    try {
      await admin.database().ref(`driversInfo/${context.auth.uid}`).update(updateData);
      
      // Mantener driverLocations por compatibilidad (deprecated)
      await admin.database().ref(`driverLocations/${context.auth.uid}`).update({
        status,
        lastUpdate: Date.now(),
        lat: latitude,
        lng: longitude,
      });
    } catch (dbError: any) {
      console.error("❌ Error actualizando Realtime DB:", dbError.message);
      throw new functions.https.HttpsError("unavailable", "No se pudo actualizar estado del conductor");
    }

    console.log(`✅ Estado de conductor actualizado: ${context.auth.uid} -> ${status}`);

    return {
      success: true,
      status,
    };
  } catch (error: any) {
    console.error("❌ Error actualizando estado:", error.message);
    throw new functions.https.HttpsError("internal", error.message || "Error actualizando estado");
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        console.warn("⚠️ Error liberando conexión PostgreSQL:", releaseError);
      }
    }
  }
});

/**
 * Obtener conductores disponibles en un área
 * NUEVA FUNCIÓN para verificar disponibilidad
 * NOTA: Esta función NO requiere autenticación (es pública)
 */
// ✅ ELIMINADO: updateDesignatedDriverMode
// Ahora los conductores ofrecen servicios a través de driver_services
// El modo se controla por getDriverServices() que retorna servicios activos

export const getAvailableDrivers = functions.https.onCall(async (data, context) => {
  const { latitude, longitude, radius = 10, vehicleType, serviceCode } = data; // radius en km, vehicleType opcional, serviceCode opcional

  console.log(`🔍 Buscando conductores cerca de: ${latitude}, ${longitude} (radio: ${radius}km, tipo: ${vehicleType || 'todos'}, servicio: ${serviceCode || 'todos'})`);

  if (!latitude || !longitude) {
    throw new functions.https.HttpsError("invalid-argument", "Ubicación requerida");
  }

  // NO verificar autenticación - función pública

  try {
    // Obtener conductores de driversInfo (nueva estructura con vehículo incluido)
    const driversSnapshot = await admin
      .database()
      .ref("driversInfo")
      .once("value");

    const driversData = driversSnapshot.val();

    console.log(`📍 Conductores en driversInfo:`, driversData ? Object.keys(driversData).length : 0);

    if (!driversData) {
      console.log("ℹ️ No hay conductores registrados en driversInfo");
      return {
        success: true,
        available: false,
        count: 0,
        drivers: [],
      };
    }

    // Filtrar conductores disponibles y calcular distancias
    const availableDrivers: any[] = [];
    let totalDrivers = 0;
    let availableCount = 0;
    let withinRadiusCount = 0;

    for (const [driverId, driverInfo] of Object.entries(driversData as Record<string, any>)) {
      totalDrivers++;
      console.log(`👤 Conductor ${driverId}:`, {
        status: driverInfo?.status,
        lat: driverInfo?.lat,
        lng: driverInfo?.lng,
        vehicleType: driverInfo?.vehicle?.type,
      });

      // Solo conductores con estado "available"
      if (!driverInfo || driverInfo.status !== "available") {
        console.log(`  ⏭️ Saltando - Estado: ${driverInfo?.status || 'sin estado'}`);
        continue;
      }

      // Filtrar por tipo de vehículo si se especificó
      if (vehicleType && driverInfo.vehicle) {
        const driverVehicleType = driverInfo.vehicle.type?.toLowerCase();
        
        if (vehicleType === 'auto') {
          // Si buscan "auto", incluir sedan, suv, pickup
          if (!['sedan', 'sedán', 'suv', 'pickup'].includes(driverVehicleType)) {
            console.log(`  ⏭️ Saltando - Vehículo tipo "${driverVehicleType}" no es auto`);
            continue;
          }
        } else {
          // Para moto o designated_driver, buscar exacto
          if (driverVehicleType !== vehicleType.toLowerCase()) {
            console.log(`  ⏭️ Saltando - Vehículo tipo "${driverVehicleType}" != "${vehicleType}"`);
            continue;
          }
        }
      } else if (vehicleType) {
        // Si se especificó tipo pero el conductor no tiene vehículo registrado
        console.log(`  ⏭️ Saltando - No tiene vehículo registrado`);
        continue;
      }

      // ✅ NUEVO: Filtrar por servicio si se especificó
      if (serviceCode) {
        try {
          const client = await pool.connect();
          try {
            const serviceResult = await client.query(
              `SELECT ds.* FROM driver_services ds
               JOIN services s ON ds.service_id = s.id
               WHERE ds.driver_id = (SELECT id FROM drivers WHERE user_id = $1)
               AND s.code = $2
               AND ds.is_active = true
               AND ds.is_approved = true
               AND (ds.expires_at IS NULL OR ds.expires_at > NOW())`,
              [driverId, serviceCode]
            );

            if (serviceResult.rows.length === 0) {
              console.log(`  ⏭️ Saltando - No ofrece servicio '${serviceCode}'`);
              continue;
            }
            console.log(`  ✅ Ofrece servicio '${serviceCode}'`);
          } finally {
            client.release();
          }
        } catch (err) {
          console.error(`  ⚠️ Error verificando servicio para ${driverId}:`, err);
          continue;
        }
      }

      availableCount++;

      // Calcular distancia (fórmula de Haversine)
      const distance = calculateDistance(
        latitude,
        longitude,
        driverInfo.lat,
        driverInfo.lng
      );

      console.log(`  📏 Distancia: ${distance.toFixed(2)}km`);

      // Solo incluir conductores dentro del radio
      if (distance <= radius) {
        withinRadiusCount++;
        availableDrivers.push({
          id: driverId,
          fullName: driverInfo.fullName,
          phone: driverInfo.phone,
          averageRating: driverInfo.averageRating,
          vehicle: driverInfo.vehicle,
          currentLocation: {
            lat: driverInfo.lat,
            lng: driverInfo.lng,
            lastUpdate: driverInfo.lastUpdate,
          },
          distance,
        });
        console.log(`  ✅ Conductor agregado con vehículo: ${driverInfo.vehicle?.type}`);
      } else {
        console.log(`  ❌ Fuera del radio (${distance.toFixed(2)}km > ${radius}km)`);
      }
    }

    const drivers = availableDrivers;

    console.log(`📊 Resumen:`);
    console.log(`  - Total conductores en DB: ${totalDrivers}`);
    console.log(`  - Conductores "available": ${availableCount}`);
    console.log(`  - Dentro del radio: ${withinRadiusCount}`);
    console.log(`  - Conductores finales: ${drivers.length}`);

    return {
      success: true,
      available: drivers.length > 0,
      count: drivers.length,
      drivers,
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo conductores disponibles:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Calcular distancia entre dos puntos (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Actualizar información del conductor (fotos de licencia, etc.)
 */
export const updateDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { 
    license_photo_front, 
    license_photo_back,
    license_number,
    license_expiry,
    department,
    municipality,
    profile_photo
  } = data;

  const client = await pool.connect();
  try {
    // Construir query dinámicamente solo con campos proporcionados
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (license_photo_front !== undefined) {
      updates.push(`license_photo_front = $${paramCount++}`);
      values.push(license_photo_front);
    }
    if (license_photo_back !== undefined) {
      updates.push(`license_photo_back = $${paramCount++}`);
      values.push(license_photo_back);
    }
    if (license_number !== undefined) {
      updates.push(`license_number = $${paramCount++}`);
      values.push(license_number);
    }
    if (license_expiry !== undefined) {
      updates.push(`license_expiry = $${paramCount++}`);
      values.push(license_expiry);
    }
    if (department !== undefined) {
      updates.push(`department = $${paramCount++}`);
      values.push(department);
    }
    if (municipality !== undefined) {
      updates.push(`municipality = $${paramCount++}`);
      values.push(municipality);
    }
    if (profile_photo !== undefined) {
      updates.push(`profile_photo = $${paramCount++}`);
      values.push(profile_photo);
    }

    if (updates.length === 0) {
      throw new Error("No hay campos para actualizar");
    }

    updates.push(`updated_at = NOW()`);
    values.push(context.auth.uid);

    const query = `
      UPDATE drivers 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("Conductor no encontrado");
    }

    // Si se actualizó la foto de perfil, también actualizar en Firestore
    if (profile_photo !== undefined) {
      console.log(`📸 Actualizando foto de perfil en Firestore: ${profile_photo}`);
      await admin.firestore().collection("users").doc(context.auth.uid).update({
        profilePhoto: profile_photo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`✅ Foto de perfil actualizada en Firestore`);
    }

    console.log(`✅ Conductor actualizado: ${context.auth.uid}`);

    return {
      success: true,
      driver: result.rows[0],
    };
  } catch (error: any) {
    console.error("❌ Error actualizando conductor:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Actualizar información del vehículo (fotos de documentos, etc.)
 */
export const updateVehicle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }
  const { 
    vehicleId,
    registration_photo_front,
    registration_photo_back,
    insurance_photo,
    vehicle_photo,
    registration_number,
    registration_expiry,
    insurance_number,
    insurance_company,
    insurance_start_date,
    insurance_expiry,
    motor,
    chasis,
    vin,
    cylinders,
    passengers,
    fuel_type,
    tonnage,
    vehicle_class,
    service_type,
    lien,
    plate,
    brand,
    model,
    year,
    color,
    vehicleType,
    is_4x4
  } = data;

  if (!vehicleId) {
    throw new functions.https.HttpsError("invalid-argument", "vehicleId es requerido");
  }

  const client = await pool.connect();
  try {
    // Construir query dinámicamente
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (registration_photo_front !== undefined) {
      updates.push(`registration_photo_front = $${paramCount++}`);
      values.push(registration_photo_front);
    }
    if (registration_photo_back !== undefined) {
      updates.push(`registration_photo_back = $${paramCount++}`);
      values.push(registration_photo_back);
    }
    if (insurance_photo !== undefined) {
      updates.push(`insurance_photo = $${paramCount++}`);
      values.push(insurance_photo);
    }
    if (vehicle_photo !== undefined) {
      updates.push(`vehicle_photo = $${paramCount++}`);
      values.push(vehicle_photo);
    }
    if (registration_number !== undefined) {
      updates.push(`registration_number = $${paramCount++}`);
      values.push(registration_number);
    }
    if (registration_expiry !== undefined) {
      updates.push(`registration_expiry = $${paramCount++}`);
      values.push(registration_expiry);
    }
    if (insurance_number !== undefined) {
      updates.push(`insurance_number = $${paramCount++}`);
      values.push(insurance_number);
    }
    if (insurance_company !== undefined) {
      updates.push(`insurance_company = $${paramCount++}`);
      values.push(insurance_company);
    }
    if (insurance_start_date !== undefined) {
      updates.push(`insurance_start_date = $${paramCount++}`);
      values.push(insurance_start_date);
    }
    if (insurance_expiry !== undefined) {
      updates.push(`insurance_expiry = $${paramCount++}`);
      values.push(insurance_expiry);
    }
    if (motor !== undefined) {
      updates.push(`motor = $${paramCount++}`);
      values.push(motor);
    }
    if (chasis !== undefined) {
      updates.push(`chasis = $${paramCount++}`);
      values.push(chasis);
    }
    if (vin !== undefined) {
      updates.push(`vin = $${paramCount++}`);
      values.push(vin);
    }
    if (cylinders !== undefined) {
      updates.push(`cylinders = $${paramCount++}`);
      values.push(cylinders);
    }
    if (passengers !== undefined) {
      updates.push(`passengers = $${paramCount++}`);
      values.push(passengers);
    }
    if (fuel_type !== undefined) {
      updates.push(`fuel_type = $${paramCount++}`);
      values.push(fuel_type);
    }
    if (tonnage !== undefined) {
      updates.push(`tonnage = $${paramCount++}`);
      values.push(tonnage);
    }
    if (vehicle_class !== undefined) {
      updates.push(`vehicle_class = $${paramCount++}`);
      values.push(vehicle_class);
    }
    if (service_type !== undefined) {
      updates.push(`service_type = $${paramCount++}`);
      values.push(service_type);
    }
    if (lien !== undefined) {
      updates.push(`lien = $${paramCount++}`);
      values.push(lien);
    }
    if (plate !== undefined) {
      updates.push(`plate = $${paramCount++}`);
      values.push(plate);
    }
    if (brand !== undefined) {
      updates.push(`brand = $${paramCount++}`);
      values.push(brand);
    }
    if (model !== undefined) {
      updates.push(`model = $${paramCount++}`);
      values.push(model);
    }
    if (year !== undefined) {
      updates.push(`year = $${paramCount++}`);
      values.push(year);
    }
    if (color !== undefined) {
      updates.push(`color = $${paramCount++}`);
      values.push(color);
    }
    if (vehicleType !== undefined) {
      updates.push(`type = $${paramCount++}`);
      values.push(vehicleType);
    }
    if (is_4x4 !== undefined) {
      updates.push(`is_4x4 = $${paramCount++}`);
      values.push(is_4x4);
    }

    if (updates.length === 0) {
      throw new Error("No hay campos para actualizar");
    }

    updates.push(`updated_at = NOW()`);
    values.push(vehicleId);

    const query = `
      UPDATE vehicles 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("Vehículo no encontrado");
    }

    console.log(`✅ Vehículo actualizado: ${vehicleId}`);

    return {
      success: true,
      vehicle: result.rows[0],
    };
  } catch (error: any) {
    console.error("❌ Error actualizando vehículo:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Agregar nuevo vehículo para un conductor
 * Crea un nuevo registro en la tabla vehicles
 */
export const addVehicle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const {
    plate,
    brand,
    model,
    year,
    color,
    type,
    motor,
    chasis,
    vin,
    cylinders,
    passengers,
    fuel_type,
    tonnage,
    vehicle_class,
    service_type,
    lien,
    emission_date,
    registration_number,
    registration_expiry,
    registration_photo,
    registration_photo_front,
    registration_photo_back,
    insurance_number,
    insurance_company,
    insurance_start_date,
    insurance_expiry,
    insurance_photo,
    vehicle_photo,
  } = data;

  console.log(`🚗 Agregando nuevo vehículo para conductor: ${context.auth.uid}`);

  const client = await pool.connect();
  try {
    // Obtener driver_id del usuario
    const driverResult = await client.query(
      `SELECT id FROM drivers WHERE user_id = $1`,
      [context.auth.uid]
    );

    if (driverResult.rows.length === 0) {
      throw new Error("Conductor no encontrado");
    }

    const driverId = driverResult.rows[0].id;

    // Insertar nuevo vehículo
    const vehicleResult = await client.query(
      `INSERT INTO vehicles (
        driver_id, plate, brand, model, year, color, type,
        motor, chasis, vin, cylinders, passengers, fuel_type,
        tonnage, vehicle_class, service_type, lien, emission_date,
        registration_number, registration_expiry, registration_photo,
        registration_photo_front, registration_photo_back,
        insurance_number, insurance_company, insurance_start_date,
        insurance_expiry, insurance_photo, vehicle_photo, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
        $26, $27, $28, $29, true
      ) RETURNING *`,
      [
        driverId, plate, brand, model, year, color, type,
        motor, chasis, vin, cylinders, passengers, fuel_type,
        tonnage, vehicle_class, service_type, lien, emission_date,
        registration_number, registration_expiry, registration_photo,
        registration_photo_front, registration_photo_back,
        insurance_number, insurance_company, insurance_start_date,
        insurance_expiry, insurance_photo, vehicle_photo,
      ]
    );

    console.log(`✅ Vehículo agregado exitosamente: ${vehicleResult.rows[0].id}`);

    return {
      success: true,
      vehicle: vehicleResult.rows[0],
    };
  } catch (error: any) {
    console.error("❌ Error agregando vehículo:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Cambiar vehículo activo del conductor
 * Desactiva el vehículo actual y activa el nuevo
 * También actualiza la información en Firebase Realtime Database
 */
export const switchVehicle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { vehicleId } = data;

  if (!vehicleId) {
    throw new functions.https.HttpsError("invalid-argument", "vehicleId es requerido");
  }

  console.log(`🔄 Cambiando vehículo activo para conductor: ${context.auth.uid}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Obtener driver_id del usuario
    const driverResult = await client.query(
      `SELECT id FROM drivers WHERE user_id = $1`,
      [context.auth.uid]
    );

    if (driverResult.rows.length === 0) {
      throw new Error("Conductor no encontrado");
    }

    const driverId = driverResult.rows[0].id;

    // Verificar que el vehículo pertenece al conductor
    const vehicleCheck = await client.query(
      `SELECT id FROM vehicles WHERE id = $1 AND driver_id = $2`,
      [vehicleId, driverId]
    );

    if (vehicleCheck.rows.length === 0) {
      throw new Error("Vehículo no encontrado o no pertenece a este conductor");
    }

    // Desactivar todos los vehículos del conductor
    await client.query(
      `UPDATE vehicles SET is_active = false WHERE driver_id = $1`,
      [driverId]
    );

    // Activar el nuevo vehículo
    const switchResult = await client.query(
      `UPDATE vehicles SET is_active = true WHERE id = $1 RETURNING *`,
      [vehicleId]
    );

    await client.query("COMMIT");

    const newVehicle = switchResult.rows[0];

    // ✅ NUEVO: Actualizar información del vehículo en Firebase Realtime Database
    console.log(`📡 Actualizando vehículo en Firebase Realtime Database para: ${context.auth.uid}`);
    
    await admin.database().ref(`driversInfo/${context.auth.uid}/vehicle`).set({
      id: newVehicle.id,
      plate: newVehicle.plate,
      brand: newVehicle.brand,
      model: newVehicle.model,
      year: newVehicle.year,
      color: newVehicle.color,
      type: newVehicle.type,
      is_4x4: newVehicle.is_4x4 || false,
      motor: newVehicle.motor,
      chasis: newVehicle.chasis,
      vin: newVehicle.vin,
      cylinders: newVehicle.cylinders,
      passengers: newVehicle.passengers,
      fuel_type: newVehicle.fuel_type,
      tonnage: newVehicle.tonnage,
      vehicle_class: newVehicle.vehicle_class,
      service_type: newVehicle.service_type,
      lien: newVehicle.lien,
      emission_date: newVehicle.emission_date,
      registration_number: newVehicle.registration_number,
      registration_expiry: newVehicle.registration_expiry,
      registration_photo: newVehicle.registration_photo,
      registration_photo_front: newVehicle.registration_photo_front,
      registration_photo_back: newVehicle.registration_photo_back,
      insurance_number: newVehicle.insurance_number,
      insurance_company: newVehicle.insurance_company,
      insurance_start_date: newVehicle.insurance_start_date,
      insurance_expiry: newVehicle.insurance_expiry,
      insurance_photo: newVehicle.insurance_photo,
      vehicle_photo: newVehicle.vehicle_photo,
      updated_at: Date.now(),
    });

    console.log(`✅ Vehículo cambiado exitosamente a: ${vehicleId}`);
    console.log(`✅ Información del vehículo actualizada en Firebase Realtime Database`);

    return {
      success: true,
      vehicle: newVehicle,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Error cambiando vehículo:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener todos los vehículos del conductor
 */
export const getDriverVehicles = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  console.log(`🚗 Obteniendo vehículos del conductor: ${context.auth.uid}`);

  const client = await pool.connect();
  try {
    // Obtener driver_id del usuario
    const driverResult = await client.query(
      `SELECT id FROM drivers WHERE user_id = $1`,
      [context.auth.uid]
    );

    if (driverResult.rows.length === 0) {
      throw new Error("Conductor no encontrado");
    }

    const driverId = driverResult.rows[0].id;

    // Obtener todos los vehículos del conductor
    const vehiclesResult = await client.query(
      `SELECT * FROM vehicles WHERE driver_id = $1 ORDER BY is_active DESC, created_at DESC`,
      [driverId]
    );

    console.log(`✅ ${vehiclesResult.rows.length} vehículos encontrados`);

    // Helper para convertir fechas de PostgreSQL a strings YYYY-MM-DD
    const formatDateToString = (dateValue: any): string | null => {
      if (!dateValue) return null;
      
      // Si ya es un string, devolverlo
      if (typeof dateValue === 'string') {
        return dateValue.split('T')[0]; // Remover hora si existe
      }
      
      // Si es un objeto Date
      if (dateValue instanceof Date) {
        return dateValue.toISOString().split('T')[0];
      }
      
      // Intentar convertir como fecha
      try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (e) {
        console.warn(`⚠️ No se pudo convertir fecha: ${dateValue}`);
      }
      
      return null;
    };

    // Normalizar fechas en cada vehículo
    const normalizedVehicles = vehiclesResult.rows.map((vehicle: any) => ({
      ...vehicle,
      registration_expiry: formatDateToString(vehicle.registration_expiry),
      insurance_expiry: formatDateToString(vehicle.insurance_expiry),
      insurance_start_date: formatDateToString(vehicle.insurance_start_date),
      emission_date: formatDateToString(vehicle.emission_date),
      created_at: formatDateToString(vehicle.created_at),
      updated_at: formatDateToString(vehicle.updated_at),
    }));

    console.log(`📤 Primer vehículo normalizado:`, JSON.stringify(normalizedVehicles[0], null, 2));

    return {
      success: true,
      vehicles: normalizedVehicles,
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo vehículos:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

// ✅ ELIMINADO: requestDesignatedDriverAccess
// Ahora usar: assignServiceToDriver(driverId, serviceId)
// Donde serviceId es el UUID del servicio "designated_driver"

// ✅ ELIMINADO: getDesignatedDriverRequestStatus
// Ahora usar: getDriverServices(driverId)
// Que retorna servicios activos y aprobados del conductor

// ✅ ELIMINADO: approveDesignatedDriverRequest
// Ahora usar: approveDriverService(driverServiceId, approved)
// Que ya existe en driverServices.ts

// ✅ ELIMINADO: rejectDesignatedDriverRequest
// Ahora usar: approveDriverService(driverServiceId, approved=false)
// Que ya existe en driverServices.ts
