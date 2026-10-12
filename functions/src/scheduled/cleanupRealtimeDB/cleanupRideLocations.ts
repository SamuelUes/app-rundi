/**
 * Limpia ubicaciones antiguas de viajes activos
 * Se ejecuta cada 30 minutos
 * Mantiene solo las últimas 500 ubicaciones por viaje
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

export const cleanupRideLocations = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('every 30 minutes')  // Cada 30 minutos (00:00, 00:30, 01:00...)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de ubicaciones de viajes...');

    try {
      const db = admin.database();
      const ridesRef = db.ref('/activeRides');

      let totalCleaned = 0;
      let processedCount = 0;

      // Paginación: procesar en lotes de 100 viajes
      const BATCH_SIZE = 100;
      let lastKey: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let query = ridesRef.orderByKey().limitToFirst(BATCH_SIZE);
        if (lastKey) {
          query = ridesRef.orderByKey().startAfter(lastKey).limitToFirst(BATCH_SIZE);
        }

        const snapshot = await query.once('value');

        if (!snapshot.exists()) {
          hasMore = false;
          break;
        }

        const rides = snapshot.val();
        const entries = Object.entries(rides) as [string, any][];

        if (entries.length === 0) {
          hasMore = false;
          break;
        }

        lastKey = entries[entries.length - 1][0];

        for (const [rideId, ride] of entries) {
          processedCount++;

          if (!ride.locations) continue;

          const locationsArray = Object.entries(ride.locations)
            .map(([key, value]: [string, any]) => ({
              key,
              timestamp: value.timestamp || 0
            }))
            .sort((a, b) => b.timestamp - a.timestamp);

          if (locationsArray.length > 500) {
            const toDelete = locationsArray.slice(500);

            console.log(`🗑️ Viaje ${rideId}: ${toDelete.length} ubicaciones a eliminar`);

            const updates: Record<string, null> = {};
            toDelete.forEach(loc => {
              updates[`/activeRides/${rideId}/locations/${loc.key}`] = null;
            });

            await db.ref().update(updates);
            totalCleaned += toDelete.length;
          }
        }

        if (entries.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      console.log(`✅ Limpieza completada: ${totalCleaned} ubicaciones eliminadas de ${processedCount} viajes procesados`);
      return { success: true, cleaned: totalCleaned };

    } catch (error: any) {
      console.error('❌ Error limpiando ubicaciones de viajes:', error);
      return { success: false, error: error.message };
    }
  });
