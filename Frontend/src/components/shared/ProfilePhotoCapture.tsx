import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { LoadingIcon } from '../ui/LoadingIcon';
import { MaterialIcons } from '@expo/vector-icons';
import * as ExpoImagePicker from 'expo-image-picker';
import { launchCameraSafely } from '../../utils/cameraUtils';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';

interface ProfilePhotoCaptureProps {
  photoUri: string | null;
  onPhotoSelected: (uri: string) => void;
  loading?: boolean;
}

export default function ProfilePhotoCapture({
  photoUri,
  onPhotoSelected,
  loading = false,
}: ProfilePhotoCaptureProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const requestPermissions = async () => {
    const { status } = await ExpoImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        t('common.components.profilePhotoCapture.alerts.permissionTitle'),
        t('common.components.profilePhotoCapture.alerts.permissionMessage'),
      );
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) return;

    try {
      const result = await launchCameraSafely({
        allowsEditing: true,
        aspect: [1, 1], // Foto cuadrada para perfil
        quality: 0.9, // Alta calidad para reconocimiento facial
        cameraType: ExpoImagePicker.CameraType.front, // Cámara frontal
      });

      if (result && !result.canceled && result.assets && result.assets.length > 0) {
        onPhotoSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error tomando foto:', error);
      Alert.alert(
        t('common.components.profilePhotoCapture.alerts.errorTitle'),
        t('common.components.profilePhotoCapture.alerts.errorMessage'),
      );
    }
  };

  const showInstructions = () => {
    Alert.alert(
      t('common.components.profilePhotoCapture.instructions.title'),
      t('common.components.profilePhotoCapture.instructions.message'),
      [
        {
          text: t('common.components.profilePhotoCapture.instructions.confirm'),
          style: 'default',
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={[styles.label, { color: colors.text }]}>
          {t('common.components.profilePhotoCapture.label')} <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity onPress={showInstructions}>
          <Text style={[styles.infoButton, { color: colors.primary }]}>
            {t('common.components.profilePhotoCapture.buttons.instructions')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.photoContainer}>
        {loading ? (
          <View style={[styles.photoPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LoadingIcon size={32} color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {t('common.components.profilePhotoCapture.states.uploading')}
            </Text>
          </View>
        ) : photoUri ? (
          <View style={styles.photoWrapper}>
            <Image source={{ uri: photoUri }} style={styles.profilePhoto} />
            <View style={styles.checkmarkContainer}>
              <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
            </View>
          </View>
        ) : (
          <View style={[styles.photoPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialIcons name="person" size={48} color={colors.textSecondary} />
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              {t('common.components.profilePhotoCapture.states.empty')}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.captureButton,
          {
            backgroundColor: photoUri ? colors.card : colors.primary,
            borderColor: photoUri ? colors.border : colors.primary,
          },
        ]}
        onPress={takePhoto}
        disabled={loading}
      >
        <Text
          style={[
            styles.captureButtonText,
            { color: photoUri ? colors.text : '#fff' },
          ]}
        >
          {photoUri
            ? t('common.components.profilePhotoCapture.buttons.retake')
            : t('common.components.profilePhotoCapture.buttons.take')}
        </Text>
      </TouchableOpacity>

      <View style={[styles.warningBox, { backgroundColor: colors.surface, borderColor: '#f59e0b' }]}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={[styles.warningText, { color: colors.text }]}>
          <Text style={styles.warningBold}>
            {t('common.components.profilePhotoCapture.warning.intro')}
          </Text>{' '}
          {t('common.components.profilePhotoCapture.warning.message')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  required: {
    color: '#ef4444',
    fontSize: 16,
  },
  infoButton: {
    fontSize: 14,
    fontWeight: '600',
  },
  photoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  photoWrapper: {
    position: 'relative',
  },
  profilePhoto: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 4,
    borderColor: '#10b981',
  },
  checkmarkContainer: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#10b981',
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  checkmark: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  photoPlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 60,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  captureButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    marginBottom: 16,
  },
  captureButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  warningBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  warningBold: {
    fontWeight: '700',
  },
});
