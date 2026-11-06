import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';

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
    // v2: DATA-MAIN_users solo es legible por el owner u operator (reglas).
    // Para un conductor viendo el perfil de su cliente no existe proyección
    // pública en v2 → devuelve null salvo que el lector sea el propio cliente.
    const auth = await getFirebaseAuth();
    if (auth.currentUser?.uid !== clientId) return null;
    const db = await getFirebaseFirestore();
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
