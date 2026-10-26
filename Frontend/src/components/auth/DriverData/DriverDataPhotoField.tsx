import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';

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
  const { colors } = useTheme();

  return (
    <View style={styles.photoContainer}>
      <View style={styles.photoHeader}>
        <Text style={styles.photoTitle} numberOfLines={2}>
          {title}
        </Text>
        {photoUri ? (
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        ) : null}
      </View>
      {photoUri ? (
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: photoUri }}
            style={styles.photoPreview}
            resizeMode="cover"
          />
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={onTakePhoto}
            disabled={loading}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Ionicons
              name="camera-reverse-outline"
              size={15}
              color={colors.text}
            />
            <Text style={styles.retakeButtonText}>
              {t('authScreens.driverData.photos.retakePhoto')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.photoButton}
          onPress={onTakePhoto}
          disabled={loading}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <Ionicons name="camera-outline" size={20} color={colors.primary} />
          <Text style={styles.photoButtonText}>
            {t('authScreens.driverData.photos.takePhoto')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
