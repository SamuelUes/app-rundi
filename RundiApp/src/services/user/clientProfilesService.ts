import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { fetchRidePreview } from '../ride/ridePreviewService';

export interface ClientProfile {
  fullName?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
}

const profileCache = new Map<string, ClientProfile | null>();

export async function fetchClientProfile(clientId?: string | null, rideId?: string | null): Promise<ClientProfile | null> {
  if (!clientId) {
    return null;
  }

  const cacheKey = rideId ? `${clientId}:${rideId}` : clientId;
  if (profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey) ?? null;
  }

  try {
    const auth = await getFirebaseAuth();
    const db = await getFirebaseFirestore();

    // v2: DATA-MAIN_users solo es legible por el owner u operator (reglas) —
    // el propio cliente leyendo su perfil.
    if (auth.currentUser?.uid === clientId) {
      const snap = await getDoc(doc(db, FS_COL.users, clientId));
      if (snap.exists()) {
        const d = snap.data() as any;
        const profile: ClientProfile = {
          fullName: d.name ?? d.fullName ?? null,
          phone: d.phone ?? null,
          photoUrl: d.profilePhoto ?? d.photoUrl ?? null,
        };
        profileCache.set(cacheKey, profile);
        return profile;
      }
      profileCache.set(cacheKey, null);
      return null;
    }

    // Conductor viendo a su cliente: la foto/nombre/teléfono viajan embebidos
    // en el contexto del viaje (REALTIME_trips_live / REALTIME_driver_offers,
    // proyectados por el backend desde users.profile_photo).
    if (rideId) {
      // trips_live es legible por participante (viaje ya asignado).
      const liveSnap = await getDoc(doc(db, FS_COL.tripsLive, rideId)).catch(() => null);
      if (liveSnap?.exists()) {
        const d = liveSnap.data() as any;
        if (!d.clientId || d.clientId === clientId) {
          const profile: ClientProfile = {
            fullName: d.clientName ?? null,
            phone: d.clientPhone ?? null,
            photoUrl: d.clientPhoto ?? null,
          };
          profileCache.set(cacheKey, profile);
          return profile;
        }
      }

      // Pre-asignación: el doc de oferta propio + listado de 'requested'.
      const preview = await fetchRidePreview(rideId);
      if (preview && (!preview.clientId || preview.clientId === clientId)) {
        const profile: ClientProfile = {
          fullName: preview.clientName ?? null,
          phone: preview.clientPhone ?? null,
          photoUrl: preview.clientPhoto ?? null,
        };
        profileCache.set(cacheKey, profile);
        return profile;
      }
    }
  } catch (error) {
    console.warn('[clientProfilesService] Error leyendo perfil de cliente:', error);
  }

  profileCache.set(cacheKey, null);
  return null;
}

export function clearClientProfileCache(clientId?: string) {
  if (!clientId) {
    profileCache.clear();
    return;
  }
  for (const key of profileCache.keys()) {
    if (key === clientId || key.startsWith(`${clientId}:`)) {
      profileCache.delete(key);
    }
  }
}
