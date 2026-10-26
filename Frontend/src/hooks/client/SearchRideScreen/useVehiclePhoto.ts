import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { launchCameraSafely } from '../../../utils/cameraUtils';
import alertService from '../../../services/alertService';
import { uploadClientVehiclePhoto } from '../../../services/supabaseStorage';
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

  const uploadPhotoIfNeeded = useCallback(async (): Promise<string | null> => {
    if (clientVehiclePhoto) return clientVehiclePhoto;
    if (!clientVehiclePhotoLocalUri || !userId) return null;

    setUploadingPhoto(true);
    try {
      const url = await uploadClientVehiclePhoto(userId, clientVehiclePhotoLocalUri);
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
    uploadPhotoIfNeeded,
  };
}
