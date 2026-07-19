import { useEffect, useState } from 'react';
import { fetchClientProfile, type ClientProfile } from '../../../services/clientProfilesService';

export function useClientProfile(clientId: string) {
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const profile = await fetchClientProfile(clientId);
        if (active) {
          setClientProfile(profile);
        }
      } catch (error) {
        console.warn('[useClientProfile] Error cargando perfil cliente:', error);
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [clientId]);

  return { clientProfile, setClientProfile };
}
