import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Alert,
  ActivityIndicator,
  Platform,
  TextInput
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import supabaseStorage from '../../services/supabaseStorage';
import driversService from '../../services/driversService';

interface DriversDocumentsInspectionProps {
  route: any;
  navigation: any;
}

export default function DriversDocumentsInspectionScreen({ route, navigation }: DriversDocumentsInspectionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  const [loading, setLoading] = useState(false);
  const [licensePhotoFront, setLicensePhotoFront] = useState<string | null>(null);
  const [licensePhotoBack, setLicensePhotoBack] = useState<string | null>(null);

  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [documentsStatus, setDocumentsStatus] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState(0);
  const { user } = useAuth();
  
  // Solicitar permisos para la cámara
  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso Requerido', 'Necesitamos acceso a la cámara para tomar fotos de tus documentos.');
      }
    })();
  }, []);

  // Cargar datos del conductor si ya existen
  useEffect(() => {
    loadDriverData();
  }, [user?.id]);

  const loadDriverData = async () => {
    if (!user?.id) return;
    
    try {
      const profile = await driversService.getMyDriverProfile();
      
      if (profile) {
        console.log('✅ Datos del conductor cargados desde backend:', {
          license_number: profile.licenseNumber || profile.license_number,
          license_expiry: profile.licenseExpiry || profile.license_expiry,
          license_photo_front: (profile.license_photo_front || profile.licensePhotoFront) ? '✅' : '❌',
          license_photo_back: (profile.license_photo_back || profile.licensePhotoBack) ? '✅' : '❌',
        });

        if (profile.documents_status || profile.documentsStatus || profile.status) {
          setDocumentsStatus(
            (profile.documents_status || profile.documentsStatus || profile.status || '').toLowerCase(),
          );
        }

        // Cargar datos existentes en los estados (con fallback a snake_case)
        if (profile.licenseNumber || profile.license_number) {
          setLicenseNumber(profile.licenseNumber || profile.license_number);
        }
        if (profile.licenseExpiry || profile.license_expiry) {
          setLicenseExpiry(profile.licenseExpiry || profile.license_expiry);
        }
        if (profile.license_photo_front || profile.licensePhotoFront) {
          setLicensePhotoFront(profile.license_photo_front || profile.licensePhotoFront);
        }
        if (profile.license_photo_back || profile.licensePhotoBack) {
          setLicensePhotoBack(profile.license_photo_back || profile.licensePhotoBack);
        }
      }
    } catch (error) {
      console.error('Error al cargar datos del conductor:', error);
    }
  };

  // Tomar foto con la cámara
  const takePhoto = async (setPhotoFunction: (uri: string) => void) => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotoFunction(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo tomar la foto');
      console.error('Error al tomar foto:', error);
    }
  };

  // Subir fotos y datos a Supabase
  const uploadDocumentsAndContinue = async () => {
    if (!user || !allDataProvided) {
      Alert.alert('Error', 'Faltan datos o fotos para continuar');
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      const photos = [
        { uri: licensePhotoFront as string, type: 'license_front' },
        { uri: licensePhotoBack as string, type: 'license_back' },
      ];

      const uploadedUrls: Record<string, string> = {};
      let totalProgress = 0;

      // Subir cada foto
      for (const [index, photo] of photos.entries()) {
        if (!photo.uri) continue;
        
        totalProgress = index / photos.length;
        setUploadProgress(totalProgress);
        
        // Subir la foto a Supabase
        const downloadUrl = await supabaseStorage.uploadLicensePhoto(
          user.id,
          photo.uri,
          photo.type === 'license_front' ? 'front' : 'back'
        );
        
        uploadedUrls[photo.type] = downloadUrl;
        
        totalProgress = (index + 1) / photos.length;
        setUploadProgress(totalProgress);
      }

      // Actualizar en drivers table
      console.log('💾 Actualizando documentos del conductor...');
      const updateResult = await driversService.updateDriver({
        license_number: licenseNumber,
        license_expiry: licenseExpiry,
        license_photo_front: uploadedUrls['license_front'],
        license_photo_back: uploadedUrls['license_back'],
      });

      setLoading(false);
      Alert.alert(
        'Éxito', 
        'Documentos del conductor actualizados correctamente.',
        [{ 
          text: 'Aceptar', 
          onPress: () => {
            navigation.goBack();
          }
        }]
      );

    } catch (error) {
      console.error('Error al subir documentos:', error);
      setLoading(false);
      Alert.alert('Error', 'No se pudieron subir los documentos. Inténtelo de nuevo.');
    }
  };

  const allDataProvided = licensePhotoFront && licensePhotoBack && licenseNumber && licenseExpiry;
  const documentsStatusNormalized = (documentsStatus || '').toLowerCase();
  const documentsVerified = documentsStatusNormalized === 'verified';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📋 Documentos del Conductor</Text>
        <Text style={styles.subtitle}>Por favor completa tu información de licencia de conducir y sube las fotos del frente y reverso.</Text>
      </View>
      
      {/* Datos de Licencia */}
      <View style={styles.dataSection}>
        <Text style={styles.sectionTitle}>Información de Licencia</Text>
        
        <Text style={styles.label}>Número de Licencia *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: B21332434"
          value={licenseNumber}
          onChangeText={setLicenseNumber}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>Fecha de Vencimiento (YYYY-MM-DD) *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: 2030-02-12"
          value={licenseExpiry}
          onChangeText={setLicenseExpiry}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Fotos de Licencia */}
      <View style={styles.photoSection}>
        <Text style={styles.sectionTitle}>Fotos de Licencia</Text>
        
        {/* Foto Frontal */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>1. Frente de la Licencia</Text>
          {licensePhotoFront ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: licensePhotoFront }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setLicensePhotoFront)}
              >
                <Text style={styles.retakeButtonText}>Volver a tomar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setLicensePhotoFront)}
            >
              <Text style={styles.photoButtonText}>📷 Tomar Foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto Trasera */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>2. Reverso de la Licencia</Text>
          {licensePhotoBack ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: licensePhotoBack }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setLicensePhotoBack)}
              >
                <Text style={styles.retakeButtonText}>Volver a tomar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setLicensePhotoBack)}
            >
              <Text style={styles.photoButtonText}>📷 Tomar Foto</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.noticeContainer}>
        <Text style={styles.noticeText}>
          ⚠️ Asegúrate de que las fotos sean claras y legibles. Estos documentos serán verificados por nuestro equipo.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Subiendo documentos... {Math.round(uploadProgress * 100)}%</Text>
        </View>
      ) : documentsVerified ? (
        <View style={styles.verifiedNotice}>
          <Text style={styles.verifiedNoticeText}>Documentos verificados ✅</Text>
          <Text style={styles.verifiedNoticeSubtitle}>Si necesitas actualizar tu información, contáctanos por soporte.</Text>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.submitButton, !allDataProvided && styles.submitButtonDisabled]}
          onPress={uploadDocumentsAndContinue}
          disabled={!allDataProvided}
        >
          <Text style={styles.submitButtonText}>
            {allDataProvided ? 'Guardar Documentos' : 'Complete todos los datos y fotos'}
          </Text>
        </TouchableOpacity>
      )}
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  dataSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoSection: {
    padding: 20,
    paddingTop: 0,
  },
  photoContainer: {
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.text,
  },
  photoButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewContainer: {
    alignItems: 'center',
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  retakeButton: {
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  retakeButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  noticeContainer: {
    padding: 16,
    marginHorizontal: 20,
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    marginBottom: 20,
  },
  noticeText: {
    color: '#856404',
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    marginHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  verifiedNotice: {
    padding: 20,
    marginHorizontal: 20,
    backgroundColor: '#D4EDDA',
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#C3E6CB',
  },
  verifiedNoticeText: {
    color: '#155724',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  verifiedNoticeSubtitle: {
    color: '#155724',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
