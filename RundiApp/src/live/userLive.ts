/**
 * Estado del usuario sobre DATA-MAIN_users — perfil (listener propio) y
 * fcmTokens (escritura directa del owner según reglas v2).
 * Reemplaza users/{uid} + fcmTokens del Firestore legacy.
 */

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebase';
import { FS_COL } from '../constants/firestore';

/** Perfil operativo propio (proyección/backend puede autocorregir). */
export async function listenMyProfile(
  uid: string,
  cb: (data: DocumentData | undefined) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  return onSnapshot(doc(db, FS_COL.users, uid), (s) => cb(s.data()));
}

/** Registra/renueva un token FCM (doc id = token; convención v1). */
export async function registerFcmToken(uid: string, token: string): Promise<void> {
  const db = await getFirebaseFirestore();
  await setDoc(
    doc(collection(db, FS_COL.users, uid, 'fcmTokens'), token),
    { token, createdAt: serverTimestamp() },
    { merge: true },
  );
}

/** Quita un token FCM (logout o token rotado/inválido). */
export async function removeFcmToken(uid: string, token: string): Promise<void> {
  const db = await getFirebaseFirestore();
  await deleteDoc(doc(collection(db, FS_COL.users, uid, 'fcmTokens'), token));
}

/** Marca una notificación in-app como leída (campos permitidos por reglas). */
export async function markNotificationRead(uid: string, notificationKey: string): Promise<void> {
  const db = await getFirebaseFirestore();
  await setDoc(
    doc(collection(db, FS_COL.notifications, uid, 'items'), notificationKey),
    { read: true, readAt: serverTimestamp() },
    { merge: true },
  );
}

/** Elimina una notificación in-app (permitido al owner por reglas). */
export async function deleteNotification(uid: string, notificationKey: string): Promise<void> {
  const db = await getFirebaseFirestore();
  await deleteDoc(doc(collection(db, FS_COL.notifications, uid, 'items'), notificationKey));
}
