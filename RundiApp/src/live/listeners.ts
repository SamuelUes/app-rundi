/**
 * Listeners sobre colecciones REALTIME_* y DATA-MAIN_* — el SDK del cliente
 * escucha proyecciones que el consumidor (cmd/consumer) escribe desde el
 * Outbox. Reemplaza los listeners RTDB de useFirebaseData en los dominios migrados.
 *
 * Convención: siempre retornar el unsubscribe de onSnapshot y usarlo en
 * cleanup (misma regla que AGENTS.md para onValue).
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebase';
import { FS_COL } from '../constants/firestore';
import { liveTripDocId } from './tripIds';

/** Estado vivo de un viaje (proyección versionada desde SQL). Acepta el id
 * SQL del viaje o el doc id vivo (firebaseRideId) — se resuelve aquí. */
export async function listenTripLive(
  tripId: string,
  cb: (data: DocumentData | undefined) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const liveId = await liveTripDocId(tripId);
  return onSnapshot(doc(db, FS_COL.tripsLive, liveId), (s) => cb(s.data()));
}

/** Ofertas destinadas a un conductor (REALTIME_driver_offers). */
export async function listenDriverOffers(
  driverUid: string,
  cb: (docs: { id: string; data: DocumentData }[]) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const q = query(
    collection(db, FS_COL.driverOffers),
    where('driverId', '==', driverUid),
    where('status', '==', 'pending'),
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
  );
}

/** Ofertas de conductores sobre un viaje (REALTIME_driver_offers, lado cliente).
 * rideId = UUID SQL (clave del campo rideId de la oferta); clientUid se exige
 * porque las reglas solo prueban clientId/driverId == uid. */
export async function listenRideOffers(
  rideId: string,
  clientUid: string,
  cb: (docs: { id: string; data: DocumentData }[]) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const q = query(
    collection(db, FS_COL.driverOffers),
    where('clientId', '==', clientUid),
    where('rideId', '==', rideId),
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
  );
}

/** Estado de pago vivo de un viaje (REALTIME_payments_live/{tripId}). */
export async function listenPaymentLive(
  tripId: string,
  cb: (data: DocumentData | undefined) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const liveId = await liveTripDocId(tripId);
  return onSnapshot(doc(db, FS_COL.paymentsLive, liveId), (s) => cb(s.data()));
}

/** Conductores online de un área (matching client-side, doc §7.2). */
export async function listenOnlineDrivers(
  serviceAreaId: string,
  cb: (docs: { id: string; data: DocumentData }[]) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const q = query(
    collection(db, FS_COL.driversLive),
    where('serviceAreaId', '==', serviceAreaId),
    where('status', 'in', ['online', 'on_ride']),
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
  );
}

/** Notificaciones del usuario (DATA-MAIN_notifications/{uid}/items). */
export async function listenNotifications(
  uid: string,
  cb: (docs: { id: string; data: DocumentData }[]) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const q = query(
    collection(db, FS_COL.notifications, uid, 'items'),
    where('read', '==', false),
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
  );
}
