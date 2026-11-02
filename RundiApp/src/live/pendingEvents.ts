/**
 * Pending events — patrón doc §5.2: el doc operacional + su
 * SYSTEM_pending_events en UN solo WriteBatch atómico. El consumidor
 * (cmd/consumer) lo persiste en SQL de forma idempotente; las reglas solo
 * aceptan `create` con forma exacta y eventType whitelisted.
 *
 * Caso actual: foto del vehículo de llegada (conductor designado).
 *   - Operacional: REALTIME_designated_arrival_photos/{uid} {path, takenAt}
 *   - Durable:     rides.arrival_vehicle_photo en Cloud SQL (vía pending event)
 */
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';

import { getFirebaseFirestore } from '../config/firebase';
import { FS_COL } from '../constants/firestore';

export interface ArrivalPhotoInput {
  uid: string;     // Firebase UID del que sube (driver o follower)
  rideId: string;  // ride UUID
  path: string;    // objectPath en Cloud Storage (bucket privado)
}

/**
 * submitArrivalPhoto — batch atómico: foto efímera + pending event.
 * El backend valida que uid sea driver/follower del ride antes de persistir
 * (nunca se confía en el payload; las reglas solo fuerzan la forma).
 */
export async function submitArrivalPhoto(input: ArrivalPhotoInput): Promise<void> {
  const { uid, rideId, path } = input;
  const eventId = `arrival-${rideId}-${uid}`;

  const db = await getFirebaseFirestore();
  const batch = writeBatch(db);
  batch.set(doc(db, FS_COL.arrivalPhotos, uid), {
    path,
    takenAt: serverTimestamp(),
  });
  batch.set(doc(db, FS_COL.pendingEvents, eventId), {
    eventType: 'arrival_photo_uploaded',
    aggregateType: 'ride',
    aggregateId: rideId,
    payload: { rideId, uid, path },
    status: 'pending',
    source: 'client',
    createdAt: serverTimestamp(),
  });
  return batch.commit();
}
