import { Alert, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import i18n from '../i18n';

/**
 * UIImagePickerController lanza una NSException nativa (crash no capturable
 * desde JS) al usar sourceType .camera en un dispositivo sin cámara —
 * p. ej. el iOS Simulator o cámaras restringidas. En Android el picker
 * maneja la ausencia de cámara rechazando la promesa.
 */
export function isCameraAvailable(): boolean {
  if (Platform.OS !== 'ios') return true;
  return Device.isDevice;
}

/**
 * Envuelve ImagePicker.launchCameraAsync evitando el crash nativo cuando no
 * hay cámara. En ese caso ofrece abrir la galería como fallback.
 * Retorna null si el usuario no obtuvo imagen.
 */
export async function launchCameraSafely(
  options: ImagePicker.ImagePickerOptions = {},
): Promise<ImagePicker.ImagePickerResult | null> {
  if (isCameraAvailable()) {
    return ImagePicker.launchCameraAsync({ mediaTypes: ['images'], ...options });
  }

  return new Promise((resolve) => {
    Alert.alert(
      i18n.t('common.components.camera.unavailableTitle'),
      i18n.t('common.components.camera.unavailableMessage'),
      [
        {
          text: i18n.t('common.actions.cancel'),
          style: 'cancel',
          onPress: () => resolve(null),
        },
        {
          text: i18n.t('common.components.camera.useGallery'),
          onPress: async () => {
            resolve(
              await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: options.allowsEditing,
                aspect: options.aspect,
                quality: options.quality,
              }),
            );
          },
        },
      ],
    );
  });
}
