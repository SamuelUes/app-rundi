/**
 * Drivers Service - Gestión de conductores
 */

import { auth } from '../config/firebase';
import { getFunctions, httpsCallable} from 'firebase/functions';

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
  private functions = getFunctions();

  /**
   * Actualizar estado del conductor
   */
  async updateStatus(
    status: 'offline' | 'available' | 'busy',
    location?: Location
  ): Promise<{ success: boolean; status: string }> {
    // Verificar que el usuario esté autenticado
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Usuario no autenticado. Por favor inicia sesión.');
    }

    const updateDriverStatus = httpsCallable(this.functions, 'updateDriverStatus');
    
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
    radius: number = 10
  ): Promise<AvailableDriversResponse> {
    const getAvailableDrivers = httpsCallable(this.functions, 'getAvailableDrivers');
    
    const result = await getAvailableDrivers({
      latitude: location.latitude,
      longitude: location.longitude,
      radius,
    });

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
    const updateDriverLocation = httpsCallable(this.functions, 'updateDriverLocation');
    
    const result = await updateDriverLocation({
      latitude,
      longitude,
      heading,
      speed,
      accuracy,
    });

    return result.data as { success: boolean };
  }
}

export default new DriversService();
