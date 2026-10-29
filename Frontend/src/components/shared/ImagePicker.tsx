import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { LoadingIcon } from '../ui/LoadingIcon';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ExpoImagePicker from 'expo-image-picker';
import { launchCameraSafely } from '../../utils/cameraUtils';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';

interface ImagePickerProps {
  label: string;
  imageUri: string | null;
  onImageSelected: (uri: string) => void;
  loading?: boolean;
  required?: boolean;
  compact?: boolean;
}

export default function ImagePicker({
  label,
  imageUri,
  onImageSelected,
  loading = false,
  required = false,
  compact = false,
}: ImagePickerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const requestPermissions = async () => {
    const { status: cameraStatus } = await ExpoImagePicker.requestCameraPermissionsAsync();
    const { status: libraryStatus } = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
      Alert.alert(
        t('common.components.imagePicker.alerts.permissionsTitle'),
        t('common.components.imagePicker.alerts.permissionsMessage'),
      );
      return false;
    }
    return true;
  };

  const pickImage = async (useCamera: boolean) => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) return;

    try {
      const result = useCamera
        ? await launchCameraSafely({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          })
        : await ExpoImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
          });

      if (result && !result.canceled && result.assets && result.assets.length > 0) {
        onImageSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error seleccionando imagen:', error);
      Alert.alert(
        t('common.components.imagePicker.alerts.errorTitle'),
        t('common.components.imagePicker.alerts.selectError'),
      );
    }
  };

  const showOptions = () => {
    Alert.alert(
      t('common.components.imagePicker.alerts.selectTitle'),
      t('common.components.imagePicker.alerts.selectMessage'),
      [
        {
          text: t('common.components.imagePicker.alerts.cameraOption'),
          onPress: () => pickImage(true),
        },
        {
          text: t('common.components.imagePicker.alerts.galleryOption'),
          onPress: () => pickImage(false),
        },
        {
          text: t('common.components.imagePicker.alerts.cancelOption'),
          style: 'cancel',
        },
      ]
    );
  };

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <Text style={[styles.label, { color: colors.text }]}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>

      <TouchableOpacity
        style={[
          styles.imageButton,
          compact && styles.compactImageButton,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        onPress={showOptions}
        disabled={loading}
      >
        {loading ? (
          <LoadingIcon size={20} color={colors.primary} />
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.imagePreview} />
        ) : (
          <View style={styles.placeholderContainer}>
            <MaterialIcons name="photo-camera" size={compact ? 26 : 32} color={colors.textSecondary} />
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              {t('common.components.imagePicker.placeholder')}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {imageUri && !loading && (
        <TouchableOpacity
          style={styles.changeButton}
          onPress={showOptions}
        >
          <Text style={[styles.changeButtonText, { color: colors.primary }]}>
            {t('common.components.imagePicker.changeButton')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  compactContainer: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  required: {
    color: '#ef4444',
  },
  imageButton: {
    height: 200,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactImageButton: {
    height: 124,
    borderRadius: 10,
    borderWidth: 1,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '500',
  },
  changeButton: {
    marginTop: 8,
    alignItems: 'center',
    padding: 8,
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
