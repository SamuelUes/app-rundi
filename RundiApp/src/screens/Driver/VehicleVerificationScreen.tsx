import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { InsuranceCompanySelectField } from '../../components/shared/InsuranceCompanySelectField';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import * as ImagePicker from 'expo-image-picker';
import { launchCameraSafely } from '../../utils/system/cameraUtils';
import StorageImage from '../../components/shared/StorageImage';
import supabaseStorage from '../../services/media/storageService';
import vehiclesService from '../../services/driver/vehiclesService';
import complianceService from '../../services/driver/complianceService';
import { vehicleVerificationData } from '../../utils/driver/vehicleVerificationData';

interface VehicleVerificationProps {
  route: any;
  navigation: any;
}

export default function VehicleVerificationScreen({ route, navigation }: VehicleVerificationProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const ns = 'driver.VehicleVerificationScreen';
  
  const { vehicleId } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [vehiclePhoto, setVehiclePhoto] = useState<string | null>(null);
  const [registrationPhotoFront, setRegistrationPhotoFront] = useState<string | null>(null);
  const [registrationPhotoBack, setRegistrationPhotoBack] = useState<string | null>(null);
  const [insurancePhoto, setInsurancePhoto] = useState<string | null>(null);
  
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');

  // Documentos periódicos (opcionales aquí; el motor de compliance los exige
  // para operar vehículos nuevos — los antiguos están exentos por transición)
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionValidUntil, setInspectionValidUntil] = useState('');
  const [emissionsTestedAt, setEmissionsTestedAt] = useState('');
  const [emissionsValidUntil, setEmissionsValidUntil] = useState('');
  const [roadTaxPaidAt, setRoadTaxPaidAt] = useState('');
  const [revisadoValidUntil, setRevisadoValidUntil] = useState('');
  const [inspectionPhoto, setInspectionPhoto] = useState<string | null>(null);
  const [emissionsPhoto, setEmissionsPhoto] = useState<string | null>(null);
  const [roadTaxPhoto, setRoadTaxPhoto] = useState<string | null>(null);
  const [revisadoPhoto, setRevisadoPhoto] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState(0);
  const loadedDocumentsRef = useRef<{
    data: ReturnType<typeof vehicleVerificationData>;
    hasCard: boolean;
    hasInsurance: boolean;
  } | null>(null);

  // Solicitar permisos para la cámara
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            t(`${ns}.alerts.permissionTitle`), 
            t(`${ns}.alerts.permissionMessage`)
          );
        }
      }
    })();
  }, []);

  // Cargar datos existentes del vehículo
  useEffect(() => {
    loadedDocumentsRef.current = null;
    const loadVehicleData = async () => {
      try {
        if (!vehicleId) {
          console.log('⚠️ vehicleId no disponible');
          return;
        }

        console.log('🚗 Cargando datos existentes del vehículo:', vehicleId);
        setLoading(true);

        // Obtener vehículos del conductor
        const vehicles = await vehiclesService.getDriverVehicles();
        
        if (!vehicles || vehicles.length === 0) {
          console.warn('⚠️ No hay vehículos disponibles');
          setLoading(false);
          return;
        }
        
        // Buscar el vehículo por ID
        const vehicle = vehicles.find((v: any) => v.id === vehicleId);
        
        if (vehicle) {
          const result = await complianceService.getMyDocuments();
          const docs = result.vehicles.find((item) => item.id === vehicleId)?.documents;
          const data = vehicleVerificationData(vehicle, docs);
          loadedDocumentsRef.current = {
            data,
            hasCard: Boolean(docs?.vehicle_circulation_cards?.length),
            hasInsurance: Boolean(docs?.vehicle_insurance_policies?.some(
              (policy: any) => policy.coverage_type === 'rc_obligatorio',
            )),
          };
          setRegistrationNumber(data.registrationNumber);
          setRegistrationExpiry(data.registrationExpiry);
          setRegistrationPhotoFront(data.registrationPhotoFront || null);
          setRegistrationPhotoBack(data.registrationPhotoBack || null);
          setInsuranceNumber(data.insuranceNumber);
          setInsuranceCompany(data.insuranceCompany);
          setInsuranceExpiry(data.insuranceExpiry);
          setInsurancePhoto(data.insurancePhoto || null);
          setVehiclePhoto(data.vehiclePhoto || null);
        } else {
          console.log('⚠️ Vehículo no encontrado con ID:', vehicleId);
        }

        setLoading(false);
      } catch (error) {
        console.error('❌ Error cargando datos del vehículo:', error);
        setLoading(false);
      }
    };

    loadVehicleData();
  }, [vehicleId]);

  // Verificar si faltan datos y fotos
  const photosCompleted = [vehiclePhoto, registrationPhotoFront, registrationPhotoBack, insurancePhoto]
    .filter(Boolean).length;
  const allDataProvided = vehiclePhoto && registrationPhotoFront && registrationPhotoBack && insurancePhoto && 
                          registrationNumber && registrationExpiry && insuranceNumber && insuranceCompany && insuranceExpiry;
  
  // Tomar foto con la cámara
  const takePhoto = async (setPhotoFunction: React.Dispatch<React.SetStateAction<string | null>>) => {
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
        t(`${ns}.alerts.cameraErrorTitle`),
        t(`${ns}.alerts.cameraErrorMessage`)
      );
      console.error('Error al tomar foto:', error);
    }
  };

  // Seleccionar foto de la galería
  const pickFromGallery = async (setPhotoFunction: React.Dispatch<React.SetStateAction<string | null>>) => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            t(`${ns}.alerts.permissionTitle`),
            t(`${ns}.alerts.galleryPermissionMessage`)
          );
          return;
        }
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
        t(`${ns}.alerts.cameraErrorTitle`),
        t(`${ns}.alerts.galleryErrorMessage`)
      );
      console.error('Error al seleccionar foto:', error);
    }
  };

  // Subir fotos y datos del vehículo
  const uploadVehicleVerification = async () => {
    if (!user || !allDataProvided) {
      Alert.alert(
        t(`${ns}.alerts.missingDataTitle`),
        t(`${ns}.alerts.missingDataMessage`)
      );
      return;
    }

    // Cada documento periódico es opcional, pero si se captura una fecha debe
    // venir el par completo para registrar un documento coherente.
    const partialDocs: string[] = [];
    if ((inspectionDate && !inspectionValidUntil) || (!inspectionDate && inspectionValidUntil)) {
      partialDocs.push(t(`${ns}.periodic.inspectionName`));
    }
    if ((emissionsTestedAt && !emissionsValidUntil) || (!emissionsTestedAt && emissionsValidUntil)) {
      partialDocs.push(t(`${ns}.periodic.emissionsName`));
    }
    if (partialDocs.length > 0) {
      Alert.alert(
        t(`${ns}.alerts.missingDataTitle`),
        `${t(`${ns}.alerts.partialDocsMessage`)}\n\n${partialDocs.join('\n')}`
      );
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      const photos = [
        { uri: vehiclePhoto as string, type: 'vehicle_photo' },
        { uri: registrationPhotoFront as string, type: 'registration_front' },
        { uri: registrationPhotoBack as string, type: 'registration_back' },
        { uri: insurancePhoto as string, type: 'insurance_photo' },
      ];
      // Fotos opcionales de documentos periódicos
      if (inspectionPhoto) photos.push({ uri: inspectionPhoto, type: 'inspection_photo' });
      if (emissionsPhoto) photos.push({ uri: emissionsPhoto, type: 'emissions_photo' });
      if (roadTaxPhoto) photos.push({ uri: roadTaxPhoto, type: 'road_tax_photo' });
      if (revisadoPhoto) photos.push({ uri: revisadoPhoto, type: 'revisado_photo' });

      const uploadedUrls: Record<string, string> = {};
      let totalProgress = 0;

      // Subir cada foto
      for (const [index, photo] of photos.entries()) {
        if (!photo.uri) continue;
        
        totalProgress = index / photos.length;
        setUploadProgress(totalProgress);
        
        // Subir la foto a Supabase
        let downloadUrl: string;

        if (!/^(file:|content:|ph:|assets-library:)/i.test(photo.uri)) {
          // Conservar rutas existentes de Storage; solo se suben archivos locales.
          downloadUrl = photo.uri;
        } else if (photo.type === 'registration_front' || photo.type === 'registration_back') {
          downloadUrl = await supabaseStorage.uploadRegistrationPhoto(
            user.id,
            photo.uri,
            photo.type === 'registration_front' ? 'front' : 'back'
          );
        } else if (photo.type === 'insurance_photo') {
          downloadUrl = await supabaseStorage.uploadInsurancePhoto(user.id, photo.uri);
        } else {
          // vehicle_photo y documentos periódicos - uploadImage genérico
          const timestamp = Date.now();
          const path = `vehicle-documents/vehicles/${user.id}/${photo.type}_${timestamp}.jpg`;
          downloadUrl = await supabaseStorage.uploadImage(photo.uri, 'drivers', path);
        }
        
        uploadedUrls[photo.type] = downloadUrl;
        
        totalProgress = (index + 1) / photos.length;
        setUploadProgress(totalProgress);
      }

      // Registrar en el sistema de compliance (versiones vigentes + historial;
      // el backend mantiene las columnas legacy sincronizadas)
      console.log('💾 Registrando documentos del vehículo en compliance...');
      const loaded = loadedDocumentsRef.current;
      if (!loaded?.hasCard ||
          loaded.data.registrationNumber !== registrationNumber ||
          loaded.data.registrationExpiry !== registrationExpiry ||
          loaded.data.registrationPhotoFront !== uploadedUrls['registration_front'] ||
          loaded.data.registrationPhotoBack !== uploadedUrls['registration_back']) {
        await complianceService.submitVehicleDocument({
          vehicleId,
          documentType: 'circulation_card',
          cardNumber: registrationNumber,
          declaredValidUntil: registrationExpiry,
          documentPath: uploadedUrls['registration_front'],
          documentPathBack: uploadedUrls['registration_back'],
        });
      }

      if (!loaded?.hasInsurance ||
          loaded.data.insuranceNumber !== insuranceNumber ||
          loaded.data.insuranceCompany !== insuranceCompany ||
          loaded.data.insuranceExpiry !== insuranceExpiry ||
          loaded.data.insurancePhoto !== uploadedUrls['insurance_photo']) {
        await complianceService.submitVehicleDocument({
          vehicleId,
          documentType: 'insurance',
          policyNumber: insuranceNumber,
          insurerName: insuranceCompany,
          coverageType: 'rc_obligatorio',
          effectiveUntil: insuranceExpiry,
          documentPath: uploadedUrls['insurance_photo'],
        });
      }

      // Documentos periódicos: se registran solo cuando el conductor capturó
      // las fechas (son opcionales en esta pantalla; el motor decide si son
      // exigibles según el vehículo y la transición).
      if (inspectionDate && inspectionValidUntil) {
        await complianceService.submitVehicleDocument({
          vehicleId,
          documentType: 'inspection',
          inspectedAt: inspectionDate,
          validUntil: inspectionValidUntil,
          result: 'approved',
          documentPath: uploadedUrls['inspection_photo'],
        });
      }
      if (emissionsTestedAt && emissionsValidUntil) {
        await complianceService.submitVehicleDocument({
          vehicleId,
          documentType: 'emissions',
          testedAt: emissionsTestedAt,
          validUntil: emissionsValidUntil,
          result: 'approved',
          documentPath: uploadedUrls['emissions_photo'],
        });
      }
      if (roadTaxPaidAt) {
        await complianceService.submitVehicleDocument({
          vehicleId,
          documentType: 'road_tax',
          paidAt: roadTaxPaidAt,
          taxYear: Number(roadTaxPaidAt.slice(0, 4)) || undefined,
          documentPath: uploadedUrls['road_tax_photo'],
        });
      }
      if (revisadoValidUntil) {
        await complianceService.submitVehicleDocument({
          vehicleId,
          documentType: 'revisado',
          validUntil: revisadoValidUntil,
          stickerYear: Number(revisadoValidUntil.slice(0, 4)) || undefined,
          documentPath: uploadedUrls['revisado_photo'],
        });
      }

      // Foto del vehículo sigue por el endpoint legacy (no es documento de compliance)
      if (uploadedUrls['vehicle_photo']) {
        await vehiclesService.updateVehicle(vehicleId, {
          vehicle_photo: uploadedUrls['vehicle_photo'],
        });
      }

      setLoading(false);
      Alert.alert(
        t(`${ns}.alerts.successTitle`), 
        t(`${ns}.alerts.successMessage`),
        [{ 
          text: t(`${ns}.alerts.successButton`), 
          onPress: () => {
            navigation.goBack();
          }
        }]
      );

    } catch (error) {
      console.error('Error al verificar vehículo:', error);
      setLoading(false);
      Alert.alert(
        t(`${ns}.alerts.uploadErrorTitle`),
        t(`${ns}.alerts.uploadErrorMessage`)
      );
    }
  };

  const renderPhotoCard = (
    title: string,
    photo: string | null,
    setPhoto: React.Dispatch<React.SetStateAction<string | null>>,
  ) => (
    <View style={styles.photoContainer}>
      <View style={styles.photoTitleRow}>
        <Text style={styles.photoTitle}>{title}</Text>
        {photo && <MaterialIcons name="check-circle" size={20} color={colors.success || '#2E7D32'} />}
      </View>
      {photo && <StorageImage uri={photo} style={styles.photoPreview} />}
      <View style={styles.photoActionsRow}>
        <TouchableOpacity
          style={[styles.photoActionButton, styles.photoActionButtonPrimary]}
          onPress={() => takePhoto(setPhoto)}
        >
          <MaterialIcons name="photo-camera" size={18} color="#fff" />
          <Text style={styles.photoActionButtonPrimaryText}>
            {photo ? t(`${ns}.photos.retakePhoto`) : t(`${ns}.photos.takePhoto`)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.photoActionButton, styles.photoActionButtonSecondary]}
          onPress={() => pickFromGallery(setPhoto)}
        >
          <MaterialIcons name="photo-library" size={18} color={colors.primary} />
          <Text style={styles.photoActionButtonSecondaryText}>
            {t(`${ns}.photos.chooseFromGallery`)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
          <Text style={styles.title}>{t(`${ns}.header.title`)}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.subtitle}>{t(`${ns}.header.subtitle`)}</Text>
      </View>
      
      {/* Datos del Vehículo */}
      <View style={styles.dataSection}>
        <Text style={styles.sectionTitle}>{t(`${ns}.form.title`)}</Text>
        
        <Text style={styles.label}>{t(`${ns}.form.registrationNumberLabel`)}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={t(`${ns}.form.registrationNumberPlaceholder`)}
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${ns}.form.registrationExpiryLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${ns}.form.registrationExpiryPlaceholder`)}
          value={registrationExpiry}
          onChangeText={setRegistrationExpiry}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${ns}.form.insuranceNumberLabel`)}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={t(`${ns}.form.insuranceNumberPlaceholder`)}
          value={insuranceNumber}
          onChangeText={setInsuranceNumber}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${ns}.form.insuranceCompanyLabel`)}</Text>
        <InsuranceCompanySelectField
          style={styles.input}
          value={insuranceCompany}
          onChange={setInsuranceCompany}
          placeholder={t(`${ns}.form.insuranceCompanyPlaceholder`)}
        />

        <Text style={styles.label}>{t(`${ns}.form.insuranceExpiryLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${ns}.form.insuranceExpiryPlaceholder`)}
          value={insuranceExpiry}
          onChangeText={setInsuranceExpiry}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Documentos periódicos (opcional; requeridos para operar) */}
      <View style={styles.dataSection}>
        <Text style={styles.sectionTitle}>{t(`${ns}.periodic.title`)}</Text>
        <Text style={styles.periodicHint}>{t(`${ns}.periodic.subtitle`)}</Text>

        <Text style={styles.label}>{t(`${ns}.periodic.inspectionDateLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${ns}.periodic.inspectionDatePlaceholder`)}
          value={inspectionDate}
          onChangeText={setInspectionDate}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${ns}.periodic.inspectionValidUntilLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${ns}.periodic.inspectionValidUntilPlaceholder`)}
          value={inspectionValidUntil}
          onChangeText={setInspectionValidUntil}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${ns}.periodic.emissionsTestedAtLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${ns}.periodic.emissionsTestedAtPlaceholder`)}
          value={emissionsTestedAt}
          onChangeText={setEmissionsTestedAt}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${ns}.periodic.emissionsValidUntilLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${ns}.periodic.emissionsValidUntilPlaceholder`)}
          value={emissionsValidUntil}
          onChangeText={setEmissionsValidUntil}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${ns}.periodic.roadTaxPaidAtLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${ns}.periodic.roadTaxPaidAtPlaceholder`)}
          value={roadTaxPaidAt}
          onChangeText={setRoadTaxPaidAt}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>{t(`${ns}.periodic.revisadoValidUntilLabel`)}</Text>
        <DatePickerField
          style={styles.input}
          placeholder={t(`${ns}.periodic.revisadoValidUntilPlaceholder`)}
          value={revisadoValidUntil}
          onChangeText={setRevisadoValidUntil}
          placeholderTextColor={colors.textSecondary}
        />

        {renderPhotoCard(t(`${ns}.periodic.photoInspection`), inspectionPhoto, setInspectionPhoto)}
        {renderPhotoCard(t(`${ns}.periodic.photoEmissions`), emissionsPhoto, setEmissionsPhoto)}
        {renderPhotoCard(t(`${ns}.periodic.photoRoadTax`), roadTaxPhoto, setRoadTaxPhoto)}
        {renderPhotoCard(t(`${ns}.periodic.photoRevisado`), revisadoPhoto, setRevisadoPhoto)}
      </View>

      {/* Fotos del Vehículo */}
      <View style={styles.photoSection}>
        <View style={styles.photoSectionHeader}>
          <Text style={styles.sectionTitle}>{t(`${ns}.photos.title`)}</Text>
          <Text style={styles.photoProgress}>{photosCompleted}/4</Text>
        </View>

        {renderPhotoCard(t(`${ns}.photos.vehicleTitle`), vehiclePhoto, setVehiclePhoto)}
        {renderPhotoCard(t(`${ns}.photos.registrationFrontTitle`), registrationPhotoFront, setRegistrationPhotoFront)}
        {renderPhotoCard(t(`${ns}.photos.registrationBackTitle`), registrationPhotoBack, setRegistrationPhotoBack)}
        {renderPhotoCard(t(`${ns}.photos.insuranceTitle`), insurancePhoto, setInsurancePhoto)}
      </View>

      <View style={styles.noticeContainer}>
        <Text style={styles.noticeText}>{t(`${ns}.notice.text`)}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <LoadingIcon size={32} color={colors.primary} />
          <Text style={styles.loadingText}>
            {t(`${ns}.loading.verifying`, { progress: Math.round(uploadProgress * 100) })}
          </Text>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.submitButton, !allDataProvided && styles.submitButtonDisabled]}
          onPress={uploadVehicleVerification}
          disabled={!allDataProvided}
        >
          <Text style={[styles.submitButtonText, !allDataProvided && styles.submitButtonTextDisabled]}>
            {allDataProvided
              ? t(`${ns}.buttons.submit`)
              : t(`${ns}.buttons.incomplete`)}
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
  periodicHint: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
    marginTop: -8,
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
    height: 190,
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
});
