import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

export interface ClientProfile {
  fullName?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
}

const profileCache = new Map<string, ClientProfile | null>();

export async function fetchClientProfile(clientId?: string | null): Promise<ClientProfile | null> {
  if (!clientId) {
    return null;
  }

  if (profileCache.has(clientId)) {
    return profileCache.get(clientId) ?? null;
  }

  try {
    const functions = await getFirebaseFunctions();
    const callable = httpsCallable<{ clientId: string }, { found?: boolean; profile?: ClientProfile }>(
      functions,
      'getClientProfile'
    );
    const result = await callable({ clientId });

    if (result.data?.found && result.data?.profile) {
      profileCache.set(clientId, result.data.profile);
      return result.data.profile;
    }
  } catch (error) {
    console.warn('[clientProfilesService] Error llamando getClientProfile:', error);
  }

  profileCache.set(clientId, null);
  return null;
}

export function clearClientProfileCache(clientId?: string) {
  if (!clientId) {
    profileCache.clear();
    return;
  }
  profileCache.delete(clientId);
}
