import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import type { RecurringRide, RecurringRideInput, RecurringRidePoint } from '../../types/recurringRide';

export const MAX_RECURRING_RIDES = 10;
const COLLECTION = 'recurringRides';

const asNumber = (value: any): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function sanitizePoint(raw: any): RecurringRidePoint | null {
  const lat = asNumber(raw?.lat ?? raw?.latitude);
  const lng = asNumber(raw?.lng ?? raw?.longitude);
  if (lat == null || lng == null) return null;
  return { lat, lng, address: String(raw?.address ?? '') };
}

export function sanitizeRecurringRide(raw: any, fallbackId: string): RecurringRide | null {
  const origin = sanitizePoint(raw?.origin);
  const destination = sanitizePoint(raw?.destination);
  if (!origin || !destination) return null;
  const vehicleType: RecurringRide['vehicleType'] =
    raw?.vehicleType === 'moto' || raw?.vehicleType === 'designated_driver' ? raw.vehicleType : 'auto';
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : fallbackId,
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
  };
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) out[key] = stripUndefined(entry);
    }
    return out as T;
  }
  return value;
}

export function generateRecurringRideId(): string {
  return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const ridesCol = async (uid: string) =>
  collection(await getFirebaseFirestore(), FS_COL.users, uid, COLLECTION);

const sortRides = (rides: RecurringRide[]) =>
  rides.sort((a, b) => a.createdAt - b.createdAt);

async function readRides(uid: string): Promise<RecurringRide[]> {
  const col = await ridesCol(uid);
  const snap = await getDocs(col);
  const rides: RecurringRide[] = [];
  snap.forEach((docSnap) => {
    const ride = sanitizeRecurringRide(docSnap.data(), docSnap.id);
    if (ride) rides.push(ride);
  });
  return sortRides(rides);
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
      const col = await ridesCol(uid);
      if (cancelled) return;
      unsubscribe = onSnapshot(
        col,
        (snap) => {
          const rides: RecurringRide[] = [];
          snap.forEach((docSnap) => {
            const ride = sanitizeRecurringRide(docSnap.data(), docSnap.id);
            if (ride) rides.push(ride);
          });
          callback(sortRides(rides));
        },
        (error) => {
          console.warn('[recurringRides] snapshot failed, fallback getDocs', error);
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
  const col = await ridesCol(uid);
  const now = Date.now();

  let existing: RecurringRide | null = null;
  if (input.id) {
    const snap = await getDoc(doc(col, input.id));
    existing = sanitizeRecurringRide(snap.data(), input.id);
  }

  if (!existing) {
    const count = (await getDocs(col)).size;
    if (count >= MAX_RECURRING_RIDES) {
      throw new Error(`MAX_RECURRING_RIDES:${MAX_RECURRING_RIDES}`);
    }
  }

  const ride: RecurringRide = {
    ...input,
    id: input.id ?? generateRecurringRideId(),
    extraStops: input.extraStops ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(doc(col, ride.id), stripUndefined(ride), { merge: true });
  return ride;
}

export async function deleteRecurringRide(uid: string, rideId: string): Promise<void> {
  const col = await ridesCol(uid);
  await deleteDoc(doc(col, rideId));
}
