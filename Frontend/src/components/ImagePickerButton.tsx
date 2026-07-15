import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from './LoadingIcon';
import uploadService from '../services/uploadService';
import { useTranslation } from 'react-i18next';

interface ImagePickerButtonProps {
  label: string;
  onImageSelected: (url: string) => void;
  currentImage?: string;
  folder?: string;
}

export default function ImagePickerButton({
  label,
  onImageSelected,
  currentImage,
  folder,
}: ImagePickerButtonProps) {
  const [uploading, setUploading] = useState(false);
  const [imageUri, setImageUri] = useState<string | undefined>(currentImage);
  const { t } = useTranslation();

  const handleSelectImage = () => {
    Alert.alert(
      t('common.components.imagePickerButton.alerts.pickTitle'),
      t('common.components.imagePickerButton.alerts.pickMessage'),
      [
        {
          text: t('common.components.imagePickerButton.alerts.cameraOption'),
          onPress: handleTakePhoto,
        },
        {
          text: t('common.components.imagePickerButton.alerts.galleryOption'),
          onPress: handlePickFromGallery,
        },
        {
          text: t('common.components.imagePickerButton.alerts.cancelOption'),
          style: 'cancel',
        },
      ],
    );
  };

  const handleTakePhoto = async () => {
    try {
      const hasPermission = await uploadService.requestPermissions();
      if (!hasPermission) {
        Alert.alert(
          t('common.components.imagePickerButton.alerts.permissionTitle'),
          t('common.components.imagePickerButton.alerts.permissionMessage'),
        );
        return;
      }

      const image = await uploadService.takePhoto();
      if (image) {
        await uploadImage(image.uri);
      }
    } catch (error) {
      Alert.alert(
        t('common.components.imagePickerButton.alerts.uploadErrorTitle'),
        t('common.components.imagePickerButton.alerts.takePhotoError'),
      );
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const hasPermission = await uploadService.requestPermissions();
      if (!hasPermission) {
        Alert.alert(
          t('common.components.imagePickerButton.alerts.permissionTitle'),
          t('common.components.imagePickerButton.alerts.permissionGalleryMessage'),
        );
        return;
      }

      const image = await uploadService.pickImageFromGallery();
      if (image) {
        await uploadImage(image.uri);
      }
    } catch (error) {
      Alert.alert(
        t('common.components.imagePickerButton.alerts.uploadErrorTitle'),
        t('common.components.imagePickerButton.alerts.pickError'),
      );
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);
      setImageUri(uri);

      const result = await uploadService.uploadImage(uri, folder);
      onImageSelected(result.url);

      Alert.alert(
        t('common.components.imagePickerButton.alerts.uploadSuccessTitle'),
        t('common.components.imagePickerButton.alerts.uploadSuccessMessage'),
      );
    } catch (error: any) {
      Alert.alert(
        t('common.components.imagePickerButton.alerts.uploadErrorTitle'),
        error.message || t('common.components.imagePickerButton.alerts.uploadErrorMessage'),
      );
      setImageUri(undefined);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handleSelectImage}
        disabled={uploading}
      >
        {uploading ? (
          <LoadingIcon icon="cloud-upload" size={32} color="#fff" animation="pulse" />
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <MaterialIcons name="photo-camera" size={48} color="#999" style={styles.placeholderIcon} />
            <Text style={styles.placeholderSubtext}>
              {t('common.components.imagePickerButton.placeholder.label')}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  button: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: '#f9f9f9',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    display: 'none',
  },
  placeholderIcon: {
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#666',
  },
});
