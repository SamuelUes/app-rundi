/**
 * Pending events — patrón doc §5.2: el doc operacional + su
 * SYSTEM_pending_events en una transacción del backend. El consumidor
 * (cmd/consumer) lo persiste en SQL de forma idempotente; las reglas
 * deniegan la creación directa de eventos desde clientes.
 *
 * Caso actual: foto del vehículo de llegada (conductor designado).
 *   - Operacional: REALTIME_designated_arrival_photos/{uid} {path, takenAt}
 *   - Durable:     rides.arrival_vehicle_photo en Cloud SQL (vía pending event)
 */
import client from '../api/client';

export interface ArrivalPhotoInput {
  uid: string;     // Firebase UID del que sube (driver o follower)
  rideId: string;  // ride UUID
  path: string;    // objectPath en Cloud Storage (bucket privado)
}

/**
 * submitArrivalPhoto — comando atómico: foto efímera + pending event.
 * El backend valida que uid sea driver/follower del ride antes de persistir
 * (nunca se confía en el payload).
 */
export async function submitArrivalPhoto(input: ArrivalPhotoInput): Promise<void> {
  await client.post('/client-events/arrival-photo', { rideId: input.rideId, path: input.path });
}
