import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from './LoadingIcon';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';

interface PhotoUploadFieldProps {
  label: string;
  value: string | null;
  onPhotoSelected: (uri: string) => void;
  isRequired?: boolean;
  colors: any;
}

export const PhotoUploadField: React.FC<PhotoUploadFieldProps> = ({
  label,
  value,
  onPhotoSelected,
  isRequired = false,
  colors,
}) => {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          t('common.components.photoUploadField.alerts.permissionDeniedTitle'),
          t('common.components.photoUploadField.alerts.galleryPermission'),
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        onPhotoSelected(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert(
        t('common.components.photoUploadField.alerts.errorTitle'),
        t('common.components.photoUploadField.alerts.selectError'),
      );
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          t('common.components.photoUploadField.alerts.permissionDeniedTitle'),
          t('common.components.photoUploadField.alerts.cameraPermission'),
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled) {
        onPhotoSelected(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert(
        t('common.components.photoUploadField.alerts.errorTitle'),
        t('common.components.photoUploadField.alerts.captureError'),
      );
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      t('common.components.photoUploadField.options.title'),
      t('common.components.photoUploadField.options.message'),
      [
        { text: t('common.components.photoUploadField.options.cancel'), style: 'cancel' },
        { text: t('common.components.photoUploadField.options.gallery'), onPress: pickImage },
        { text: t('common.components.photoUploadField.options.camera'), onPress: takePhoto },
      ]
    );
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>
          {label}
          {isRequired && <Text style={styles.required}> *</Text>}
        </Text>
        {value && <MaterialIcons name="check-circle" size={18} color="#4CAF50" />}
      </View>

      {value ? (
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: value }}
            style={styles.preview}
          />
          <TouchableOpacity
            style={styles.changeButton}
            onPress={showPhotoOptions}
          >
            <Text style={styles.changeButtonText}>
              {t('common.components.photoUploadField.buttons.change')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={showPhotoOptions}
          disabled={loading}
        >
          {loading ? (
            <LoadingIcon icon="cloud-upload" size={32} color={colors.primary} animation="pulse" />
          ) : (
            <>
              <MaterialIcons name="photo-camera" size={32} color={colors.primary} style={styles.uploadIcon} />
              <Text style={styles.uploadText}>
                {t('common.components.photoUploadField.buttons.add')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    labelContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    required: {
      color: '#FF6B6B',
    },
    statusIcon: {
      display: 'none',
    },
    previewContainer: {
      alignItems: 'center',
    },
    preview: {
      width: '100%',
      height: 200,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: colors.surface,
    },
    changeButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.primary,
      borderRadius: 6,
    },
    changeButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    uploadButton: {
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    uploadIcon: {
      marginBottom: 8,
    },
    uploadText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600',
    },
  });
