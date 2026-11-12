/**
 * Escrituras directas a REALTIME_* — único dominio donde el SDK del cliente
 * escribe sin pasar por el backend (doc §5.2). Campos limitados por las reglas
 * v2 (database-v2/firestore/firestore.rules); no tocar estados críticos.
 */

import {
  GeoPoint,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebase';
import { FS_COL } from '../constants/firestore';
import { liveTripDocId } from './tripIds';
import { devRideTrackingStage, devWriteAttempt } from '../utils/devWriteMetrics';
import {
  claimTripLocationWrite,
  confirmTripLocationWrite,
  createTripLocationWriteGate,
  releaseTripLocationWrite,
  type TripLocationWriteGate,
} from '../utils/ride/tripLocationWriteGate';

export interface DriverLivePatch {
  latitude?: number;
  longitude?: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  serviceAreaId?: string;
  vehicleType?: string;
}

/**
 * GPS/heartbeat del conductor → REALTIME_drivers_live/{uid}.
 * Solo keys permitidas por la regla: location, serviceAreaId, vehicleType,
 * lastSeen, heading, speed, accuracy. status/activeServiceCodes/session*
 * son autoridad del backend (POST/DELETE /v1/compliance/availability); el
 * heartbeat nunca escribe online ni al reabrir la app ni al terminar viaje.
 * Objetivo: 3–5s en viaje, 15–30s libre (doc §7.2).
 */
export async function writeDriverLiveLocation(
  driverUid: string,
  patch: DriverLivePatch,
): Promise<void> {
  const db = await getFirebaseFirestore();
  const hasCoords = typeof patch.latitude === 'number' && typeof patch.longitude === 'number';
  devWriteAttempt('driver_live');
  await setDoc(
    doc(db, FS_COL.driversLive, driverUid),
    {
      ...(hasCoords && { location: new GeoPoint(patch.latitude!, patch.longitude!) }),
      ...(patch.serviceAreaId !== undefined && { serviceAreaId: patch.serviceAreaId }),
      ...(patch.vehicleType !== undefined && { vehicleType: patch.vehicleType }),
      ...(patch.heading !== undefined && { heading: patch.heading }),
      ...(patch.speed !== undefined && { speed: patch.speed }),
      ...(patch.accuracy !== undefined && { accuracy: patch.accuracy }),
      lastSeen: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Toggle de modo conductor designado → drivers_live/{uid}.designatedMode.
 * Paridad v1 driversInfo.isDesignatedDriverMode: el matching de viajes
 * designados (serviceCode designated_driver_*) lo exige true server-side.
 * status/activeServiceCodes siguen siendo autoridad del backend — este flag
 * solo modula los servicios designados ya aprobados en driver_services.
 */
export async function writeDriverDesignatedMode(
  driverUid: string,
  isActive: boolean,
): Promise<void> {
  const db = await getFirebaseFirestore();
  devWriteAttempt('driver_live');
  await setDoc(
    doc(db, FS_COL.driversLive, driverUid),
    { designatedMode: isActive },
    { merge: true },
  );
}

/** Presencia online/offline → REALTIME_presence/{uid} (heartbeat del cliente). */
export async function writePresence(
  uid: string,
  state: 'online' | 'offline' | 'away',
): Promise<void> {
  const db = await getFirebaseFirestore();
  devWriteAttempt('presence');
  await setDoc(
    doc(db, FS_COL.presence, uid),
    { state, lastSeen: serverTimestamp(), heartbeatAt: serverTimestamp() },
    { merge: true },
  );
}

export interface UserSessionPatch {
  mode: 'client' | 'driver';
  device?: string;
  platform?: string;
  appVersion?: string;
  serviceAreaId?: string;
  fcmToken?: string;
}

/** Sesión/modo activo → REALTIME_user_sessions/{uid} (heartbeat incluido). */
export async function writeUserSession(
  uid: string,
  patch: UserSessionPatch,
): Promise<void> {
  const db = await getFirebaseFirestore();
  devWriteAttempt('session');
  await setDoc(
    doc(db, FS_COL.userSessions, uid),
    {
      ...patch,
      lastHeartbeat: serverTimestamp(),
      startedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

const tripLocationWriteGates = new Map<string, TripLocationWriteGate>();

const gateForTripLocation = (liveId: string, uid: string): TripLocationWriteGate => {
  const key = `${liveId}:${uid}`;
  let gate = tripLocationWriteGates.get(key);
  if (!gate) {
    gate = createTripLocationWriteGate();
    tripLocationWriteGates.set(key, gate);
  }
  return gate;
};

/** GPS del participante dentro de un viaje → trips_live/{liveId}/locations/{uid}.
 * Acepta el id SQL o el doc id vivo — se resuelve antes de escribir (la regla
 * del subdoc exige participación en el doc padre real). */
export async function writeTripParticipantLocation(
  tripId: string,
  uid: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  devRideTrackingStage('trip_write_start');
  try {
    const db = await getFirebaseFirestore();
    const liveId = await liveTripDocId(tripId);
    devRideTrackingStage('trip_id_resolved');
    const gate = gateForTripLocation(liveId, uid);
    if (!claimTripLocationWrite(gate, Date.now())) {
      devRideTrackingStage('trip_write_skipped');
      return;
    }
    try {
      devWriteAttempt('trip_location');
      await setDoc(
        doc(db, FS_COL.tripsLive, liveId, 'locations', uid),
        { latitude, longitude, updatedAt: serverTimestamp() },
        { merge: true },
      );
      confirmTripLocationWrite(gate, Date.now());
      devRideTrackingStage('trip_write_confirmed');
    } catch (error) {
      releaseTripLocationWrite(gate);
      throw error;
    }
  } catch (error) {
    devRideTrackingStage('trip_write_failed');
    throw error;
  }
}
