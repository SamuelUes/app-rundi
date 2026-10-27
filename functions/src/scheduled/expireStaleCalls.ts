/**
 * EXPIRACIÓN DE LLAMADAS DE SOPORTE SIN RESPUESTA
 *
 * Barrido cada minuto sobre calls/{callId}: las llamadas en estado ringing
 * (initiated | ringing_client | ringing_operator) cuyo acceptDeadline ya venció
 * pasan a `missed`. Sin esto, un ringing que nadie contesta queda "activo"
 * para siempre y bloquea nuevas llamadas del mismo caso.
 */

import * as functions from 'firebase-functions/v1';
import { database } from '../config/firebase';
import {
  RINGING_CALL_STATUSES,
  isExpiredRingingCall,
  markCallMissed,
} from '../helpers/callLifecycle';

const MAX_SCAN_PER_STATUS = 200;

export const expireStaleCalls = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('every 1 minutes')
  .timeZone('America/Managua')
  .onRun(async () => {
    const now = Date.now();
    let expiredCount = 0;

    for (const status of RINGING_CALL_STATUSES) {
      const snap = await database
        .ref('calls')
        .orderByChild('status')
        .equalTo(status)
        .limitToFirst(MAX_SCAN_PER_STATUS)
        .once('value');

      if (!snap.exists()) continue;

      const entries = Object.entries<any>(snap.val() || {});
      for (const [callId, call] of entries) {
        if (!isExpiredRingingCall(call, now)) continue;
        try {
          await markCallMissed(callId);
          expiredCount += 1;
        } catch (error: any) {
          functions.logger.warn('[expireStaleCalls] No se pudo marcar missed', {
            callId,
            error: error?.message,
          });
        }
      }
    }

    if (expiredCount > 0) {
      functions.logger.info(`📞 [expireStaleCalls] ${expiredCount} llamada(s) expiradas marcadas missed`);
    }

    return null;
  });
