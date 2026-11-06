/**
 * Storage Service (v2)
 * Subida/descarga de archivos en Firebase Storage (Cloud Storage del proyecto
 * actual). Reemplaza supabaseStorage: el cliente sube directo al bucket y los
 * documentos se referencian por `objectPath`; las URLs de lectura se resuelven
 * con getDownloadURL (docs públicos) o URL firmada del backend (docs privados,
 * p.ej. compliance — el API ya las devuelve firmadas).
 *
 * El parámetro `bucket` de la API anterior se conserva como carpeta raíz
 * dentro del bucket único (`{bucket}/{path}`) para mantener la organización:
 *   users-documents/profiles/{uid}/…        perfiles (clientes y conductores)
 *   drivers/driver-documents/…              licencia y docs del conductor
 *   drivers/vehicle-documents/…             circulación, póliza, fotos del auto
 *   rides-documents/…                       evidencia por viaje
 */

import { Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getFirebaseStorage } from '../../config/firebase';
import i18n from '../../i18n';
import type { DesignatedDriverPhotoType } from '../../utils/driver/designatedDriverEvidence';

const downloadUrlCache = new Map<string, { url: string; expiresAtMs: number }>();
const DOWNLOAD_URL_TTL_MS = 50 * 60 * 1000; // URLs de Firebase expiran lejos; cachear 50min

/**
 * Resuelve una referencia de Storage a una URL descargable.
 * Acepta `objectPath` (`bucket/path/file.jpg`, sin scheme) o URLs http(s)
 * ya resueltas (URLs firmadas del backend se devuelven tal cual).
 */
export async function resolveDocumentPhotoUrl(photoUrl: string | null | undefined): Promise<string | null> {
  if (!photoUrl) return null;

  // URL ya resuelta (firmada por backend, http(s) externa o local).
  if (/^https?:\/\//i.test(photoUrl) || photoUrl.startsWith('file:') || photoUrl.startsWith('content:')) {
    return photoUrl;
  }

  // objectPath relativo → downloadURL con caché.
  const objectPath = photoUrl.replace(/^\/+/, '');
  const cached = downloadUrlCache.get(objectPath);
  if (cached && cached.expiresAtMs - Date.now() > 30_000) {
    return cached.url;
  }

  try {
    const storage = await getFirebaseStorage();
    const url = await getDownloadURL(ref(storage, objectPath));
    downloadUrlCache.set(objectPath, { url, expiresAtMs: Date.now() + DOWNLOAD_URL_TTL_MS });
    return url;
  } catch {
    console.warn('No se pudo resolver la URL del documento:', objectPath);
    return null;
  }
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
    const target = `${baseDir}storage_upload_${Date.now()}.${extension}`;

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
    const info = await LegacyFileSystem.getInfoAsync(uri);
    const originalSize = info.exists && info.size ? info.size : undefined;

    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.5, format: SaveFormat.JPEG }
    );

    const compressedUri = result.uri || uri;
    const compressedInfo = await LegacyFileSystem.getInfoAsync(compressedUri);
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
  i18n.t(`services.firebaseStorage.${path}`, options) as string;

/**
 * Lee un archivo local como Blob.
 * El SDK JS de Storage exige `instanceof Blob` real (FbsBlob) y en RN no se
 * pueden crear Blobs desde ArrayBuffer/Uint8Array/base64 — por eso falla
 * uploadString. `fetch(file://)` sí devuelve un Blob respaldado por el módulo
 * nativo de RN, que XHR puede enviar en streaming sin pasar por memoria JS.
 */
async function readFileAsBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

/**
 * Subir imagen a Firebase Storage.
 * @param uri - URI local de la imagen
 * @param bucket - Carpeta raíz lógica (ej: 'drivers-documents')
 * @param path - Ruta dentro de la carpeta (ej: 'licenses/user123/front.jpg')
 * @returns objectPath del archivo subido (`{bucket}/{path}`)
 */
export const uploadImage = async (
  uri: string,
  bucket: string,
  path: string
): Promise<string> => {
  try {
    console.log('📤 Iniciando upload:', { uri, bucket, path });

    if (!uri) {
      throw new Error(tr('errors.missingUri'));
    }

    const normalizedUri = await normalizeUriForUpload(uri);
    const uploadUri = await compressForUpload(normalizedUri);

    if (!uploadUri.startsWith('file://')) {
      console.error('❌ URI no soportada para upload (se requiere file://):', uploadUri);
      throw new Error(tr('errors.uploadFailed'));
    }

    const objectPath = `${bucket}/${path}`;
    const storage = await getFirebaseStorage();
    const blob = await readFileAsBlob(uploadUri);
    try {
      await uploadBytes(ref(storage, objectPath), blob, {
        contentType: 'image/jpeg',
      });
    } finally {
      // Liberar el blob nativo (RN Blob.close no está en los typings DOM)
      (blob as { close?: () => void }).close?.();
    }

    console.log('✅ Imagen subida exitosamente:', objectPath);
    return objectPath;
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
 * Subir foto de perfil (clientes y conductores)
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @returns objectPath de la imagen
 */
export const uploadProfilePhoto = async (
  userId: string,
  uri: string
): Promise<string> => {
  const timestamp = Date.now();
  const path = `profiles/${userId}/profile_${timestamp}.jpg`;
  return uploadImage(uri, 'users-documents', path);
};

/**
 * Subir foto de licencia de conducir
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @param side - 'front' o 'back'
 * @returns objectPath de la imagen
 */
export const uploadLicensePhoto = async (
  userId: string,
  uri: string,
  side: 'front' | 'back'
): Promise<string> => {
  const timestamp = Date.now();
  const path = `driver-documents/licenses/${userId}/${side}_${timestamp}.jpg`;
  return uploadImage(uri, 'drivers', path);
};

/**
 * Subir foto de tarjeta de circulación
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @param side - 'front' o 'back'
 * @returns objectPath de la imagen
 */
export const uploadRegistrationPhoto = async (
  userId: string,
  uri: string,
  side: 'front' | 'back'
): Promise<string> => {
  const timestamp = Date.now();
  const path = `vehicle-documents/registrations/${userId}/${side}_${timestamp}.jpg`;
  return uploadImage(uri, 'drivers', path);
};

/**
 * Subir foto de póliza de seguro
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @returns objectPath de la imagen
 */
export const uploadInsurancePhoto = async (
  userId: string,
  uri: string
): Promise<string> => {
  const timestamp = Date.now();
  const path = `vehicle-documents/insurance/${userId}/policy_${timestamp}.jpg`;
  return uploadImage(uri, 'drivers', path);
};

/**
 * Subir foto del vehículo del conductor
 * @param userId - ID del usuario
 * @param uri - URI local de la imagen
 * @returns URL autenticada (getDownloadURL con token) — vehicles.vehicle_photo
 *   persiste URL, no objectPath, porque el backend la proyecta literal a
 *   DATA-MAIN_vehicles.vehiclePhoto.
 */
export const uploadDriverVehiclePhoto = async (
  userId: string,
  uri: string
): Promise<string> => {
  const timestamp = Date.now();
  const path = `vehicle-documents/vehicles/${userId}/vehicle_${timestamp}.jpg`;
  const objectPath = await uploadImage(uri, 'drivers', path);
  const url = await resolveDocumentPhotoUrl(objectPath);
  if (!url) {
    throw new Error(tr('errors.uploadFailed'));
  }
  return url;
};

/**
 * Subir foto del vehículo del cliente (Conductor Designado)
 * @param userId - ID del usuario (cliente)
 * @param uri - URI local de la imagen
 * @returns objectPath de la imagen
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
 * Eliminar imagen de Firebase Storage
 * @param bucket - Carpeta raíz lógica
 * @param path - Ruta de la imagen
 */
export const deleteImage = async (
  bucket: string,
  path: string
): Promise<void> => {
  try {
    const storage = await getFirebaseStorage();
    await deleteObject(ref(storage, `${bucket}/${path}`));
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
 * @returns objectPath de la imagen
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
  uploadDriverVehiclePhoto,
  uploadClientVehiclePhoto,
  uploadVehicleInspectionPhoto,
  uploadDesignatedDriverEvidencePhoto,
  resolveDocumentPhotoUrl,
  resolveProfilePhotoUrl,
  deleteImage,
};
