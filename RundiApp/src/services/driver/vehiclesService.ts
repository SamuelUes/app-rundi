/**
 * Vehicles Service — v2 REST /v1/drivers/me/vehicles.
 * Docs de circulación/seguro van por /v1/compliance/vehicle-documents;
 * la tabla vehicles solo guarda vehiclePhoto.
 */

import { getAuth } from 'firebase/auth';
import {
  getMyVehicles,
  registerVehicle,
  switchVehicle as switchVehicleV2,
  updateVehicle as updateVehicleV2,
} from '../../api/drivers';
import { submitVehicleDocument } from '../../api/compliance';
import i18n from '../../i18n';

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
   * Agregar nuevo vehículo.
   * Flujo v2: crear vehículo → subir fotos a Firebase Storage → patch
   * vehiclePhoto + docs de compliance (circulación/seguro) best-effort.
   */
  async addVehicle(vehicleData: VehicleData) {
    try {
      console.log('🚗 Agregando nuevo vehículo (v2)...');

      const vehicleId = await registerVehicle({
        plate: vehicleData.plate,
        brand: vehicleData.brand,
        model: vehicleData.model,
        year: vehicleData.year,
        color: vehicleData.color,
        type: (vehicleData.type as any) ?? 'auto',
        fuelType: vehicleData.fuel_type,
        passengers: vehicleData.passengers,
        is4x4: vehicleData.is_4x4,
        registrationNumber: vehicleData.registration_number,
        registrationExpiry: vehicleData.registration_expiry,
        insuranceNumber: vehicleData.insurance_number,
        insuranceCompany: vehicleData.insurance_company,
        insuranceExpiry: vehicleData.insurance_expiry,
      });
      console.log(`✅ Vehículo creado con ID: ${vehicleId}`);

      const [regFront, regBack, insurancePhoto, vehiclePhoto] = await Promise.all([
        vehicleData.registration_photo_front?.startsWith('file://')
          ? this.uploadPhoto(vehicleData.registration_photo_front, 'registrations', vehicleId, 'front').catch(() => null)
          : Promise.resolve(vehicleData.registration_photo_front ?? null),
        vehicleData.registration_photo_back?.startsWith('file://')
          ? this.uploadPhoto(vehicleData.registration_photo_back, 'registrations', vehicleId, 'back').catch(() => null)
          : Promise.resolve(vehicleData.registration_photo_back ?? null),
        vehicleData.insurance_photo?.startsWith('file://')
          ? this.uploadPhoto(vehicleData.insurance_photo, 'insurance', vehicleId, 'policy').catch(() => null)
          : Promise.resolve(vehicleData.insurance_photo ?? null),
        vehicleData.vehicle_photo?.startsWith('file://')
          ? this.uploadPhoto(vehicleData.vehicle_photo, 'vehicles', vehicleId, 'vehicle').catch(() => null)
          : Promise.resolve(vehicleData.vehicle_photo ?? null),
      ]);

      if (vehiclePhoto) {
        await updateVehicleV2(vehicleId, { vehiclePhoto }).catch((err) =>
          console.warn('⚠️ No se pudo guardar vehiclePhoto:', err),
        );
      }

      if (regFront) {
        await submitVehicleDocument({
          vehicleId,
          documentType: 'circulation_card',
          documentPath: regFront,
          documentPathBack: regBack ?? undefined,
          cardNumber: vehicleData.registration_number,
          declaredValidUntil: vehicleData.registration_expiry,
        }).catch((err) => console.warn('⚠️ circulation_card doc:', err));
      }
      if (insurancePhoto) {
        await submitVehicleDocument({
          vehicleId,
          documentType: 'insurance',
          documentPath: insurancePhoto,
          policyNumber: vehicleData.insurance_number,
          insurerName: vehicleData.insurance_company,
          effectiveFrom: vehicleData.insurance_start_date,
          effectiveUntil: vehicleData.insurance_expiry,
        }).catch((err) => console.warn('⚠️ insurance doc:', err));
      }

      return { success: true, vehicle: { id: vehicleId, vehiclePhoto } };
    } catch (error: any) {
      console.error('❌ Error agregando vehículo:', error);
      throw new Error(error.message || this.tr('errors.addVehicleFailed'));
    }
  }

  /**
   * Subir foto a Firebase Storage (objectPath — el backend resuelve URL).
   * Estructura: folder/userId/vehicleId/type_timestamp.jpg
   */
  private async uploadPhoto(fileUri: string, folder: string, vehicleId: string, type: string = 'photo'): Promise<string> {
    const storageService = (await import('../media/storageService')).default;
    const auth = getAuth();
    const userId = auth.currentUser?.uid;

    if (!userId) {
      throw new Error(this.tr('errors.notAuthenticated'));
    }

    const timestamp = Date.now();
    const fileName = `${type}_${timestamp}.jpg`;
    const path = `vehicle-documents/${folder}/${userId}/${vehicleId}/${fileName}`;

    console.log(`📤 Subiendo foto a: drivers/${path}`);
    const objectPath = await storageService.uploadImage(fileUri, 'drivers', path);
    console.log(`✅ Foto subida a: ${objectPath}`);
    return objectPath;
  }

  /**
   * Cambiar vehículo activo
   */
  async switchVehicle(vehicleId: string) {
    try {
      console.log('🔄 Cambiando vehículo activo:', vehicleId);
      await switchVehicleV2(vehicleId);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error cambiando vehículo:', error);
      throw new Error(error.message || this.tr('errors.switchVehicleFailed'));
    }
  }

  /**
   * Normalizar datos de vehículo (snake_case → camelCase, timestamps → ISO).
   */
  private normalizeVehicle(vehicle: any): any {
    const normalized: any = {};
    Object.assign(normalized, vehicle);

    const fieldMappings: { [key: string]: string } = {
      'driver_id': 'driverId',
      'driverUid': 'driverId',
      'is_active': 'isActive',
      'is4x4': 'is4x4',
      'registration_number': 'registrationNumber',
      'registration_expiry': 'registrationExpiry',
      'registration_photo_front': 'registrationPhotoFront',
      'registration_photo_back': 'registrationPhotoBack',
      'insurance_number': 'insuranceNumber',
      'insurance_company': 'insuranceCompany',
      'insurance_expiry': 'insuranceExpiry',
      'insurance_photo': 'insurancePhoto',
      'vehicle_photo': 'vehiclePhoto',
    };

    Object.entries(fieldMappings).forEach(([snakeKey, camelKey]) => {
      if ((normalized[camelKey] === undefined || normalized[camelKey] === null) &&
          vehicle[snakeKey] !== undefined && vehicle[snakeKey] !== null) {
        normalized[camelKey] = vehicle[snakeKey];
      }
    });

    const dateFields = ['registrationExpiry', 'insuranceExpiry'];
    dateFields.forEach(field => {
      if (normalized[field]) {
        if (typeof normalized[field] === 'object' && Object.keys(normalized[field]).length === 0) {
          normalized[field] = null;
        } else if (typeof normalized[field] === 'object' && normalized[field]._seconds) {
          normalized[field] = new Date(normalized[field]._seconds * 1000).toISOString().split('T')[0];
        } else if (typeof normalized[field]?.toDate === 'function') {
          normalized[field] = normalized[field].toDate().toISOString().split('T')[0];
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
      const vehicles = await getMyVehicles();
      console.log(`✅ ${vehicles.length} vehículos obtenidos (v2)`);
      return vehicles.map((vehicle: any) => this.normalizeVehicle(vehicle));
    } catch (error: any) {
      console.error('❌ Error obteniendo vehículos:', error);
      return [];
    }
  }

  /**
   * Actualizar datos del vehículo.
   * Fotos de documentos (insurance/registration) NO son campos del PATCH —
   * en v2 van por /compliance/vehicle-documents (circulation_card/insurance).
   */
  async updateVehicle(vehicleId: string, data: Partial<VehicleData>) {
    try {
      if (!vehicleId) {
        throw new Error(this.tr('errors.vehicleIdRequired'));
      }
      console.log('🔄 Actualizando vehículo:', vehicleId);
      const { insurancePhoto, registrationPhotoFront, registrationPhotoBack, ...fields } =
        data as any;
      if (Object.keys(fields).length) {
        await updateVehicleV2(vehicleId, fields);
      }
      if (insurancePhoto) {
        await submitVehicleDocument({
          vehicleId,
          documentType: 'insurance',
          documentPath: insurancePhoto,
        });
      }
      if (registrationPhotoFront || registrationPhotoBack) {
        await submitVehicleDocument({
          vehicleId,
          documentType: 'circulation_card',
          documentPath: registrationPhotoFront,
          documentPathBack: registrationPhotoBack,
        });
      }
      return { success: true, vehicle: { id: vehicleId, ...data } };
    } catch (error: any) {
      console.error('❌ Error actualizando vehículo:', error);
      throw new Error(error.message || this.tr('errors.updateVehicleFailed'));
    }
  }
}

export default new VehiclesService();
