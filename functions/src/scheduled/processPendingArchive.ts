/**
 * SCHEDULED: Process Pending Archive Outbox
 *
 * Procesa la cola `pendingArchive/{rideId}` cada 2 minutos.
 * Reintenta archivar en Supabase los rides que fallaron en los triggers.
 *
 * Usa backoff exponencial: 1min, 2min, 4min, 8min, 16min (máx 5 reintentos).
 */

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import {
  saveCompletedRideToSupabase,
  saveCanceledRideToSupabase,
  savePaymentToSupabase,
  saveRideLocationsToSupabase,
  updateRideLocationIds,
} from "../helpers/supabaseArchive";
import { dequeueArchiveRetry, incrementRetryAndScheduleNext, OUTBOX_PATH } from "../helpers/archiveOutbox";

const BATCH_SIZE = 20;
const PROCESSING_TIMEOUT_MS = 80_000; // 80s — dejar margen antes del timeout de la función

export const processPendingArchive = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("America/Managua")
  .onRun(async () => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📋 [processPendingArchive] Iniciando procesamiento del outbox`);
    console.log(`${"=".repeat(60)}`);

    const now = Date.now();
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    try {
      const snapshot = await admin
        .database()
        .ref(OUTBOX_PATH)
        .orderByChild("nextRetryAt")
        .limitToFirst(BATCH_SIZE)
        .once("value");

      if (!snapshot.exists()) {
        console.log(`📋 [processPendingArchive] Outbox vacío — nada que procesar`);
        return null;
      }

      const entries: Array<{ key: string; val: any }> = [];
      snapshot.forEach((child) => {
        const data = child.val();
        // Solo procesar entradas cuyo nextRetryAt ya pasó
        if (data && data.nextRetryAt && data.nextRetryAt <= now && data.status !== "failed") {
          entries.push({ key: child.key!, val: data });
        }
        return false; // no detener iteración
      });

      console.log(`📋 [processPendingArchive] Entradas a procesar: ${entries.length} (de ${snapshot.numChildren()} totales)`);

      const deadline = Date.now() + PROCESSING_TIMEOUT_MS;

      for (const entry of entries) {
        if (Date.now() > deadline) {
          console.log(`⏰ [processPendingArchive] Deadline alcanzado — procesando en próximo ciclo`);
          break;
        }

        const { key: rideId, val: outboxEntry } = entry;
        processed++;

        try {
          const { rideData, paymentStatus, archiveType } = outboxEntry;

          console.log(`\n📋 [processPendingArchive] Procesando ${rideId} (${archiveType}, intento #${outboxEntry.retryCount || 0})`);

          // Intentar archivar el ride
          let pgRideId: string | null = null;

          if (archiveType === "completed") {
            pgRideId = await saveCompletedRideToSupabase(rideData, rideId, paymentStatus);
          } else {
            pgRideId = await saveCanceledRideToSupabase(rideData, rideId);
          }

          if (!pgRideId) {
            console.error(`❌ [processPendingArchive] ${rideId} — archivado falló`);
            await incrementRetryAndScheduleNext(rideId, "saveRide retornó null");
            failed++;
            continue;
          }

          // Guardar ubicaciones
          if (rideData) {
            const locationIds = await saveRideLocationsToSupabase(pgRideId, rideData);
            if (locationIds && locationIds.length > 0) {
              await updateRideLocationIds(pgRideId, locationIds);
            }
          }

          // Guardar pago si existe
          if (paymentStatus) {
            const paymentSaved = await savePaymentToSupabase(pgRideId, paymentStatus);
            if (!paymentSaved) {
              console.warn(`⚠️ [processPendingArchive] ${rideId} — pago falló pero ride archivado`);
            }
          }

          // Actualizar Firebase con pgRideId
          await admin.database().ref(`activeRides/${rideId}`).update({
            pgRideId,
            archivedAt: Date.now(),
            archivedToSupabase: true,
          });

          // Eliminar del outbox
          await dequeueArchiveRetry(rideId);
          succeeded++;
          console.log(`✅ [processPendingArchive] ${rideId} archivado exitosamente`);
        } catch (error: any) {
          console.error(`❌ [processPendingArchive] ${rideId} — error:`, error.message);
          await incrementRetryAndScheduleNext(rideId, error.message);
          failed++;
        }
      }

      console.log(`\n${"=".repeat(60)}`);
      console.log(`📋 [processPendingArchive] Resumen: ${succeeded} exitosos, ${failed} fallidos, ${skipped} saltados, ${processed} procesados`);
      console.log(`${"=".repeat(60)}\n`);

      return null;
    } catch (error: any) {
      console.error(`❌ [processPendingArchive] Error general:`, error.message);
      throw error;
    }
  });
