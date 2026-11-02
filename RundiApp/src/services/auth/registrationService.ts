/**
 * Registration Service
 * Servicio para gestionar el flujo completo de registro
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { bootstrapUser, upgradeToDriver } from '../../api/users';
import { registerDriver, registerVehicle } from '../../api/drivers';
import { GoogleAuthProvider, signInWithCredential, deleteUser, signOut, getAuth} from 'firebase/auth';
import { getFirebaseAuth } from '../../config/firebase';
import phoneAuthService from './phoneAuthService';
import accountLinkingService from './accountLinkingService';
import i18n from '../../i18n';

type RegistrationMethod = 'email' | 'phone' | 'google';
type RegistrationAuthProvider = 'email/password' | 'phone' | 'google';

interface RegistrationData {
  name: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: 'client' | 'driver';
  method?: RegistrationMethod;
  authProvider?: RegistrationAuthProvider;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  lastStep?:
    | 'register'
    | 'emailVerification'
    | 'roleSelection'
    | 'googlePhone'
    | 'driverPhone'
    | 'phoneVerification'
    | 'driverData'
    | 'registerConfirm';
  googleIdToken?: string;
  driverData?: {
    licenseNumber: string;
    licenseExpiry: string;
    profilePhoto?: string;
    licensePhotoFront?: string;
    licensePhotoBack?: string;
    department?: string;
    municipality?: string;
  };
  vehicleData?: {
    plate: string;
    brand: string;
    model: string;
    year: number;
    color: string;
    type: 'sedan' | 'suv' | 'van' | 'moto';
    motor?: string;
    chasis?: string;
    vin?: string;
    cylinders?: string;
    passengers?: string;
    fuelType?: string;
    tonnage?: string;
    vehicleClass?: string;
    serviceType?: string;
    lien?: string;
    emissionDate?: string;
    registrationNumber?: string;
    registrationExpiry?: string;
    registrationPhotoFront?: string;
    registrationPhotoBack?: string;
    insuranceNumber?: string;
    insuranceCompany?: string;
    insuranceStartDate?: string;
    insuranceExpiry?: string;
    insurancePhoto?: string;
    inspectionDate?: string;
    inspectionValidUntil?: string;
    emissionsTestedAt?: string;
    emissionsValidUntil?: string;
    roadTaxPaidAt?: string;
    roadTaxReceiptNumber?: string;
    revisadoValidUntil?: string;
  };
}

class RegistrationService {
  private readonly STORAGE_KEY = 'registration_data';
  private readonly TEMP_STORAGE_KEY = 'registration_temp';
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.registrationService.${path}`, options) as string;
  }

  /**
   * Guardar datos temporales de registro
   * Se usa durante el flujo de registro para guardar datos entre pantallas
   */
  async saveTemporaryData(data: Partial<RegistrationData>): Promise<void> {
    try {
      const existingData = await this.getTemporaryData();
      const mergedData = { ...existingData, ...data };
      await SecureStore.setItemAsync(this.TEMP_STORAGE_KEY, JSON.stringify(mergedData));
      console.log('✅ Datos temporales guardados');
    } catch (error) {
      console.error('❌ Error guardando datos temporales:', error);
      throw error;
    }
  }

  /**
   * Obtener datos temporales de registro
   */
  async getTemporaryData(): Promise<Partial<RegistrationData>> {
    try {
      const secureData = await SecureStore.getItemAsync(this.TEMP_STORAGE_KEY);
      if (secureData) {
        return JSON.parse(secureData);
      }
      const legacyData = await AsyncStorage.getItem(this.TEMP_STORAGE_KEY);
      return legacyData ? JSON.parse(legacyData) : {};
    } catch (error) {
      console.error('❌ Error obteniendo datos temporales:', error);
      return {};
    }
  }

  /**
   * Limpiar datos temporales
   */
  async clearTemporaryData(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.TEMP_STORAGE_KEY);
      await AsyncStorage.removeItem(this.TEMP_STORAGE_KEY);
      console.log('✅ Datos temporales limpios');
    } catch (error) {
      console.error('❌ Error limpiando datos temporales:', error);
    }
  }

  /**
   * Elimina las fotos capturadas localmente durante el registro
   * (URIs file:// guardadas en driverData/vehicleData)
   */
  private async deleteLocalRegistrationPhotos(data: Partial<RegistrationData>): Promise<void> {
    const uris = new Set<string>();

    for (const source of [data.driverData, data.vehicleData]) {
      if (!source) {
        continue;
      }
      for (const value of Object.values(source)) {
        if (typeof value === 'string' && value.trim().startsWith('file://')) {
          uris.add(value.trim());
        }
      }
    }

    await Promise.all(
      [...uris].map(async (uri) => {
        try {
          await LegacyFileSystem.deleteAsync(uri, { idempotent: true });
        } catch {}
      }),
    );
  }

  /**
   * Descartar un registro en progreso.
   * Elimina la cuenta creada en Firebase Authentication (SDK web y SDK nativo
   * de verificación SMS) y limpia todo el estado local generado durante el
   * flujo. Best-effort: ningún error individual bloquea la limpieza local.
   */
  async discardPendingRegistration(): Promise<void> {
    let tempData: Partial<RegistrationData> = {};
    try {
      tempData = await this.getTemporaryData();
    } catch (error) {
      console.warn('⚠️ No se pudieron leer los datos temporales del registro:', error);
    }

    const expectedEmail = (tempData.email || '').trim().toLowerCase();
    const expectedPhoneDigits = (tempData.phone || '').replace(/\D/g, '');

    try {
      const auth = await getFirebaseAuth();
      const currentUser = auth.currentUser;
      const matchesPendingUser = Boolean(
        currentUser &&
          ((expectedEmail && (currentUser.email || '').trim().toLowerCase() === expectedEmail) ||
            (expectedPhoneDigits &&
              (currentUser.phoneNumber || '').replace(/\D/g, '') === expectedPhoneDigits)),
      );

      if (currentUser && matchesPendingUser) {
        await deleteUser(currentUser);
        console.log('✅ Usuario de registro eliminado de Firebase Authentication');
      }
    } catch (error) {
      console.warn('⚠️ No se pudo eliminar el usuario de Firebase Auth:', error);
    }

    try {
      await phoneAuthService.deleteCurrentUser(tempData.phone);
    } catch (error) {
      console.warn('⚠️ No se pudo eliminar el usuario nativo de Firebase Auth:', error);
    }

    try {
      const auth = await getFirebaseAuth();
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (error) {
      console.warn('⚠️ No se pudo cerrar sesión de Firebase Auth:', error);
    }

    try {
      await phoneAuthService.signOutCurrentUser();
    } catch (error) {
      console.warn('⚠️ No se pudo cerrar la sesión nativa de Firebase:', error);
    }

    try {
      if (tempData.phone) {
        phoneAuthService.clearConfirmation(tempData.phone);
      }
      accountLinkingService.clearPhoneLinkSession();
    } catch (error) {
      console.warn('⚠️ No se pudieron limpiar las verificaciones en curso:', error);
    }

    try {
      await this.deleteLocalRegistrationPhotos(tempData);
    } catch (error) {
      console.warn('⚠️ No se pudieron eliminar las fotos locales del registro:', error);
    }

    try {
      await this.clearUserData();
      await AsyncStorage.multiRemove(['authToken', 'user', 'userMode']);
    } catch (error) {
      console.warn('⚠️ No se pudo limpiar el almacenamiento local del registro:', error);
    }
  }

  /**
   * Crear usuario final
   * Llama a Cloud Function para registrar usuario
   */
  async createUser(data: RegistrationData): Promise<any> {
    try {
      console.log('📝 Creando usuario...');

      // Validar datos requeridos (email es opcional)
      if (!data.name || !data.role) {
        throw new Error(this.tr('errors.requiredNameRole'));
      }

      if (!data.method || !data.authProvider) {
        throw new Error(this.tr('errors.invalidMethod'));
      }

      if (data.authProvider === 'email/password') {
        if (!data.email || !data.password) {
          throw new Error(this.tr('errors.emailPasswordRequired'));
        }
      }

      if (data.authProvider === 'phone') {
        if (!data.phone || !data.phoneVerified) {
          throw new Error(this.tr('errors.phoneVerificationRequired'));
        }
      }

      // Para conductores, validar datos adicionales
      if (data.role === 'driver') {
        if (!data.driverData || !data.vehicleData) {
          throw new Error(this.tr('errors.driverDataRequired'));
        }
      }

      let firebaseUser: import('firebase/auth').User | null = null;

      if (data.authProvider === 'google') {
        if (!data.googleIdToken) {
          throw new Error(this.tr('errors.googleTokenMissing'));
        }

        try {
          const auth = await getFirebaseAuth();
          const credential = GoogleAuthProvider.credential(data.googleIdToken);
          const userCredential = await signInWithCredential(auth, credential);
          firebaseUser = userCredential.user;
          console.log('✅ Usuario autenticado con Google en Firebase:', firebaseUser.uid);
        } catch (googleError: any) {
          console.error('❌ Error autenticando con Google en Firebase:', googleError);
          throw new Error(googleError?.message || this.tr('errors.googleAuthFailed'));
        }
      }

      const registrationPayload = {
        email: data.email || firebaseUser?.email || undefined,
        password: data.password || undefined,
        name: data.name,
        phone: data.phone || firebaseUser?.phoneNumber || undefined,
        role: data.role,
        authProvider: data.authProvider || 'email/password',
        method: data.method || data.authProvider || 'email',
        phoneVerified: data.phoneVerified || false,
        emailVerified: data.emailVerified || false,
        driverData: data.driverData || undefined,
        vehicleData: data.vehicleData || undefined,
        googleIdToken: data.googleIdToken || undefined,
      };

      await bootstrapUser({
        name: registrationPayload.name,
        email: registrationPayload.email,
        phone: registrationPayload.phone,
        authProvider: registrationPayload.authProvider,
      });
      if (registrationPayload.role === 'driver' && registrationPayload.driverData) {
        await upgradeToDriver();
        await registerDriver(registrationPayload.driverData);
        await getAuth().currentUser?.getIdToken(true); // propagar claim role=driver
        if (registrationPayload.vehicleData) {
          await registerVehicle(registrationPayload.vehicleData as any);
        }
      }

      const user = {
        userId: firebaseUser?.uid,
        email: registrationPayload.email,
        name: registrationPayload.name,
        role: registrationPayload.role,
      };

      console.log('✅ Usuario creado (v2):', user);

      await AsyncStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({
          userId: user.userId,
          email: user.email,
          name: user.name,
          role: user.role,
        })
      );

      await this.clearTemporaryData();

      return { success: true, user };
    } catch (error: any) {
      console.error('❌ Error creando usuario:', error);
      const apiMessage = error?.response?.data?.error;
      const message = apiMessage || error?.message || this.tr('errors.createUserFailed');
      throw new Error(message);
    }
  }

  /**
   * Completar registro de conductor
   * Se llama después de que el conductor ingresa sus datos
   */
  async completeDriverRegistration(
    userId: string,
    driverData: any,
    vehicleData: any
  ): Promise<any> {
    try {
      console.log('📝 Completando registro de conductor...');

      await upgradeToDriver();
      await registerDriver(driverData);
      await getAuth().currentUser?.getIdToken(true); // propagar claim role=driver
      if (vehicleData) {
        await registerVehicle(vehicleData);
      }
      const result: any = { success: true, userId };
      console.log('✅ Registro de conductor completado (v2):', result);
      return result;
    } catch (error: any) {
      console.error('❌ Error completando registro de conductor:', error);

      throw new Error(error.message || this.tr('errors.completeDriverFailed'));
    }
  }

  /**
   * Actualizar una cuenta existente de cliente a conductor (upgrade)
   * Usa la Cloud Function upgradeClientToDriver
   */
  async upgradeClientToDriver(driverData: any, vehicleData: any): Promise<any> {
    try {
      console.log('📝 Iniciando upgrade de cliente a conductor...');

      if (!driverData || !vehicleData) {
        throw new Error(this.tr('errors.driverDataRequired'));
      }

      await upgradeToDriver();
      await registerDriver(driverData);
      await getAuth().currentUser?.getIdToken(true); // propagar claim role=driver
      if (vehicleData) {
        await registerVehicle(vehicleData);
      }
      const data = { success: true };
      console.log('✅ Upgrade cliente→conductor completado:', data);

      return data;
    } catch (error: any) {
      console.error('❌ Error en upgrade cliente→conductor:', error);

      const code = error?.code || '';
      const message = error?.message || '';

      if (
        typeof message === 'string' &&
        message === 'PHONE_VERIFICATION_REQUIRED'
      ) {
        throw new Error(this.tr('errors.upgradePhoneVerification'));
      }

      if (typeof message === 'string' && message.length > 0) {
        throw new Error(message);
      }

      if (typeof code === 'string' && code.includes('failed-precondition')) {
        throw new Error(this.tr('errors.upgradePreconditionFailed'));
      }

      throw new Error(this.tr('errors.upgradeFailed'));
    }
  }

  /**
   * Obtener datos de usuario guardados
   */
  async getUserData(): Promise<any> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Error obteniendo datos de usuario:', error);
      return null;
    }
  }

  /**
   * Limpiar datos de usuario
   */
  async clearUserData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
      await this.clearTemporaryData();
      console.log('✅ Datos de usuario limpios');
    } catch (error) {
      console.error('❌ Error limpiando datos de usuario:', error);
    }
  }

  /**
   * Validar datos de registro
   */
  validateRegistrationData(data: RegistrationData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validar email (opcional, pero si se proporciona debe ser válido)
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push(this.tr('validation.emailInvalid'));
    }

    // Validar nombre
    if (!data.name || data.name.trim().length < 2) {
      errors.push(this.tr('validation.nameTooShort'));
    }

    // Validar teléfono
    if (data.authProvider === 'phone' || data.method === 'phone') {
      if (!data.phone || !/^\+505\d{8}$/.test(data.phone.replace(/\s/g, ''))) {
        errors.push(this.tr('validation.phoneFormat'));
      }
    }

    // Validar rol
    if (!data.role || !['client', 'driver'].includes(data.role)) {
      errors.push(this.tr('validation.roleInvalid'));
    }

    // Validar contraseña (si es email/password)
    if (data.authProvider === 'email/password' && (!data.password || data.password.length < 6)) {
      errors.push(this.tr('validation.passwordLength'));
    }

    // Validar datos de conductor
    if (data.role === 'driver') {
      if (!data.driverData?.licenseNumber || data.driverData.licenseNumber.length < 5) {
        errors.push(this.tr('validation.licenseInvalid'));
      }

      if (!data.vehicleData?.plate || data.vehicleData.plate.length < 4) {
        errors.push(this.tr('validation.plateInvalid'));
      }

      if (!data.vehicleData?.brand || data.vehicleData.brand.length < 2) {
        errors.push(this.tr('validation.brandRequired'));
      }

      if (!data.vehicleData?.model || data.vehicleData.model.length < 2) {
        errors.push(this.tr('validation.modelRequired'));
      }

      if (!data.vehicleData?.year || isNaN(data.vehicleData.year)) {
        errors.push(this.tr('validation.yearInvalid'));
      }

      if (!data.vehicleData?.color || data.vehicleData.color.length < 2) {
        errors.push(this.tr('validation.colorRequired'));
      }

      if (!data.vehicleData?.type || !['sedan', 'suv', 'van', 'moto'].includes(data.vehicleData.type)) {
        errors.push(this.tr('validation.typeInvalid'));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default new RegistrationService();
