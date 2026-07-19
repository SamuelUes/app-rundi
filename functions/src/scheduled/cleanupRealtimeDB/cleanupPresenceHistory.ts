/**
 * Limpia historial de presencia
 * Se ejecuta diariamente a las 2 AM
 * Mantiene solo los últimos 10 registros por usuario
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';

export const cleanupPresenceHistory = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('0 2 * * *')  // Diario a las 2 AM (02:00)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de historial de presencia...');

    try {
      const db = admin.database();
      const presenceRef = db.ref('/presence');

      const snapshot = await presenceRef.once('value');

      if (!snapshot.exists()) {
        console.log('ℹ️ No hay historial de presencia para limpiar');
        return null;
      }

      const presence = snapshot.val();
      let totalCleaned = 0;

      for (const userId in presence) {
        const userPresence = presence[userId];

        if (!userPresence.history) continue;

        const historyArray = Object.entries(userPresence.history)
          .map(([key, value]: [string, any]) => ({
            key,
            timestamp: value.timestamp || 0
          }))
          .sort((a, b) => b.timestamp - a.timestamp);

        if (historyArray.length > 10) {
          const toDelete = historyArray.slice(10);

          console.log(`🗑️ Usuario ${userId}: ${toDelete.length} registros de presencia a eliminar`);

          const updates: Record<string, null> = {};
          toDelete.forEach(record => {
            updates[`/presence/${userId}/history/${record.key}`] = null;
          });

          await db.ref().update(updates);
          totalCleaned += toDelete.length;
        }
      }

      console.log(`✅ Limpieza completada: ${totalCleaned} registros eliminados`);
      return { success: true, cleaned: totalCleaned };

    } catch (error: any) {
      console.error('❌ Error limpiando presencia:', error);
      return { success: false, error: error.message };
    }
  });
