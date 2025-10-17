/**
 * Drivers API - Migrado de Backend/src/drivers/drivers.service.ts
 * Firebase Functions implementation
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";

/**
 * Registrar conductor (ya se hace en auth.register, esto es para actualizar)
 * Migrado de: Backend/src/drivers/drivers.service.ts -> create()
 */
export const registerDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { licenseNumber, licenseExpiry, licensePhoto } = data;

  const client = await pool.connect();
  try {
    // Actualizar datos de conductor en PostgreSQL
    const result = await client.query(
      `UPDATE drivers 
       SET license_number = $1, license_expiry = $2, license_photo = $3, updated_at = NOW()
       WHERE user_id = $4
       RETURNING *`,
      [licenseNumber, licenseExpiry, licensePhoto, context.auth.uid]
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

  const { latitude, longitude, heading, speed, accuracy } = data;

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
        d.id, d.user_id, d.license_number, d.license_expiry, d.license_photo,
        d.status, d.total_rides, d.average_rating, d.total_earnings,
        d.created_at, d.updated_at,
        v.id as vehicle_id, v.plate, v.brand, v.model, v.year, v.color, v.type,
        v.registration_number, v.registration_expiry, v.registration_photo,
        v.insurance_number, v.insurance_company, v.insurance_expiry, v.insurance_photo,
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
    console.log(`✅ Datos del conductor encontrados:`, {
      driver_id: driverData.id,
      license: driverData.license_number,
      vehicle_exists: !!driverData.vehicle_id,
      vehicle_plate: driverData.plate
    });

    // Obtener datos de Firestore
    const userDoc = await admin.firestore().collection("users").doc(targetDriverId).get();
    const userData = userDoc.data();

    // Obtener ubicación actual de Realtime DB
    const locationSnapshot = await admin.database().ref(`driverLocations/${targetDriverId}`).once("value");
    const locationData = locationSnapshot.val();

    // Preparar respuesta con estructura consistente
    const profile = {
      success: true,
      driver: {
        id: driverData.id,
        user_id: driverData.user_id,
        license_number: driverData.license_number,
        license_expiry: driverData.license_expiry,
        license_photo: driverData.license_photo,
        status: driverData.status,
        total_rides: driverData.total_rides,
        average_rating: driverData.average_rating,
        total_earnings: driverData.total_earnings,
        created_at: driverData.created_at,
        updated_at: driverData.updated_at,
        // Datos del vehículo (si existe)
        vehicle: driverData.vehicle_id ? {
          id: driverData.vehicle_id,
          plate: driverData.plate,
          brand: driverData.brand,
          model: driverData.model,
          year: driverData.year,
          color: driverData.color,
          type: driverData.type,
          registration_number: driverData.registration_number,
          registration_expiry: driverData.registration_expiry,
          registration_photo: driverData.registration_photo,
          insurance_number: driverData.insurance_number,
          insurance_company: driverData.insurance_company,
          insurance_expiry: driverData.insurance_expiry,
          insurance_photo: driverData.insurance_photo,
          is_active: driverData.is_active,
          created_at: driverData.vehicle_created_at,
          updated_at: driverData.vehicle_updated_at,
        } : null,
        // Datos de usuario de Firestore
        ...userData,
        // Ubicación actual
        currentLocation: locationData,
      },
    };

    console.log(`✅ Perfil de conductor obtenido exitosamente para: ${targetDriverId}`);
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

  const client = await pool.connect();
  try {
    // Actualizar en Firestore
    await admin.firestore().collection("users").doc(context.auth.uid).update({
      driverStatus: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Obtener datos del conductor y vehículo de PostgreSQL
    const driverResult = await client.query(
      `SELECT 
        d.id, d.user_id, d.average_rating,
        v.type, v.brand, v.model, v.year, v.color, v.plate, v.is_4x4
       FROM drivers d
       LEFT JOIN vehicles v ON v.driver_id = d.id AND v.is_active = true
       WHERE d.user_id = $1`,
      [context.auth.uid]
    );

    // Obtener datos de Firestore
    const userDoc = await admin.firestore().collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();

    // Preparar datos para Realtime DB
    const updateData: any = {
      status,
      lastUpdate: Date.now(),
      fullName: userData?.fullName || userData?.name || 'Conductor',
      phone: userData?.phone || '',
      averageRating: driverResult.rows[0]?.average_rating || 0,
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

    // Actualizar en driversInfo (nueva estructura)
    await admin.database().ref(`driversInfo/${context.auth.uid}`).update(updateData);
    
    // Mantener driverLocations por compatibilidad (deprecated)
    await admin.database().ref(`driverLocations/${context.auth.uid}`).update({
      status,
      lastUpdate: Date.now(),
      lat: latitude,
      lng: longitude,
    });

    console.log(`✅ Estado de conductor actualizado: ${context.auth.uid} -> ${status}`);

    return {
      success: true,
      status,
    };
  } catch (error: any) {
    console.error("❌ Error actualizando estado:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener conductores disponibles en un área
 * NUEVA FUNCIÓN para verificar disponibilidad
 * NOTA: Esta función NO requiere autenticación (es pública)
 */
/**
 * Actualizar modo conductor designado
 */
export const updateDesignatedDriverMode = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { driverId, isActive } = data;

  if (!driverId) {
    throw new functions.https.HttpsError("invalid-argument", "Driver ID requerido");
  }

  try {
    // Actualizar en Firebase Realtime DB
    await admin.database().ref(`driverLocations/${driverId}`).update({
      designatedDriverMode: isActive,
      updatedAt: Date.now(),
    });

    console.log(`✅ Modo conductor designado ${isActive ? 'activado' : 'desactivado'} para driver ${driverId}`);

    return {
      success: true,
      message: `Modo conductor designado ${isActive ? 'activado' : 'desactivado'}`,
    };
  } catch (error: any) {
    console.error("❌ Error actualizando modo conductor designado:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

export const getAvailableDrivers = functions.https.onCall(async (data, context) => {
  const { latitude, longitude, radius = 10, vehicleType } = data; // radius en km, vehicleType opcional

  console.log(`🔍 Buscando conductores cerca de: ${latitude}, ${longitude} (radio: ${radius}km, tipo: ${vehicleType || 'todos'})`);

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
