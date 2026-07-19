/**
 * Limpieza automática de viajes antiguos
 *
 * Se ejecuta cada hora para limpiar viajes que:
 * - Están completados/cancelados hace más de 1 hora
 * - No fueron archivados correctamente
 *
 * Esto es un sistema de respaldo por si falla el archivado automático
 */

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import { cleanupRideFromRealtime } from "../helpers/cleanupHelpers";

export const cleanupOldRides = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('30 * * * *')  // Cada hora a los 30 minutos (00:30, 01:30, 02:30...)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de viajes antiguos...');

    try {
      const db = admin.database();
      const activeRidesRef = db.ref('activeRides');

      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000); // 1 hora en milisegundos
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000); // 24 horas en milisegundos

      let completedCount = 0;
      let canceledCount = 0;
      let errorCount = 0;
      let processedCount = 0;

      // Paginación: procesar en lotes de 200 para evitar cargar todo en memoria
      const BATCH_SIZE = 200;
      let lastKey: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let query = activeRidesRef.orderByKey().limitToFirst(BATCH_SIZE);
        if (lastKey) {
          query = activeRidesRef.orderByKey().startAfter(lastKey).limitToFirst(BATCH_SIZE);
        }

        const snapshot = await query.once('value');
        const rides = snapshot.val();

        if (!rides) {
          hasMore = false;
          break;
        }

        const entries = Object.entries(rides) as [string, any][];
        if (entries.length === 0) {
          hasMore = false;
          break;
        }

        // El último key del lote para la siguiente iteración
        lastKey = entries[entries.length - 1][0];

        for (const [rideId, ride] of entries) {
          try {
            if (ride.status === 'completed' && ride.completedAt && ride.completedAt < oneHourAgo) {
              console.log(`🧹 Eliminando viaje completado antiguo: ${rideId}`);
              await cleanupRideFromRealtime(rideId);
              completedCount++;
            } else if (ride.status === 'pending_rating' && ride.completedAt && ride.completedAt < twentyFourHoursAgo) {
              console.log(`⏰ Eliminando viaje pending_rating antiguo (24h+): ${rideId}`);
              await cleanupRideFromRealtime(rideId);
              completedCount++;
            } else if (ride.status === 'canceled' && ride.canceledAt && ride.canceledAt < oneHourAgo) {
              console.log(`🧹 Eliminando viaje cancelado antiguo: ${rideId}`);
              await cleanupRideFromRealtime(rideId);
              canceledCount++;
            } else if (ride.status === 'requested' && ride.createdAt && ride.createdAt < (now - 24 * 60 * 60 * 1000)) {
              console.log(`🗑️ Eliminando viaje huérfano: ${rideId} (creado hace más de 24h)`);
              await cleanupRideFromRealtime(rideId);
              canceledCount++;
            }
            processedCount++;
          } catch (error) {
            console.error(`❌ Error procesando viaje ${rideId}:`, error);
            errorCount++;
          }
        }

        // Si el lote fue menor que BATCH_SIZE, no hay más datos
        if (entries.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      console.log(`✅ Limpieza completada:`);
      console.log(`   - Viajes procesados: ${processedCount}`);
      console.log(`   - Viajes completados limpiados: ${completedCount}`);
      console.log(`   - Viajes cancelados eliminados: ${canceledCount}`);
      console.log(`   - Errores: ${errorCount}`);

      return null;
    } catch (error) {
      console.error('❌ Error en limpieza de viajes:', error);
      return null;
    }
  });
