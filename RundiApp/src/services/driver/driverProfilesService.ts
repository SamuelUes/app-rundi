import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';

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

export async function fetchDriverProfile(
  driverId?: string | null,
  options?: { forceRefresh?: boolean },
): Promise<DriverProfile | null> {
  if (!driverId) return null;

  if (!options?.forceRefresh && driverProfileCache.has(driverId)) {
    return driverProfileCache.get(driverId) ?? null;
  }

  try {
    // v2: perfil PROPIO del conductor (preflight) — get auth permitido en
    // DATA-MAIN_drivers; la lista está restringida a operadores. Para perfiles
    // de otros conductores usar REALTIME_driver_public_profiles.
    const db = await getFirebaseFirestore();
    const [driverSnap, vehiclesSnap] = await Promise.all([
      getDoc(doc(db, FS_COL.drivers, driverId)),
      getDocs(
        query(collection(db, FS_COL.vehicles), where('driverUid', '==', driverId)),
      ).catch(() => null),
    ]);

    if (driverSnap.exists()) {
      const d = driverSnap.data() as any;
      const nameParts = String(d.displayName || '').trim().split(/\s+/);
      const vehicles: DriverProfileVehicle[] = vehiclesSnap
        ? vehiclesSnap.docs.map((v) => {
            const vd = v.data() as any;
            return {
              id: v.id,
              plate: vd.plate ?? null,
              brand: vd.brand ?? null,
              model: vd.model ?? null,
              year: vd.year ?? null,
              color: vd.color ?? null,
              type: vd.type ?? null,
              isActive: vd.isActive ?? null,
              vehiclePhoto: vd.vehiclePhoto ?? null,
            };
          })
        : [];

      const profile: DriverProfile = {
        id: driverSnap.id,
        userId: d.userId ?? driverSnap.id,
        firstName: nameParts[0] || null,
        lastName: nameParts.slice(1).join(' ') || null,
        profilePhoto: d.photoUrl ?? null,
        department: d.department ?? null,
        municipality: d.municipality ?? null,
        status: d.accountStatus ?? null,
        totalRides: d.totalRides ?? 0,
        rating: d.averageRating ?? 0,
        vehicles,
      };
      driverProfileCache.set(driverId, profile);
      return profile;
    }
  } catch (error) {
    console.warn('[driverProfilesService] Error leyendo perfil de conductor:', error);
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
