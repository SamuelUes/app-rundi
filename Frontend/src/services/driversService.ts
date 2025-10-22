/**
 * Drivers Service - Gestión de conductores
 */

import { getFirebaseAuth, getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

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

class DriversService {
  private functions: any = null;

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  /**
   * Actualizar estado del conductor
   */
  async updateStatus(
    status: 'offline' | 'available' | 'busy',
    location?: Location
  ): Promise<{ success: boolean; status: string }> {
    // Verificar que el usuario esté autenticado
    const auth = await getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Usuario no autenticado. Por favor inicia sesión.');
    }

    const functions = await this.getFunctions();
    const updateDriverStatus = httpsCallable(functions, 'updateDriverStatus');
    
    const data: any = { status };
    if (location) {
      data.latitude = location.latitude;
      data.longitude = location.longitude;
    }

    const result = await updateDriverStatus(data);
    return result.data as { success: boolean; status: string };
  }

  /**
   * Verificar si hay conductores disponibles en un área
   * NOTA: Esta función NO requiere autenticación (es pública)
   */
  async checkAvailableDrivers(
    location: Location,
    radius: number = 10,
    vehicleType?: string
  ): Promise<AvailableDriversResponse> {
    const functions = await this.getFunctions();
    const getAvailableDrivers = httpsCallable(functions, 'getAvailableDrivers');
    
    console.log(`🚗 [driversService] Llamando getAvailableDrivers con:`, {
      latitude: location.latitude,
      longitude: location.longitude,
      radius,
      vehicleType
    });
    
    const result = await getAvailableDrivers({
      latitude: location.latitude,
      longitude: location.longitude,
      radius,
      vehicleType, // Agregar filtro de tipo de vehículo
    });

    console.log(`✅ [driversService] Respuesta recibida:`, result.data);
    
    return result.data as AvailableDriversResponse;
  }

  /**
   * Actualizar ubicación del conductor
   */
  async updateLocation(
    latitude: number,
    longitude: number,
    heading?: number,
    speed?: number,
    accuracy?: number
  ): Promise<{ success: boolean }> {
    const functions = await this.getFunctions();
    const updateDriverLocation = httpsCallable(functions, 'updateDriverLocation');
    
    const result = await updateDriverLocation({
      latitude,
      longitude,
      heading,
      speed,
      accuracy,
    });

    return result.data as { success: boolean };
  }

  /**
   * Obtener perfil del conductor
   */
  async getDriverProfile(driverId: string): Promise<any> {
    const functions = await this.getFunctions();
    const getDriverProfile = httpsCallable(functions, 'getDriverProfile');
    const result = await getDriverProfile({ driverId });
    return result.data;
  }

  /**
   * Actualizar modo conductor designado en Firebase Realtime DB
   */
  async updateDesignatedDriverMode(driverId: string, isActive: boolean): Promise<{ success: boolean }> {
    const functions = await this.getFunctions();
    const updateMode = httpsCallable(functions, 'updateDesignatedDriverMode');
    const result = await updateMode({ driverId, isActive });
    return result.data as { success: boolean };
  }

  /**
   * Actualizar información del conductor (fotos de licencia, etc.)
   */
  async updateDriver(data: {
    license_photo_front?: string;
    license_photo_back?: string;
    license_number?: string;
    license_expiry?: string;
    profile_photo?: string;
  }): Promise<{ success: boolean; driver: any }> {
    const functions = await this.getFunctions();
    const updateDriver = httpsCallable(functions, 'updateDriver');
    const result = await updateDriver(data);
    return result.data as { success: boolean; driver: any };
  }

  /**
   * Actualizar información del vehículo (fotos de documentos, etc.)
   */
  async updateVehicle(vehicleId: string, data: {
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
  }): Promise<{ success: boolean; vehicle: any }> {
    const functions = await this.getFunctions();
    const updateVehicle = httpsCallable(functions, 'updateVehicle');
    const result = await updateVehicle({ vehicleId, ...data });
    return result.data as { success: boolean; vehicle: any };
  }
}

export default new DriversService();
