/**
 * Supabase Storage Service
 * Servicio para subir imágenes a Supabase Storage
 */

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import i18n from '../i18n';

// Configuración de Supabase desde variables de entorno de Expo
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || 'https://ceytngpresytjhafcadu.supabase.co';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNleXRuZ3ByZXN5dGpoYWZjYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5Nzg4NzIsImV4cCI6MjA3NTU1NDg3Mn0.3G9aCmJsjOIL-VG6E49sNnxvKBLITX-I1gFFlWKVslo';

console.log('🔧 Supabase URL:', SUPABASE_URL);
console.log('🔧 Supabase Key:', SUPABASE_ANON_KEY ? '✅ Configurada' : '❌ No configurada');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tr = (path: string, options?: Record<string, any>) =>
  i18n.t(`services.supabaseStorage.${path}`, options) as string;

/**
 * Subir imagen a Supabase Storage
 * @param uri - URI local de la imagen
 * @param bucket - Nombre del bucket (ej: 'drivers-documents')
 * @param path - Ruta dentro del bucket (ej: 'licenses/user123/front.jpg')
 * @returns URL pública de la imagen subida
 */
export const uploadImage = async (
  uri: string,
  bucket: string,
  path: string
): Promise<string> => {
  try {
    console.log('📤 Iniciando upload:', { uri, bucket, path });
    
    // Validar que la URI existe
    if (!uri) {
      throw new Error(tr('errors.missingUri'));
    }

    // Leer archivo usando expo-file-system
    console.log('🔄 Leyendo archivo con FileSystem...');
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('✅ Archivo leído en base64:', base64.length, 'caracteres');

    // Convertir base64 a binary string para FormData
    console.log('🔄 Preparando datos para upload...');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Crear FormData con el archivo
    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      type: 'image/jpeg',
      name: path.split('/').pop() || 'image.jpg',
    } as any);

    console.log('☁️ Subiendo a Supabase Storage con FormData...');
    
    // Usar fetch directo con FormData (más compatible con React Native)
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'x-upsert': 'true',
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      let errorPayload: any = null;
      try {
        errorPayload = await uploadResponse.json();
      } catch {
        errorPayload = await uploadResponse.text();
      }
      console.error('❌ Error en respuesta:', errorPayload);
      if (typeof errorPayload === 'object' && errorPayload !== null && errorPayload.message) {
        throw new Error(errorPayload.message);
      }
      throw new Error(`${tr('errors.uploadFailed')} (${uploadResponse.statusText})`);
    }

    let uploadData: any = null;
    const rawText = await uploadResponse.text();
    if (rawText) {
      try {
        uploadData = JSON.parse(rawText);
      } catch {
        uploadData = rawText;
      }
    }
    console.log('✅ Imagen subida exitosamente:', uploadData ?? '(respuesta vacía)');

    // Generar URL pública
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    console.log('🔗 URL pública generada:', publicUrl);
    
    return publicUrl;
  } catch (error: any) {
    console.error('❌ Error en uploadImage:', error);
    console.error('📋 Detalles:', {
      message: error.message,
      stack: error.stack,
      uri,
      bucket,
      path,
    });
    throw new Error(error.message || tr('errors.uploadFailed'));
  }
};

/**
 * Subir foto de perfil del conductor
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @returns URL pública de la imagen
 */
export const uploadProfilePhoto = async (
  userId: string,
  uri: string
): Promise<string> => {
  const timestamp = Date.now();
  const path = `profiles/${userId}/profile_${timestamp}.jpg`;
  return uploadImage(uri, 'drivers-documents', path);
};

/**
 * Subir foto de licencia de conducir
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @param side - 'front' o 'back'
 * @returns URL pública de la imagen
 */
export const uploadLicensePhoto = async (
  userId: string,
  uri: string,
  side: 'front' | 'back'
): Promise<string> => {
  const timestamp = Date.now();
  const path = `licenses/${userId}/${side}_${timestamp}.jpg`;
  return uploadImage(uri, 'drivers-documents', path);
};

/**
 * Subir foto de tarjeta de circulación
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @param side - 'front' o 'back'
 * @returns URL pública de la imagen
 */
export const uploadRegistrationPhoto = async (
  userId: string,
  uri: string,
  side: 'front' | 'back'
): Promise<string> => {
  const timestamp = Date.now();
  const path = `registrations/${userId}/${side}_${timestamp}.jpg`;
  return uploadImage(uri, 'drivers-documents', path);
};

/**
 * Subir foto de póliza de seguro
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @returns URL pública de la imagen
 */
export const uploadInsurancePhoto = async (
  userId: string,
  uri: string
): Promise<string> => {
  const timestamp = Date.now();
  const path = `insurance/${userId}/policy_${timestamp}.jpg`;
  return uploadImage(uri, 'drivers-documents', path);
};

/**
 * Subir foto del vehículo del cliente (Conductor Designado)
 * @param userId - ID del usuario (cliente)
 * @param uri - URI local de la imagen
 * @returns URL pública de la imagen
 */
export const uploadClientVehiclePhoto = async (
  userId: string,
  uri: string,
): Promise<string> => {
  const timestamp = Date.now();
  const path = `client-vehicles/${userId}/vehicle_${timestamp}.jpg`;
  return uploadImage(uri, 'rides-documents', path);
};

/**
 * Eliminar imagen de Supabase Storage
 * @param bucket - Nombre del bucket
 * @param path - Ruta de la imagen
 */
export const deleteImage = async (
  bucket: string,
  path: string
): Promise<void> => {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.error('Error eliminando imagen de Supabase:', error);
      throw new Error(`${tr('errors.deleteFailed')} (${error.message})`);
    }
  } catch (error: any) {
    console.error('Error en deleteImage:', error);
    throw new Error(error.message || tr('errors.deleteFailed'));
  }
};

/**
 * Subir foto de inspección de vehículo para viajes de conductor designado
 * @param rideId - ID del viaje
 * @param userId - ID del conductor
 * @param uri - URI local de la imagen
 * @param type - Tipo de foto ('vehicle_front', 'vehicle_rear', 'interior_front', 'interior_rear')
 * @returns URL pública de la imagen
 */
export const uploadVehicleInspectionPhoto = async (
  rideId: string,
  userId: string,
  uri: string,
  type: 'vehicle_front' | 'vehicle_rear' | 'interior_front' | 'interior_rear'
): Promise<string> => {
  const timestamp = Date.now();
  const path = `rides-inspection/${rideId}/${type}_${userId}_${timestamp}.jpg`;
  return uploadImage(uri, 'rides-documents', path);
};

export default {
  uploadImage,
  uploadProfilePhoto,
  uploadLicensePhoto,
  uploadRegistrationPhoto,
  uploadInsurancePhoto,
  uploadClientVehiclePhoto,
  uploadVehicleInspectionPhoto,
  deleteImage,
};
