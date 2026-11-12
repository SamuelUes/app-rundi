/**
 * Dualidad de ids de viaje — REALTIME_trips_live se indexa por
 * firebaseRideId (doc id generado por el cliente), mientras toda ruta
 * REST /v1/rides/{id} y driver_offers.rideId usan el UUID SQL rides.id.
 * El doc vivo lleva ambos campos (`rideId` = SQL, `firebaseRideId` = doc id),
 * así que cualquiera de los dos resuelve al otro.
 */
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebase';
import { getRideDetail } from '../api/rides';
import { FS_COL } from '../constants/firestore';

const liveIdCache = new Map<string, string>();
const sqlIdCache = new Map<string, string>();

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function cachePair(liveId: string, sqlId: string) {
  liveIdCache.set(liveId, liveId);
  liveIdCache.set(sqlId, liveId);
  sqlIdCache.set(liveId, sqlId);
  sqlIdCache.set(sqlId, sqlId);
}

/** Id del doc REALTIME_trips_live para cualquiera de los dos ids del viaje. */
export async function liveTripDocId(rideOrLiveId: string): Promise<string> {
  const cached = liveIdCache.get(rideOrLiveId);
  if (cached) return cached;
  const db = await getFirebaseFirestore();
  try {
    const snap = await getDoc(doc(db, FS_COL.tripsLive, rideOrLiveId));
    if (snap.exists()) {
      const sqlId = snap.data()?.rideId as string | undefined;
      cachePair(rideOrLiveId, sqlId || rideOrLiveId);
      return rideOrLiveId;
    }
  } catch {
    // doc inexistente o reglas lo niegan — seguir por REST
  }
  // El detalle REST (participante u oferente) trae ambos ids; el backend
  // también resuelve firebase_ride_id en el path.
  const detail = await getRideDetail(rideOrLiveId);
  const fbId = detail.firebaseRideId || rideOrLiveId;
  cachePair(fbId, detail.id || rideOrLiveId);
  return fbId;
}

/** UUID SQL (rides.id) para cualquiera de los dos ids del viaje. */
export async function sqlRideIdForTrip(rideOrLiveId: string): Promise<string> {
  const cached = sqlIdCache.get(rideOrLiveId);
  if (cached) return cached;
  const db = await getFirebaseFirestore();
  try {
    const snap = await getDoc(doc(db, FS_COL.tripsLive, rideOrLiveId));
    const sqlId = snap.exists() ? (snap.data()?.rideId as string | undefined) : undefined;
    if (sqlId) {
      cachePair(rideOrLiveId, sqlId);
      return sqlId;
    }
  } catch {
    // doc inexistente o reglas lo niegan (oferente pre-asignación) — REST
  }
  if (UUID_RE.test(rideOrLiveId)) {
    sqlIdCache.set(rideOrLiveId, rideOrLiveId);
    return rideOrLiveId;
  }
  // Id no-uuid = probable firebaseRideId cuyo doc no pudimos leer (driver
  // aún no participante). GET /v1/rides/{id} también resuelve por
  // firebase_ride_id y autoriza al conductor con oferta existente.
  try {
    const detail = await getRideDetail(rideOrLiveId);
    const sqlId = detail.id || rideOrLiveId;
    cachePair(detail.firebaseRideId || rideOrLiveId, sqlId);
    return sqlId;
  } catch {
    sqlIdCache.set(rideOrLiveId, rideOrLiveId);
    return rideOrLiveId;
  }
}
