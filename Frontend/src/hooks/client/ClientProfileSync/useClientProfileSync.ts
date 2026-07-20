import { useEffect } from 'react';
import { useAuth } from '../../shared/auth/useAuth';
import { fetchClientProfile } from '../../../services/clientProfilesService';

/**
 * useInitializeClientProfile
 * Llama a getClientProfile() una sola vez al iniciar la app (para clientes).
 * Esto dispara el cacheo automático en clientsInfo/{uid} desde el backend.
 * No escribe directamente; deja que el backend maneje la lógica.
 */
export function useInitializeClientProfile() {
  const { user } = useAuth();

  useEffect(() => {
    // Solo para clientes autenticados
    if (!user?.id || user.role !== 'client') {
      return;
    }

    let cancelled = false;

    const initProfile = async () => {
      try {
        // Llamar a getClientProfile para que el backend cachee el perfil
        await fetchClientProfile(user.id);
        if (!cancelled) {
          console.log('[useInitializeClientProfile] ✅ Perfil inicializado y cacheado por el backend');
        }
      } catch (error) {
        // No es crítico si falla; el backend lo intentará después
        console.warn('[useInitializeClientProfile] Error inicializando perfil:', (error as any)?.message || error);
      }
    };

    initProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  return null;
}
