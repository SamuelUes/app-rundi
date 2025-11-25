import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchDriverProfile } from '../services/driverProfilesService';

/**
 * useDriverProfileSync
 * Obtiene el perfil del conductor desde el backend (Firebase Auth + Supabase)
 * y sincroniza la información importante en Realtime Database (`driversInfo/{uid}`).
 * Esto asegura que otras pantallas (cliente/driver) puedan consumir la data normalizada.
 */
export function useDriverProfileSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id || user.role !== 'driver') {
      return;
    }

    let cancelled = false;

    const syncProfile = async () => {
      try {
        const profile = await fetchDriverProfile(user.id);
        if (!profile || cancelled) {
          return;
        }

        const { getDatabase, ref, set } = await import('firebase/database');
        const db = getDatabase();

        const fullName = [profile.firstName, profile.lastName]
          .filter(Boolean)
          .join(' ')
          .trim();

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

        const rawAccountStatus = String(
          (profile as any)?.account_status || (profile as any)?.status || ''
        ).toLowerCase();

        const accountStatus = rawAccountStatus === 'active' || rawAccountStatus === 'verified' || rawAccountStatus === 'approved'
          ? 'active'
          : rawAccountStatus === 'suspended'
            ? 'suspended'
            : rawAccountStatus === 'rejected'
              ? 'rejected'
              : 'pending';

        const rawDocumentsStatus = String((profile as any)?.documents_status || '').toLowerCase();
        const documentsStatus = rawDocumentsStatus === 'verified'
          ? 'verified'
          : rawDocumentsStatus === 'suspended'
            ? 'suspended'
            : rawDocumentsStatus === 'rejected'
              ? 'rejected'
              : 'pending';

        const driversInfoPayload: Record<string, any> = {
          firstName: profile.firstName ?? null,
          lastName: profile.lastName ?? null,
          fullName: fullName || null,
          name: fullName || profile.firstName || null,
          displayName: fullName || profile.firstName || null,
          profilePhoto: profile.profilePhoto ?? null,
          photoURL: profile.profilePhoto ?? null,
          email: profile.email ?? null,
          phone: profile.phone ?? null,
          account_status: accountStatus,
          documents_status: documentsStatus,
          rating: typeof profile.rating === 'number' ? profile.rating : null,
          totalRides: typeof profile.totalRides === 'number' ? profile.totalRides : 0,
          earnings: typeof profile.earnings === 'number' ? profile.earnings : 0,
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

        // Escribir directamente en el path específico, no en la raíz
        await set(ref(db, `driversInfo/${user.id}`), driversInfoPayload);
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
  }, [user?.id, user?.role]);

  return null;
}
