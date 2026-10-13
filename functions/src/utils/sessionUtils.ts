import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { TransactionResult } from '@firebase/database-types';

// Las transacciones RTDB ejecutan la función de actualización contra el caché
// local del SDK, no contra un GET del servidor. En una instancia fría ese caché
// está vacío: update() recibe null y un abort devuelve committed=false aunque
// el nodo exista. Mantener un listener vivo hasta que llegue el primer valor
// del servidor garantiza que la transacción vea el dato real en el primer intento.
export async function runSessionTransaction(
  ref: admin.database.Reference,
  update: (current: any) => any,
  applyLocally = false,
): Promise<TransactionResult> {
  const keepAlive = () => undefined;
  ref.on('value', keepAlive);
  try {
    await Promise.race([
      ref.once('value'),
      new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    ]);
    return await ref.transaction(update, undefined, applyLocally);
  } finally {
    ref.off('value', keepAlive);
  }
}

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
  // La propiedad de la sesión se determina solo por deviceId. isActive=false
  // es un estado transitorio (markAppClosed en background) del mismo
  // dispositivo, no una transferencia de propiedad.
  if (!session || session.deviceId !== deviceId) {
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
