/**
 * Driver Data Screen
 * Pantalla para que conductores ingresen datos de licencia y vehículo
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { Picker } from '@react-native-picker/picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import registrationService from '../../services/auth/registrationService';
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [licensePhotoFront, setLicensePhotoFront] = useState<string | null>(null);
  const [licensePhotoBack, setLicensePhotoBack] = useState<string | null>(null);
  const [insurancePhoto, setInsurancePhoto] = useState<string | null>(null);
  const [registrationPhotoFront, setRegistrationPhotoFront] = useState<string | null>(null);
  const [registrationPhotoBack, setRegistrationPhotoBack] = useState<string | null>(null);

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
  ]);

  const takePhoto = async (setPhotoFunction: React.Dispatch<React.SetStateAction<string | null>>) => {
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
      Alert.alert(t('authScreens.driverData.alerts.errorTitle'), t('authScreens.driverData.alerts.saveFailed'));
      console.error('Error al tomar foto:', error);
    }
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

  const formatDate = (text: string, currentValue: string) => {
    const numbers = text.replace(/[^\d]/g, '');

    if (text.length < currentValue.length) {
      return text;
    }

    if (numbers.length <= 4) {
      return numbers;
    } else if (numbers.length <= 6) {
      const year = numbers.slice(0, 4);
      const month = numbers.slice(4, 6);
      return `${year}-${month}`;
    } else {
      const year = numbers.slice(0, 4);
      const month = numbers.slice(4, 6);
      const day = numbers.slice(6, 8);
      return `${year}-${month}-${day}`;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('authScreens.driverData.headerTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {t('authScreens.driverData.headerSubtitle')}
            </Text>
          </View>

          {/* Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'license' && styles.tabActive]}
              onPress={() => setActiveTab('license')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'license' && styles.tabTextActive,
                ]}
              >
                {t('authScreens.driverData.tabs.license')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'vehicle' && styles.tabActive]}
              onPress={() => setActiveTab('vehicle')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'vehicle' && styles.tabTextActive,
                ]}
              >
                {t('authScreens.driverData.tabs.vehicle')}
              </Text>
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
              onSetLicenseNumber={setLicenseNumber}
              onSetLicenseExpiry={setLicenseExpiry}
              onSetDepartment={setDepartment}
              onSetMunicipality={setMunicipality}
              onTakeProfilePhoto={() => takePhoto(setProfilePhoto)}
              onTakeLicensePhotoFront={() => takePhoto(setLicensePhotoFront)}
              onTakeLicensePhotoBack={() => takePhoto(setLicensePhotoBack)}
              formatDate={formatDate}
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
              onSetPlate={setPlate}
              onSetBrand={setBrand}
              onSetModel={setModel}
              onSetYear={setYear}
              onSetColor={setColor}
              onSetType={setType}
              onSetPassengers={setPassengers}
              onSetRegistrationNumber={setRegistrationNumber}
              onSetRegistrationExpiry={setRegistrationExpiry}
              onSetInsuranceNumber={setInsuranceNumber}
              onSetInsuranceCompany={setInsuranceCompany}
              onSetInsuranceExpiry={setInsuranceExpiry}
              onTakeInsurancePhoto={() => takePhoto(setInsurancePhoto)}
              onTakeRegistrationPhotoFront={() => takePhoto(setRegistrationPhotoFront)}
              onTakeRegistrationPhotoBack={() => takePhoto(setRegistrationPhotoBack)}
              formatDate={formatDate}
              styles={styles}
              t={t}
            />
          )}

          {/* Botones */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>
                {t('authScreens.driverData.buttons.back')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.continueButton, !isComplete && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading || !isComplete}
            >
              {loading ? (
                <LoadingIcon size={24} color="#FFFFFF" />
              ) : (
                <Text style={styles.label}>
                  {t('authScreens.driverData.buttons.continue')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Progreso */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '50%' }]} />
          </View>
          <Text style={styles.progressText}>
            {t('authScreens.driverData.progress', { current: 3, total: 4 })}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginBottom: 24,
    marginTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: 'rgba(212, 156, 35, 1)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: 'rgba(212, 156, 35, 1)',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
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
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text,
  },
  infoBox: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  infoText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  backButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  continueButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(201, 149, 36, 1)',
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  progressContainer: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  photoSection: {
    marginTop: 16,
  },
  photoContainer: {
    marginBottom: 16,
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
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retakeButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
