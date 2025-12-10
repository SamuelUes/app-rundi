/**
 * TRIGGER: ON RATING COMPLETED
 *
 * Se dispara cuando un viaje pasa a estado `rating_completed` en activeRides.
 *
 * Flujo:
 * 1) Cuando status cambia a 'rating_completed', se espera ~15s y luego,
 *    si el viaje sigue en 'rating_completed', se actualiza a 'completed'.
 * 2) 20s después (≈35s desde rating_completed), si el viaje sigue existiendo
 *    y está en 'completed' o 'rating_completed', se elimina de `activeRides`.
 *
 * Nota: Esta función *solo* toca `activeRides/{rideId}`. La limpieza de
 * paymentStatus/chats/presence sigue centralizada en otros helpers/triggers.
 */

import * as functions from "firebase-functions";
import admin from "firebase-admin";

export const onRatingCompleted = functions.database
  .ref("activeRides/{rideId}")
  .onWrite(async (change, context) => {
    const rideId = context.params.rideId as string;
    const after = change.after.val();
    const before = change.before.val();

    // Si se eliminó el nodo o no hay datos nuevos, no hacer nada
    if (!after) {
      return null;
    }

    const newStatus: string | undefined = after.status;
    const oldStatus: string | undefined = before?.status;

    // Solo reaccionar cuando el estado cambia a 'rating_completed'
    if (newStatus !== "rating_completed" || oldStatus === "rating_completed") {
      return null;
    }

    console.log(`⭐ [onRatingCompleted] rideId=${rideId} → status=rating_completed`);

    const db = admin.database();

    try {
      // 1) Esperar ~15 segundos antes de marcar como completed
      await new Promise((resolve) => setTimeout(resolve, 15000));

      try {
        const snapshotAfterDelay = await db.ref(`activeRides/${rideId}`).once("value");
        const rideAfterDelay = snapshotAfterDelay.val();

        if (!rideAfterDelay) {
          console.log(`⏭️ [onRatingCompleted] Viaje ${rideId} ya no existe después de 15s, no actualizar.`);
        } else if (rideAfterDelay.status === "rating_completed") {
          console.log(`✅ [onRatingCompleted] Marcando viaje ${rideId} como 'completed' tras rating.`);
          await db.ref(`activeRides/${rideId}`).update({
            status: "completed",
            completedAt: rideAfterDelay.completedAt || admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        } else {
          console.log(
            `⏭️ [onRatingCompleted] Estado de viaje ${rideId} cambió de 'rating_completed' a '${rideAfterDelay.status}', no forzar completed.`,
          );
        }
      } catch (updateErr) {
        console.warn(`⚠️ [onRatingCompleted] Error al actualizar estado a completed para ${rideId}:`, updateErr);
      }

      // 2) Esperar 20 segundos adicionales antes de eliminar de activeRides
      await new Promise((resolve) => setTimeout(resolve, 20000));

      try {
        const snapshotForCleanup = await db.ref(`activeRides/${rideId}`).once("value");
        const rideForCleanup = snapshotForCleanup.val();

        if (!rideForCleanup) {
          console.log(`⏭️ [onRatingCompleted] Viaje ${rideId} ya fue eliminado antes de la limpieza final.`);
          return null;
        }

        const finalStatus: string | undefined = rideForCleanup.status;

        if (finalStatus === "completed" || finalStatus === "rating_completed") {
          console.log(`🧹 [onRatingCompleted] Eliminando activeRides/${rideId} tras espera post-rating.`);
          await db.ref(`activeRides/${rideId}`).remove();
        } else {
          console.log(
            `⏭️ [onRatingCompleted] Estado final de viaje ${rideId} es '${finalStatus}', no eliminar de activeRides.`,
          );
        }
      } catch (cleanupErr) {
        console.warn(`⚠️ [onRatingCompleted] Error eliminando activeRides/${rideId}:`, cleanupErr);
      }
    } catch (err) {
      console.error(`❌ [onRatingCompleted] Error general para rideId=${rideId}:`, err);
    }

    return null;
  });
