import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { getRideDetail } from '../../api/rides';
import { liveTripDocId } from '../../live/tripIds';

export interface RidePreview {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  estimatedPrice: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  paymentMethod?: 'cash' | 'card';
  negotiationStatus?: string;
}

const unwrap = <T>(value: T | null | undefined): T | undefined =>
  value === null ? undefined : value;

/**
 * Preview del viaje para el conductor. En v2 el conductor no participante no
 * puede leer trips_live ni /rides/{id}; la fuente es su doc de oferta
 * REALTIME_driver_offers/{rideId}_{uid} (contexto de la solicitud) + detalle
 * REST cuando ya es participante.
 */
export async function fetchRidePreview(rideId: string): Promise<RidePreview | null> {
  const auth = await getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  const db = await getFirebaseFirestore();

  let offer: any = null;
  if (uid) {
    const offerSnap = await getDoc(doc(db, FS_COL.driverOffers, `${rideId}_${uid}`)).catch(() => null);
    if (offerSnap?.exists()) offer = offerSnap.data();
  }

  // trips_live solo si ya es participante (oferta aceptada o asignado)
  let live: any = null;
  const liveSnap = await getDoc(doc(db, FS_COL.tripsLive, await liveTripDocId(rideId))).catch(() => null);
  if (liveSnap?.exists()) live = liveSnap.data();

  // Detalle REST solo para participantes (403 si no lo es — best-effort)
  const detail = await getRideDetail(rideId).catch(() => null);

  const src: any = { ...offer, ...live, ...(detail ?? {}) };
  if (!src.clientId && !offer && !live && !detail) {
    return null;
  }

  const originRaw = src.origin ?? {};
  const destRaw = src.destination ?? {};

  return {
    id: rideId,
    clientId: src.clientId || '',
    clientName: unwrap(src.clientName),
    clientPhone: unwrap(src.clientPhone),
    origin: {
      lat: originRaw.latitude ?? originRaw.lat ?? 0,
      lng: originRaw.longitude ?? originRaw.lng ?? 0,
      address: unwrap(originRaw.address ?? src.originAddress),
    },
    destination: {
      lat: destRaw.latitude ?? destRaw.lat ?? 0,
      lng: destRaw.longitude ?? destRaw.lng ?? 0,
      address: unwrap(destRaw.address ?? src.destinationAddress),
    },
    extraDestinations: src.extraDestinations || [],
    estimatedPrice: Number(src.estimatedPrice ?? src.finalFare ?? 0),
    estimatedDistance: unwrap(src.estimatedDistance),
    estimatedDuration: unwrap(src.estimatedDuration),
    clientSuggestedPrice: unwrap(src.clientSuggestedPrice),
    driverOfferedPrice: unwrap(src.offeredPrice ?? src.driverOfferedPrice) ?? null,
    paymentMethod: (src.paymentType === 'card_local' || src.paymentMethod === 'card' ? 'card' : 'cash') as 'cash' | 'card',
    negotiationStatus: unwrap(src.negotiationStatus ?? src.status),
  };
}
