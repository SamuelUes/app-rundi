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
import uploadService from '../services/uploadService';

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

  const handleSelectImage = () => {
    Alert.alert('Seleccionar Imagen', 'Elige una opción', [
      {
        text: 'Cámara',
        onPress: handleTakePhoto,
      },
      {
        text: 'Galería',
        onPress: handlePickFromGallery,
      },
      {
        text: 'Cancelar',
        style: 'cancel',
      },
    ]);
  };

  const handleTakePhoto = async () => {
    try {
      const hasPermission = await uploadService.requestPermissions();
      if (!hasPermission) {
        Alert.alert('Permisos', 'Se requieren permisos de cámara para continuar');
        return;
      }

      const image = await uploadService.takePhoto();
      if (image) {
        await uploadImage(image.uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Error al tomar la foto');
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const hasPermission = await uploadService.requestPermissions();
      if (!hasPermission) {
        Alert.alert('Permisos', 'Se requieren permisos de galería para continuar');
        return;
      }

      const image = await uploadService.pickImageFromGallery();
      if (image) {
        await uploadImage(image.uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Error al seleccionar la imagen');
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);
      setImageUri(uri);

      const result = await uploadService.uploadImage(uri, folder);
      onImageSelected(result.url);

      Alert.alert('Éxito', 'Imagen subida correctamente');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al subir la imagen');
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
          <ActivityIndicator color="#fff" />
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>📷</Text>
            <Text style={styles.placeholderSubtext}>Toca para seleccionar</Text>
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
    fontSize: 48,
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#666',
  },
});
