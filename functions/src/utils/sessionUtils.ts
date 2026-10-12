import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

const SESSION_ACTIVE_THRESHOLD_MS = 2 * 60 * 1000;

const isRecent = (lastSeen: any): boolean => {
  if (typeof lastSeen === 'number') {
    const diff = Date.now() - lastSeen;
    return diff >= 0 && diff <= SESSION_ACTIVE_THRESHOLD_MS;
  }
  return false;
};

export const ensureActiveSession = async (
  context: functions.https.CallableContext,
  data: any,
): Promise<void> => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const uid = context.auth.uid;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId.trim() : '';
  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId requerido');
  }

  const sessionSnap = await admin.database().ref(`sessions/${uid}`).once('value');
  const session = sessionSnap.val();
  if (session && session.deviceId && session.deviceId !== deviceId && isRecent(session.lastSeen)) {
    throw new functions.https.HttpsError('failed-precondition', 'SESSION_ACTIVE_ELSEWHERE');
  }
};

export async function getUserRole(uid: string): Promise<string | null> {
  try {
    const userRecord = await admin.auth().getUser(uid);
    const claims = userRecord.customClaims as Record<string, any> | undefined;
    if (claims?.role) {
      return claims.role as string;
    }
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (userDoc.exists) {
      return userDoc.data()?.role || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function requireRole(
  context: functions.https.CallableContext,
  allowedRoles: string[],
): Promise<string> {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const uid = context.auth.uid;
  const role = await getUserRole(uid);
  if (!role || !allowedRoles.includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Rol no autorizado para esta acción');
  }
  return uid;
}

export async function requireDriver(context: functions.https.CallableContext): Promise<string> {
  return requireRole(context, ['driver', 'designated_driver']);
}

export async function requireClient(context: functions.https.CallableContext): Promise<string> {
  return requireRole(context, ['client']);
}

export async function requireAdmin(context: functions.https.CallableContext): Promise<string> {
  return requireRole(context, ['admin']);
}
