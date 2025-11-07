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

import * as admin from "firebase-admin";

/**
 * Limpiar viaje del Realtime Database
 * Elimina: activeRides, paymentStatus, chat
 */
export async function cleanupRideFromRealtime(rideId: string, driverId?: string): Promise<void> {
  try {
    console.log(`🧹 Limpiando viaje ${rideId} del Realtime Database...`);
    
    const updates: { [key: string]: null } = {};
    
    // Eliminar viaje de activeRides
    updates[`activeRides/${rideId}`] = null;
    
    // Eliminar paymentStatus
    updates[`paymentStatus/${rideId}`] = null;
    
    // Eliminar chat
    updates[`chats/${rideId}`] = null;
    
    // Aplicar todas las eliminaciones en una sola operación
    await admin.database().ref().update(updates);
    
    console.log(`✅ Viaje ${rideId} eliminado del Realtime Database`);
  } catch (error) {
    console.error(`❌ Error limpiando viaje ${rideId} del Realtime:`, error);
    throw error;
  }
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

