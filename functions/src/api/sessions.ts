import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { runSessionTransaction } from '../utils/sessionUtils';

const db = admin.database();

interface StartSessionPayload {
  deviceId?: string;
  platform?: string;
  model?: string;
  fcmToken?: string;
  policy?: 'deny';
  heartbeatOnly?: boolean;
  source?: string;
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

  const idType = (value: unknown): string | null =>
    typeof value === 'string' && value.includes('-') ? value.split('-')[0] : null;

  const logRejection = async (operation: 'claim' | 'heartbeat') => {
    try {
      const latest = (await sessionRef.once('value')).val();
      functions.logger.warn(`[startSession] ${operation} rechazado`, {
        uid,
        source: typeof data?.source === 'string' ? data.source : undefined,
        sessionExists: Boolean(latest),
        sameDevice: latest?.deviceId === deviceId,
        incomingIdType: idType(deviceId),
        ownerIdType: idType(latest?.deviceId),
        sessionActive: latest?.isActive ?? null,
        sessionPlatform: latest?.platform ?? null,
        sessionModel: latest?.model ?? null,
      });
    } catch {
      // diagnóstico best-effort
    }
  };

  if (data?.heartbeatOnly === true) {
    // El heartbeat solo renueva si el deviceId coincide. isActive no se
    // verifica: markAppClosed puede dejarlo en false durante transiciones
    // transitorias a background (diálogos de permisos, etc.) y el heartbeat
    // debe reafirmar la propiedad del dispositivo que sigue vivo.
    const heartbeat = await runSessionTransaction(sessionRef, (existing) => {
      if (!existing || existing.deviceId !== deviceId) return;
      return { ...existing, isActive: true, lastSeen: nowServer() };
    });

    if (!heartbeat.committed) {
      await logRejection('heartbeat');
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_ACTIVE_ELSEWHERE');
    }

    return { success: true };
  }

  const result = await runSessionTransaction(sessionRef, (existing) => {
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
  });

  if (!result.committed) {
    await logRejection('claim');
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

  const sessionRef = db.ref(`sessions/${context.auth.uid}`);
  const result = await runSessionTransaction(sessionRef, (session) => {
    if (session?.deviceId !== deviceId) return;
    return null;
  });

  if (!result.committed) {
    try {
      const latest = (await sessionRef.once('value')).val();
      const idType = (value: unknown): string | null =>
        typeof value === 'string' && value.includes('-') ? value.split('-')[0] : null;
      functions.logger.warn('[endSession] Sesión no eliminada (otro dueño o inexistente)', {
        uid: context.auth.uid,
        sessionExists: Boolean(latest),
        sameDevice: latest?.deviceId === deviceId,
        incomingIdType: idType(deviceId),
        ownerIdType: idType(latest?.deviceId),
        sessionPlatform: latest?.platform ?? null,
      });
    } catch {
      // diagnóstico best-effort
    }
  }

  return { success: result.committed };
});
