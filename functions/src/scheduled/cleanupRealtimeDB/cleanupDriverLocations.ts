/**
 * Limpia ubicaciones antiguas de conductores
 * Se ejecuta cada hora
 * Mantiene solo las últimas 100 ubicaciones por conductor
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

export const cleanupDriverLocations = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('every 1 hours')  // Cada hora en punto (00:00, 01:00, 02:00...)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de ubicaciones de conductores...');

    try {
      const db = admin.database();
      const locationsRef = db.ref('/driverLocations');

      // Obtener solo las claves (shallow) para no cargar todo en memoria
      const snapshot = await locationsRef.limitToLast(200).once('value');

      if (!snapshot.exists()) {
        console.log('ℹ️ No hay ubicaciones de conductores para limpiar');
        return null;
      }

      const drivers = snapshot.val();
      let totalCleaned = 0;
      let processedDrivers = 0;
      const BATCH_SIZE = 50;
      const driverIds = Object.keys(drivers);

      // Procesar en lotes para limitar memoria
      for (let i = 0; i < driverIds.length; i += BATCH_SIZE) {
        const batch = driverIds.slice(i, i + BATCH_SIZE);

        for (const driverId of batch) {
          const driverLocations = drivers[driverId];
          processedDrivers++;

          // Convertir a array y ordenar por timestamp
          const locationsArray = Object.entries(driverLocations)
            .map(([key, value]: [string, any]) => ({
              key,
              timestamp: value.timestamp || 0
            }))
            .sort((a, b) => b.timestamp - a.timestamp);

          // Si hay más de 100, eliminar las más antiguas
          if (locationsArray.length > 100) {
            const toDelete = locationsArray.slice(100);

            console.log(`🗑️ Conductor ${driverId}: ${toDelete.length} ubicaciones a eliminar`);

            // Eliminar en batch
            const updates: Record<string, null> = {};
            toDelete.forEach(loc => {
              updates[`/driverLocations/${driverId}/${loc.key}`] = null;
            });

            await db.ref().update(updates);
            totalCleaned += toDelete.length;
          }
        }
      }

      console.log(`✅ Limpieza completada: ${totalCleaned} ubicaciones eliminadas de ${processedDrivers} conductores`);
      return { success: true, cleaned: totalCleaned };

    } catch (error: any) {
      console.error('❌ Error limpiando ubicaciones:', error);
      return { success: false, error: error.message };
    }
  });
