import * as ImagePicker from 'expo-image-picker';
import { launchCameraSafely } from '../utils/cameraUtils';
import i18n from '../i18n';

export interface UploadResult {
  url: string;
  publicId: string;
}

class UploadService {
  /**
   * Solicitar permisos de cámara y galería
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      const galleryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      return cameraPermission.granted && galleryPermission.granted;
    } catch (error) {
      console.error('Error solicitando permisos:', error);
      return false;
    }
  }

  /**
   * Seleccionar imagen de la galería
   */
  async pickImageFromGallery(): Promise<ImagePicker.ImagePickerAsset | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0];
    }

    return null;
  }

  /**
   * Tomar foto con la cámara
   */
  async takePhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
    const result = await launchCameraSafely({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result && !result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0];
    }

    return null;
  }

  /**
   * "Subir" imagen (en realidad solo retorna la URI local)
   * La URI se guarda directamente en Supabase PostgreSQL
   */
  async uploadImage(
    imageUri: string,
    folder: string = 'images',
  ): Promise<UploadResult> {
    try {
      console.log('📤 Procesando imagen...');
      console.log('URI:', imageUri);

      // Retornar la URI local directamente
      // Se guardará en la BD de Supabase como está
      return {
        url: imageUri,
        publicId: `${folder}_${Date.now()}`,
      };
    } catch (error: any) {
      console.error('❌ Error procesando imagen:', error);
      throw new Error(i18n.t('services.uploadService.errors.processImage') as string);
    }
  }

  /**
   * Subir múltiples imágenes
   */
  async uploadMultipleImages(
    imageUris: string[],
    folder: string = 'images',
  ): Promise<UploadResult[]> {
    try {
      const results = imageUris.map((uri, index) => ({
        url: uri,
        publicId: `${folder}_${Date.now()}_${index}`,
      }));
      return results;
    } catch (error: any) {
      console.error('Error procesando imágenes:', error);
      throw new Error(i18n.t('services.uploadService.errors.processImages') as string);
    }
  }

  /**
   * Subir foto de perfil
   */
  async uploadProfilePhoto(imageUri: string): Promise<UploadResult> {
    return this.uploadImage(imageUri, 'profiles');
  }

  /**
   * Subir licencia
   */
  async uploadLicense(imageUri: string): Promise<UploadResult> {
    return this.uploadImage(imageUri, 'licenses');
  }

  /**
   * Subir fotos del vehículo
   */
  async uploadVehiclePhotos(imageUris: string[]): Promise<UploadResult[]> {
    return this.uploadMultipleImages(imageUris, 'vehicles');
  }

  /**
   * Subir documento (matrícula, seguro, etc.)
   */
  async uploadDocument(
    imageUri: string,
    type: string,
  ): Promise<UploadResult> {
    return this.uploadImage(imageUri, `documents/${type}`);
  }
}

export default new UploadService();
