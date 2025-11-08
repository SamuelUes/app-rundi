import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

export interface DriverProfileVehicle {
  id?: string | null;
  plate?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | string | null;
  color?: string | null;
  type?: string | null;
  isActive?: boolean | null;
  registrationNumber?: string | null;
  registrationExpiry?: string | null;
  registrationPhotoFront?: string | null;
  registrationPhotoBack?: string | null;
  insuranceNumber?: string | null;
  insuranceCompany?: string | null;
  insuranceExpiry?: string | null;
  insurancePhoto?: string | null;
  vehiclePhoto?: string | null;
}

export interface DriverProfile {
  id: string;
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  licensePhotoFront?: string | null;
  licensePhotoBack?: string | null;
  licensePhoto?: string | null;
  profilePhoto?: string | null;
  department?: string | null;
  municipality?: string | null;
  status?: string | null;
  verifiedAt?: string | null;
  totalRides?: number;
  rating?: number;
  earnings?: number;
  createdAt?: string | null;
  vehicles?: DriverProfileVehicle[];
}

const driverProfileCache = new Map<string, DriverProfile | null>();

export async function fetchDriverProfile(driverId?: string | null): Promise<DriverProfile | null> {
  if (!driverId) return null;

  if (driverProfileCache.has(driverId)) {
    return driverProfileCache.get(driverId) ?? null;
  }

  try {
    const functions = await getFirebaseFunctions();
    const callable = httpsCallable<{ driverId: string }, { success: boolean; driver?: DriverProfile }>(
      functions,
      'getDriverProfileWithFallback'
    );

    const result = await callable({ driverId });
    if (result.data?.success && result.data?.driver) {
      driverProfileCache.set(driverId, result.data.driver);
      return result.data.driver;
    }
  } catch (error) {
    console.warn('[driverProfilesService] Error llamando getDriverProfileWithFallback:', error);
  }

  driverProfileCache.set(driverId, null);
  return null;
}

export function clearDriverProfileCache(driverId?: string) {
  if (!driverId) {
    driverProfileCache.clear();
    return;
  }
  driverProfileCache.delete(driverId);
}
