import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { isCameraAvailable, launchCameraSafely } from '../../../utils/system/cameraUtils';
import alertService from '../../../services/notification/alertService';
import { uploadClientVehiclePhoto } from '../../../services/media/storageService';
import type { TFunction } from 'i18next';

export function useVehiclePhoto(userId: string | undefined, t: TFunction) {
  const [clientVehiclePhoto, setClientVehiclePhoto] = useState<string | null>(null);
  const [clientVehiclePhotoLocalUri, setClientVehiclePhotoLocalUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const tr = useCallback(
    (path: string, options?: Record<string, any>) => t(`shared.searchRide.${path}`, options),
    [t],
  );

  const handleTakeVehiclePhoto = useCallback(async () => {
    if (!userId) {
      alertService.showErrorAlert(tr('alerts.photoLoginRequired'));
      return;
    }

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alertService.showInfoAlert(tr('alerts.photoPermissionsTitle'), tr('alerts.photoPermissionsMessage'));
        return;
      }

      const pickFrom = async (fromCamera: boolean) => {
        try {
          const result = fromCamera
            ? await launchCameraSafely({
                allowsEditing: true,
                quality: 0.8,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.8,
              });

          if (result && !result.canceled && result.assets?.[0]) {
            setClientVehiclePhotoLocalUri(result.assets[0].uri);
            setClientVehiclePhoto(null);
            alertService.showSuccessAlert(tr('alerts.photoSelectedTitle'), tr('alerts.photoSelectedMessage'), { duration: 2000 });
          }
        } finally {
          setUploadingPhoto(false);
        }
      };

      alertService.showOptionsAlert(tr('alerts.photoOptionsTitle'), tr('alerts.photoOptionsMessage'), [
        { text: tr('alerts.photoOptionsCamera'), onPress: () => pickFrom(true) },
        { text: tr('alerts.photoOptionsGallery'), onPress: () => pickFrom(false) },
        { text: tr('alerts.photoOptionsCancel'), style: 'cancel' },
      ]);
    } catch (error) {
      alertService.showErrorAlert(tr('alerts.photoCaptureFailed'));
    }
  }, [userId, tr]);

  /**
   * Flujo directo del CTA "confirmar y solicitar": abre la cámara sin diálogo
   * intermedio y cae a la galería cuando la cámara no está disponible (sin
   * permiso, sin hardware o fallo al abrirla). Devuelve el uri local elegido,
   * o null si el usuario canceló / hubo error.
   */
  const captureVehiclePhotoNow = useCallback(async (): Promise<string | null> => {
    if (!userId) {
      alertService.showErrorAlert(tr('alerts.photoLoginRequired'));
      return null;
    }

    try {
      let result: ImagePicker.ImagePickerResult | null = null;
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status === 'granted' && isCameraAvailable()) {
        try {
          result = await launchCameraSafely({
            allowsEditing: true,
            quality: 0.8,
          });
        } catch {
          result = null; // cámara falló al abrir → galería
        }
        if (result && result.canceled) return null; // cancelación explícita
      }

      if (!result || !result.assets?.[0]?.uri) {
        try {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          });
        } catch {
          result = null;
        }
        if (!result || result.canceled || !result.assets?.[0]?.uri) return null;
      }

      const uri = result.assets[0].uri;
      setClientVehiclePhotoLocalUri(uri);
      setClientVehiclePhoto(null);
      return uri;
    } catch (error) {
      alertService.showErrorAlert(tr('alerts.photoCaptureFailed'));
      return null;
    }
  }, [userId, tr]);

  const uploadPhotoIfNeeded = useCallback(async (uriOverride?: string): Promise<string | null> => {
    if (clientVehiclePhoto) return clientVehiclePhoto;
    const localUri = uriOverride ?? clientVehiclePhotoLocalUri;
    if (!localUri || !userId) return null;

    setUploadingPhoto(true);
    try {
      const url = await uploadClientVehiclePhoto(userId, localUri);
      setClientVehiclePhoto(url);
      alertService.showSuccessAlert(tr('alerts.photoUploadedTitle'), tr('alerts.photoUploadedMessage'), { duration: 2000 });
      setUploadingPhoto(false);
      return url;
    } catch (uploadError) {
      console.error('[vehiclePhotoUpload] Error', uploadError);
      alertService.showErrorAlert(tr('alerts.photoUploadFailed'));
      setUploadingPhoto(false);
      return null;
    }
  }, [clientVehiclePhoto, clientVehiclePhotoLocalUri, userId, tr]);

  return {
    clientVehiclePhoto,
    setClientVehiclePhoto,
    clientVehiclePhotoLocalUri,
    uploadingPhoto,
    setUploadingPhoto,
    handleTakeVehiclePhoto,
    captureVehiclePhotoNow,
    uploadPhotoIfNeeded,
  };
}
