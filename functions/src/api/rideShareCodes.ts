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

const db = admin.database();

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para dictarlo por teléfono.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const SHARE_CODE_TTL_MS = 4 * 60 * 60 * 1000; // 4 h
const MAX_CODE_ATTEMPTS = 5;

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
    let code = '';
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = generateCode();
      const existing = await db.ref(`rideTrackingCodes/${candidate}`).once('value');
      if (!existing.exists()) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new functions.https.HttpsError('internal', 'No se pudo generar un código único');
    }

    await db.ref(`rideTrackingCodes/${code}`).set({
      rideId,
      createdBy: uid,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      expiresAt: Date.now() + SHARE_CODE_TTL_MS,
    });

    console.log(`🔗 [createRideShareToken] Código ${code} creado para viaje ${rideId} por ${uid}`);

    return { code, expiresInHours: SHARE_CODE_TTL_MS / (60 * 60 * 1000) };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('❌ [createRideShareToken] Error:', error);
    throw new functions.https.HttpsError('internal', 'Error interno del servidor');
  }
});
