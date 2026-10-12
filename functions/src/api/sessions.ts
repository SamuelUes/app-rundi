import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

const db = admin.database();

interface StartSessionPayload {
  deviceId?: string;
  platform?: string;
  model?: string;
  fcmToken?: string;
  policy?: 'deny' | 'takeover';
}

const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos

function nowServer() {
  return admin.database.ServerValue.TIMESTAMP as unknown as number;
}

async function getSession(uid: string): Promise<any | null> {
  const snap = await db.ref(`sessions/${uid}`).once('value');
  return snap.val() || null;
}

function isSessionRecent(lastSeen: unknown): boolean {
  if (typeof lastSeen === 'number') {
    const diff = Date.now() - lastSeen;
    return diff >= 0 && diff <= ACTIVE_THRESHOLD_MS;
  }
  // Si es un server timestamp pendiente u otro tipo, considerarlo reciente por seguridad
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
  const policy = (data?.policy === 'takeover' ? 'takeover' : 'deny') as 'deny' | 'takeover';

  if (!deviceId || deviceId.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId inválido');
  }

  const existing = await getSession(uid);

  if (existing && existing.deviceId && existing.deviceId !== deviceId) {
    const recent = isSessionRecent(existing.lastSeen);

    if (policy === 'deny' && recent) {
      // Denegar estrictamente si la sesión existente está activa recientemente
      throw new functions.https.HttpsError(
        'failed-precondition',
        'SESSION_ACTIVE_ELSEWHERE',
      );
    }
  }

  const sessionPayload: Record<string, any> = {
    deviceId,
    platform: platform || null,
    model: model || null,
    fcmToken: fcmToken || null,
    createdAt: existing?.createdAt || nowServer(),
    lastSeen: nowServer(),
    policy,
  };

  await db.ref(`sessions/${uid}`).set(sessionPayload);

  return { success: true };
});

export const endSession = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const uid = context.auth.uid;
  try {
    await db.ref(`sessions/${uid}`).remove();
  } catch (err) {
    // No bloquear logout por error de limpieza
    functions.logger.warn('[endSession] Error removing session', { uid, error: (err as any)?.message || err });
  }

  return { success: true };
});
