/**
 * Vehicles Service
 * Servicio para gestionar vehículos del conductor
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

interface VehicleData {
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  type: string;
  is_4x4?: boolean;
  motor?: string;
  chasis?: string;
  vin?: string;
  cylinders?: number;
  passengers?: number;
  fuel_type?: string;
  tonnage?: string;
  vehicle_class?: string;
  service_type?: string;
  lien?: string;
  emission_date?: string;
  registration_number?: string;
  registration_expiry?: string;
  registration_photo?: string;
  registration_photo_front?: string;
  registration_photo_back?: string;
  insurance_number?: string;
  insurance_company?: string;
  insurance_start_date?: string;
  insurance_expiry?: string;
  insurance_photo?: string;
  vehicle_photo?: string;
}

class VehiclesService {
  /**
   * Agregar nuevo vehículo
   */
  async addVehicle(vehicleData: VehicleData) {
    try {
      console.log('🚗 Agregando nuevo vehículo...');
      
      const functions = await getFirebaseFunctions();
      const addVehicleFn = httpsCallable(functions, 'addVehicle');
      
      const result: any = await addVehicleFn(vehicleData);
      
      console.log('✅ Vehículo agregado exitosamente:', result.data);
      
      return result.data;
    } catch (error: any) {
      console.error('❌ Error agregando vehículo:', error);
      throw new Error(error.message || 'Error al agregar vehículo');
    }
  }

  /**
   * Cambiar vehículo activo
   */
  async switchVehicle(vehicleId: string) {
    try {
      console.log('🔄 Cambiando vehículo activo:', vehicleId);
      
      const functions = await getFirebaseFunctions();
      const switchVehicleFn = httpsCallable(functions, 'switchVehicle');
      
      const result: any = await switchVehicleFn({ vehicleId });
      
      console.log('✅ Vehículo cambiado exitosamente:', result.data);
      
      return result.data;
    } catch (error: any) {
      console.error('❌ Error cambiando vehículo:', error);
      throw new Error(error.message || 'Error al cambiar vehículo');
    }
  }

  /**
   * Normalizar datos de vehículo (convertir fechas de objetos a strings)
   */
  private normalizeVehicle(vehicle: any): any {
    const normalized = { ...vehicle };
    
    // Convertir fechas que vienen como objetos vacíos o Firebase Timestamps
    const dateFields = ['registration_expiry', 'insurance_expiry', 'insurance_start_date', 'emission_date'];
    
    dateFields.forEach(field => {
      if (normalized[field]) {
        // Si es un objeto vacío {}, intentar obtener la fecha del backend
        if (typeof normalized[field] === 'object' && Object.keys(normalized[field]).length === 0) {
          console.warn(`⚠️ Campo ${field} es un objeto vacío, será mostrado como N/A`);
          normalized[field] = null;
        }
        // Si es un Firebase Timestamp con _seconds
        else if (typeof normalized[field] === 'object' && normalized[field]._seconds) {
          const date = new Date(normalized[field]._seconds * 1000);
          normalized[field] = date.toISOString().split('T')[0]; // Convertir a YYYY-MM-DD
          console.log(`✅ Convertido ${field} de Firebase Timestamp a:`, normalized[field]);
        }
      }
    });
    
    return normalized;
  }

  /**
   * Obtener todos los vehículos del conductor
   */
  async getDriverVehicles() {
    try {
      console.log('🚗 Obteniendo vehículos del conductor...');
      
      const functions = await getFirebaseFunctions();
      const getVehiclesFn = httpsCallable(functions, 'getDriverVehicles');
      
      const result: any = await getVehiclesFn({});
      
      console.log('✅ Vehículos obtenidos:', result.data.vehicles.length);
      
      // Normalizar cada vehículo
      const normalizedVehicles = result.data.vehicles.map((vehicle: any) => this.normalizeVehicle(vehicle));
      
      console.log('📋 Primer vehículo normalizado:', JSON.stringify(normalizedVehicles[0], null, 2));
      
      return normalizedVehicles;
    } catch (error: any) {
      console.error('❌ Error obteniendo vehículos:', error);
      throw new Error(error.message || 'Error al obtener vehículos');
    }
  }

  /**
   * Actualizar datos de verificación del vehículo
   */
  async updateVehicle(vehicleId: string, data: Partial<VehicleData>) {
    try {
      console.log('🔄 Actualizando vehículo:', vehicleId);
      
      const functions = await getFirebaseFunctions();
      const updateVehicleFn = httpsCallable(functions, 'updateVehicle');
      
      const result: any = await updateVehicleFn({ vehicleId, ...data });
      
      console.log('✅ Vehículo actualizado exitosamente:', result.data);
      
      return result.data;
    } catch (error: any) {
      console.error('❌ Error actualizando vehículo:', error);
      throw new Error(error.message || 'Error al actualizar vehículo');
    }
  }
}

export default new VehiclesService();
