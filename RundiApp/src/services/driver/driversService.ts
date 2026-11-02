/**
 * Drivers Service — v2: perfil/vehículos vía REST /v1/drivers; estado+GPS vía
 * escritura directa a REALTIME_drivers_live (único dominio client-writable).
 */

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import {
  getDriverStats,
  getMyDriverProfile as getMyDriverProfileV2,
  getMyDriverServices,
  getMyFeatureCapabilities,
  updateMyDriverProfile as updateMyDriverProfileV2,
  updateVehicle as updateVehicleV2,
} from '../../api/drivers';
import { writeDriverLiveLocation, writePresence } from '../../live/driverLive';
import i18n from '../../i18n';

interface Location {
  latitude: number;
  longitude: number;
}

interface AvailableDriversResponse {
  success: boolean;
  available: boolean;
  count: number;
  drivers: any[];
}

type DriverUpdatePayload = {
  license_photo_front?: string;
  license_photo_back?: string;
  license_number?: string;
  license_expiry?: string;
  profile_photo?: string;
  documents_status?: string;
  documentsStatus?: string;
};

type VehicleUpdatePayload = {
  registration_photo_front?: string;
  registration_photo_back?: string;
  insurance_photo?: string;
  vehicle_photo?: string;
  registration_number?: string;
  registration_expiry?: string;
  insurance_number?: string;
  insurance_company?: string;
  insurance_start_date?: string;
  insurance_expiry?: string;
};

type DriverProfileUpdatePayload = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  vehicleType?: string;
  vehiclePlate?: string;
};

const tr = (path: string) => i18n.t(`services.driversService.${path}`) as string;

async function currentUid(): Promise<string> {
  const auth = await getFirebaseAuth();
  if (!auth.currentUser) {
    throw new Error(tr('errors.notAuthenticated'));
  }
  return auth.currentUser.uid;
}

const STATUS_MAP = {
  offline: 'offline',
  available: 'online',
  busy: 'on_ride',
} as const;

class DriversService {
  private isAvailabilityLimitError(error: unknown): boolean {
    const normalized = String((error as any)?.message || (error as any)?.code || '').toLowerCase();
    return (
      normalized.includes('10 o más comisiones') ||
      normalized.includes('10 o mas comisiones') ||
      normalized.includes('10 or more commissions')
    );
  }

  async getMyRideFeatureCapabilities(vehicleId?: string): Promise<{
    success: boolean;
    vehicleId: string | null;
    driverFeatureCodes: string[];
    vehicleFeatureCodes: string[];
  }> {
    const features = await getMyFeatureCapabilities();
    return {
      success: true,
      vehicleId: vehicleId ?? null,
      driverFeatureCodes: features,
      vehicleFeatureCodes: [],
    };
  }

  async updateStatus(
    status: 'offline' | 'available' | 'busy',
    location?: Location,
    retries: number = 3,
  ): Promise<{ success: boolean; status: string }> {
    const uid = await currentUid();
    const liveStatus = STATUS_MAP[status];

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await writeDriverLiveLocation(uid, {
          status: liveStatus,
          latitude: location?.latitude,
          longitude: location?.longitude,
        });
        await writePresence(uid, status === 'offline' ? 'offline' : 'online');
        return { success: true, status };
      } catch (error) {
        lastError = error;
        if (this.isAvailabilityLimitError(error)) {
          throw new Error(tr('errors.availabilityLimit'));
        }
        if (attempt === retries) {
          console.error('❌ Error final en updateStatus después de', retries, 'intentos:', error);
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(tr('errors.updateFailed'));
  }

  async checkAvailableDrivers(
    _location: Location,
    _radius: number = 10,
    _vehicleType?: string,
    _designatedDriverVehicle?: 'auto' | 'moto',
    serviceCode?: string,
    featureCodes: string[] = [],
    _eligibilityAt?: number,
  ): Promise<AvailableDriversResponse> {
    // v2: matching lo hace el backend; esta consulta informativa lee drivers_live.
    const db = await getFirebaseFirestore();
    const snap = await getDocs(
      query(collection(db, FS_COL.driversLive), where('status', '==', 'online')),
    );
    let drivers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (serviceCode) {
      drivers = drivers.filter(
        (d: any) => !Array.isArray(d.activeServiceCodes) || d.activeServiceCodes.includes(serviceCode),
      );
    }
    if (featureCodes.length > 0) {
      drivers = drivers.filter(
        (d: any) => !Array.isArray(d.featureCodes) || featureCodes.every((f) => d.featureCodes.includes(f)),
      );
    }
    return { success: true, available: drivers.length > 0, count: drivers.length, drivers };
  }

  async updateLocation(
    latitude: number,
    longitude: number,
    heading?: number,
    speed?: number,
    accuracy?: number,
  ): Promise<{ success: boolean }> {
    const uid = await currentUid();
    await writeDriverLiveLocation(uid, { latitude, longitude, heading, speed, accuracy });
    return { success: true };
  }

  async updateVehicle(vehicleId: string, data: VehicleUpdatePayload): Promise<{ success: boolean; vehicle: any }> {
    await updateVehicleV2(vehicleId, data as any);
    return { success: true, vehicle: { id: vehicleId, ...data } };
  }

  async getDriverProfile(driverId: string): Promise<any> {
    // Perfil público del conductor → REALTIME_driver_public_profiles/{id}.
    const db = await getFirebaseFirestore();
    const snap = await getDoc(doc(db, FS_COL.driverPublic, driverId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async updateDesignatedDriverMode(driverId: string, isActive: boolean): Promise<{ success: boolean }> {
    // Modo designado = 'designated_driver' dentro de activeServiceCodes en drivers_live.
    const services = await getMyDriverServices().catch(() => [] as any[]);
    const codes = services.map((s: any) => s.serviceCode || s.code).filter(Boolean);
    const next = isActive
      ? Array.from(new Set([...codes, 'designated_driver']))
      : codes.filter((c: string) => c !== 'designated_driver');
    await writeDriverLiveLocation(driverId, { activeServiceCodes: next });
    return { success: true };
  }

  async updateDriver(data: DriverUpdatePayload): Promise<{ success: boolean; driver: any }> {
    await updateMyDriverProfileV2(data as any);
    return { success: true, driver: data };
  }

  async getMyDriverProfile(): Promise<any> {
    return getMyDriverProfileV2();
  }

  async updateMyDriverProfile(data: DriverProfileUpdatePayload): Promise<{ success: boolean; message: string }> {
    await updateMyDriverProfileV2(data as any);
    return { success: true, message: 'ok' };
  }

  async getDriverStats() {
    return getDriverStats();
  }
}

export default new DriversService();
