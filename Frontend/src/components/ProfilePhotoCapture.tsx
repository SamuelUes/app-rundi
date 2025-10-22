import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ExpoImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';

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

  const requestPermissions = async () => {
    const { status } = await ExpoImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Permiso de Cámara Requerido',
        'Necesitamos acceso a la cámara para tomar tu foto de perfil. Esto es obligatorio para verificar tu identidad.'
      );
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) return;

    try {
      const result = await ExpoImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1], // Foto cuadrada para perfil
        quality: 0.9, // Alta calidad para reconocimiento facial
        cameraType: ExpoImagePicker.CameraType.front, // Cámara frontal
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        onPhotoSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error tomando foto:', error);
      Alert.alert('Error', 'No se pudo tomar la foto. Intenta de nuevo.');
    }
  };

  const showInstructions = () => {
    Alert.alert(
      '📸 Instrucciones para la Foto de Perfil',
      '• Quítate los lentes de sol\n' +
      '• Asegúrate de tener buena iluminación\n' +
      '• Mira directamente a la cámara\n' +
      '• Tu rostro debe ser claramente visible\n' +
      '• No uses filtros ni ediciones\n' +
      '• La foto debe ser reciente\n\n' +
      'Esta foto es OBLIGATORIA para verificar tu identidad y garantizar la seguridad de los pasajeros.',
      [
        {
          text: 'Entendido',
          style: 'default',
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={[styles.label, { color: colors.text }]}>
          Foto de Perfil <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity onPress={showInstructions}>
          <Text style={[styles.infoButton, { color: colors.primary }]}>ℹ️ Instrucciones</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.photoContainer}>
        {loading ? (
          <View style={[styles.photoPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Subiendo foto...
            </Text>
          </View>
        ) : photoUri ? (
          <View style={styles.photoWrapper}>
            <Image source={{ uri: photoUri }} style={styles.profilePhoto} />
            <View style={styles.checkmarkContainer}>
              <Text style={styles.checkmark}>✓</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.photoPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.placeholderIcon}>👤</Text>
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              Sin foto
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
          {photoUri ? '🔄 Tomar Nueva Foto' : '📷 Tomar Foto de Perfil'}
        </Text>
      </TouchableOpacity>

      <View style={[styles.warningBox, { backgroundColor: colors.surface, borderColor: '#f59e0b' }]}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={[styles.warningText, { color: colors.text }]}>
          <Text style={styles.warningBold}>Importante:</Text> Tu foto de perfil es obligatoria.
          Debe mostrar claramente tu rostro sin lentes de sol. Será usada para verificar tu identidad.
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
