/**
 * Limpia viajes programados antiguos completados/cancelados de Realtime DB.
 * Se ejecuta diariamente a las 3:00 AM.
 * Elimina programmedRides con status completed/canceled/expired hace más de 24h.
 *
 * Esta función existía en GCP como Cloud Scheduler job pero no tenía código backend.
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

export const cleanupProgrammedRides = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('0 3 * * *')  // Diario a las 3:00 AM
  .timeZone('America/Managua')
  .onRun(async () => {
    console.log('🧹 [cleanupProgrammedRides] Iniciando limpieza...');

    try {
      const db = admin.database();
      const now = Date.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      // Paginación: procesar en lotes de 200
      const BATCH_SIZE = 200;
      let lastKey: string | null = null;
      let hasMore = true;
      let deletedCount = 0;
      let processedCount = 0;

      while (hasMore) {
        let query = db.ref('programmedRides').orderByKey().limitToFirst(BATCH_SIZE);
        if (lastKey) {
          query = db.ref('programmedRides').orderByKey().startAfter(lastKey).limitToFirst(BATCH_SIZE);
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

        lastKey = entries[entries.length - 1][0];
        const updates: Record<string, null> = {};

        for (const [rideId, ride] of entries) {
          processedCount++;
          const status = ride?.status;
          const updatedAt = ride?.updatedAt || ride?.canceledAt || ride?.completedAt || 0;

          const shouldDelete =
            (status === 'completed' || status === 'canceled' || status === 'expired' || status === 'activated') &&
            updatedAt > 0 &&
            updatedAt < twentyFourHoursAgo;

          if (shouldDelete) {
            updates[`programmedRides/${rideId}`] = null;
            updates[`programmedRideCodes/${rideId}`] = null;
            deletedCount++;
          }
        }

        if (Object.keys(updates).length > 0) {
          await db.ref().update(updates);
        }

        if (entries.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      console.log(`✅ [cleanupProgrammedRides] Limpieza completada: ${deletedCount} eliminados de ${processedCount} procesados`);
      return null;
    } catch (error) {
      console.error('❌ [cleanupProgrammedRides] Error:', error);
      return null;
    }
  });
