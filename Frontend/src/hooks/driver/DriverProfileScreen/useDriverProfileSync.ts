import { useEffect } from 'react';
import { useAuth } from '../../shared/auth/useAuth';
import { fetchDriverProfile } from '../../../services/driverProfilesService';

const preferNonEmpty = (...candidates: Array<string | null | undefined>): string | null => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
};

/**
 * useDriverProfileSync
 * Obtiene el perfil del conductor desde el backend (Firebase Auth + Supabase)
 * y sincroniza la información importante en Realtime Database (`driversInfo/{uid}`).
 * Esto asegura que otras pantallas (cliente/driver) puedan consumir la data normalizada.
 */
export function useDriverProfileSync() {
  const { user, userMode } = useAuth();

  useEffect(() => {
    const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';

    // Solo sincronizar cuando el usuario es conductor (o designated_driver)
    // y el modo activo de la app es "driver". Esto asegura que al cambiar
    // de cliente -> conductor se vuelva a poblar driversInfo.
    if (!user?.id || !isDriverCapable || userMode !== 'driver') {
      return;
    }

    let cancelled = false;

    const syncProfile = async () => {
      try {
        const profile = await fetchDriverProfile(user.id, { forceRefresh: true });
        if (!profile || cancelled) {
          return;
        }

        const { getDatabase, ref, update } = await import('firebase/database');
        const db = getDatabase();

        const combinedFullName = [profile.firstName, profile.lastName]
          .filter(Boolean)
          .join(' ')
          .trim();

        const normalizedFullName =
          preferNonEmpty(
            combinedFullName,
            (profile as any)?.fullName,
            (profile as any)?.displayName,
            (profile as any)?.name,
            user?.name,
          ) || null;

        const normalizedFirstName =
          profile.firstName ||
          (normalizedFullName ? normalizedFullName.split(' ')[0] : null) ||
          null;

        const normalizedLastName =
          profile.lastName ||
          (normalizedFullName && normalizedFullName.split(' ').length > 1
            ? normalizedFullName.split(' ').slice(1).join(' ')
            : null) ||
          null;

        const activeVehicle = profile.vehicles?.find((v) => v?.isActive) || profile.vehicles?.[0] || null;

        const vehiclePayload = activeVehicle
          ? {
              id: activeVehicle.id ?? null,
              plate: activeVehicle.plate ?? null,
              brand: activeVehicle.brand ?? null,
              model: activeVehicle.model ?? null,
              year: activeVehicle.year ?? null,
              color: activeVehicle.color ?? null,
              type: activeVehicle.type ?? null,
              isActive: Boolean(activeVehicle.isActive),
              registrationNumber: activeVehicle.registrationNumber ?? null,
              registrationExpiry: activeVehicle.registrationExpiry ?? null,
              insuranceNumber: activeVehicle.insuranceNumber ?? null,
              insuranceCompany: activeVehicle.insuranceCompany ?? null,
              insuranceExpiry: activeVehicle.insuranceExpiry ?? null,
              vehiclePhoto: activeVehicle.vehiclePhoto ?? null,
            }
          : null;

        // rating/totalRides/earnings/account_status/documents_status son
        // propiedad del backend (ratings API, verificación). Las RTDB rules los
        // congelan para writes de cliente — el conductor no puede autoeditar
        // su reputación ni autoaprobar su cuenta.
        const driversInfoPayload: Record<string, any> = {
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          fullName: normalizedFullName,
          name: normalizedFullName,
          displayName: normalizedFullName,
          profilePhoto: profile.profilePhoto ?? null,
          photoURL: profile.profilePhoto ?? null,
          email: profile.email ?? null,
          phone: profile.phone ?? null,
          licenseNumber: profile.licenseNumber ?? null,
          department: profile.department ?? null,
          municipality: profile.municipality ?? null,
          verifiedAt: profile.verifiedAt ?? null,
          updatedAt: Date.now(),
          cachedFrom: 'driverProfileSync',
        };

        if (vehiclePayload) {
          driversInfoPayload.vehicle = vehiclePayload;
        }

        // update() (no set) para preservar campos backend-owned que el payload
        // ya no incluye (rating, earnings, account_status, ...).
        // Solo escribir campos que cambiaron: cada update() en driversInfo
        // broadcastea a TODOS los clientes suscritos a driversInfo.
        const { get } = await import('firebase/database');
        const driverInfoRef = ref(db, `driversInfo/${user.id}`);
        const existingSnap = await get(driverInfoRef);
        const existing = (existingSnap.val() as Record<string, any> | null) ?? {};
        const diff: Record<string, any> = {};
        for (const [key, value] of Object.entries(driversInfoPayload)) {
          if (key === 'updatedAt') continue; // timestamp propio, no comparar
          const previous = existing[key];
          const changed =
            typeof value === 'object' && value !== null
              ? JSON.stringify(value) !== JSON.stringify(previous)
              : previous !== value;
          if (changed) diff[key] = value;
        }

        if (Object.keys(diff).length === 0) {
          console.log('[useDriverProfileSync] driversInfo ya sincronizado, sin cambios');
          return;
        }
        diff.updatedAt = Date.now();
        diff.cachedFrom = 'driverProfileSync';
        await update(driverInfoRef, diff);
        console.log('[useDriverProfileSync] ✅ Perfil de conductor sincronizado en driversInfo');
      } catch (error) {
        console.warn(
          '[useDriverProfileSync] Error sincronizando perfil del conductor:',
          (error as any)?.message || error
        );
      }
    };

    syncProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, userMode]);

  return null;
}
