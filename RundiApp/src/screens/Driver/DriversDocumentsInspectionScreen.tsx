import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Platform,
  TextInput
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import * as ImagePicker from 'expo-image-picker';
import { launchCameraSafely } from '../../utils/system/cameraUtils';
import StorageImage from '../../components/shared/StorageImage';
import supabaseStorage from '../../services/media/storageService';
import driversService from '../../services/driver/driversService';
import complianceService from '../../services/driver/complianceService';

interface DriversDocumentsInspectionProps {
  route: any;
  navigation: any;
}

export default function DriversDocumentsInspectionScreen({ route, navigation }: DriversDocumentsInspectionProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
      const result = await launchCameraSafely({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (result && !result.canceled && result.assets && result.assets.length > 0) {
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

  // Seleccionar foto de la galería
  const pickFromGallery = async (setPhotoFunction: (uri: string) => void) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t(`${diNS}.alerts.permissionTitle`),
          t(`${diNS}.alerts.galleryPermissionMessage`)
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
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
        t(`${diNS}.alerts.galleryErrorMessage`)
      );
      console.error('Error al seleccionar foto:', error);
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
        
        // Subir la foto a Supabase (o conservar la URL si ya estaba en Storage)
        const downloadUrl = /^https?:\/\//.test(photo.uri)
          ? photo.uri
          : await supabaseStorage.uploadLicensePhoto(
              user.id,
              photo.uri,
              photo.type === 'license_front' ? 'front' : 'back'
            );
        
        uploadedUrls[photo.type] = downloadUrl;
        
        totalProgress = (index + 1) / photos.length;
        setUploadProgress(totalProgress);
      }

      // Registrar en el sistema de compliance (crea versión vigente + historial;
      // el backend mantiene las columnas legacy sincronizadas)
      console.log('💾 Registrando licencia en compliance...');
      await complianceService.submitDriverLicense({
        licenseNumber,
        expiryDate: licenseExpiry,
        photoFront: uploadedUrls['license_front'],
        photoBack: uploadedUrls['license_back'],
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

  const photosCompleted = [licensePhotoFront, licensePhotoBack].filter(Boolean).length;
  const allDataProvided = licensePhotoFront && licensePhotoBack && licenseNumber && licenseExpiry;
  const documentsStatusNormalized = (documentsStatus || '').toLowerCase();
  const documentsVerified = documentsStatusNormalized === 'verified' || documentsStatusNormalized === 'active';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t(`${diNS}.header.title`)}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.subtitle}>{t(`${diNS}.header.subtitle`)}</Text>
      </View>
      
      {/* Datos de Licencia */}
      <View style={styles.dataSection}>
        <Text style={styles.sectionTitle}>{t(`${diNS}.licenseSection.title`)}</Text>
        
        <Text style={styles.label}>{t(`${diNS}.licenseSection.numberLabel`)}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={t(`${diNS}.licenseSection.numberPlaceholder`)}
          value={licenseNumber}
          onChangeText={setLicenseNumber}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${diNS}.licenseSection.expiryLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${diNS}.licenseSection.expiryPlaceholder`)}
          value={licenseExpiry}
          onChangeText={setLicenseExpiry}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Fotos de Licencia */}
      <View style={styles.photoSection}>
        <View style={styles.photoSectionHeader}>
          <Text style={styles.sectionTitle}>{t(`${diNS}.photosSection.title`)}</Text>
          <Text style={styles.photoProgress}>{photosCompleted}/2</Text>
        </View>
        
        {/* Foto Frontal */}
        <View style={styles.photoContainer}>
          <View style={styles.photoTitleRow}>
            <Text style={styles.photoTitle}>{t(`${diNS}.photosSection.frontTitle`)}</Text>
            {licensePhotoFront && <MaterialIcons name="check-circle" size={20} color={colors.success} />}
          </View>
          {licensePhotoFront && (
            <StorageImage uri={licensePhotoFront} style={styles.photoPreview} />
          )}
          <View style={styles.photoActionsRow}>
            <TouchableOpacity
              style={[styles.photoActionButton, styles.photoActionButtonPrimary]}
              onPress={() => takePhoto(setLicensePhotoFront)}
            >
              <MaterialIcons name="photo-camera" size={18} color="#fff" />
              <Text style={styles.photoActionButtonPrimaryText}>
                {licensePhotoFront
                  ? t(`${diNS}.photosSection.retakePhoto`)
                  : t(`${diNS}.photosSection.takePhoto`)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.photoActionButton, styles.photoActionButtonSecondary]}
              onPress={() => pickFromGallery(setLicensePhotoFront)}
            >
              <MaterialIcons name="photo-library" size={18} color={colors.primary} />
              <Text style={styles.photoActionButtonSecondaryText}>
                {t(`${diNS}.photosSection.chooseFromGallery`)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Foto Trasera */}
        <View style={styles.photoContainer}>
          <View style={styles.photoTitleRow}>
            <Text style={styles.photoTitle}>{t(`${diNS}.photosSection.backTitle`)}</Text>
            {licensePhotoBack && <MaterialIcons name="check-circle" size={20} color={colors.success} />}
          </View>
          {licensePhotoBack && (
            <StorageImage uri={licensePhotoBack} style={styles.photoPreview} />
          )}
          <View style={styles.photoActionsRow}>
            <TouchableOpacity
              style={[styles.photoActionButton, styles.photoActionButtonPrimary]}
              onPress={() => takePhoto(setLicensePhotoBack)}
            >
              <MaterialIcons name="photo-camera" size={18} color="#fff" />
              <Text style={styles.photoActionButtonPrimaryText}>
                {licensePhotoBack
                  ? t(`${diNS}.photosSection.retakePhoto`)
                  : t(`${diNS}.photosSection.takePhoto`)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.photoActionButton, styles.photoActionButtonSecondary]}
              onPress={() => pickFromGallery(setLicensePhotoBack)}
            >
              <MaterialIcons name="photo-library" size={18} color={colors.primary} />
              <Text style={styles.photoActionButtonSecondaryText}>
                {t(`${diNS}.photosSection.chooseFromGallery`)}
              </Text>
            </TouchableOpacity>
          </View>
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
          <Text style={[styles.submitButtonText, !allDataProvided && styles.submitButtonTextDisabled]}>
            {allDataProvided
              ? t(`${diNS}.buttons.save`)
              : t(`${diNS}.buttons.missingData`)}
          </Text>
        </TouchableOpacity>
      )}
      
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  dataSection: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    padding: 18,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    minHeight: 48,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  photoSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  photoProgress: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  photoContainer: {
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  photoTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.text,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  photoActionButtonPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  photoActionButtonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  photoActionButtonSecondaryText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  noticeContainer: {
    padding: 16,
    marginHorizontal: 16,
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    marginBottom: 16,
  },
  noticeText: {
    color: '#856404',
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    minHeight: 52,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  submitButtonDisabled: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  submitButtonTextDisabled: {
    color: colors.textTertiary,
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
    padding: 18,
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.success,
  },
  verifiedNoticeText: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  verifiedNoticeSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
