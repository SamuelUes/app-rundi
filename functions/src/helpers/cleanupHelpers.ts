/**
 * CLEANUP HELPERS - Limpieza de Firebase Realtime Database
 * 
 * ✅ NUEVO SISTEMA (2025-10-24):
 * - Archivado en Supabase se hace automáticamente por trigger onPaymentCompleted
 * - Este archivo SOLO mantiene funciones de limpieza de Firebase
 * - NO usar saveCompletedRideToPostgres() - DEPRECADO
 * - NO usar archiveCompletedRide() - DEPRECADO
 * 
 * Usar en su lugar:
 * - helpers/supabaseArchive.ts → saveCompletedRideToSupabase()
 * - triggers/onPaymentCompleted.ts → Se dispara automáticamente
 */

import * as admin from "firebase-admin";

/**
 * ⚠️ DEPRECADO - NO USAR
 * Usar: helpers/supabaseArchive.ts → saveCompletedRideToSupabase()
 */
export async function saveCompletedRideToPostgres(ride: any, rideId: string): Promise<string | null> {
  console.warn(`⚠️ [saveCompletedRideToPostgres] DEPRECADO - Usar supabaseArchive.saveCompletedRideToSupabase()`);
  return null;
}

/**
 * ⚠️ DEPRECADO - NO USAR
 * Usar: helpers/supabaseArchive.ts → saveCanceledRideToSupabase()
 */
export async function saveCanceledRideToPostgres(ride: any, rideId: string): Promise<string | null> {
  console.warn(`⚠️ [saveCanceledRideToPostgres] DEPRECADO - Usar supabaseArchive.saveCanceledRideToSupabase()`);
  return null;
}

/**
 * ⚠️ DEPRECADO - NO USAR
 * Usar: helpers/supabaseArchive.ts → savePaymentToSupabase()
 */
export async function savePaymentToPostgres(paymentStatus: any, rideId: string, pgRideId: string): Promise<void> {
  console.warn(`⚠️ [savePaymentToPostgres] DEPRECADO - Usar supabaseArchive.savePaymentToSupabase()`);
  return;
}

/**
 * ⚠️ DEPRECADO - NO USAR
 * Usar: triggers/onPaymentCompleted.ts → Se dispara automáticamente
 */
export async function archiveCompletedRide(ride: any, rideId: string, paymentStatus?: any): Promise<void> {
  console.warn(`⚠️ [archiveCompletedRide] DEPRECADO - El trigger onPaymentCompleted lo hace automáticamente`);
  return;
}

/**
 * ⚠️ DEPRECADO - NO USAR
 * Usar: helpers/supabaseArchive.ts → saveCanceledRideToSupabase()
 */
export async function archiveCanceledRide(ride: any, rideId: string): Promise<void> {
  console.warn(`⚠️ [archiveCanceledRide] DEPRECADO - Usar supabaseArchive.saveCanceledRideToSupabase()`);
  return;
}

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
