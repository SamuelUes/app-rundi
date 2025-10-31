import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

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

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permiso Denegado', 'Necesitamos acceso a tu galería');
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
      Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permiso Denegado', 'Necesitamos acceso a la cámara');
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
      Alert.alert('Error', 'No se pudo tomar la foto');
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      'Seleccionar Foto',
      'Elige cómo deseas agregar la foto',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Galería', onPress: pickImage },
        { text: 'Cámara', onPress: takePhoto },
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
        {value && <Text style={styles.statusIcon}>✅</Text>}
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
            <Text style={styles.changeButtonText}>Cambiar Foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={showPhotoOptions}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={styles.uploadIcon}>📷</Text>
              <Text style={styles.uploadText}>Agregar Foto</Text>
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
      fontSize: 16,
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
      fontSize: 32,
      marginBottom: 8,
    },
    uploadText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600',
    },
  });
