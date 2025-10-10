/**
 * Rides API - Migrado de Backend/src/rides/rides.service.ts
 * Firebase Functions implementation
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import pool from "../config/database";

// Tipos
enum RideStatus {
  REQUESTED = "requested",
  ACCEPTED = "accepted",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELED = "canceled",
}

enum RideType {
  NORMAL = "normal",
  PREMIUM = "premium",
  SHARED = "shared",
}

/**
 * Calcular distancia entre dos puntos (Haversine formula)
 * Copiado de Backend/src/rides/rides.service.ts
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Solicitar viaje
 * Migrado de: Backend/src/rides/rides.service.ts -> requestRide()
 */
export const requestRide = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const {
    origin,
    destination,
    estimatedDistance,
    estimatedDuration,
    estimatedPrice,
    rideType,
    clientSuggestedPrice,
    notes,
  } = data;

  // Constantes de tarifas
  const MINIMUM_FARE = 50; // C$50 mínimo

  // Validaciones
  if (!origin || !destination) {
    throw new functions.https.HttpsError("invalid-argument", "Origen y destino requeridos");
  }

  // Validar precio mínimo
  if (clientSuggestedPrice && clientSuggestedPrice < MINIMUM_FARE) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `El precio sugerido debe ser mínimo C$${MINIMUM_FARE}`
    );
  }

  // Garantizar que el precio estimado sea mínimo C$50
  const finalEstimatedPrice = Math.max(estimatedPrice || MINIMUM_FARE, MINIMUM_FARE);

  // Validar que origen y destino sean diferentes
  const distance = calculateDistance(
    origin.lat,
    origin.lng,
    destination.lat,
    destination.lng
  );

  if (distance < 0.1) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Origin and destination must be at least 100 meters apart"
    );
  }

  // Validar precio estimado
  const minPrice = 50;
  const maxPrice = (estimatedDistance / 1000) * 50 + 100;

  if (estimatedPrice < minPrice || estimatedPrice > maxPrice) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Estimated price must be between C$${minPrice} and C$${maxPrice.toFixed(0)}`
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insertar viaje en PostgreSQL
    const result = await client.query(
      `INSERT INTO rides (
        client_id, origin_lat, origin_lng, origin_address,
        destination_lat, destination_lng, destination_address,
        estimated_distance, estimated_duration, estimated_price,
        client_suggested_price, notes, ride_type,
        status, requested_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      RETURNING *`,
      [
        context.auth.uid,
        origin.lat,
        origin.lng,
        origin.address,
        destination.lat,
        destination.lng,
        destination.address,
        estimatedDistance,
        estimatedDuration,
        finalEstimatedPrice, // Usar precio validado
        clientSuggestedPrice || null,
        notes || null,
        rideType || RideType.NORMAL,
        RideStatus.REQUESTED,
      ]
    );

    const ride = result.rows[0];

    // Publicar en Firebase Realtime Database para notificaciones en tiempo real
    await admin.database().ref(`activeRides/${ride.id}`).set({
      id: ride.id,
      clientId: context.auth.uid,
      status: RideStatus.REQUESTED,
      origin: {
        lat: origin.lat,
        lng: origin.lng,
        address: origin.address,
      },
      destination: {
        lat: destination.lat,
        lng: destination.lng,
        address: destination.address,
      },
      estimatedDistance,
      estimatedDuration,
      estimatedPrice,
      rideType: rideType || RideType.NORMAL,
      requestedAt: Date.now(),
      lastUpdate: Date.now(),
    });

    await client.query("COMMIT");

    console.log(`✅ Nueva solicitud de viaje creada: ${ride.id}`);

    return {
      success: true,
      ride,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Error creando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Aceptar viaje
 * Migrado de: Backend/src/rides/rides.controller.ts -> acceptRide()
 */
export const acceptRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId } = data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Actualizar viaje en PostgreSQL
    const result = await client.query(
      `UPDATE rides 
       SET driver_id = $1, status = $2, accepted_at = NOW()
       WHERE id = $3 AND status = $4
       RETURNING *`,
      [context.auth.uid, RideStatus.ACCEPTED, rideId, RideStatus.REQUESTED]
    );

    if (result.rows.length === 0) {
      throw new Error("Ride not found or already accepted");
    }

    const ride = result.rows[0];

    // Actualizar en Firebase Realtime Database
    await admin.database().ref(`activeRides/${rideId}`).update({
      driverId: context.auth.uid,
      status: RideStatus.ACCEPTED,
      acceptedAt: Date.now(),
      lastUpdate: Date.now(),
    });

    await client.query("COMMIT");

    console.log(`✅ Viaje aceptado: ${rideId} por conductor ${context.auth.uid}`);

    // Obtener información del conductor y cliente
    let driverData = null;
    let clientData = null;

    try {
      const driverRecord = await admin.auth().getUser(context.auth.uid);
      driverData = {
        id: driverRecord.uid,
        name: driverRecord.displayName || "Conductor",
        email: driverRecord.email || "",
        phone: driverRecord.phoneNumber || "",
      };
    } catch (error) {
      console.error(`Error obteniendo conductor:`, error);
    }

    try {
      const clientRecord = await admin.auth().getUser(ride.client_id);
      clientData = {
        id: clientRecord.uid,
        name: clientRecord.displayName || "Usuario",
        email: clientRecord.email || "",
        phone: clientRecord.phoneNumber || "",
      };
    } catch (error) {
      console.error(`Error obteniendo cliente:`, error);
    }

    return {
      success: true,
      ride: {
        id: ride.id,
        clientId: ride.client_id,
        driverId: ride.driver_id,
        status: ride.status,
        originAddress: ride.origin_address,
        destinationAddress: ride.destination_address,
        originLat: ride.origin_lat,
        originLng: ride.origin_lng,
        destinationLat: ride.destination_lat,
        destinationLng: ride.destination_lng,
        estimatedDistance: ride.estimated_distance,
        estimatedDuration: ride.estimated_duration,
        estimatedPrice: ride.estimated_price,
        estimatedFare: ride.estimated_price,
        finalPrice: ride.final_price,
        rideType: ride.ride_type,
        notes: ride.notes,
        createdAt: ride.created_at,
        requestedAt: ride.requested_at,
        acceptedAt: ride.accepted_at,
        startedAt: ride.started_at,
        completedAt: ride.completed_at,
        canceledAt: ride.canceled_at,
        cancelReason: ride.cancel_reason,
        client: clientData,
        driver: driverData,
      },
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Error aceptando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Iniciar viaje
 */
export const startRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId } = data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE rides 
       SET status = $1, started_at = NOW()
       WHERE id = $2 AND driver_id = $3 AND status = $4
       RETURNING *`,
      [RideStatus.IN_PROGRESS, rideId, context.auth.uid, RideStatus.ACCEPTED]
    );

    if (result.rows.length === 0) {
      throw new Error("Ride not found or cannot be started");
    }

    const ride = result.rows[0];

    // Actualizar en Firebase Realtime Database
    await admin.database().ref(`activeRides/${rideId}`).update({
      status: RideStatus.IN_PROGRESS,
      startedAt: Date.now(),
      lastUpdate: Date.now(),
    });

    await client.query("COMMIT");

    console.log(`✅ Viaje iniciado: ${rideId}`);

    return {
      success: true,
      ride,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Error iniciando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Completar viaje
 * Migrado de: Backend/src/rides/rides.service.ts -> updateStatus()
 */
export const completeRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, finalFare, actualDistance, actualDuration } = data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE rides 
       SET status = $1, completed_at = NOW(), final_fare = $2, 
           actual_distance = $3, actual_duration = $4
       WHERE id = $5 AND driver_id = $6 AND status = $7
       RETURNING *`,
      [
        RideStatus.COMPLETED,
        finalFare,
        actualDistance,
        actualDuration,
        rideId,
        context.auth.uid,
        RideStatus.IN_PROGRESS,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error("Ride not found or cannot be completed");
    }

    const ride = result.rows[0];

    // Eliminar de Firebase Realtime Database (ya no está activo)
    await admin.database().ref(`activeRides/${rideId}`).remove();

    await client.query("COMMIT");

    console.log(`✅ Viaje completado: ${rideId}`);

    // TODO: Capturar pago automáticamente
    // await capturePayment(rideId);

    return {
      success: true,
      ride,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Error completando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Cancelar viaje
 * Migrado de: Backend/src/rides/rides.service.ts -> cancelRide()
 */
export const cancelRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId, reason } = data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE rides 
       SET status = $1, canceled_at = NOW(), cancel_reason = $2
       WHERE id = $3 AND (client_id = $4 OR driver_id = $4)
       RETURNING *`,
      [RideStatus.CANCELED, reason, rideId, context.auth.uid]
    );

    if (result.rows.length === 0) {
      throw new Error("Ride not found or you don't have permission to cancel");
    }

    const ride = result.rows[0];

    // Eliminar de Firebase Realtime Database
    await admin.database().ref(`activeRides/${rideId}`).remove();

    await client.query("COMMIT");

    console.log(`✅ Viaje cancelado: ${rideId}`);

    // TODO: Cancelar autorización de pago
    // await cancelPaymentAuthorization(rideId);

    return {
      success: true,
      ride,
    };
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Error cancelando viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener detalles de viaje
 */
export const getRideDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const { rideId } = data;

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM rides 
       WHERE id = $1 AND (client_id = $2 OR driver_id = $2)`,
      [rideId, context.auth.uid]
    );

    if (result.rows.length === 0) {
      throw new Error("Ride not found");
    }

    const ride = result.rows[0];

    // Obtener datos del cliente de Firebase Auth
    let clientData = null;
    if (ride.client_id) {
      try {
        const clientRecord = await admin.auth().getUser(ride.client_id);
        clientData = {
          id: clientRecord.uid,
          name: clientRecord.displayName || "Usuario",
          email: clientRecord.email || "",
          phone: clientRecord.phoneNumber || "",
        };
      } catch (error) {
        console.error(`Error obteniendo cliente ${ride.client_id}:`, error);
      }
    }

    // Obtener datos del conductor de Firebase Auth
    let driverData = null;
    if (ride.driver_id) {
      try {
        const driverRecord = await admin.auth().getUser(ride.driver_id);
        driverData = {
          id: driverRecord.uid,
          name: driverRecord.displayName || "Conductor",
          email: driverRecord.email || "",
          phone: driverRecord.phoneNumber || "",
        };
      } catch (error) {
        console.error(`Error obteniendo conductor ${ride.driver_id}:`, error);
      }
    }

    return {
      success: true,
      ride: {
        id: ride.id,
        clientId: ride.client_id,
        driverId: ride.driver_id,
        status: ride.status,
        originAddress: ride.origin_address,
        destinationAddress: ride.destination_address,
        originLat: ride.origin_lat,
        originLng: ride.origin_lng,
        destinationLat: ride.destination_lat,
        destinationLng: ride.destination_lng,
        estimatedDistance: ride.estimated_distance,
        estimatedDuration: ride.estimated_duration,
        estimatedPrice: ride.estimated_price,
        estimatedFare: ride.estimated_price,
        finalPrice: ride.final_price,
        rideType: ride.ride_type,
        notes: ride.notes,
        createdAt: ride.created_at,
        requestedAt: ride.requested_at,
        acceptedAt: ride.accepted_at,
        startedAt: ride.started_at,
        completedAt: ride.completed_at,
        canceledAt: ride.canceled_at,
        cancelReason: ride.cancel_reason,
        client: clientData,
        driver: driverData,
      },
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo viaje:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener viajes disponibles para conductores
 * Migrado de: Backend/src/rides/rides.service.ts -> findAvailableRides()
 */
export const getAvailableRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM rides 
       WHERE status = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [RideStatus.REQUESTED]
    );

    // Obtener datos de usuarios de Firebase Auth y transformar a camelCase
    const ridesWithClientData = await Promise.all(
      result.rows.map(async (ride) => {
        try {
          const userRecord = await admin.auth().getUser(ride.client_id);
          return {
            id: ride.id,
            clientId: ride.client_id,
            driverId: ride.driver_id,
            status: ride.status,
            originAddress: ride.origin_address,
            destinationAddress: ride.destination_address,
            originLat: ride.origin_lat,
            originLng: ride.origin_lng,
            destinationLat: ride.destination_lat,
            destinationLng: ride.destination_lng,
            estimatedDistance: ride.estimated_distance,
            estimatedDuration: ride.estimated_duration,
            estimatedPrice: ride.estimated_price,
            estimatedFare: ride.estimated_price, // Alias
            finalPrice: ride.final_price,
            rideType: ride.ride_type,
            notes: ride.notes,
            createdAt: ride.created_at,
            requestedAt: ride.requested_at,
            acceptedAt: ride.accepted_at,
            startedAt: ride.started_at,
            completedAt: ride.completed_at,
            canceledAt: ride.canceled_at,
            cancelReason: ride.cancel_reason,
            client: {
              id: userRecord.uid,
              name: userRecord.displayName || "Usuario",
              email: userRecord.email || "",
              phone: userRecord.phoneNumber || "",
            },
          };
        } catch (error) {
          console.error(`Error obteniendo usuario ${ride.client_id}:`, error);
          return {
            id: ride.id,
            clientId: ride.client_id,
            driverId: ride.driver_id,
            status: ride.status,
            originAddress: ride.origin_address,
            destinationAddress: ride.destination_address,
            originLat: ride.origin_lat,
            originLng: ride.origin_lng,
            destinationLat: ride.destination_lat,
            destinationLng: ride.destination_lng,
            estimatedDistance: ride.estimated_distance,
            estimatedDuration: ride.estimated_duration,
            estimatedPrice: ride.estimated_price,
            estimatedFare: ride.estimated_price,
            finalPrice: ride.final_price,
            rideType: ride.ride_type,
            notes: ride.notes,
            createdAt: ride.created_at,
            requestedAt: ride.requested_at,
            acceptedAt: ride.accepted_at,
            startedAt: ride.started_at,
            completedAt: ride.completed_at,
            canceledAt: ride.canceled_at,
            cancelReason: ride.cancel_reason,
            client: {
              id: ride.client_id,
              name: "Usuario",
              email: "",
              phone: "",
            },
          };
        }
      })
    );

    return {
      success: true,
      rides: ridesWithClientData,
    };
  } catch (error: any) {
    console.error("❌ Error obteniendo viajes disponibles:", error);
    throw new functions.https.HttpsError("internal", error.message);
  } finally {
    client.release();
  }
});
