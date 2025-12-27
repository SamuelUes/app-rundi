/**
 * Drivers Service - Gestión de conductores
 */

import { getFirebaseAuth, getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';

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
  designated_rol_requested?: string;
  designatedRolRequested?: string;
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

const AVAILABILITY_LIMIT_MESSAGE =
  'No puedes activarte: tienes 10 o más comisiones pendientes. Liquídalas desde "Pagar comisiones".';

class DriversService {
  private functions: Functions | null = null;

  private async getFunctions(): Promise<Functions> {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  private isAvailabilityLimitError(error: unknown): boolean {
    const normalized = String((error as any)?.message || (error as any)?.code || '').toLowerCase();
    return (
      normalized.includes('10 o más comisiones') ||
      normalized.includes('10 o mas comisiones') ||
      normalized.includes('10 or more commissions')
    );
  }

  private async callFunction<T>(fnName: string, payload: unknown): Promise<T> {
    const functions = await this.getFunctions();
    const callable = httpsCallable(functions, fnName);
    const response = await callable(payload);
    return response.data as T;
  }

  async updateStatus(
    status: 'offline' | 'available' | 'busy',
    location?: Location,
    retries: number = 3,
  ): Promise<{ success: boolean; status: string }> {
    const auth = await getFirebaseAuth();
    if (!auth.currentUser) {
      throw new Error('Usuario no autenticado. Por favor inicia sesión.');
    }

    const payload: { status: typeof status; latitude?: number; longitude?: number } = { status };
    if (location) {
      payload.latitude = location.latitude;
      payload.longitude = location.longitude;
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.callFunction<{ success: boolean; status: string }>('updateDriverStatus', payload);
      } catch (error) {
        lastError = error;

        if (this.isAvailabilityLimitError(error)) {
          throw new Error(AVAILABILITY_LIMIT_MESSAGE);
        }

        if (attempt === retries) {
          console.error('❌ Error final en updateStatus después de', retries, 'intentos:', error);
          throw error;
        }

        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('No se pudo actualizar el estado del conductor');
  }

  async checkAvailableDrivers(
    location: Location,
    radius: number = 10,
    vehicleType?: string,
    designatedDriverVehicle?: 'auto' | 'moto',
  ): Promise<AvailableDriversResponse> {
    console.log('🚗 [driversService] Llamando getAvailableDrivers con:', {
      latitude: location.latitude,
      longitude: location.longitude,
      radius,
      vehicleType,
    });

    const payload: Record<string, any> = {
      latitude: location.latitude,
      longitude: location.longitude,
      radius,
    };

    if (vehicleType) {
      payload.vehicleType = vehicleType;
    }

    if (designatedDriverVehicle) {
      payload.designatedDriverVehicle = designatedDriverVehicle;
    }

    const result = await this.callFunction<AvailableDriversResponse>('getAvailableDrivers', payload);

    console.log('✅ [driversService] Respuesta recibida:', result);
    return result;
  }

  async updateLocation(
    latitude: number,
    longitude: number,
    heading?: number,
    speed?: number,
    accuracy?: number,
  ): Promise<{ success: boolean }> {
    return this.callFunction<{ success: boolean }>('updateDriverLocation', {
      latitude,
      longitude,
      heading,
      speed,
      accuracy,
    });
  }

  async updateVehicle(vehicleId: string, data: VehicleUpdatePayload): Promise<{ success: boolean; vehicle: any }> {
    return this.callFunction<{ success: boolean; vehicle: any }>('updateVehicle', {
      vehicleId,
      ...data,
    });
  }

  async getDriverProfile(driverId: string): Promise<any> {
    return this.callFunction<any>('getDriverProfile', { driverId });
  }

  async updateDesignatedDriverMode(driverId: string, isActive: boolean): Promise<{ success: boolean }> {
    return this.callFunction<{ success: boolean }>('updateDesignatedDriverMode', {
      driverId,
      isActive,
    });
  }

  async updateDriver(data: DriverUpdatePayload): Promise<{ success: boolean; driver: any }> {
    return this.callFunction<{ success: boolean; driver: any }>('updateDriver', data);
  }

  async getMyDriverProfile(): Promise<any> {
    const result = await this.callFunction<{ success: boolean; driver: any }>('getDriverProfileWithFallback', {});
    if (result.success) {
      return result.driver;
    }

    throw new Error('No se pudo obtener el perfil del conductor');
  }

  async updateMyDriverProfile(data: DriverProfileUpdatePayload): Promise<{ success: boolean; message: string }> {
    const result = await this.callFunction<{ success: boolean; message: string }>('updateDriverProfileWithSync', data);
    if (result.success) {
      return result;
    }

    throw new Error('No se pudo actualizar el perfil');
  }
}

export default new DriversService();