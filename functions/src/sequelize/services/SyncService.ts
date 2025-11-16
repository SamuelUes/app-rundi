/**
 * SyncService - Sincronización entre Supabase y Firebase Realtime DB
 * Mantiene ambas bases de datos sincronizadas
 */

import * as admin from 'firebase-admin';
import { MIGRATION_FLAGS } from '../../config/migration-flags';
import { DriverRepository } from '../repositories/DriverRepository';
import { RideRepository } from '../repositories/RideRepository';

const db = admin.database();
const driverRepo = new DriverRepository();
const rideRepo = new RideRepository();

export class SyncService {
  /**
   * Sincronizar perfil del conductor de Supabase a Realtime DB
   */
  static async syncDriverToRealtimeDB(driverId: string, supabaseDriver: any) {
    try {
      console.log(`🔄 [SyncService] Sincronizando conductor ${driverId} a Realtime DB`);
      
      // Obtener datos de Firebase Auth
      let firebaseUser: any = null;
      try {
        firebaseUser = await admin.auth().getUser(driverId);
      } catch (error) {
        console.warn(`⚠️ [SyncService] Error obteniendo usuario de Firebase Auth:`, error);
      }

      const driverJson = supabaseDriver.toJSON ? supabaseDriver.toJSON() : supabaseDriver;
      
      const syncData = {
        id: driverJson.id || driverId,
        userId: driverId,
        firstName: firebaseUser?.displayName?.split(' ')[0] || null,
        lastName: firebaseUser?.displayName?.split(' ').slice(1).join(' ') || null,
        email: firebaseUser?.email || null,
        phone: firebaseUser?.phoneNumber || null,
        licenseNumber: driverJson.license_number || null,
        licenseExpiry: driverJson.license_expiry || null,
        profilePhoto: driverJson.profile_photo || null,
        department: driverJson.department || null,
        municipality: driverJson.municipality || null,
        status: driverJson.status || 'pending',
        verifiedAt: driverJson.verified_at || null,
        totalRides: driverJson.total_rides || 0,
        rating: driverJson.average_rating || 5.0,
        earnings: driverJson.total_earnings || 0,
        createdAt: driverJson.created_at || null,
        updatedAt: new Date().toISOString(),
      };

      if (MIGRATION_FLAGS.SYNC_DRIVERS_STATIC_TO_RTDB) {
        await db.ref(`drivers/${driverId}`).set(syncData);
        console.log(`✅ [SyncService] Conductor ${driverId} sincronizado a Realtime DB`);
      } else {
        console.log(`⏭️ [SyncService] SYNC_DRIVERS_STATIC_TO_RTDB=false, no se sincroniza drivers/${driverId}`);
      }
      
      return syncData;
    } catch (error: any) {
      console.error(`❌ [SyncService] Error sincronizando conductor:`, error.message);
      throw error;
    }
  }

  /**
   * Sincronizar viajes de Supabase a Realtime DB
   */
  static async syncRidesToRealtimeDB(driverId: string, rides: any[]) {
    try {
      console.log(`🔄 [SyncService] Sincronizando ${rides.length} viajes del conductor ${driverId}`);
      
      const syncedRides = rides.map((ride: any) => {
        const rideJson = ride.toJSON ? ride.toJSON() : ride;
        return {
          id: rideJson.id,
          firebaseRideId: rideJson.firebase_ride_id,
          status: rideJson.status,
          estimatedPrice: rideJson.estimated_price,
          finalFare: rideJson.final_fare,
          distance: rideJson.actual_distance || rideJson.estimated_distance,
          duration: rideJson.actual_duration || rideJson.estimated_duration,
          createdAt: rideJson.created_at,
          completedAt: rideJson.completed_at,
          clientId: rideJson.client_id,
          driverId: rideJson.driver_id,
        };
      });

      // Guardar en Realtime DB
      if (MIGRATION_FLAGS.SYNC_DRIVER_RIDES_TO_RTDB) {
        await db.ref(`drivers/${driverId}/rides`).set(syncedRides);
        console.log(`✅ [SyncService] ${rides.length} viajes sincronizados a Realtime DB`);
      } else {
        console.log(`⏭️ [SyncService] SYNC_DRIVER_RIDES_TO_RTDB=false, no se sincroniza drivers/${driverId}/rides`);
      }
      
      return syncedRides;
    } catch (error: any) {
      console.error(`❌ [SyncService] Error sincronizando viajes:`, error.message);
      throw error;
    }
  }

  /**
   * Obtener y sincronizar perfil completo del conductor
   */
  static async getAndSyncDriverProfile(driverId: string) {
    try {
      console.log(`📊 [SyncService] Obteniendo y sincronizando perfil del conductor: ${driverId}`);
      
      // Obtener de Supabase
      const supabaseDriver = await driverRepo.findByUserId(driverId);
      
      if (!supabaseDriver) {
        console.warn(`⚠️ [SyncService] Conductor no encontrado en Supabase`);
        return null;
      }

      // Sincronizar a Realtime DB
      const syncedDriver = await this.syncDriverToRealtimeDB(driverId, supabaseDriver);
      
      return syncedDriver;
    } catch (error: any) {
      console.error(`❌ [SyncService] Error obteniendo y sincronizando perfil:`, error.message);
      throw error;
    }
  }

  /**
   * Obtener y sincronizar viajes del conductor
   */
  static async getAndSyncDriverRides(driverId: string) {
    try {
      console.log(`📊 [SyncService] Obteniendo y sincronizando viajes del conductor: ${driverId}`);
      
      // Obtener de Supabase
      const rides = await rideRepo.findByDriverId(driverId);
      
      console.log(`📦 [SyncService] Viajes encontrados: ${rides.length}`);
      
      if (rides.length === 0) {
        console.log(`ℹ️ [SyncService] No hay viajes para sincronizar`);
        return [];
      }

      // Sincronizar a Realtime DB
      const syncedRides = await this.syncRidesToRealtimeDB(driverId, rides);
      
      return syncedRides;
    } catch (error: any) {
      console.error(`❌ [SyncService] Error obteniendo y sincronizando viajes:`, error.message);
      throw error;
    }
  }

  /**
   * Sincronizar un viaje individual a Realtime DB
   * ✅ Convierte tipos correctamente: NUMERIC → number, TIMESTAMP → unix timestamp
   */
  static async syncSingleRideToRealtimeDB(ride: any) {
    try {
      const rideJson = ride.toJSON ? ride.toJSON() : ride;
      const rideId = rideJson.id;
      
      console.log(`🔄 [SyncService] Sincronizando viaje individual: ${rideId}`);
      
      // ✅ Conversión de tipos: Supabase → Realtime DB
      const syncData = {
        id: rideJson.id,
        firebaseRideId: rideJson.firebase_ride_id,
        clientId: rideJson.client_id,
        driverId: rideJson.driver_id,
        status: rideJson.status,
        estimatedPrice: parseFloat(rideJson.estimated_price?.toString() || '0'), // NUMERIC → number
        finalFare: rideJson.final_fare ? parseFloat(rideJson.final_fare.toString()) : null,
        clientSuggestedPrice: rideJson.client_suggested_price ? parseFloat(rideJson.client_suggested_price.toString()) : null,
        driverOfferedPrice: rideJson.driver_offered_price ? parseFloat(rideJson.driver_offered_price.toString()) : null,
        distance: rideJson.actual_distance || rideJson.estimated_distance,
        duration: rideJson.actual_duration || rideJson.estimated_duration,
        estimatedDistance: rideJson.estimated_distance,
        estimatedDuration: rideJson.estimated_duration,
        createdAt: rideJson.created_at ? new Date(rideJson.created_at).getTime() : Date.now(), // TIMESTAMP → unix timestamp
        completedAt: rideJson.completed_at ? new Date(rideJson.completed_at).getTime() : null,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      // Sincronizar a activeRides o completedRides según estado
      const path = rideJson.status === 'completed' || rideJson.status === 'canceled' 
        ? `completedRides/${rideId}`
        : `activeRides/${rideId}`;
      
      await db.ref(path).set(syncData);
      console.log(`✅ [SyncService] Viaje ${rideId} sincronizado a Realtime DB (${path})`);
      
      return syncData;
    } catch (error: any) {
      console.error(`❌ [SyncService] Error sincronizando viaje individual:`, error.message);
      throw error;
    }
  }

  /**
   * Sincronizar pagos a Realtime DB
   * ✅ Convierte tipos correctamente: NUMERIC → number, TIMESTAMP → unix timestamp
   */
  static async syncPaymentToRealtimeDB(rideId: string, paymentData: any) {
    try {
      console.log(`🔄 [SyncService] Sincronizando pago para viaje: ${rideId}`);
      
      // ✅ Conversión de tipos: Supabase → Realtime DB
      const amount = parseFloat(paymentData.amount?.toString() || '0'); // NUMERIC → number
      const tip = parseFloat((paymentData.tip || 0).toString()); // NUMERIC → number
      
      const syncData = {
        rideId,
        status: paymentData.status,
        amount: amount,
        tip: tip,
        total: amount + tip,
        method: paymentData.payment_method || 'cash',
        provider: paymentData.payment_provider || 'cash',
        createdAt: paymentData.created_at ? new Date(paymentData.created_at).getTime() : Date.now(), // TIMESTAMP → unix timestamp
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      // ✅ Validar que los valores sean válidos antes de sincronizar
      if (!syncData.rideId || !syncData.status || syncData.amount < 0) {
        console.warn(`⚠️ [SyncService] Datos de pago inválidos:`, syncData);
        throw new Error('Datos de pago inválidos');
      }

      await db.ref(`paymentStatus/${rideId}`).update(syncData);
      console.log(`✅ [SyncService] Pago de viaje ${rideId} sincronizado a Realtime DB`);
      
      return syncData;
    } catch (error: any) {
      console.error(`❌ [SyncService] Error sincronizando pago:`, error.message);
      throw error;
    }
  }
}
