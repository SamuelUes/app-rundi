/**
 * Limpieza de paymentStatus huérfanos
 * Se ejecuta cada 6 horas
 * Elimina paymentStatus cuyo viaje ya no existe en activeRides
 *
 * ✅ Grupo 7 (H5): Procesamiento en lotes con limitToFirst para evitar
 *    cargar todos los paymentStatus en memoria de una sola vez.
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';

const BATCH_SIZE = 200;
const MAX_BATCHES = 50; // Límite de seguridad: 200 * 50 = 10,000 payments por ejecución

export const cleanupOrphanPayments = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('0 3,9,15,21 * * *')  // Cada 6 horas (03:00, 09:00, 15:00, 21:00)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de payments huérfanos...');

    try {
      const db = admin.database();
      const paymentStatusRef = db.ref('paymentStatus');
      const activeRidesRef = db.ref('activeRides');

      let totalDeleted = 0;
      let batchNumber = 0;
      let lastKey: string | null = null;

      while (batchNumber < MAX_BATCHES) {
        batchNumber++;

        // ✅ Paginación: obtener un lote de paymentStatus usando limitToFirst + startAfter
        let query = paymentStatusRef.orderByKey().limitToFirst(BATCH_SIZE);
        if (lastKey) {
          query = paymentStatusRef.orderByKey().startAfter(lastKey).limitToFirst(BATCH_SIZE);
        }

        const batchSnapshot = await query.once('value');
        const batchPayments = batchSnapshot.val();

        if (!batchPayments) {
          console.log(`✅ No hay más payments para procesar (lote ${batchNumber})`);
          break;
        }

        const paymentEntries = Object.entries(batchPayments) as [string, any][];
        if (paymentEntries.length === 0) {
          break;
        }

        // Obtener solo los rideIds de este lote desde activeRides (lectura individual por ride)
        // en lugar de cargar TODOS los activeRides de una vez
        const rideIds = paymentEntries.map(([rideId]) => rideId);
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
        for (const [rideId] of paymentEntries) {
          if (!rideExistsMap.get(rideId)) {
            try {
              await paymentStatusRef.child(rideId).remove();
              batchDeleted++;
            } catch (error) {
              console.error(`❌ Error eliminando payment ${rideId}:`, error);
            }
          }
        }

        totalDeleted += batchDeleted;

        // Si el lote fue menor que BATCH_SIZE, no hay más datos
        if (paymentEntries.length < BATCH_SIZE) {
          console.log(`✅ Último lote procesado (${batchNumber}): ${paymentEntries.length} payments`);
          break;
        }

        // Actualizar lastKey para el siguiente lote
        lastKey = paymentEntries[paymentEntries.length - 1][0];
        console.log(`📦 Lote ${batchNumber}: ${paymentEntries.length} payments, ${batchDeleted} eliminados. Continuando desde ${lastKey}`);
      }

      console.log(`✅ Limpieza de payments completada: ${totalDeleted} payments eliminados en ${batchNumber} lotes`);

      return null;
    } catch (error) {
      console.error('❌ Error en limpieza de payments:', error);
      return null;
    }
  });
