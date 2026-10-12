/**
 * Limpieza de chats huérfanos
 * Se ejecuta cada 12 horas
 * Elimina chats cuyo viaje ya no existe en activeRides
 *
 * ✅ Grupo 7 (H5): Procesamiento en lotes con limitToFirst para evitar
 *    cargar todos los chats en memoria de una sola vez.
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

const BATCH_SIZE = 200;
const MAX_BATCHES = 50; // Límite de seguridad: 200 * 50 = 10,000 chats por ejecución

export const cleanupOldChats = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('every 12 hours')
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de chats antiguos...');

    try {
      const db = admin.database();
      const chatsRef = db.ref('chats');
      const activeRidesRef = db.ref('activeRides');

      let totalDeleted = 0;
      let batchNumber = 0;
      let lastKey: string | null = null;

      while (batchNumber < MAX_BATCHES) {
        batchNumber++;

        // ✅ Paginación: obtener un lote de chats usando limitToFirst + startAfter
        let query = chatsRef.orderByKey().limitToFirst(BATCH_SIZE);
        if (lastKey) {
          query = chatsRef.orderByKey().startAfter(lastKey).limitToFirst(BATCH_SIZE);
        }

        const batchSnapshot = await query.once('value');
        const batchChats = batchSnapshot.val();

        if (!batchChats) {
          console.log(`✅ No hay más chats para procesar (lote ${batchNumber})`);
          break;
        }

        const chatEntries = Object.entries(batchChats) as [string, any][];
        if (chatEntries.length === 0) {
          break;
        }

        // Verificar individualmente si cada ride del lote existe en activeRides
        const rideIds = chatEntries.map(([rideId]) => rideId);
        const rideChecks = await Promise.all(
          rideIds.map(async (rideId) => {
            try {
              const snap = await activeRidesRef.child(rideId).once('value');
              return { rideId, exists: snap.exists() };
            } catch {
              return { rideId, exists: false };
            }
          })
        );

        const rideExistsMap = new Map(rideChecks.map(({ rideId, exists }) => [rideId, exists]));

        let batchDeleted = 0;
        for (const [rideId] of chatEntries) {
          if (!rideExistsMap.get(rideId)) {
            try {
              await chatsRef.child(rideId).remove();
              batchDeleted++;
            } catch (error) {
              console.error(`❌ Error eliminando chat ${rideId}:`, error);
            }
          }
        }

        totalDeleted += batchDeleted;

        // Si el lote fue menor que BATCH_SIZE, no hay más datos
        if (chatEntries.length < BATCH_SIZE) {
          console.log(`✅ Último lote procesado (${batchNumber}): ${chatEntries.length} chats`);
          break;
        }

        // Actualizar lastKey para el siguiente lote
        lastKey = chatEntries[chatEntries.length - 1][0];
        console.log(`📦 Lote ${batchNumber}: ${chatEntries.length} chats, ${batchDeleted} eliminados. Continuando desde ${lastKey}`);
      }

      console.log(`✅ Limpieza de chats completada: ${totalDeleted} chats eliminados en ${batchNumber} lotes`);

      return null;
    } catch (error) {
      console.error('❌ Error en limpieza de chats:', error);
      return null;
    }
  });
