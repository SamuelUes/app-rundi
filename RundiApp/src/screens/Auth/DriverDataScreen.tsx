/**
 * Driver Data Screen
 * Pantalla para que conductores ingresen datos de licencia y vehículo
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { launchCameraSafely } from '../../utils/system/cameraUtils';
import { AnimatedCard } from '../../components/ui/AnimatedCard';
import { AnimatedButton } from '../../components/ui/AnimatedButton';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import registrationService from '../../services/auth/registrationService';
import {
  extractFieldsFromDocument,
  isOcrAvailable,
  type DocumentOcrType,
  type ExtractedDocumentFields,
} from '../../services/media/ocr/documentOcrService';
import { getDepartments, getMunicipalitiesByDepartment } from '../../constants/nicaraguaLocations';
import { AuthStackParamList } from '../../navigation/types';
import { useTranslation } from 'react-i18next';
import { DriverDataLicenseTab } from '../../components/auth/DriverData/DriverDataLicenseTab';
import { DriverDataVehicleTab } from '../../components/auth/DriverData/DriverDataVehicleTab';

type DriverDataNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'DriverData'>;
type DriverDataRouteProp = RouteProp<AuthStackParamList, 'DriverData'>;

interface Props {
  navigation: DriverDataNavigationProp;
  route: DriverDataRouteProp;
}

export default function DriverDataScreen({ navigation, route }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const readableGold = isDark ? '#E8C46A' : '#76520F';
  const { t } = useTranslation();

  const {
    name,
    email,
    phone,
    password,
    method,
    authProvider,
    googleIdToken,
    phoneVerified,
    emailVerified,
    context,
  } = route.params;

  const driverContext: 'register_driver' | 'register_upgrade_driver' =
    context === 'register_upgrade_driver' ? 'register_upgrade_driver' : 'register_driver';

  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<'license' | 'vehicle'>('license');

  // Datos de Licencia
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [department, setDepartment] = useState('');
  const [municipality, setMunicipality] = useState('');

  // Datos del Vehículo
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [type, setType] = useState('sedan');
  const [passengers, setPassengers] = useState('');

  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');

  // Documentos periódicos del vehículo (opcionales en registro; el motor de
  // compliance los exige para operar, así se capturan desde el inicio)
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionValidUntil, setInspectionValidUntil] = useState('');
  const [emissionsTestedAt, setEmissionsTestedAt] = useState('');
  const [emissionsValidUntil, setEmissionsValidUntil] = useState('');
  const [roadTaxPaidAt, setRoadTaxPaidAt] = useState('');
  const [revisadoValidUntil, setRevisadoValidUntil] = useState('');

  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [licensePhotoFront, setLicensePhotoFront] = useState<string | null>(null);
  const [licensePhotoBack, setLicensePhotoBack] = useState<string | null>(null);
  const [insurancePhoto, setInsurancePhoto] = useState<string | null>(null);
  const [registrationPhotoFront, setRegistrationPhotoFront] = useState<string | null>(null);
  const [registrationPhotoBack, setRegistrationPhotoBack] = useState<string | null>(null);

  // OCR on-device: estado de lectura y resumen de campos autocompletados
  const [ocrReading, setOcrReading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  // Los campos manuales quedan colapsados por defecto: la foto es la vía
  // principal. Se expanden solos si el OCR no logró leer nada.
  const [licenseFieldsExpanded, setLicenseFieldsExpanded] = useState(false);
  const [vehicleFieldsExpanded, setVehicleFieldsExpanded] = useState(false);
  // Campos que fueron llenados por OCR: al retomar la foto se actualizan,
  // pero una edición manual del usuario nunca se sobreescribe.
  const ocrFilledRef = useRef<Set<keyof ExtractedDocumentFields>>(new Set());

  // Listas
  const departments_list = getDepartments();
  const municipalities = department ? getMunicipalitiesByDepartment(department) : [];

  // Validar que los datos requeridos estén completos
  const isLicenseComplete =
    licenseNumber &&
    licenseExpiry &&
    department &&
    municipality &&
    profilePhoto &&
    licensePhotoFront &&
    licensePhotoBack;
  const isVehicleComplete =
    plate &&
    brand &&
    model &&
    year &&
    color &&
    type &&
    insurancePhoto &&
    registrationPhotoFront &&
    registrationPhotoBack;
  const isComplete = isLicenseComplete && isVehicleComplete;

  const progressCurrent = 3;
  const progressTotal = 4;

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        try {
          await ImagePicker.requestCameraPermissionsAsync();
        } catch {
          return;
        }
      }
    })();
  }, []);

  // Hidratar borrador desde params o checkpoint
  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const paramsDriverData = route.params?.driverData;
        const paramsVehicleData = route.params?.vehicleData;

        let draftDriver = paramsDriverData;
        let draftVehicle = paramsVehicleData;

        if (!draftDriver || !draftVehicle) {
          try {
            const temp = await registrationService.getTemporaryData();
            draftDriver = draftDriver || temp?.driverData;
            draftVehicle = draftVehicle || temp?.vehicleData;
          } catch (err) {
            console.warn('⚠️ No se pudo hidratar datos de conductor desde checkpoint:', err);
          }
        }

        if (!mounted) return;

        if (draftDriver) {
          setLicenseNumber(draftDriver.licenseNumber || '');
          setLicenseExpiry(draftDriver.licenseExpiry || '');
          setDepartment(draftDriver.department || '');
          setMunicipality(draftDriver.municipality || '');
          setProfilePhoto(draftDriver.profilePhoto || null);
          setLicensePhotoFront(draftDriver.licensePhotoFront || null);
          setLicensePhotoBack(draftDriver.licensePhotoBack || null);
        }

        if (draftVehicle) {
          setPlate(draftVehicle.plate || '');
          setBrand(draftVehicle.brand || '');
          setModel(draftVehicle.model || '');
          setYear(draftVehicle.year ? String(draftVehicle.year) : '');
          setColor(draftVehicle.color || '');
          setType(draftVehicle.type || 'sedan');
          setPassengers(draftVehicle.passengers || '');
          setRegistrationNumber(draftVehicle.registrationNumber || '');
          setRegistrationExpiry(draftVehicle.registrationExpiry || '');
          setInsuranceNumber(draftVehicle.insuranceNumber || '');
          setInsuranceCompany(draftVehicle.insuranceCompany || '');
          setInsuranceExpiry(draftVehicle.insuranceExpiry || '');
          setInsurancePhoto(draftVehicle.insurancePhoto || null);
          setRegistrationPhotoFront(draftVehicle.registrationPhotoFront || null);
          setRegistrationPhotoBack(draftVehicle.registrationPhotoBack || null);
          setInspectionDate(draftVehicle.inspectionDate || '');
          setInspectionValidUntil(draftVehicle.inspectionValidUntil || '');
          setEmissionsTestedAt(draftVehicle.emissionsTestedAt || '');
          setEmissionsValidUntil(draftVehicle.emissionsValidUntil || '');
          setRoadTaxPaidAt(draftVehicle.roadTaxPaidAt || '');
          setRevisadoValidUntil(draftVehicle.revisadoValidUntil || '');
        }
      } finally {
        if (mounted) {
          setHydrated(true);
        }
      }
    };

    hydrate();
    return () => {
      mounted = false;
    };
  }, [route.params]);

  // Guardar borrador en checkpoint cuando los campos cambien (solo flujo register_driver)
  useEffect(() => {
    if (!hydrated || driverContext !== 'register_driver') {
      return;
    }

    const driverDraft: any = {
      ...(licenseNumber ? { licenseNumber } : {}),
      ...(licenseExpiry ? { licenseExpiry } : {}),
      ...(department ? { department } : {}),
      ...(municipality ? { municipality } : {}),
      ...(profilePhoto ? { profilePhoto } : {}),
      ...(licensePhotoFront ? { licensePhotoFront } : {}),
      ...(licensePhotoBack ? { licensePhotoBack } : {}),
    };

    const vehicleDraft: any = {
      ...(plate ? { plate: plate.toUpperCase() } : {}),
      ...(brand ? { brand } : {}),
      ...(model ? { model } : {}),
      ...(year ? { year: parseInt(year, 10) } : {}),
      ...(color ? { color } : {}),
      ...(type ? { type } : {}),
      ...(passengers ? { passengers } : {}),
      ...(registrationNumber ? { registrationNumber } : {}),
      ...(registrationExpiry ? { registrationExpiry } : {}),
      ...(insuranceNumber ? { insuranceNumber } : {}),
      ...(insuranceCompany ? { insuranceCompany } : {}),
      ...(insuranceExpiry ? { insuranceExpiry } : {}),
      ...(insurancePhoto ? { insurancePhoto } : {}),
      ...(registrationPhotoFront ? { registrationPhotoFront } : {}),
      ...(registrationPhotoBack ? { registrationPhotoBack } : {}),
      ...(inspectionDate ? { inspectionDate } : {}),
      ...(inspectionValidUntil ? { inspectionValidUntil } : {}),
      ...(emissionsTestedAt ? { emissionsTestedAt } : {}),
      ...(emissionsValidUntil ? { emissionsValidUntil } : {}),
      ...(roadTaxPaidAt ? { roadTaxPaidAt } : {}),
      ...(revisadoValidUntil ? { revisadoValidUntil } : {}),
    };

    registrationService
      .saveTemporaryData({
        name,
        email,
        phone,
        password,
        role: 'driver',
        method,
        authProvider,
        googleIdToken,
        phoneVerified,
        driverData: Object.keys(driverDraft).length ? driverDraft : undefined,
        vehicleData: Object.keys(vehicleDraft).length ? vehicleDraft : undefined,
        lastStep: 'driverData',
      })
      .catch((err) => {
        console.warn('⚠️ No se pudo guardar borrador de datos de conductor:', err);
      });
  }, [
    hydrated,
    driverContext,
    name,
    email,
    phone,
    password,
    method,
    authProvider,
    googleIdToken,
    phoneVerified,
    licenseNumber,
    licenseExpiry,
    department,
    municipality,
    profilePhoto,
    licensePhotoFront,
    licensePhotoBack,
    plate,
    brand,
    model,
    year,
    color,
    type,
    passengers,
    registrationNumber,
    registrationExpiry,
    insuranceNumber,
    insuranceCompany,
    insuranceExpiry,
    insurancePhoto,
    registrationPhotoFront,
    registrationPhotoBack,
    inspectionDate,
    inspectionValidUntil,
    emissionsTestedAt,
    emissionsValidUntil,
    roadTaxPaidAt,
    revisadoValidUntil,
  ]);

  /**
   * Corre OCR sobre la foto recién tomada y llena campos vacíos o campos
   * que el propio OCR llenó antes (al retomar la foto se actualizan).
   * Nunca pisa un valor que el usuario escribió o corrigió a mano.
   */
  const runDocumentOcr = async (imageUri: string, docType: DocumentOcrType) => {
    if (!isOcrAvailable()) {
      return;
    }
    setOcrReading(true);
    setOcrMessage(null);
    try {
      const { fields } = await extractFieldsFromDocument(imageUri, docType);
      const applied: string[] = [];
      const filledByOcr = ocrFilledRef.current;

      const fill = (
        current: string,
        detected: string | undefined,
        setter: (v: string) => void,
        fieldKey: keyof ExtractedDocumentFields,
      ) => {
        if (!detected) return;
        if (current && !filledByOcr.has(fieldKey)) return; // valor manual
        setter(detected);
        filledByOcr.add(fieldKey);
        applied.push(t(`authScreens.driverData.ocr.fields.${fieldKey}`));
      };

      if (docType === 'license') {
        fill(licenseNumber, fields.licenseNumber, setLicenseNumber, 'licenseNumber');
        fill(licenseExpiry, fields.licenseExpiry, setLicenseExpiry, 'licenseExpiry');
      } else if (docType === 'registration') {
        fill(plate, fields.plate, setPlate, 'plate');
        fill(brand, fields.brand, setBrand, 'brand');
        fill(model, fields.model, setModel, 'model');
        fill(year, fields.year, setYear, 'year');
        fill(color, fields.color, setColor, 'color');
        fill(type, fields.type, setType, 'type');
        fill(passengers, fields.passengers, setPassengers, 'passengers');
        fill(registrationNumber, fields.registrationNumber, setRegistrationNumber, 'registrationNumber');
        fill(registrationExpiry, fields.registrationExpiry, setRegistrationExpiry, 'registrationExpiry');
      } else {
        fill(insuranceNumber, fields.insuranceNumber, setInsuranceNumber, 'insuranceNumber');
        fill(insuranceCompany, fields.insuranceCompany, setInsuranceCompany, 'insuranceCompany');
        fill(insuranceExpiry, fields.insuranceExpiry, setInsuranceExpiry, 'insuranceExpiry');
        // La póliza repite datos del vehículo (placa, marca, tipo)
        fill(plate, fields.plate, setPlate, 'plate');
        fill(brand, fields.brand, setBrand, 'brand');
        fill(type, fields.type, setType, 'type');
      }

      setOcrMessage(
        applied.length > 0
          ? t('authScreens.driverData.ocr.detected', { fields: applied.join(', ') })
          : t('authScreens.driverData.ocr.notDetected'),
      );
      if (applied.length === 0) {
        // OCR no leyó nada útil: abrir los campos para llenado manual
        if (docType === 'license') {
          setLicenseFieldsExpanded(true);
        } else {
          setVehicleFieldsExpanded(true);
        }
      }
    } catch (err) {
      console.warn('⚠️ OCR de documento falló:', err);
      setOcrMessage(t('authScreens.driverData.ocr.notDetected'));
      if (docType === 'license') {
        setLicenseFieldsExpanded(true);
      } else {
        setVehicleFieldsExpanded(true);
      }
    } finally {
      setOcrReading(false);
    }
  };

  /**
   * Edición manual de un campo: lo saca del set de "llenado por OCR" para
   * que retomar la foto no sobreescriba la corrección del usuario.
   */
  const manualEdit =
    (key: keyof ExtractedDocumentFields, setter: (v: string) => void) =>
    (v: string) => {
      ocrFilledRef.current.delete(key);
      setter(v);
    };

  const capturePhoto = async (
    source: 'camera' | 'gallery',
    setPhotoFunction: React.Dispatch<React.SetStateAction<string | null>>,
    ocrDocType?: DocumentOcrType,
  ) => {
    try {
      const options = { allowsEditing: true, aspect: [4, 3] as [number, number], quality: 0.9 };
      let result: ImagePicker.ImagePickerResult | null;

      if (source === 'gallery') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            t('common.components.photoUploadField.alerts.permissionDeniedTitle'),
            t('common.components.photoUploadField.alerts.galleryPermission'),
          );
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          ...options,
        });
      } else {
        result = await launchCameraSafely(options);
      }

      if (result && !result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setPhotoFunction(uri);
        if (ocrDocType) {
          void runDocumentOcr(uri, ocrDocType);
        }
      }
    } catch (error) {
      Alert.alert(t('authScreens.driverData.alerts.errorTitle'), t('authScreens.driverData.alerts.saveFailed'));
      console.error('Error al obtener foto:', error);
    }
  };

  const takePhoto = (
    setPhotoFunction: React.Dispatch<React.SetStateAction<string | null>>,
    ocrDocType?: DocumentOcrType,
  ) => {
    Alert.alert(
      t('common.components.photoUploadField.options.title'),
      t('common.components.photoUploadField.options.message'),
      [
        { text: t('common.components.photoUploadField.options.cancel'), style: 'cancel' },
        {
          text: t('common.components.photoUploadField.options.gallery'),
          onPress: () => void capturePhoto('gallery', setPhotoFunction, ocrDocType),
        },
        {
          text: t('common.components.photoUploadField.options.camera'),
          onPress: () => void capturePhoto('camera', setPhotoFunction, ocrDocType),
        },
      ],
    );
  };

  /**
   * Regresa siempre al paso anterior. Si DriverData quedó como raíz del
   * stack (checkpoint reanudado usa `replace`), `goBack` no tiene a dónde
   * ir: se navega al paso lógico previo con `replace`.
   */
  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (driverContext === 'register_upgrade_driver') {
      // El upgrade vive en ClientStack: el paso previo es la pantalla de ajustes.
      (navigation as any).replace('Settings');
      return;
    }

    navigation.replace('RoleSelection', {
      name,
      email,
      phone,
      password,
      method,
      authProvider,
      googleIdToken,
      phoneVerified,
      emailVerified,
    });
  };

  const isValidDateString = (value: string) => {
    if (!value) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [yearStr, monthStr, dayStr] = value.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  };

  const handleContinue = async () => {
    if (!isComplete) {
      Alert.alert(
        t('authScreens.driverData.alerts.errorTitle'),
        t('authScreens.driverData.alerts.incomplete'),
      );
      return;
    }

    // Validar fechas para evitar errores 400 en backend (ej. 2222-22-22)
    const invalidDates: string[] = [];
    if (licenseExpiry && !isValidDateString(licenseExpiry)) {
      invalidDates.push(t('authScreens.driverData.license.expiryPlaceholder'));
    }
    if (registrationExpiry && !isValidDateString(registrationExpiry)) {
      invalidDates.push(t('authScreens.driverData.vehicle.registrationExpiryPlaceholder'));
    }
    if (insuranceExpiry && !isValidDateString(insuranceExpiry)) {
      invalidDates.push(t('authScreens.driverData.vehicle.insuranceExpiryPlaceholder'));
    }
    if (invalidDates.length > 0) {
      Alert.alert(
        t('authScreens.driverData.alerts.errorTitle'),
        `${t('authScreens.driverData.alerts.incomplete')}\n\n${invalidDates.join('\n')}`,
      );
      return;
    }

    setLoading(true);
    try {
      console.log('💾 Guardando datos del conductor...');

      // Guardar datos temporales solo para flujo de registro inicial
      if (driverContext === 'register_driver') {
        await registrationService.saveTemporaryData({
          name,
          email,
          phone,
          password,
          role: 'driver',
          method,
          authProvider,
          phoneVerified,
          driverData: {
            licenseNumber,
            licenseExpiry,
            department,
            municipality,
            profilePhoto: profilePhoto || undefined,
            licensePhotoFront: licensePhotoFront || undefined,
            licensePhotoBack: licensePhotoBack || undefined,
          },
          vehicleData: {
            plate: plate.toUpperCase(),
            brand,
            model,
            year: parseInt(year, 10),
            color,
            type: type as 'sedan' | 'suv' | 'van' | 'moto',
            passengers: passengers || undefined,
            registrationNumber: registrationNumber || undefined,
            registrationExpiry: registrationExpiry || undefined,
            insuranceNumber: insuranceNumber || undefined,
            insuranceCompany: insuranceCompany || undefined,
            insuranceExpiry: insuranceExpiry || undefined,
            insurancePhoto: insurancePhoto || undefined,
            registrationPhotoFront: registrationPhotoFront || undefined,
            registrationPhotoBack: registrationPhotoBack || undefined,
            inspectionDate: inspectionDate || undefined,
            inspectionValidUntil: inspectionValidUntil || undefined,
            emissionsTestedAt: emissionsTestedAt || undefined,
            emissionsValidUntil: emissionsValidUntil || undefined,
            roadTaxPaidAt: roadTaxPaidAt || undefined,
            revisadoValidUntil: revisadoValidUntil || undefined,
          },
          googleIdToken,
          emailVerified,
          lastStep: 'driverData',
        });

        console.log('✅ Datos guardados');
      }

      // Navegar a pantalla de confirmación
      
      navigation.navigate('RegisterConfirm', {
        name,
        email,
        phone,
        password,
        role: 'driver',
        method,
        authProvider,
        googleIdToken,
        phoneVerified,
        emailVerified,
        driverData: {
          licenseNumber,
          licenseExpiry,
          department,
          municipality,
          profilePhoto: profilePhoto || undefined,
          licensePhotoFront: licensePhotoFront || undefined,
          licensePhotoBack: licensePhotoBack || undefined,
        },
        vehicleData: {
          plate: plate.toUpperCase(),
          brand,
          model,
          year: parseInt(year, 10),
          color,
          type: type as 'sedan' | 'suv' | 'van' | 'moto',
          passengers: passengers || undefined,
          registrationNumber: registrationNumber || undefined,
          registrationExpiry: registrationExpiry || undefined,
          insuranceNumber: insuranceNumber || undefined,
          insuranceCompany: insuranceCompany || undefined,
          insuranceExpiry: insuranceExpiry || undefined,
          insurancePhoto: insurancePhoto || undefined,
          registrationPhotoFront: registrationPhotoFront || undefined,
          registrationPhotoBack: registrationPhotoBack || undefined,
          inspectionDate: inspectionDate || undefined,
          inspectionValidUntil: inspectionValidUntil || undefined,
          emissionsTestedAt: emissionsTestedAt || undefined,
          emissionsValidUntil: emissionsValidUntil || undefined,
          roadTaxPaidAt: roadTaxPaidAt || undefined,
          revisadoValidUntil: revisadoValidUntil || undefined,
        },
        context: driverContext,
      });
    } catch (error: any) {
      console.error('Error guardando datos:', error);
      Alert.alert(
        t('authScreens.driverData.alerts.errorTitle'),
        error?.message || t('authScreens.driverData.alerts.saveFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('authScreens.driverData.headerTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {t('authScreens.driverData.headerSubtitle')}
            </Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${(progressCurrent / progressTotal) * 100}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {t('authScreens.driverData.progress', {
                  current: progressCurrent,
                  total: progressTotal,
                })}
              </Text>
            </View>
          </View>

          <AnimatedCard delay={0} style={styles.card}>
            {/* Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'license' && styles.tabActive]}
                onPress={() => setActiveTab('license')}
                accessibilityRole="button"
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name="badge"
                  size={16}
                  color={
                    activeTab === 'license' ? readableGold : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'license' && styles.tabTextActive,
                  ]}
                >
                  {t('authScreens.driverData.tabs.license')}
                </Text>
                {isLicenseComplete ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={15}
                    color={colors.success}
                  />
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'vehicle' && styles.tabActive]}
                onPress={() => setActiveTab('vehicle')}
                accessibilityRole="button"
                activeOpacity={0.8}
              >
                <Ionicons
                  name="car-sport-outline"
                  size={16}
                  color={
                    activeTab === 'vehicle' ? readableGold : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === 'vehicle' && styles.tabTextActive,
                  ]}
                >
                  {t('authScreens.driverData.tabs.vehicle')}
                </Text>
                {isVehicleComplete ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={15}
                    color={colors.success}
                  />
                ) : null}
              </TouchableOpacity>
            </View>

          {/* Contenido por Tab */}
          {activeTab === 'license' ? (
            <DriverDataLicenseTab
              licenseNumber={licenseNumber}
              licenseExpiry={licenseExpiry}
              department={department}
              municipality={municipality}
              profilePhoto={profilePhoto}
              licensePhotoFront={licensePhotoFront}
              licensePhotoBack={licensePhotoBack}
              loading={loading}
              departmentsList={departments_list}
              municipalities={municipalities}
              colors={colors}
              onSetLicenseNumber={manualEdit('licenseNumber', setLicenseNumber)}
              onSetLicenseExpiry={manualEdit('licenseExpiry', setLicenseExpiry)}
              onSetDepartment={setDepartment}
              onSetMunicipality={setMunicipality}
              onTakeProfilePhoto={() => takePhoto(setProfilePhoto)}
              onTakeLicensePhotoFront={() => takePhoto(setLicensePhotoFront, 'license')}
              onTakeLicensePhotoBack={() => takePhoto(setLicensePhotoBack, 'license')}
              ocrReading={ocrReading}
              ocrMessage={ocrMessage}
              fieldsExpanded={licenseFieldsExpanded}
              onToggleFieldsExpanded={() => setLicenseFieldsExpanded((v) => !v)}
              styles={styles}
              t={t}
            />
          ) : (
            <DriverDataVehicleTab
              plate={plate}
              brand={brand}
              model={model}
              year={year}
              color={color}
              type={type}
              passengers={passengers}
              registrationNumber={registrationNumber}
              registrationExpiry={registrationExpiry}
              insuranceNumber={insuranceNumber}
              insuranceCompany={insuranceCompany}
              insuranceExpiry={insuranceExpiry}
              insurancePhoto={insurancePhoto}
              registrationPhotoFront={registrationPhotoFront}
              registrationPhotoBack={registrationPhotoBack}
              loading={loading}
              colors={colors}
              onSetPlate={manualEdit('plate', setPlate)}
              onSetBrand={manualEdit('brand', setBrand)}
              onSetModel={manualEdit('model', setModel)}
              onSetYear={manualEdit('year', setYear)}
              onSetColor={manualEdit('color', setColor)}
              onSetType={manualEdit('type', setType)}
              onSetPassengers={manualEdit('passengers', setPassengers)}
              onSetRegistrationNumber={manualEdit('registrationNumber', setRegistrationNumber)}
              onSetRegistrationExpiry={manualEdit('registrationExpiry', setRegistrationExpiry)}
              onSetInsuranceNumber={manualEdit('insuranceNumber', setInsuranceNumber)}
              onSetInsuranceCompany={manualEdit('insuranceCompany', setInsuranceCompany)}
              onSetInsuranceExpiry={manualEdit('insuranceExpiry', setInsuranceExpiry)}
              inspectionDate={inspectionDate}
              inspectionValidUntil={inspectionValidUntil}
              emissionsTestedAt={emissionsTestedAt}
              emissionsValidUntil={emissionsValidUntil}
              roadTaxPaidAt={roadTaxPaidAt}
              revisadoValidUntil={revisadoValidUntil}
              onSetInspectionDate={setInspectionDate}
              onSetInspectionValidUntil={setInspectionValidUntil}
              onSetEmissionsTestedAt={setEmissionsTestedAt}
              onSetEmissionsValidUntil={setEmissionsValidUntil}
              onSetRoadTaxPaidAt={setRoadTaxPaidAt}
              onSetRevisadoValidUntil={setRevisadoValidUntil}
              onTakeInsurancePhoto={() => takePhoto(setInsurancePhoto, 'insurance')}
              onTakeRegistrationPhotoFront={() => takePhoto(setRegistrationPhotoFront, 'registration')}
              onTakeRegistrationPhotoBack={() => takePhoto(setRegistrationPhotoBack, 'registration')}
              ocrReading={ocrReading}
              ocrMessage={ocrMessage}
              fieldsExpanded={vehicleFieldsExpanded}
              onToggleFieldsExpanded={() => setVehicleFieldsExpanded((v) => !v)}
              styles={styles}
              t={t}
            />
          )}

            {/* Acciones */}
            <View style={styles.actions}>
              <AnimatedButton
                title={t('authScreens.driverData.buttons.continue')}
                onPress={handleContinue}
                size="large"
                iconName="arrow-forward"
                loading={loading}
                disabled={!isComplete}
                style={styles.actionButton}
              />
              <AnimatedButton
                title={t('authScreens.driverData.buttons.back')}
                onPress={handleBack}
                size="large"
                variant="outline"
                iconName="arrow-back"
                color={readableGold}
                disabled={loading}
                style={styles.actionButton}
              />
            </View>
          </AnimatedCard>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 20,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: isDark ? '#E8C46A' : '#76520F',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 26,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 999,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 999,
    gap: 6,
  },
  tabActive: {
    backgroundColor: 'rgba(241, 200, 123, 0.2)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: isDark ? '#E8C46A' : '#76520F',
  },
  section: {},
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: colors.text,
    marginBottom: 14,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  pickerContainer: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text,
  },
  infoBox: {
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actions: {
    gap: 12,
    marginTop: 14,
  },
  actionButton: {
    borderRadius: 22,
  },
  photoSection: {
    marginTop: 8,
  },
  ocrStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  expandFieldsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 175, 55, 0.5)',
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
    marginBottom: 16,
  },
  expandFieldsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandFieldsText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  photoContainer: {
    marginBottom: 14,
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  photoTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 175, 55, 0.5)',
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
  },
  photoButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  previewContainer: {},
  photoPreview: {
    width: '100%',
    height: 190,
    borderRadius: 12,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retakeButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
