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

  const client = await pool.connect();
  try {
    // Obtener datos de PostgreSQL
    const driverResult = await client.query(
      `SELECT d.*, v.plate, v.brand, v.model, v.year, v.color, v.type
       FROM drivers d
       LEFT JOIN vehicles v ON d.id = v.driver_id
       WHERE d.user_id = $1`,
      [targetDriverId]
    );

    if (driverResult.rows.length === 0) {
      throw new Error("Conductor no encontrado");
    }

    // Obtener datos de Firestore
    const userDoc = await admin.firestore().collection("users").doc(targetDriverId).get();
    const userData = userDoc.data();

    // Obtener ubicación actual de Realtime DB
    const locationSnapshot = await admin.database().ref(`driverLocations/${targetDriverId}`).once("value");
    const locationData = locationSnapshot.val();

    return {
      success: true,
      driver: {
        ...driverResult.rows[0],
        ...userData,
        currentLocation: locationData,
      },
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo perfil:", error);
    throw new functions.https.HttpsError("internal", error.message);
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

  // Actualizar en Firestore
  await admin.firestore().collection("users").doc(context.auth.uid).update({
    driverStatus: status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Actualizar en Realtime DB con ubicación
  const updateData: any = {
    status,
    lastUpdate: Date.now(),
  };

  // Si se proporciona ubicación, actualizarla también
  if (latitude !== undefined && longitude !== undefined) {
    updateData.lat = latitude;
    updateData.lng = longitude;
  }

  await admin.database().ref(`driverLocations/${context.auth.uid}`).update(updateData);

  console.log(`🚗 Estado de conductor actualizado: ${context.auth.uid} -> ${status}`);

  return {
    success: true,
    status,
  };
});

/**
 * Obtener conductores disponibles en un área
 * NUEVA FUNCIÓN para verificar disponibilidad
 * NOTA: Esta función NO requiere autenticación (es pública)
 */
export const getAvailableDrivers = functions.https.onCall(async (data, context) => {
  const { latitude, longitude, radius = 10 } = data; // radius en km

  if (!latitude || !longitude) {
    throw new functions.https.HttpsError("invalid-argument", "Ubicación requerida");
  }

  // NO verificar autenticación - función pública

  try {
    // Obtener ubicaciones de conductores directamente de Realtime DB
    const locationsSnapshot = await admin
      .database()
      .ref("driverLocations")
      .once("value");

    const locations = locationsSnapshot.val();

    if (!locations) {
      console.log("ℹ️ No hay conductores con ubicación registrada");
      return {
        success: true,
        available: false,
        count: 0,
        drivers: [],
      };
    }

    // Filtrar conductores disponibles y calcular distancias
    const availableDrivers: any[] = [];

    for (const [driverId, location] of Object.entries(locations as Record<string, any>)) {
      // Solo conductores con estado "available"
      if (!location || location.status !== "available") {
        continue;
      }

      // Calcular distancia (fórmula de Haversine)
      const distance = calculateDistance(
        latitude,
        longitude,
        location.lat,
        location.lng
      );

      // Solo incluir conductores dentro del radio
      if (distance <= radius) {
        availableDrivers.push({
          id: driverId,
          currentLocation: location,
          distance,
        });
      }
    }

    const drivers = availableDrivers;

    console.log(`✅ Conductores disponibles: ${drivers.length}`);

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
