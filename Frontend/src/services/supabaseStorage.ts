 /**
 * Supabase Storage Service
 * Servicio para subir imágenes a Supabase Storage
 */

import * as FileSystem from 'expo-file-system';
import { Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { createClient } from '@supabase/supabase-js';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import i18n from '../i18n';
import type { DesignatedDriverPhotoType } from '../utils/designatedDriverEvidence';

let cachedSupabaseJwt: { token: string; expiresAtMs: number } | null = null;

async function getSupabaseJwt(): Promise<string> {
  const now = Date.now();
  if (cachedSupabaseJwt && cachedSupabaseJwt.expiresAtMs - now > 30_000) {
    return cachedSupabaseJwt.token;
  }

  const functions = await getFirebaseFunctions();
  const callable = httpsCallable(functions, 'getSupabaseJwt');
  const response = await callable({});
  const data = response.data as any;

  const token = typeof data?.token === 'string' ? data.token : undefined;
  const expiresAtMs = typeof data?.expiresAtMs === 'number' ? data.expiresAtMs : undefined;
  if (!token || !expiresAtMs) {
    throw new Error('SUPABASE_JWT_NOT_AVAILABLE');
  }

  cachedSupabaseJwt = { token, expiresAtMs };
  return token;
}

const documentSignedUrlTtlSeconds = 60 * 60;
const documentSignedUrls = new Map<string, { url: string; expiresAtMs: number }>();
let documentSigningClient: ReturnType<typeof createClient> | null = null;

function getDocumentSigningClient() {
  if (!documentSigningClient) {
    documentSigningClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      accessToken: getSupabaseJwt,
    });
  }
  return documentSigningClient;
}

function usesLocalSupabaseUrl() {
  try {
    return new URL(SUPABASE_URL).protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Resuelve una URL de Storage para mostrarla en la app.
 * En el entorno local los buckets son privados, así que las URLs `/public`
 * devuelven 400; aquí se genera una URL firmada temporal con el JWT del
 * usuario autenticado. En producción devuelve la URL original.
 */
export async function resolveDocumentPhotoUrl(photoUrl: string | null | undefined): Promise<string | null> {
  if (!photoUrl) return null;
  if (!usesLocalSupabaseUrl()) return photoUrl;

  let storageObject: { bucket: string; path: string } | null = null;
  try {
    const parsedUrl = new URL(photoUrl);
    if (parsedUrl.protocol !== 'http:') return photoUrl;
    const configuredUrl = new URL(SUPABASE_URL);
    const loopbackHosts = new Set(['localhost', '127.0.0.1', '10.0.2.2']);
    const sameLocalOrigin =
      parsedUrl.port === configuredUrl.port &&
      loopbackHosts.has(parsedUrl.hostname) &&
      loopbackHosts.has(configuredUrl.hostname);
    if (parsedUrl.origin !== configuredUrl.origin && !sameLocalOrigin) return photoUrl;

    const pathname = parsedUrl.pathname;
    const routePrefix = '/storage/v1/object/';
    const routeStart = pathname.indexOf(routePrefix);
    if (routeStart < 0) return photoUrl;

    const parts = pathname.slice(routeStart + routePrefix.length).split('/');
    const visibility = parts.shift();
    if (!['public', 'authenticated', 'sign'].includes(visibility || '')) return photoUrl;

    const bucket = decodeURIComponent(parts.shift() || '');
    const path = parts.map((part) => decodeURIComponent(part)).join('/');
    if (!bucket || !path) return photoUrl;
    storageObject = { bucket, path };
  } catch {
    return photoUrl;
  }

  const cacheKey = `${storageObject.bucket}/${storageObject.path}`;
  const cached = documentSignedUrls.get(cacheKey);
  if (cached && cached.expiresAtMs - Date.now() > 30_000) {
    return cached.url;
  }

  const signingClients = [getDocumentSigningClient(), supabase];
  for (const client of signingClients) {
    try {
      const { data, error } = await client.storage
        .from(storageObject.bucket)
        .createSignedUrl(storageObject.path, documentSignedUrlTtlSeconds);

      if (error || !data?.signedUrl) {
        continue;
      }

      documentSignedUrls.set(cacheKey, {
        url: data.signedUrl,
        expiresAtMs: Date.now() + documentSignedUrlTtlSeconds * 1000,
      });
      return data.signedUrl;
    } catch {
      // Intentar con el siguiente cliente (fallback sin JWT de usuario)
    }
  }

  console.warn('No se pudo generar la URL temporal del documento');
  return null;
}

export const resolveProfilePhotoUrl = resolveDocumentPhotoUrl;

async function normalizeUriForUpload(uri: string): Promise<string> {
  const trimmed = uri.trim();

  if (trimmed.startsWith('file:/') && !trimmed.startsWith('file://')) {
    return `file://${trimmed.slice('file:'.length)}`;
  }

  if (trimmed.startsWith('content://')) {
    const extension = 'jpg';
    const baseDir =
      LegacyFileSystem.cacheDirectory ||
      LegacyFileSystem.documentDirectory ||
      (Paths.cache as any)?.uri ||
      (Paths.document as any)?.uri ||
      '';
    const target = `${baseDir}supabase_upload_${Date.now()}.${extension}`;

    if (!target) {
      return trimmed;
    }

    try {
      await LegacyFileSystem.copyAsync({ from: trimmed, to: target });
      return target;
    } catch (error) {
      console.warn('⚠️ No se pudo copiar content:// a cache para upload. Se intentará usar la URI original.', error);
      return trimmed;
    }
  }

  return trimmed;
}

async function compressForUpload(uri: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const originalSize = info.exists && info.size ? info.size : undefined;

    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.5, format: SaveFormat.JPEG }
    );

    const compressedUri = result.uri || uri;
    const compressedInfo = await FileSystem.getInfoAsync(compressedUri);
    const compressedSize = compressedInfo.exists && compressedInfo.size ? compressedInfo.size : undefined;

    console.log('🗜️ Imagen comprimida para upload', {
      originalUri: uri,
      compressedUri,
      originalSize,
      compressedSize,
    });

    return compressedUri;
  } catch (error) {
    console.warn('⚠️ No se pudo comprimir imagen, se usará original:', error);
    return uri;
  }
}

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

    const normalizedUri = await normalizeUriForUpload(uri);
    const uploadUri = await compressForUpload(normalizedUri);

    console.log('☁️ Subiendo a Supabase Storage (binary upload)...');
    
    // Usar fetch directo con FormData (más compatible con React Native)
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    const supabaseJwt = await getSupabaseJwt();

    if (!uploadUri.startsWith('file://')) {
      console.error('❌ URI no soportada para uploadAsync (se requiere file://):', uploadUri);
      throw new Error(tr('errors.uploadFailed'));
    }

    const uploadResult = await LegacyFileSystem.uploadAsync(uploadUrl, uploadUri, {
      uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseJwt}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
    });

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      console.error('❌ Error en respuesta:', {
        status: uploadResult.status,
        body: uploadResult.body,
      });

      let message = tr('errors.uploadFailed');
      try {
        const maybeJson = JSON.parse(uploadResult.body);
        if (maybeJson?.message) {
          message = String(maybeJson.message);
        }
      } catch {
        if (uploadResult.body) {
          message = uploadResult.body;
        }
      }

      throw new Error(message);
    }

    let uploadData: any = null;
    if (uploadResult.body) {
      try {
        uploadData = JSON.parse(uploadResult.body);
      } catch {
        uploadData = uploadResult.body;
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

export const uploadDesignatedDriverEvidencePhoto = async (
  rideId: string,
  userId: string,
  uri: string,
  type: DesignatedDriverPhotoType,
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
  uploadDesignatedDriverEvidencePhoto,
  resolveDocumentPhotoUrl,
  resolveProfilePhotoUrl,
  deleteImage,
};
