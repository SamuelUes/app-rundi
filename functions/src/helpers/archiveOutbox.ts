/**
 * ARCHIVE OUTBOX - Patrón outbox para archivado confiable a Supabase
 *
 * Cuando un trigger falla al archivar un ride a Supabase, encola el ride
 * en `pendingArchive/{rideId}` en RTDB. Una scheduled function procesa
 * esta cola periódicamente y reintenta el archivado.
 *
 * Esto previene pérdida permanente de datos cuando Supabase no está disponible.
 */

import admin from "firebase-admin";

const OUTBOX_PATH = "pendingArchive";
const CLAIMS_PATH = "archiveClaims";
const CLAIM_STALE_MS = 2 * 60_000;
const MAX_RETRIES = 5;

export type OutboxEntry = {
  rideId: string;
  rideData: any;
  paymentStatus: any | null;
  archiveType: "completed" | "canceled";
  retryCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  nextRetryAt: number;
};

/**
 * Claim single-flight del archivado de un ride.
 *
 * RTDB entrega los triggers at-least-once y el cron puede procesar la misma
 * entrada del outbox en paralelo: sin un claim, dos invocaciones podrían
 * archivar (y potencialmente insertar) el mismo ride dos veces.
 *
 * Devuelve true si el llamador obtuvo el claim y debe archivar.
 * El claim expira solo (CLAIM_STALE_MS) para que un crash no bloquee retries.
 */
export async function claimArchive(
  rideId: string,
  archiveType: "completed" | "canceled",
): Promise<boolean> {
  try {
    const ref = admin.database().ref(`${CLAIMS_PATH}/${rideId}`);
    const result = await ref.transaction((current: any) => {
      if (current?.done === true) {
        return; // Ya archivado — no reprocesar
      }
      if (
        current &&
        typeof current.at === "number" &&
        Date.now() - current.at < CLAIM_STALE_MS
      ) {
        return; // Otro proceso archivando en este momento
      }
      return { at: Date.now(), type: archiveType, done: false };
    });
    return result.committed === true;
  } catch (error: any) {
    // Fail-open: mejor un posible archivado duplicado (los writers son
    // idempotentes por firebase_ride_id) que perder el archivado.
    console.warn(`⚠️ [ArchiveOutbox] claimArchive falló para ${rideId}:`, error.message);
    return true;
  }
}

/**
 * Marca el archivado como terminado. Llamadores que fallaron NO deben llamarlo:
 * el claim queda y expira para permitir reintentos.
 */
export async function markArchiveDone(rideId: string, pgRideId: string): Promise<void> {
  try {
    await admin.database().ref(`${CLAIMS_PATH}/${rideId}`).update({
      done: true,
      at: Date.now(),
      pgRideId,
    });
  } catch (error: any) {
    console.warn(`⚠️ [ArchiveOutbox] markArchiveDone falló para ${rideId}:`, error.message);
  }
}

/**
 * true si el ride ya está archivado (claim.done) — usado por el cron para
 * limpiar entradas del outbox que el trigger terminó mientras tanto.
 */
export async function isArchiveDone(rideId: string): Promise<boolean> {
  try {
    const snap = await admin.database().ref(`${CLAIMS_PATH}/${rideId}/done`).once("value");
    return snap.val() === true;
  } catch {
    return false;
  }
}

/**
 * Encola un ride en el outbox para reintento posterior.
 * Si ya existe una entrada para este rideId, actualiza el timestamp
 * y reinicia el contador de reintentos solo si el tipo cambia.
 */
export async function enqueueArchiveRetry(
  rideId: string,
  rideData: any,
  paymentStatus: any | null,
  archiveType: "completed" | "canceled",
  errorMessage: string,
): Promise<void> {
  try {
    const ref = admin.database().ref(`${OUTBOX_PATH}/${rideId}`);
    const existing = await ref.once("value");

    if (existing.exists()) {
      // No incrementar retryCount aquí — se incrementa al procesar
      await ref.update({
        rideData,
        paymentStatus: paymentStatus || null,
        lastError: errorMessage.substring(0, 500),
        updatedAt: Date.now(),
        nextRetryAt: Date.now() + 60_000, // Reintento en 1 min
      });
      console.log(`📋 [ArchiveOutbox] Actualizada entrada existente para ${rideId}`);
    } else {
      const entry: OutboxEntry = {
        rideId,
        rideData,
        paymentStatus: paymentStatus || null,
        archiveType,
        retryCount: 0,
        lastError: errorMessage.substring(0, 500),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nextRetryAt: Date.now() + 60_000,
      };
      await ref.set(entry);
      console.log(`📋 [ArchiveOutbox] Encolado ${rideId} (${archiveType}) para reintento`);
    }
  } catch (error: any) {
    console.error(`❌ [ArchiveOutbox] Error encolando ${rideId}:`, error.message);
    // Último recurso: no podemos hacer nada más si RTDB también falla
  }
}

/**
 * Marca una entrada del outbox como procesada exitosamente (la elimina).
 */
export async function dequeueArchiveRetry(rideId: string): Promise<void> {
  try {
    await admin.database().ref(`${OUTBOX_PATH}/${rideId}`).remove();
    console.log(`✅ [ArchiveOutbox] Eliminada entrada para ${rideId} (archivado exitoso)`);
  } catch (error: any) {
    console.error(`❌ [ArchiveOutbox] Error eliminando entrada ${rideId}:`, error.message);
  }
}

/**
 * Incrementa el contador de reintentos y calcula el próximo reintento
 * con backoff exponencial. Si excede MAX_RETRIES, marca como fallido.
 */
export async function incrementRetryAndScheduleNext(
  rideId: string,
  errorMessage: string,
): Promise<boolean> {
  try {
    const ref = admin.database().ref(`${OUTBOX_PATH}/${rideId}`);
    const snapshot = await ref.once("value");
    if (!snapshot.exists()) return false;

    const entry = snapshot.val() as OutboxEntry;
    const newRetryCount = (entry.retryCount || 0) + 1;

    if (newRetryCount >= MAX_RETRIES) {
      await ref.update({
        retryCount: newRetryCount,
        lastError: errorMessage.substring(0, 500),
        updatedAt: Date.now(),
        status: "failed",
        failedAt: Date.now(),
      });
      console.error(`❌ [ArchiveOutbox] ${rideId} excedió ${MAX_RETRIES} reintentos — marcado como fallido`);
      return false;
    }

    // Backoff exponencial: 1min, 2min, 4min, 8min, 16min
    const delayMs = Math.pow(2, newRetryCount - 1) * 60_000;
    await ref.update({
      retryCount: newRetryCount,
      lastError: errorMessage.substring(0, 500),
      updatedAt: Date.now(),
      nextRetryAt: Date.now() + delayMs,
    });
    console.log(`📋 [ArchiveOutbox] ${rideId} reintento #${newRetryCount} en ${delayMs / 1000}s`);
    return true;
  } catch (error: any) {
    console.error(`❌ [ArchiveOutbox] Error incrementando reintento para ${rideId}:`, error.message);
    return false;
  }
}

export { MAX_RETRIES, OUTBOX_PATH, CLAIMS_PATH, CLAIM_STALE_MS };
