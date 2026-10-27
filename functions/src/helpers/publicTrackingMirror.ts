/**
 * ESPEJO PÚBLICO DE TRACKING (publicTracking/{code})
 *
 * La página web pública de tracking no puede leer `activeRides` (las reglas
 * exigen ser cliente/conductor del viaje) y el código de compartición vive en
 * un nodo Admin-only. Este helper proyecta una versión SANEADA del viaje —
 * la misma que devuelve getPublicRideTracking — en `publicTracking/{code}`,
 * donde las reglas permiten lectura anónima solo a quien tenga el código.
 *
 * Se invoca desde el trigger consolidado onActiveRidesWrite en cada write de
 * activeRides/{rideId} (incluye cada update de driverLocation), por lo que el
 * mapa web se actualiza en tiempo real vía listener de RTDB.
 */

import admin from 'firebase-admin';
import { buildPublicTrackingRide } from '../api/WebPage_publicRideTracking';
import { isActiveRideShareCode, type RideShareCodeEntry } from '../api/rideShareCodeStore';

const PUBLIC_ROOT = 'publicTracking';
const CODES_INDEX = 'rideTrackingCodes/_byRide';

/**
 * Devuelve el código de compartición activo del viaje (índice canónico
 * _byRide). Si el índice existe pero expiró, limpia su nodo público.
 */
async function getActiveShareCode(
  db: admin.database.Database,
  rideId: string,
): Promise<RideShareCodeEntry | null> {
  const snap = await db.ref(`${CODES_INDEX}/${rideId}`).once('value');
  const entry = snap.val() as RideShareCodeEntry | null;
  const now = Date.now();
  const entryCode = typeof entry?.code === 'string' ? entry.code.trim() : '';

  if (isActiveRideShareCode(entry, now)) {
    return entry;
  }

  // Código expirado: borramos el espejo para que nadie siga viendo el viaje.
  if (entryCode) {
    await db
      .ref(`${PUBLIC_ROOT}/${entryCode}`)
      .remove()
      .catch(() => undefined);
  }
  return null;
}

/**
 * Espeja un viaje activo a publicTracking/{code}. No-ops cuando el viaje no
 * tiene código activo (la gran mayoría de los writes).
 */
export async function mirrorRideToPublicTracking(rideId: string, rideData: any): Promise<void> {
  const db = admin.database();
  const entry = await getActiveShareCode(db, rideId);
  if (!entry) return;

  const ride = await buildPublicTrackingRide(db, rideId, rideData, 'active', true);
  await db.ref(`${PUBLIC_ROOT}/${entry.code}`).set({ ride, updatedAt: Date.now() });
}

/**
 * Cuando el viaje sale de activeRides (completado/cancelado/archivado),
 * escribe una última proyección desde completedRides para que los watchers
 * vean el estado final; si no existe ahí tampoco, borra el nodo.
 */
export async function mirrorDeletedRideToPublicTracking(rideId: string): Promise<void> {
  const db = admin.database();
  const entry = await getActiveShareCode(db, rideId);
  if (!entry) return;

  const snap = await db.ref(`completedRides/${rideId}`).once('value');
  const rideData = snap.val();
  if (!rideData || typeof rideData !== 'object') {
    await db.ref(`${PUBLIC_ROOT}/${entry.code}`).remove();
    return;
  }

  const ride = await buildPublicTrackingRide(db, rideId, rideData, 'completed', true);
  await db.ref(`${PUBLIC_ROOT}/${entry.code}`).set({ ride, updatedAt: Date.now() });
}
