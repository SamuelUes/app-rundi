import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

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
    const functions = await getFirebaseFunctions();
    const callable = httpsCallable<{ clientId: string; rideId?: string }, { found?: boolean; profile?: ClientProfile }>(
      functions,
      'getClientProfile'
    );
    const result = await callable({ clientId, rideId: rideId || undefined });

    if (result.data?.found && result.data?.profile) {
      profileCache.set(cacheKey, result.data.profile);
      return result.data.profile;
    }
  } catch (error) {
    console.warn('[clientProfilesService] Error llamando getClientProfile:', error);
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
