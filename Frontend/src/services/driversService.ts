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
   * Actualizar estado del conductor con reintentos
   */
  async updateStatus(
    status: 'offline' | 'available' | 'busy',
    location?: Location,
    retries: number = 3
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

    // Reintentos con backoff exponencial
    let lastError: any;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await updateDriverStatus(data);
        return result.data as { success: boolean; status: string };
      } catch (error: any) {
        lastError = error;
        console.warn(`⚠️ Intento ${attempt}/${retries} fallido en updateStatus:`, error.code || error.message);
        
        // Si es el último intento, lanzar el error
        if (attempt === retries) {
          console.error('❌ Error final en updateStatus después de', retries, 'intentos:', error);
          throw error;
        }
        
        // Esperar antes de reintentar (backoff exponencial)
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
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

  /**
   * Obtener mi perfil del conductor (usuario autenticado, con fallback a Realtime DB)
   */
  async getMyDriverProfile(): Promise<any> {
    try {
      const functions = await this.getFunctions();
      const getDriverProfileFn = httpsCallable(functions, 'getDriverProfileWithFallback');
      
      console.log(`👤 [driversService] Obteniendo mi perfil del conductor`);
      
      const response = await getDriverProfileFn({});
      const result = response.data as { success: boolean; driver: any };
      
      if (result.success) {
        console.log(`✅ Perfil del conductor obtenido`);
        return result.driver;
      } else {
        throw new Error('No se pudo obtener el perfil');
      }
    } catch (error: any) {
      console.error('❌ Error obteniendo perfil del conductor:', error.message);
      throw new Error(error.message || 'Error al obtener perfil del conductor');
    }
  }

  /**
   * Actualizar mi perfil del conductor (usuario autenticado, con sincronización a Realtime DB)
   */
  async updateMyDriverProfile(data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    licenseNumber?: string;
    licenseExpiry?: string;
    vehicleType?: string;
    vehiclePlate?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const functions = await this.getFunctions();
      const updateDriverProfileFn = httpsCallable(functions, 'updateDriverProfileWithSync');
      
      console.log(`👤 [driversService] Actualizando mi perfil del conductor`);
      
      const response = await updateDriverProfileFn(data);
      const result = response.data as { success: boolean; message: string };
      
      if (result.success) {
        console.log(`✅ Perfil del conductor actualizado`);
        return result;
      } else {
        throw new Error('No se pudo actualizar el perfil');
      }
    } catch (error: any) {
      console.error('❌ Error actualizando perfil del conductor:', error.message);
      throw new Error(error.message || 'Error al actualizar perfil del conductor');
    }
  }
}

export default new DriversService();
