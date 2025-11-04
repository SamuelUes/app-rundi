/**
 * Registration Service
 * Servicio para gestionar el flujo completo de registro
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { httpsCallable } from 'firebase/functions';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { getFirebaseAuth, getFirebaseFunctions } from '../config/firebase';

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
  googleIdToken?: string;
  driverData?: {
    licenseNumber: string;
    licenseExpiry: string;
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
    registrationPhotoFront?: string;
    registrationPhotoBack?: string;
    insuranceNumber?: string;
    insuranceCompany?: string;
    insuranceStartDate?: string;
    insuranceExpiry?: string;
    insurancePhoto?: string;
  };
}

class RegistrationService {
  private readonly STORAGE_KEY = 'registration_data';
  private readonly TEMP_STORAGE_KEY = 'registration_temp';

  /**
   * Guardar datos temporales de registro
   * Se usa durante el flujo de registro para guardar datos entre pantallas
   */
  async saveTemporaryData(data: Partial<RegistrationData>): Promise<void> {
    try {
      const existingData = await this.getTemporaryData();
      const mergedData = { ...existingData, ...data };
      
      await AsyncStorage.setItem(
        this.TEMP_STORAGE_KEY,
        JSON.stringify(mergedData)
      );
      
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
      const data = await AsyncStorage.getItem(this.TEMP_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
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
      await AsyncStorage.removeItem(this.TEMP_STORAGE_KEY);
      console.log('✅ Datos temporales limpios');
    } catch (error) {
      console.error('❌ Error limpiando datos temporales:', error);
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
        throw new Error('Datos requeridos faltantes: nombre y rol');
      }

      if (!data.method || !data.authProvider) {
        throw new Error('Método de registro inválido');
      }

      if (data.authProvider === 'email/password') {
        if (!data.email || !data.password) {
          throw new Error('Correo y contraseña requeridos para este método');
        }
      }

      if (data.authProvider === 'phone') {
        if (!data.phone || !data.phoneVerified) {
          throw new Error('Teléfono verificado requerido para registro por SMS');
        }
      }

      // Para conductores, validar datos adicionales
      if (data.role === 'driver') {
        if (!data.driverData || !data.vehicleData) {
          throw new Error('Datos de conductor y vehículo requeridos');
        }
      }

      let firebaseUser: import('firebase/auth').User | null = null;

      if (data.authProvider === 'google') {
        if (!data.googleIdToken) {
          throw new Error('Token de Google no disponible para completar el registro');
        }

        try {
          const auth = await getFirebaseAuth();
          const credential = GoogleAuthProvider.credential(data.googleIdToken);
          const userCredential = await signInWithCredential(auth, credential);
          firebaseUser = userCredential.user;
          console.log('✅ Usuario autenticado con Google en Firebase:', firebaseUser.uid);
        } catch (googleError: any) {
          console.error('❌ Error autenticando con Google en Firebase:', googleError);
          throw new Error(googleError?.message || 'No se pudo autenticar con Google');
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
        driverData: data.driverData || undefined,
        vehicleData: data.vehicleData || undefined,
        googleIdToken: data.googleIdToken || undefined,
      };

      const { data: result } = await client.post(ENDPOINTS.auth.register, registrationPayload);

      const user = result?.user;
      if (!result?.success || !user) {
        throw new Error(result?.error || 'Respuesta inválida del servidor');
      }

      console.log('✅ Usuario creado:', user);

      await AsyncStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({
          userId: user.userId,
          email: user.email,
          name: user.name,
          role: user.role,
        })
      );

      if (result.token) {
        await AsyncStorage.setItem('authToken', result.token);
      }

      await this.clearTemporaryData();

      return result;
    } catch (error: any) {
      console.error('❌ Error creando usuario:', error);
      const apiMessage = error?.response?.data?.error;
      const message = apiMessage || error?.message || 'Error al crear usuario';
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

      const functions = await getFirebaseFunctions();
      const completeDriverFn = httpsCallable(
        functions,
        'completeDriverRegistration'
      );

      const result: any = await completeDriverFn({
        userId,
        driverData,
        vehicleData,
      });

      console.log('✅ Registro de conductor completado:', result.data);

      return result.data;
    } catch (error: any) {
      console.error('❌ Error completando registro de conductor:', error);

      throw new Error(
        error.message || 'Error al completar registro de conductor'
      );
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
      errors.push('Email inválido');
    }

    // Validar nombre
    if (!data.name || data.name.trim().length < 2) {
      errors.push('Nombre debe tener al menos 2 caracteres');
    }

    // Validar teléfono
    if (data.authProvider === 'phone' || data.method === 'phone') {
      if (!data.phone || !/^\+505\d{8}$/.test(data.phone.replace(/\s/g, ''))) {
        errors.push('Teléfono debe estar en formato +505 XXXX XXXX');
      }
    }

    // Validar rol
    if (!data.role || !['client', 'driver'].includes(data.role)) {
      errors.push('Rol inválido');
    }

    // Validar contraseña (si es email/password)
    if (data.authProvider === 'email/password' && (!data.password || data.password.length < 6)) {
      errors.push('Contraseña debe tener al menos 6 caracteres');
    }

    // Validar datos de conductor
    if (data.role === 'driver') {
      if (!data.driverData?.licenseNumber || data.driverData.licenseNumber.length < 5) {
        errors.push('Número de licencia inválido');
      }

      if (!data.vehicleData?.plate || data.vehicleData.plate.length < 4) {
        errors.push('Placa del vehículo inválida');
      }

      if (!data.vehicleData?.brand || data.vehicleData.brand.length < 2) {
        errors.push('Marca del vehículo requerida');
      }

      if (!data.vehicleData?.model || data.vehicleData.model.length < 2) {
        errors.push('Modelo del vehículo requerido');
      }

      if (!data.vehicleData?.year || isNaN(data.vehicleData.year)) {
        errors.push('Año del vehículo inválido');
      }

      if (!data.vehicleData?.color || data.vehicleData.color.length < 2) {
        errors.push('Color del vehículo requerido');
      }

      if (!data.vehicleData?.type || !['sedan', 'suv', 'van', 'moto'].includes(data.vehicleData.type)) {
        errors.push('Tipo de vehículo inválido');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default new RegistrationService();
