/**
 * Vehicles Service
 * Servicio para gestionar vehículos del conductor
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';
import { getAuth } from 'firebase/auth';
import i18n from '../i18n';

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
  registration_photo?: string | null;
  registration_photo_front?: string | null;
  registration_photo_back?: string | null;
  insurance_number?: string;
  insurance_company?: string;
  insurance_start_date?: string;
  insurance_expiry?: string;
  insurance_photo?: string | null;
  vehicle_photo?: string | null;
}

class VehiclesService {
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.vehiclesService.${path}`, options) as string;
  }
  /**
   * Agregar nuevo vehículo
   * Flujo: Crear vehículo sin fotos → Obtener vehicleId → Subir fotos → Actualizar vehículo
   */
  async addVehicle(vehicleData: VehicleData) {
    try {
      console.log('🚗 Agregando nuevo vehículo...');
      console.log('📋 Datos del vehículo:', vehicleData);
      
      // Paso 1: Crear vehículo SIN fotos primero
      console.log('📝 Paso 1: Creando vehículo sin fotos...');
      const vehicleDataWithoutPhotos = { ...vehicleData };
      vehicleDataWithoutPhotos.registration_photo_front = null;
      vehicleDataWithoutPhotos.registration_photo_back = null;
      vehicleDataWithoutPhotos.insurance_photo = null;
      vehicleDataWithoutPhotos.vehicle_photo = null;
      
      const functions = await getFirebaseFunctions();
      const createVehicleFn = httpsCallable(functions, 'createVehicleCompleteSeq');
      const createResult: any = await createVehicleFn(vehicleDataWithoutPhotos);
      
      const vehicleId = createResult.data.vehicle.id;
      console.log(`✅ Vehículo creado con ID: ${vehicleId}`);
      
      // Paso 2: Subir fotos con el vehicleId
      console.log('📝 Paso 2: Subiendo fotos...');
      const processedData = { ...vehicleData };
      
      if (vehicleData.registration_photo_front && vehicleData.registration_photo_front.startsWith('file://')) {
        console.log('📸 Subiendo foto frontal del registro...');
        try {
          const url = await this.uploadPhoto(vehicleData.registration_photo_front, 'registrations', vehicleId, 'front');
          processedData.registration_photo_front = url;
          console.log('✅ Foto frontal subida:', url);
        } catch (err) {
          console.warn('⚠️ Error subiendo foto frontal:', err);
        }
      }
      
      if (vehicleData.registration_photo_back && vehicleData.registration_photo_back.startsWith('file://')) {
        console.log('📸 Subiendo foto trasera del registro...');
        try {
          const url = await this.uploadPhoto(vehicleData.registration_photo_back, 'registrations', vehicleId, 'back');
          processedData.registration_photo_back = url;
          console.log('✅ Foto trasera subida:', url);
        } catch (err) {
          console.warn('⚠️ Error subiendo foto trasera:', err);
        }
      }
      
      if (vehicleData.insurance_photo && vehicleData.insurance_photo.startsWith('file://')) {
        console.log('📸 Subiendo póliza de seguro...');
        try {
          const url = await this.uploadPhoto(vehicleData.insurance_photo, 'insurance', vehicleId, 'policy');
          processedData.insurance_photo = url;
          console.log('✅ Póliza subida:', url);
        } catch (err) {
          console.warn('⚠️ Error subiendo póliza:', err);
        }
      }
      
      if (vehicleData.vehicle_photo && vehicleData.vehicle_photo.startsWith('file://')) {
        console.log('📸 Subiendo foto del vehículo...');
        try {
          const url = await this.uploadPhoto(vehicleData.vehicle_photo, 'vehicles', vehicleId, 'vehicle');
          processedData.vehicle_photo = url;
          console.log('✅ Foto del vehículo subida:', url);
        } catch (err) {
          console.warn('⚠️ Error subiendo foto del vehículo:', err);
        }
      }
      
      // Paso 3: Actualizar vehículo con las fotos
      console.log('📝 Paso 3: Actualizando vehículo con fotos...');
      const updateVehicleFn = httpsCallable(functions, 'updateVehicleSeq');
      const updateResult: any = await updateVehicleFn({
        vehicleId,
        registration_photo_front: processedData.registration_photo_front,
        registration_photo_back: processedData.registration_photo_back,
        insurance_photo: processedData.insurance_photo,
        vehicle_photo: processedData.vehicle_photo,
      });
      
      console.log('✅ Vehículo actualizado con fotos:', updateResult.data);
      
      return updateResult.data;
    } catch (error: any) {
      console.error('❌ Error agregando vehículo:', error);
      console.error('Error details:', error.message);
      throw new Error(error.message || this.tr('errors.addVehicleFailed'));
    }
  }

  /**
   * Subir foto a Supabase Storage
   * Estructura: folder/userId/vehicleId/type_timestamp.jpg
   */
  private async uploadPhoto(fileUri: string, folder: string, vehicleId: string, type: string = 'photo'): Promise<string> {
    try {
      // Importar supabaseStorage
      const supabaseStorage = (await import('./supabaseStorage')).default;
      
      // Obtener userId del usuario autenticado
      const auth = getAuth();
      const userId = auth.currentUser?.uid;
      
      if (!userId) {
        throw new Error(this.tr('errors.notAuthenticated'));
      }
      
      // Crear nombre único con tipo
      const timestamp = Date.now();
      const fileName = `${type}_${timestamp}.jpg`;
      // Ruta: folder/userId/vehicleId/type_timestamp.jpg
      const path = `${folder}/${userId}/${vehicleId}/${fileName}`;
      
      console.log(`📤 Subiendo foto a: drivers-documents/${path}`);
      
      // Subir usando el método uploadImage del servicio
      const url = await supabaseStorage.uploadImage(fileUri, 'drivers-documents', path);
      
      console.log(`✅ Foto subida a: ${url}`);
      return url;
    } catch (error: any) {
      console.error('❌ Error en uploadPhoto:', error);
      throw error;
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
      throw new Error(error.message || this.tr('errors.switchVehicleFailed'));
    }
  }

  /**
   * Normalizar datos de vehículo (convertir fechas de objetos a strings y mapear campos)
   * Maneja tanto snake_case como camelCase
   */
  private normalizeVehicle(vehicle: any): any {
    const normalized: any = {};
    
    // Copiar todos los campos del vehículo original
    Object.assign(normalized, vehicle);
    
    // Mapear campos snake_case a camelCase (si no existen en camelCase)
    const fieldMappings: { [key: string]: string } = {
      // Campos básicos
      'driver_id': 'driverId',
      'is_active': 'isActive',
      // Campos de registro
      'registration_number': 'registrationNumber',
      'registration_expiry': 'registrationExpiry',
      'registration_photo_front': 'registrationPhotoFront',
      'registration_photo_back': 'registrationPhotoBack',
      // Campos de seguro
      'insurance_number': 'insuranceNumber',
      'insurance_company': 'insuranceCompany',
      'insurance_expiry': 'insuranceExpiry',
      'insurance_photo': 'insurancePhoto',
      // Fotos
      'vehicle_photo': 'vehiclePhoto',
    };
    
    // Mapear campos snake_case a camelCase si no existen en camelCase
    Object.entries(fieldMappings).forEach(([snakeKey, camelKey]) => {
      // Si el campo en camelCase no existe pero existe en snake_case, copiar
      if ((normalized[camelKey] === undefined || normalized[camelKey] === null) && 
          vehicle[snakeKey] !== undefined && vehicle[snakeKey] !== null) {
        normalized[camelKey] = vehicle[snakeKey];
      }
    });
    
    // Convertir fechas que vienen como objetos vacíos o Firebase Timestamps
    const dateFields = ['registrationExpiry', 'insuranceExpiry'];
    
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
    
    console.log(`📋 [normalizeVehicle] Vehículo normalizado:`, {
      id: normalized.id,
      plate: normalized.plate,
      registrationNumber: normalized.registrationNumber,
      registrationExpiry: normalized.registrationExpiry,
      insuranceNumber: normalized.insuranceNumber,
      insuranceCompany: normalized.insuranceCompany,
      insuranceExpiry: normalized.insuranceExpiry,
      vehiclePhoto: normalized.vehiclePhoto ? '✅' : '❌',
      registrationPhotoFront: normalized.registrationPhotoFront ? '✅' : '❌',
      registrationPhotoBack: normalized.registrationPhotoBack ? '✅' : '❌',
      insurancePhoto: normalized.insurancePhoto ? '✅' : '❌',
    });
    
    return normalized;
  }

  /**
   * Obtener todos los vehículos del conductor
   */
  async getDriverVehicles() {
    try {
      console.log('🚗 Obteniendo vehículos del conductor...');
      
      // Estrategia 1: Intentar obtener del perfil del conductor (que incluye vehículos)
      try {
        const driversService = (await import('./driversService')).default;
        const profile = await driversService.getMyDriverProfile();
        
        if (profile && profile.vehicles && Array.isArray(profile.vehicles)) {
          console.log(`✅ ${profile.vehicles.length} vehículos obtenidos del perfil`);
          const normalizedVehicles = profile.vehicles.map((vehicle: any) => this.normalizeVehicle(vehicle));
          console.log('📋 Primer vehículo normalizado:', JSON.stringify(normalizedVehicles[0], null, 2));
          return normalizedVehicles;
        }
      } catch (profileError: any) {
        console.warn('⚠️ No se pudieron obtener vehículos del perfil:', profileError.message);
      }

      // Estrategia 2: Intentar Cloud Function (fallback)
      console.log('📡 Intentando obtener vehículos de Cloud Function...');
      const functions = await getFirebaseFunctions();
      const auth = getAuth();
      if (!auth.currentUser?.uid) {
        throw new Error(this.tr('errors.notAuthenticated'));
      }

      const getVehiclesFn = httpsCallable(functions, 'getDriverVehiclesSeq');
      const result: any = await getVehiclesFn({});

      const vehiclesFromFn = result?.data?.vehicles || [];
      console.log('✅ Vehículos obtenidos:', vehiclesFromFn.length);

      // Normalizar cada vehículo
      const normalizedVehicles = vehiclesFromFn.map((vehicle: any) => this.normalizeVehicle(vehicle));

      if (normalizedVehicles.length > 0) {
        console.log('📋 Primer vehículo normalizado:', JSON.stringify(normalizedVehicles[0], null, 2));
      }

      return normalizedVehicles;
    } catch (error: any) {
      console.error('❌ Error obteniendo vehículos:', error);
      // Retornar array vacío en lugar de lanzar error
      return [];
    }
  }

  /**
   * Actualizar datos de verificación del vehículo
   */
  async updateVehicle(vehicleId: string, data: Partial<VehicleData>) {
    try {
      if (!vehicleId) {
        throw new Error(this.tr('errors.vehicleIdRequired'));
      }

      console.log('🔄 Actualizando vehículo:', vehicleId);

      const functions = await getFirebaseFunctions();
      const updateVehicleFn = httpsCallable(functions, 'updateVehicleSeq');

      const result: any = await updateVehicleFn({ vehicleId, ...data });

      console.log('✅ Vehículo actualizado exitosamente:', result.data);

      return result.data;
    } catch (error: any) {
      console.error('❌ Error actualizando vehículo:', error);
      throw new Error(error.message || this.tr('errors.updateVehicleFailed'));
    }
  }
}

export default new VehiclesService();
