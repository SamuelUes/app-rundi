import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as ExpoImagePicker from 'expo-image-picker';
import driversService from '../../../services/driver/driversService';
import firebaseStorage from '../../../services/media/storageService';
import { updateMyProfile } from '../../../api/users';
import type { TFunction } from 'i18next';

export function useDriverPhoto(
  userId: string | undefined,
  setProfilePhoto: (photo: string | null) => void,
  t: TFunction,
) {
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleUploadPhoto = useCallback(
    async (type: 'profile' | 'vehicle' | 'document', docType?: string) => {
      const { status } = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          t('driver.profile.alerts.permissions.galleryTitle'),
          t('driver.profile.alerts.permissions.galleryBody'),
        );
        return;
      }

      const result = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'profile' ? [1, 1] : [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0] && userId) {
        setUploadingPhoto(true);
        try {
          if (type === 'profile') {
            const photoPath = await firebaseStorage.uploadProfilePhoto(
              userId,
              result.assets[0].uri,
            );
            const photoUrl = await firebaseStorage.resolveProfilePhotoUrl(photoPath);
            if (!photoUrl || !/^https?:\/\//i.test(photoUrl)) {
              throw new Error(t('driver.profile.alerts.upload.errorBody'));
            }

            await updateMyProfile({ profilePhoto: photoUrl });
            await driversService.updateDriver({ profile_photo: photoUrl });
            setProfilePhoto(photoUrl);

            Alert.alert(
              t('driver.profile.alerts.upload.successTitle'),
              t('driver.profile.alerts.upload.successBody'),
            );
          }
        } catch (error: any) {
          Alert.alert(
            t('driver.profile.alerts.upload.errorTitle'),
            error?.message || t('driver.profile.alerts.upload.errorBody'),
          );
        } finally {
          setUploadingPhoto(false);
        }
      }
    },
    [userId, setProfilePhoto, t],
  );

  return {
    uploadingPhoto,
    handleUploadPhoto,
  };
}
