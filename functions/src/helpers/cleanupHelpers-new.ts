/**
 * CLEANUP HELPERS - Limpieza de Firebase Realtime Database
 * 
 * ✅ NUEVO SISTEMA (2025-10-24):
 * - Archivado en Supabase se hace automáticamente por trigger onPaymentCompleted
 * - Este archivo SOLO mantiene funciones de limpieza de Firebase
 * 
 * ⚠️ FUNCIONES DEPRECADAS (NO USAR):
 * - saveCompletedRideToPostgres() → Usar supabaseArchive.saveCompletedRideToSupabase()
 * - saveCanceledRideToPostgres() → Usar supabaseArchive.saveCanceledRideToSupabase()
 * - savePaymentToPostgres() → Usar supabaseArchive.savePaymentToSupabase()
 * - archiveCompletedRide() → Trigger onPaymentCompleted lo hace automáticamente
 * - archiveCanceledRide() → Usar supabaseArchive.saveCanceledRideToSupabase()
 */

import admin from "firebase-admin";

/**
 * Helper para construir updates usando server timestamp
 */
const serverTimestamp = admin.database.ServerValue.TIMESTAMP;

type NullableUpdate = { [key: string]: null };

/**
 * Limpiar viaje del Realtime Database
 * Elimina: activeRides, paymentStatus, chat
 */
export async function cleanupRideFromRealtime(
  rideId: string,
  driverId?: string | null,
  clientId?: string | null
): Promise<void> {
  try {
    console.log(`🧹 Limpiando viaje ${rideId} del Realtime Database...`);

    const db = admin.database();

    let resolvedDriverId = driverId ?? null;
    let resolvedClientId = clientId ?? null;

    if (!resolvedDriverId || !resolvedClientId) {
      try {
        const rideSnapshot = await db.ref(`activeRides/${rideId}`).once("value");
        const rideData = rideSnapshot.val();
        resolvedDriverId = resolvedDriverId ?? rideData?.driverId ?? null;
        resolvedClientId = resolvedClientId ?? rideData?.clientId ?? null;
      } catch (err) {
        console.warn(`⚠️ No se pudo obtener activeRides/${rideId} antes de limpiar`, err);
      }
    }

    const updates: NullableUpdate = {
      [`activeRides/${rideId}`]: null,
      [`paymentStatus/${rideId}`]: null,
      [`chats/${rideId}`]: null,
    };

    // Limpiar referencias del conductor
    if (resolvedDriverId) {
      const driverInfoRef = db.ref(`driversInfo/${resolvedDriverId}`);
      const driverLocationRef = db.ref(`driverLocations/${resolvedDriverId}`);

      const timestampsOnly = {
        updatedAt: serverTimestamp,
        lastSeen: serverTimestamp,
      } as const;

      await driverInfoRef
        .update(timestampsOnly)
        .catch((err) => console.error(`⚠️ Error actualizando driversInfo/${resolvedDriverId}:`, err));

      await driverLocationRef
        .update({
          status: "offline",
          lat: null,
          lng: null,
          updatedAt: serverTimestamp,
          lastSeen: serverTimestamp,
        })
        .catch((err) => console.error(`⚠️ Error actualizando driverLocations/${resolvedDriverId}:`, err));
    }

    // Limpiar referencias del cliente
    if (resolvedClientId) {
      updates[`clientsInfo/${resolvedClientId}`] = null;
      updates[`clientsLocations/${resolvedClientId}`] = null;
      updates[`presence/${resolvedClientId}`] = null;
    }

    // Aplicar todas las eliminaciones en una sola operación
    await db.ref().update(updates);

    console.log(`✅ Viaje ${rideId} eliminado del Realtime Database`);
  } catch (error) {
    console.error(`❌ Error limpiando viaje ${rideId} del Realtime:`, error);
    throw error;
  }
}

/**
 * Limpia presencia de conductor/cliente cuando su app se cierra completamente.
 */
export async function cleanupPresenceNodes(params: {
  driverIds?: string[];
  clientIds?: string[];
}): Promise<void> {
  const { driverIds = [], clientIds = [] } = params;

  if (!driverIds.length && !clientIds.length) {
    return;
  }

  console.log("🧹 Limpiando nodos de presencia", { driverIds, clientIds });

  const db = admin.database();

  const updates: NullableUpdate = {};

  for (const driverId of driverIds) {
    const timestampsOnly = {
      updatedAt: serverTimestamp,
      lastSeen: serverTimestamp,
    } as const;

    await db
      .ref(`driversInfo/${driverId}`)
      .update(timestampsOnly)
      .catch((err) => console.error(`⚠️ Error actualizando driversInfo/${driverId}:`, err));

    await db
      .ref(`driverLocations/${driverId}`)
      .update({
        status: "offline",
        lat: null,
        lng: null,
        updatedAt: serverTimestamp,
        lastSeen: serverTimestamp,
      })
      .catch((err) => console.error(`⚠️ Error actualizando driverLocations/${driverId}:`, err));

    updates[`presence/${driverId}`] = null;
  }

  for (const clientId of clientIds) {
    updates[`clientsLocations/${clientId}`] = null;
    updates[`clientsInfo/${clientId}`] = null;
    updates[`presence/${clientId}`] = null;
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }

  console.log("✅ Nodos de presencia limpiados");
}

/**
 * ⚠️ FUNCIONES DEPRECADAS - Solo para compatibilidad hacia atrás
 */

export async function saveCompletedRideToPostgres(ride: any, rideId: string): Promise<string | null> {
  console.warn(`⚠️ [saveCompletedRideToPostgres] DEPRECADO - Usar supabaseArchive.saveCompletedRideToSupabase()`);
  return null;
}

export async function saveCanceledRideToPostgres(ride: any, rideId: string): Promise<string | null> {
  console.warn(`⚠️ [saveCanceledRideToPostgres] DEPRECADO - Usar supabaseArchive.saveCanceledRideToSupabase()`);
  return null;
}

export async function savePaymentToPostgres(paymentStatus: any, rideId: string, pgRideId: string): Promise<void> {
  console.warn(`⚠️ [savePaymentToPostgres] DEPRECADO - Usar supabaseArchive.savePaymentToSupabase()`);
}

export async function archiveCompletedRide(ride: any, rideId: string, paymentStatus?: any): Promise<void> {
  console.warn(`⚠️ [archiveCompletedRide] DEPRECADO - Trigger onPaymentCompleted lo hace automáticamente`);
}

export async function archiveCanceledRide(ride: any, rideId: string): Promise<void> {
  console.warn(`⚠️ [archiveCanceledRide] DEPRECADO - Usar supabaseArchive.saveCanceledRideToSupabase()`);
}

