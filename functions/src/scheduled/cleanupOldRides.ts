/**
 * Función Scheduled: Limpieza de viajes antiguos
 * 
 * Se ejecuta cada hora para limpiar viajes que:
 * - Están completados/cancelados hace más de 1 hora
 * - No fueron archivados correctamente
 * 
 * Esto es un sistema de respaldo por si falla el archivado automático
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { archiveCompletedRide, archiveCanceledRide } from "../helpers/cleanupHelpers";

/**
 * Limpieza automática de viajes antiguos
 * Se ejecuta cada hora
 */
export const cleanupOldRides = functions.pubsub
  .schedule('every 1 hours')
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de viajes antiguos...');
    
    try {
      const db = admin.database();
      const activeRidesRef = db.ref('activeRides');
      
      // Obtener todos los viajes activos
      const snapshot = await activeRidesRef.once('value');
      const rides = snapshot.val();
      
      if (!rides) {
        console.log('✅ No hay viajes en activeRides');
        return null;
      }
      
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000); // 1 hora en milisegundos
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000); // 24 horas en milisegundos
      
      let completedCount = 0;
      let canceledCount = 0;
      let errorCount = 0;
      
      // Procesar cada viaje
      for (const [rideId, ride] of Object.entries(rides) as [string, any][]) {
        try {
          // Verificar si el viaje está completado hace más de 1 hora
          // IMPORTANTE: Solo archivar si está en 'completed' (ambos calificaron) o si pasó mucho tiempo
          if (ride.status === 'completed' && ride.completedAt && ride.completedAt < oneHourAgo) {
            console.log(`📦 Archivando viaje completado antiguo: ${rideId}`);
            await archiveCompletedRide(ride, rideId);
            completedCount++;
          }
          // Si está en pending_rating por más de 24 horas, archivar de todas formas
          else if (ride.status === 'pending_rating' && ride.completedAt && ride.completedAt < twentyFourHoursAgo) {
            console.log(`⏰ Archivando viaje pending_rating antiguo (24h+): ${rideId}`);
            await archiveCompletedRide(ride, rideId);
            completedCount++;
          }
          
          // Verificar si el viaje está cancelado hace más de 1 hora
          else if (ride.status === 'canceled' && ride.canceledAt && ride.canceledAt < oneHourAgo) {
            console.log(`📦 Archivando viaje cancelado antiguo: ${rideId}`);
            await archiveCanceledRide(ride, rideId);
            canceledCount++;
          }
          
          // Verificar viajes huérfanos (creados hace más de 24 horas y aún en 'requested')
          else if (ride.status === 'requested' && ride.createdAt && ride.createdAt < (now - 24 * 60 * 60 * 1000)) {
            console.log(`🗑️ Eliminando viaje huérfano: ${rideId} (creado hace más de 24h)`);
            
            // Cancelar automáticamente y archivar
            const canceledRide = {
              ...ride,
              status: 'canceled',
              canceledAt: now,
              cancelReason: 'Viaje expirado automáticamente (sin actividad por 24 horas)',
              canceledBy: 'system',
            };
            
            await archiveCanceledRide(canceledRide, rideId);
            canceledCount++;
          }
        } catch (error) {
          console.error(`❌ Error procesando viaje ${rideId}:`, error);
          errorCount++;
        }
      }
      
      console.log(`✅ Limpieza completada:`);
      console.log(`   - Viajes completados archivados: ${completedCount}`);
      console.log(`   - Viajes cancelados archivados: ${canceledCount}`);
      console.log(`   - Errores: ${errorCount}`);
      
      return null;
    } catch (error) {
      console.error('❌ Error en limpieza de viajes:', error);
      return null;
    }
  });

/**
 * Limpieza de paymentStatus huérfanos
 * Se ejecuta cada 6 horas
 */
export const cleanupOrphanPayments = functions.pubsub
  .schedule('every 6 hours')
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de payments huérfanos...');
    
    try {
      const db = admin.database();
      const paymentStatusRef = db.ref('paymentStatus');
      const activeRidesRef = db.ref('activeRides');
      
      // Obtener todos los payments
      const paymentsSnapshot = await paymentStatusRef.once('value');
      const payments = paymentsSnapshot.val();
      
      if (!payments) {
        console.log('✅ No hay payments en paymentStatus');
        return null;
      }
      
      // Obtener todos los viajes activos
      const ridesSnapshot = await activeRidesRef.once('value');
      const rides = ridesSnapshot.val() || {};
      
      let deletedCount = 0;
      
      // Procesar cada payment
      for (const [rideId] of Object.entries(payments) as [string, any][]) {
        try {
          // Si el viaje no existe en activeRides, eliminar el payment
          if (!rides[rideId]) {
            console.log(`🗑️ Eliminando payment huérfano: ${rideId}`);
            await paymentStatusRef.child(rideId).remove();
            deletedCount++;
          }
        } catch (error) {
          console.error(`❌ Error procesando payment ${rideId}:`, error);
        }
      }
      
      console.log(`✅ Limpieza de payments completada: ${deletedCount} payments eliminados`);
      
      return null;
    } catch (error) {
      console.error('❌ Error en limpieza de payments:', error);
      return null;
    }
  });

/**
 * Limpieza de chats antiguos
 * Se ejecuta cada 12 horas
 */
export const cleanupOldChats = functions.pubsub
  .schedule('every 12 hours')
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de chats antiguos...');
    
    try {
      const db = admin.database();
      const chatsRef = db.ref('chats');
      const activeRidesRef = db.ref('activeRides');
      
      // Obtener todos los chats
      const chatsSnapshot = await chatsRef.once('value');
      const chats = chatsSnapshot.val();
      
      if (!chats) {
        console.log('✅ No hay chats');
        return null;
      }
      
      // Obtener todos los viajes activos
      const ridesSnapshot = await activeRidesRef.once('value');
      const rides = ridesSnapshot.val() || {};
      
      let deletedCount = 0;
      
      // Procesar cada chat
      for (const [rideId] of Object.entries(chats) as [string, any][]) {
        try {
          // Si el viaje no existe en activeRides, eliminar el chat
          if (!rides[rideId]) {
            console.log(`🗑️ Eliminando chat huérfano: ${rideId}`);
            await chatsRef.child(rideId).remove();
            deletedCount++;
          }
        } catch (error) {
          console.error(`❌ Error procesando chat ${rideId}:`, error);
        }
      }
      
      console.log(`✅ Limpieza de chats completada: ${deletedCount} chats eliminados`);
      
      return null;
    } catch (error) {
      console.error('❌ Error en limpieza de chats:', error);
      return null;
    }
  });
