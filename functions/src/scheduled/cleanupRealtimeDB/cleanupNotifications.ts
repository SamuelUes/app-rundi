/**
 * Limpia notificaciones antiguas
 * Se ejecuta diariamente a medianoche
 * Mantiene solo las últimas 20 notificaciones por usuario
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';

export const cleanupNotifications = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('0 0 * * *')  // Diario a medianoche (00:00)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de notificaciones...');

    try {
      const db = admin.database();
      const notificationsRef = db.ref('/notifications');

      let totalCleaned = 0;
      let processedCount = 0;

      // Paginación: procesar en lotes de 100 usuarios
      const BATCH_SIZE = 100;
      let lastKey: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let query = notificationsRef.orderByKey().limitToFirst(BATCH_SIZE);
        if (lastKey) {
          query = notificationsRef.orderByKey().startAfter(lastKey).limitToFirst(BATCH_SIZE);
        }

        const snapshot = await query.once('value');

        if (!snapshot.exists()) {
          hasMore = false;
          break;
        }

        const notifications = snapshot.val();
        const entries = Object.entries(notifications) as [string, any][];

        if (entries.length === 0) {
          hasMore = false;
          break;
        }

        lastKey = entries[entries.length - 1][0];

        for (const [userId, userNotifications] of entries) {
          processedCount++;

          if (!userNotifications) continue;

          const notificationsArray = Object.entries(userNotifications)
            .map(([key, value]: [string, any]) => ({
              key,
              timestamp: value.timestamp || 0
            }))
            .sort((a, b) => b.timestamp - a.timestamp);

          if (notificationsArray.length > 20) {
            const toDelete = notificationsArray.slice(20);

            console.log(`🗑️ Usuario ${userId}: ${toDelete.length} notificaciones a eliminar`);

            const updates: Record<string, null> = {};
            toDelete.forEach(notif => {
              updates[`/notifications/${userId}/${notif.key}`] = null;
            });

            await db.ref().update(updates);
            totalCleaned += toDelete.length;
          }
        }

        if (entries.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      console.log(`✅ Limpieza completada: ${totalCleaned} notificaciones eliminadas de ${processedCount} usuarios procesados`);
      return { success: true, cleaned: totalCleaned };

    } catch (error: any) {
      console.error('❌ Error limpiando notificaciones:', error);
      return { success: false, error: error.message };
    }
  });
