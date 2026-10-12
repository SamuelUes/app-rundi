import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

const db = admin.database();

interface StartSessionPayload {
  deviceId?: string;
  platform?: string;
  model?: string;
  fcmToken?: string;
  policy?: 'deny';
}

const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos

function nowServer() {
  return admin.database.ServerValue.TIMESTAMP as unknown as number;
}

function isSessionRecent(lastSeen: unknown): boolean {
  if (typeof lastSeen === 'number') {
    const diff = Date.now() - lastSeen;
    return diff >= 0 && diff <= ACTIVE_THRESHOLD_MS;
  }
  return true;
}

export const startSession = functions.https.onCall(async (data: StartSessionPayload, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const uid = context.auth.uid;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId.trim() : '';
  const platform = typeof data?.platform === 'string' ? data.platform : undefined;
  const model = typeof data?.model === 'string' ? data.model : undefined;
  const fcmToken = typeof data?.fcmToken === 'string' ? data.fcmToken : undefined;
  const policy = 'deny' as const;

  if (!deviceId || deviceId.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId inválido');
  }

  const sessionRef = db.ref(`sessions/${uid}`);
  const result = await sessionRef.transaction((existing) => {
    if (
      policy === 'deny' &&
      existing?.deviceId &&
      existing.deviceId !== deviceId &&
      existing.isActive !== false &&
      isSessionRecent(existing.lastSeen)
    ) {
      return;
    }

    return {
      deviceId,
      platform: platform || existing?.platform || null,
      model: model || existing?.model || null,
      fcmToken: fcmToken || existing?.fcmToken || null,
      createdAt: existing?.createdAt || nowServer(),
      lastSeen: nowServer(),
      isActive: true,
      policy,
      ...(typeof existing?.serviceAreaId === 'string' ? { serviceAreaId: existing.serviceAreaId } : {}),
    };
  }, undefined, false);

  if (!result.committed) {
    throw new functions.https.HttpsError('failed-precondition', 'SESSION_ACTIVE_ELSEWHERE');
  }

  return { success: true };
});

export const endSession = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId.trim() : '';
  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId requerido');
  }

  const result = await db.ref(`sessions/${context.auth.uid}`).transaction((session) => {
    if (session?.deviceId !== deviceId) return;
    return null;
  }, undefined, false);

  return { success: result.committed };
});
