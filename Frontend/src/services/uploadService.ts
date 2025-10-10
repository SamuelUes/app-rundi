import axios from 'axios';
import { API_BASE_URL } from '../config/environment';
import * as ImagePicker from 'expo-image-picker';

export interface UploadResult {
  url: string;
  publicId: string;
}

class UploadService {
  /**
   * Solicitar permisos de cámara y galería
   */
  async requestPermissions(): Promise<boolean> {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const galleryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    return cameraPermission.granted && galleryPermission.granted;
  }

  /**
   * Seleccionar imagen de la galería
   */
  async pickImageFromGallery(): Promise<ImagePicker.ImagePickerAsset | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    const result = await ImagePicker.launchCameraAsync({
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
   * Subir imagen al servidor
   */
  async uploadImage(
    imageUri: string,
    folder?: string,
  ): Promise<UploadResult> {
    try {
      const formData = new FormData();

      // Obtener el nombre del archivo y la extensión
      const uriParts = imageUri.split('.');
      const fileType = uriParts[uriParts.length - 1];

      formData.append('file', {
        uri: imageUri,
        name: `photo.${fileType}`,
        type: `image/${fileType}`,
      } as any);

      if (folder) {
        formData.append('folder', folder);
      }

      const response = await axios.post(
        `${API_BASE_URL}/api/upload/image`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw new Error(
        error.response?.data?.message || 'Error al subir la imagen',
      );
    }
  }

  /**
   * Subir múltiples imágenes
   */
  async uploadMultipleImages(
    imageUris: string[],
    folder?: string,
  ): Promise<UploadResult[]> {
    try {
      const formData = new FormData();

      imageUris.forEach((uri, index) => {
        const uriParts = uri.split('.');
        const fileType = uriParts[uriParts.length - 1];

        formData.append('files', {
          uri,
          name: `photo_${index}.${fileType}`,
          type: `image/${fileType}`,
        } as any);
      });

      if (folder) {
        formData.append('folder', folder);
      }

      const response = await axios.post(
        `${API_BASE_URL}/api/upload/images`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Error uploading images:', error);
      throw new Error(
        error.response?.data?.message || 'Error al subir las imágenes',
      );
    }
  }

  /**
   * Subir foto de perfil
   */
  async uploadProfilePhoto(imageUri: string): Promise<UploadResult> {
    try {
      const formData = new FormData();

      const uriParts = imageUri.split('.');
      const fileType = uriParts[uriParts.length - 1];

      formData.append('file', {
        uri: imageUri,
        name: `profile.${fileType}`,
        type: `image/${fileType}`,
      } as any);

      const response = await axios.post(
        `${API_BASE_URL}/api/upload/profile`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Error uploading profile photo:', error);
      throw new Error(
        error.response?.data?.message || 'Error al subir la foto de perfil',
      );
    }
  }

  /**
   * Subir licencia
   */
  async uploadLicense(imageUri: string): Promise<UploadResult> {
    try {
      const formData = new FormData();

      const uriParts = imageUri.split('.');
      const fileType = uriParts[uriParts.length - 1];

      formData.append('file', {
        uri: imageUri,
        name: `license.${fileType}`,
        type: `image/${fileType}`,
      } as any);

      const response = await axios.post(
        `${API_BASE_URL}/api/upload/license`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Error uploading license:', error);
      throw new Error(
        error.response?.data?.message || 'Error al subir la licencia',
      );
    }
  }

  /**
   * Subir fotos del vehículo
   */
  async uploadVehiclePhotos(imageUris: string[]): Promise<UploadResult[]> {
    try {
      const formData = new FormData();

      imageUris.forEach((uri, index) => {
        const uriParts = uri.split('.');
        const fileType = uriParts[uriParts.length - 1];

        formData.append('files', {
          uri,
          name: `vehicle_${index}.${fileType}`,
          type: `image/${fileType}`,
        } as any);
      });

      const response = await axios.post(
        `${API_BASE_URL}/api/upload/vehicle`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Error uploading vehicle photos:', error);
      throw new Error(
        error.response?.data?.message || 'Error al subir las fotos del vehículo',
      );
    }
  }

  /**
   * Subir documento (matrícula, seguro, etc.)
   */
  async uploadDocument(
    imageUri: string,
    type: string,
  ): Promise<UploadResult> {
    try {
      const formData = new FormData();

      const uriParts = imageUri.split('.');
      const fileType = uriParts[uriParts.length - 1];

      formData.append('file', {
        uri: imageUri,
        name: `${type}.${fileType}`,
        type: `image/${fileType}`,
      } as any);

      formData.append('type', type);

      const response = await axios.post(
        `${API_BASE_URL}/api/upload/document`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );

      return response.data.data;
    } catch (error: any) {
      console.error('Error uploading document:', error);
      throw new Error(
        error.response?.data?.message || 'Error al subir el documento',
      );
    }
  }
}

export default new UploadService();
