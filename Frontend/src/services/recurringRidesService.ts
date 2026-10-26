import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebase';
import type { RecurringRide, RecurringRideInput, RecurringRidePoint } from '../types/recurringRide';

export const MAX_RECURRING_RIDES = 10;

const asNumber = (value: any): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function sanitizePoint(raw: any): RecurringRidePoint | null {
  const lat = asNumber(raw?.lat ?? raw?.latitude);
  const lng = asNumber(raw?.lng ?? raw?.longitude);
  if (lat == null || lng == null) return null;
  return { lat, lng, address: String(raw?.address ?? '') };
}

export function sanitizeRecurringRides(data: any): RecurringRide[] {
  if (!Array.isArray(data)) return [];
  const rides: RecurringRide[] = [];
  for (const raw of data) {
    const origin = sanitizePoint(raw?.origin);
    const destination = sanitizePoint(raw?.destination);
    if (!origin || !destination) continue;
    const vehicleType: RecurringRide['vehicleType'] =
      raw?.vehicleType === 'moto' || raw?.vehicleType === 'designated_driver' ? raw.vehicleType : 'auto';
    rides.push({
      id: typeof raw?.id === 'string' && raw.id ? raw.id : `rr_${rides.length}`,
      title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Viaje',
      origin,
      destination,
      extraStops: Array.isArray(raw?.extraStops)
        ? raw.extraStops
            .map(sanitizePoint)
            .filter((p: RecurringRidePoint | null): p is RecurringRidePoint => !!p)
            .slice(0, 3)
        : [],
      vehicleType,
      designatedDriverMode:
        raw?.designatedDriverMode === 'moto' || raw?.designatedDriverMode === 'auto'
          ? raw.designatedDriverMode
          : undefined,
      paymentMethod: raw?.paymentMethod === 'card' ? 'card' : 'cash',
      passengers: Math.max(1, Math.min(4, asNumber(raw?.passengers) ?? 1)),
      comment: typeof raw?.comment === 'string' && raw.comment.trim() ? raw.comment.trim() : undefined,
      priceSuggestion: asNumber(raw?.priceSuggestion),
      createdAt: asNumber(raw?.createdAt) ?? Date.now(),
      updatedAt: asNumber(raw?.updatedAt) ?? Date.now(),
    });
  }
  return rides;
}

export function generateRecurringRideId(): string {
  return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readRides(uid: string): Promise<RecurringRide[]> {
  const firestore = await getFirebaseFirestore();
  const snap = await getDoc(doc(firestore, 'users', uid));
  return sanitizeRecurringRides(snap.data()?.recurringRides);
}

export async function listRecurringRides(uid: string): Promise<RecurringRide[]> {
  if (!uid) return [];
  try {
    return await readRides(uid);
  } catch (error) {
    console.warn('[recurringRides] list failed', error);
    return [];
  }
}

export function subscribeRecurringRides(
  uid: string,
  callback: (rides: RecurringRide[]) => void,
): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

  (async () => {
    try {
      const firestore = await getFirebaseFirestore();
      if (cancelled) return;
      unsubscribe = onSnapshot(
        doc(firestore, 'users', uid),
        (snap) => callback(sanitizeRecurringRides(snap.data()?.recurringRides)),
        (error) => {
          console.warn('[recurringRides] snapshot failed, fallback getDoc', error);
          readRides(uid)
            .then((rides) => { if (!cancelled) callback(rides); })
            .catch(() => undefined);
        },
      );
    } catch (error) {
      console.warn('[recurringRides] subscribe init failed', error);
      try {
        const rides = await readRides(uid);
        if (!cancelled) callback(rides);
      } catch {
        /* noop */
      }
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export async function saveRecurringRide(
  uid: string,
  input: RecurringRideInput & { id?: string },
): Promise<RecurringRide> {
  if (!uid) throw new Error('missing uid');
  const rides = await readRides(uid);
  const now = Date.now();
  const existingIndex = input.id ? rides.findIndex((r) => r.id === input.id) : -1;

  const ride: RecurringRide = {
    ...input,
    id: input.id ?? generateRecurringRideId(),
    extraStops: input.extraStops ?? [],
    createdAt: existingIndex >= 0 ? rides[existingIndex].createdAt : now,
    updatedAt: now,
  };

  const next = existingIndex >= 0
    ? rides.map((r) => (r.id === ride.id ? ride : r))
    : [...rides, ride];

  if (next.length > MAX_RECURRING_RIDES) {
    throw new Error(`MAX_RECURRING_RIDES:${MAX_RECURRING_RIDES}`);
  }

  const firestore = await getFirebaseFirestore();
  await updateDoc(doc(firestore, 'users', uid), { recurringRides: next });
  return ride;
}

export async function deleteRecurringRide(uid: string, rideId: string): Promise<void> {
  const rides = await readRides(uid);
  const next = rides.filter((r) => r.id !== rideId);
  if (next.length === rides.length) return;
  const firestore = await getFirebaseFirestore();
  await updateDoc(doc(firestore, 'users', uid), { recurringRides: next });
}
