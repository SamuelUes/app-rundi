import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Alert,
  Platform,
  TextInput
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const diNS = 'driver.documentInspection';
  
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
        Alert.alert(
          t(`${diNS}.alerts.permissionTitle`),
          t(`${diNS}.alerts.permissionMessage`)
        );
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
      Alert.alert(
        t(`${diNS}.alerts.cameraErrorTitle`),
        t(`${diNS}.alerts.cameraErrorMessage`)
      );
      console.error('Error al tomar foto:', error);
    }
  };

  // Subir fotos y datos a Supabase
  const uploadDocumentsAndContinue = async () => {
    if (!user || !allDataProvided) {
      Alert.alert(
        t(`${diNS}.alerts.missingDataTitle`),
        t(`${diNS}.alerts.missingDataMessage`)
      );
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
        t(`${diNS}.alerts.successTitle`), 
        t(`${diNS}.alerts.successMessage`),
        [{ 
          text: t(`${diNS}.alerts.successButton`), 
          onPress: () => {
            navigation.goBack();
          }
        }]
      );

    } catch (error) {
      console.error('Error al subir documentos:', error);
      setLoading(false);
      Alert.alert(
        t(`${diNS}.alerts.uploadErrorTitle`),
        t(`${diNS}.alerts.uploadErrorMessage`)
      );
    }
  };

  const allDataProvided = licensePhotoFront && licensePhotoBack && licenseNumber && licenseExpiry;
  const documentsStatusNormalized = (documentsStatus || '').toLowerCase();
  const documentsVerified = documentsStatusNormalized === 'verified';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(`${diNS}.header.title`)}</Text>
        <Text style={styles.subtitle}>{t(`${diNS}.header.subtitle`)}</Text>
      </View>
      
      {/* Datos de Licencia */}
      <View style={styles.dataSection}>
        <Text style={styles.sectionTitle}>{t(`${diNS}.licenseSection.title`)}</Text>
        
        <Text style={styles.label}>{t(`${diNS}.licenseSection.numberLabel`)}</Text>
        <TextInput
          style={styles.input}
          placeholder={t(`${diNS}.licenseSection.numberPlaceholder`)}
          value={licenseNumber}
          onChangeText={setLicenseNumber}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${diNS}.licenseSection.expiryLabel`)}</Text>
        <TextInput
          style={styles.input}
          placeholder={t(`${diNS}.licenseSection.expiryPlaceholder`)}
          value={licenseExpiry}
          onChangeText={setLicenseExpiry}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Fotos de Licencia */}
      <View style={styles.photoSection}>
        <Text style={styles.sectionTitle}>{t(`${diNS}.photosSection.title`)}</Text>
        
        {/* Foto Frontal */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>{t(`${diNS}.photosSection.frontTitle`)}</Text>
          {licensePhotoFront ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: licensePhotoFront }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setLicensePhotoFront)}
              >
                <Text style={styles.retakeButtonText}>{t(`${diNS}.photosSection.retakePhoto`)}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setLicensePhotoFront)}
            >
              <Text style={styles.photoButtonText}>{t(`${diNS}.photosSection.takePhoto`)}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto Trasera */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>{t(`${diNS}.photosSection.backTitle`)}</Text>
          {licensePhotoBack ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: licensePhotoBack }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setLicensePhotoBack)}
              >
                <Text style={styles.retakeButtonText}>{t(`${diNS}.photosSection.retakePhoto`)}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setLicensePhotoBack)}
            >
              <Text style={styles.photoButtonText}>{t(`${diNS}.photosSection.takePhoto`)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.noticeContainer}>
        <Text style={styles.noticeText}>
          {t(`${diNS}.notice.text`)}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <LoadingIcon size={32} color={colors.primary} />
          <Text style={styles.loadingText}>
            {t(`${diNS}.loading.uploading`, { progress: Math.round(uploadProgress * 100) })}
          </Text>
        </View>
      ) : documentsVerified ? (
        <View style={styles.verifiedNotice}>
          <Text style={styles.verifiedNoticeText}>{t(`${diNS}.verified.title`)}</Text>
          <Text style={styles.verifiedNoticeSubtitle}>{t(`${diNS}.verified.subtitle`)}</Text>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.submitButton, !allDataProvided && styles.submitButtonDisabled]}
          onPress={uploadDocumentsAndContinue}
          disabled={!allDataProvided}
        >
          <Text style={styles.submitButtonText}>
            {allDataProvided
              ? t(`${diNS}.buttons.save`)
              : t(`${diNS}.buttons.missingData`)}
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
