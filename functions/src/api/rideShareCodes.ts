/**
 * Códigos de compartición de tracking de viaje.
 *
 * Permite a los participantes de un viaje generar un código corto que un
 * sitio externo (página pública de tracking) puede usar para ver la posición
 * y el estado del viaje SIN exponer el rideId — el código actúa como
 * capability revocable/expirable y el nodo rideTrackingCodes es Admin-only.
 */

import * as functions from 'firebase-functions/v1';
import * as crypto from 'crypto';
import admin from 'firebase-admin';
import {
  getOrCreateRideShareCode,
  isActiveRideShareCode,
  type RideShareCodeStore,
} from './rideShareCodeStore';

const db = admin.database();

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para dictarlo por teléfono.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateCode(length: number = CODE_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export const createRideShareToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    console.warn('[createRideShareToken] Auth context missing', {
      authorizationHeaderPresent: Boolean(context.rawRequest?.headers?.authorization),
      appCheckContextPresent: Boolean(context.app),
    });
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId } = data || {};
  if (!rideId || typeof rideId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  try {
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const uid = context.auth.uid;
    if (ride.clientId !== uid && ride.driverId !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'No eres participante de este viaje');
    }

    // Generar código único con reintentos en caso de colisión
    const store: RideShareCodeStore = {
      getIndex: async (targetRideId) => {
        const snapshot = await db.ref(`rideTrackingCodes/_byRide/${targetRideId}`).once('value');
        return snapshot.val() || null;
      },
      findLegacyEntries: async (targetRideId) => {
        const snapshot = await db.ref('rideTrackingCodes')
          .orderByChild('rideId')
          .equalTo(targetRideId)
          .once('value');
        return snapshot.val() || null;
      },
      transactIndex: async (targetRideId, candidate, now) => {
        const result = await db.ref(`rideTrackingCodes/_byRide/${targetRideId}`).transaction((current: any) =>
          isActiveRideShareCode(current, now) ? undefined : candidate,
        );
        return result.snapshot.val() || null;
      },
      transactCode: async (candidateCode, candidate, now) => {
        const result = await db.ref(`rideTrackingCodes/${candidateCode}`).transaction((current: any) => {
          if (!current) return candidate;
          if (current.rideId === candidate.rideId && isActiveRideShareCode(current, now)) return current;
          return;
        });
        const entry = result.snapshot.val();
        return isActiveRideShareCode(entry, now) && entry.rideId === rideId ? entry : null;
      },
      replaceIndex: async (targetRideId, expectedCode, replacement) => {
        const result = await db.ref(`rideTrackingCodes/_byRide/${targetRideId}`).transaction((current: any) =>
          current?.code === expectedCode ? replacement : undefined,
        );
        return result.snapshot.val() || null;
      },
    };
    const entry = await getOrCreateRideShareCode(store, {
      rideId,
      createdBy: uid,
      now: Date.now(),
      generateCode,
      isValidCode: (candidate) =>
        candidate.length === CODE_LENGTH && [...candidate].every((character) => CODE_ALPHABET.includes(character)),
    });

    console.log(`🔗 [createRideShareToken] Código de tracking disponible para viaje ${rideId}`);

    return {
      code: entry.code,
      expiresInHours: Math.max(0, (entry.expiresAt - Date.now()) / (60 * 60 * 1000)),
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('❌ [createRideShareToken] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});
