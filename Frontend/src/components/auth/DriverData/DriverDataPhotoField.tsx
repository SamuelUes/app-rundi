import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import type { TFunction } from 'i18next';

interface DriverDataPhotoFieldProps {
  title: string;
  photoUri: string | null;
  loading: boolean;
  onTakePhoto: () => void;
  styles: any;
  t: TFunction;
}

export function DriverDataPhotoField({
  title,
  photoUri,
  loading,
  onTakePhoto,
  styles,
  t,
}: DriverDataPhotoFieldProps) {
  return (
    <View style={styles.photoContainer}>
      <Text style={styles.photoTitle}>{title}</Text>
      {photoUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={onTakePhoto}
            disabled={loading}
          >
            <Text style={styles.retakeButtonText}>{t('authScreens.driverData.photos.retakePhoto')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.photoButton}
          onPress={onTakePhoto}
          disabled={loading}
        >
          <Text style={styles.photoButtonText}>{t('authScreens.driverData.photos.takePhoto')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
