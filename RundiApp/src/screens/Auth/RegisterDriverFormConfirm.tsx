/**
 * Register Confirm Screen
 * Pantalla de confirmación final antes de crear el usuario
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AnimatedCard } from '../../components/ui/AnimatedCard';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import registrationService from '../../services/auth/registrationService';
import driversService from '../../services/driver/driversService';
import vehiclesService from '../../services/driver/vehiclesService';
import supabaseStorage from '../../services/media/storageService';
import { setRegistrationUploadsInProgress } from '../../services/ride/proximityService';
import { AuthStackParamList } from '../../navigation/types';
import { useTranslation } from 'react-i18next';
import { RegisterConfirmSummary } from '../../components/auth/RegisterConfirm/RegisterConfirmSummary';
import { RegisterConfirmActions } from '../../components/auth/RegisterConfirm/RegisterConfirmActions';

type RegisterConfirmNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'RegisterConfirm'
>;
type RegisterConfirmRouteProp = RouteProp<AuthStackParamList, 'RegisterConfirm'>;

interface Props {
  navigation: RegisterConfirmNavigationProp;
  route: RegisterConfirmRouteProp;
}

export default function RegisterConfirmScreen({ navigation, route }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const readableGold = isDark ? '#E8C46A' : '#76520F';
  const { user, login, registerWithGoogle, loginWithPhoneAndSMS } = useAuth();
  const { t } = useTranslation();

  const {
    name,
    email,
    phone,
    password,
    role,
    method,
    authProvider,
    phoneVerified,
    emailVerified,
    driverData,
    vehicleData,
    googleIdToken,
    context,
  } = route.params;

  const [loading, setLoading] = useState(false);
  const [createdUserResult, setCreatedUserResult] = useState<any | null>(null);

  const shouldUploadUri = (uri: unknown): uri is string => {
    if (!uri || typeof uri !== 'string') {
      return false;
    }

    const normalized = uri.trim();
    return (
      normalized.startsWith('file://') ||
      normalized.startsWith('file:/') ||
      normalized.startsWith('content://')
    );
  };

  const isPreviewableUri = (uri: unknown): uri is string => {
    return typeof uri === 'string' && uri.trim().length > 0;
  };

  const driverPhotoPreviews = useMemo(() => {
    if (role !== 'driver' || !driverData) return [];

    const entries: { key: string; label: string; uri: string }[] = [];
    if (isPreviewableUri(driverData.profilePhoto)) {
      entries.push({
        key: 'profile',
        label: t('authScreens.registerConfirm.photos.profile', { defaultValue: 'Foto de perfil' }),
        uri: driverData.profilePhoto,
      });
    }
    if (isPreviewableUri(driverData.licensePhotoFront)) {
      entries.push({
        key: 'licenseFront',
        label: t('authScreens.registerConfirm.photos.licenseFront', {
          defaultValue: 'Licencia (frente)',
        }),
        uri: driverData.licensePhotoFront,
      });
    }
    if (isPreviewableUri(driverData.licensePhotoBack)) {
      entries.push({
        key: 'licenseBack',
        label: t('authScreens.registerConfirm.photos.licenseBack', {
          defaultValue: 'Licencia (reverso)',
        }),
        uri: driverData.licensePhotoBack,
      });
    }
    return entries;
  }, [driverData, role, t]);

  const vehiclePhotoPreviews = useMemo(() => {
    if (role !== 'driver' || !vehicleData) return [];

    const entries: { key: string; label: string; uri: string }[] = [];
    if (isPreviewableUri(vehicleData.insurancePhoto)) {
      entries.push({
        key: 'insurance',
        label: t('authScreens.registerConfirm.photos.insurance', {
          defaultValue: 'Póliza / seguro',
        }),
        uri: vehicleData.insurancePhoto,
      });
    }
    if (isPreviewableUri(vehicleData.vehiclePhoto)) {
      entries.push({
        key: 'vehicle',
        label: t('authScreens.registerConfirm.photos.vehicle', { defaultValue: 'Foto del vehículo' }),
        uri: vehicleData.vehiclePhoto,
      });
    }
    if (isPreviewableUri(vehicleData.registrationPhotoFront)) {
      entries.push({
        key: 'registrationFront',
        label: t('authScreens.registerConfirm.photos.registrationFront', {
          defaultValue: 'Circulación (frente)',
        }),
        uri: vehicleData.registrationPhotoFront,
      });
    }
    if (isPreviewableUri(vehicleData.registrationPhotoBack)) {
      entries.push({
        key: 'registrationBack',
        label: t('authScreens.registerConfirm.photos.registrationBack', {
          defaultValue: 'Circulación (reverso)',
        }),
        uri: vehicleData.registrationPhotoBack,
      });
    }
    return entries;
  }, [vehicleData, role, t]);

  const uploadAndPersistDriverPhotos = async (userId: string) => {
    if (role !== 'driver') {
      return;
    }

    const localDriverData: any = driverData || {};
    const localVehicleData: any = vehicleData || {};

    const uploadErrors: string[] = [];

    const driverUpdates: any = {};

    try {
      console.log('📸 [RegisterConfirm] Driver photo URIs:', {
        profilePhoto: localDriverData.profilePhoto,
        licensePhotoFront: localDriverData.licensePhotoFront,
        licensePhotoBack: localDriverData.licensePhotoBack,
      });
      console.log('📸 [RegisterConfirm] Vehicle photo URIs:', {
        insurancePhoto: localVehicleData.insurancePhoto,
        registrationPhotoFront: localVehicleData.registrationPhotoFront,
        registrationPhotoBack: localVehicleData.registrationPhotoBack,
        vehiclePhoto: localVehicleData.vehiclePhoto,
      });

      if (localDriverData.licenseNumber) {
        driverUpdates.license_number = localDriverData.licenseNumber;
      }
      if (localDriverData.licenseExpiry) {
        driverUpdates.license_expiry = localDriverData.licenseExpiry;
      }

      if (localDriverData.department) {
        driverUpdates.department = localDriverData.department;
      }
      if (localDriverData.municipality) {
        driverUpdates.municipality = localDriverData.municipality;
      }

      if (Object.keys(driverUpdates).length > 0) {
        console.log('📝 [RegisterConfirm] Actualizando driver en backend (updateDriver):', Object.keys(driverUpdates));
        await driversService.updateDriver(driverUpdates);
        console.log('✅ [RegisterConfirm] updateDriver (datos de licencia/ubicación) completado');
      }

      if (shouldUploadUri(localDriverData.profilePhoto)) {
        try {
          console.log('📤 [RegisterConfirm] Subiendo profilePhoto...');
          const url = await supabaseStorage.uploadProfilePhoto(userId, localDriverData.profilePhoto);
          await driversService.updateDriver({ profile_photo: url });
        } catch (error) {
          console.warn('⚠️ [RegisterConfirm] Error subiendo profilePhoto:', error);
          uploadErrors.push('profilePhoto');
        }
      }
      if (
        localDriverData.licensePhotoFront &&
        typeof localDriverData.licensePhotoFront === 'string' &&
        shouldUploadUri(localDriverData.licensePhotoFront)
      ) {
        try {
          console.log('📤 [RegisterConfirm] Subiendo licensePhotoFront...');
          const url = await supabaseStorage.uploadLicensePhoto(userId, localDriverData.licensePhotoFront, 'front');
          await driversService.updateDriver({ license_photo_front: url });
        } catch (error) {
          console.warn('⚠️ [RegisterConfirm] Error subiendo licensePhotoFront:', error);
          uploadErrors.push('licensePhotoFront');
        }
      }
      if (
        localDriverData.licensePhotoBack &&
        typeof localDriverData.licensePhotoBack === 'string' &&
        shouldUploadUri(localDriverData.licensePhotoBack)
      ) {
        try {
          console.log('📤 [RegisterConfirm] Subiendo licensePhotoBack...');
          const url = await supabaseStorage.uploadLicensePhoto(userId, localDriverData.licensePhotoBack, 'back');
          await driversService.updateDriver({ license_photo_back: url });
        } catch (error) {
          console.warn('⚠️ [RegisterConfirm] Error subiendo licensePhotoBack:', error);
          uploadErrors.push('licensePhotoBack');
        }
      }

      const hasAnyVehiclePhotoToUpload =
        (typeof localVehicleData.insurancePhoto === 'string' && shouldUploadUri(localVehicleData.insurancePhoto)) ||
        (typeof localVehicleData.registrationPhotoFront === 'string' &&
          shouldUploadUri(localVehicleData.registrationPhotoFront)) ||
        (typeof localVehicleData.registrationPhotoBack === 'string' &&
          shouldUploadUri(localVehicleData.registrationPhotoBack)) ||
        (typeof localVehicleData.vehiclePhoto === 'string' &&
          shouldUploadUri(localVehicleData.vehiclePhoto));

      // Docs periódicos sin foto (inspección/emisiones/rodante/revisado):
      // fechas capturadas en el formulario que van por compliance.
      const hasAnyPeriodicDoc = Boolean(
        localVehicleData.inspectionDate ||
          localVehicleData.inspectionValidUntil ||
          localVehicleData.emissionsTestedAt ||
          localVehicleData.emissionsValidUntil ||
          localVehicleData.roadTaxPaidAt ||
          localVehicleData.roadTaxReceiptNumber ||
          localVehicleData.revisadoValidUntil,
      );

      if (hasAnyVehiclePhotoToUpload || hasAnyPeriodicDoc) {
        let vehicles: any[] = [];
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`🚗 [RegisterConfirm] Buscando vehículos (intento ${attempt}/3)...`);
            vehicles = await vehiclesService.getDriverVehicles();
            if (vehicles && vehicles.length > 0) {
              break;
            }
          } catch (err) {
            console.warn(`⚠️ [RegisterConfirm] Error obteniendo vehículos (intento ${attempt}/3):`, err);
          }

          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        const vehicleId = vehicles && vehicles.length > 0 ? vehicles[0].id : null;
        if (!vehicleId) {
          console.error('❌ [RegisterConfirm] VEHICLE_NOT_FOUND: no se encontró vehículo para guardar fotos');
          throw new Error('VEHICLE_NOT_FOUND');
        }

        if (
          typeof localVehicleData.insurancePhoto === 'string' &&
          shouldUploadUri(localVehicleData.insurancePhoto)
        ) {
          try {
            console.log('📤 [RegisterConfirm] Subiendo insurancePhoto...');
            const insuranceUrl = await supabaseStorage.uploadInsurancePhoto(userId, localVehicleData.insurancePhoto);
            console.log('📝 [RegisterConfirm] Actualizando vehículo con insurance_photo:', vehicleId);
            await vehiclesService.updateVehicle(vehicleId, {
              insurance_photo: insuranceUrl,
              insurance_number: localVehicleData.insuranceNumber,
              insurance_company: localVehicleData.insuranceCompany,
              insurance_expiry: localVehicleData.insuranceExpiry,
              vin: localVehicleData.vin,
              motor: localVehicleData.motor,
              chasis: localVehicleData.chasis,
            });
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error subiendo/persistiendo insurancePhoto:', error);
            uploadErrors.push('insurancePhoto');
          }
        }

        // Frente y reverso en UN solo doc de circulación (submitNewCurrent
        // crea una versión nueva por llamada — dos llamadas dejarían la
        // vigente con una sola cara).
        let regFrontUrl: string | null = null;
        let regBackUrl: string | null = null;

        if (
          typeof localVehicleData.registrationPhotoFront === 'string' &&
          shouldUploadUri(localVehicleData.registrationPhotoFront)
        ) {
          try {
            console.log('📤 [RegisterConfirm] Subiendo registrationPhotoFront...');
            regFrontUrl = await supabaseStorage.uploadRegistrationPhoto(userId, localVehicleData.registrationPhotoFront, 'front');
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error subiendo registrationPhotoFront:', error);
            uploadErrors.push('registrationPhotoFront');
          }
        }

        if (
          typeof localVehicleData.registrationPhotoBack === 'string' &&
          shouldUploadUri(localVehicleData.registrationPhotoBack)
        ) {
          try {
            console.log('📤 [RegisterConfirm] Subiendo registrationPhotoBack...');
            regBackUrl = await supabaseStorage.uploadRegistrationPhoto(userId, localVehicleData.registrationPhotoBack, 'back');
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error subiendo registrationPhotoBack:', error);
            uploadErrors.push('registrationPhotoBack');
          }
        }

        if (regFrontUrl || regBackUrl) {
          try {
            console.log('📝 [RegisterConfirm] Guardando doc de circulación:', vehicleId);
            await vehiclesService.updateVehicle(vehicleId, {
              registration_photo_front: regFrontUrl,
              registration_photo_back: regBackUrl,
              registration_number: localVehicleData.registrationNumber,
              emission_date: localVehicleData.emissionDate,
            });
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error persistiendo doc de circulación:', error);
            uploadErrors.push('registrationPhotos');
          }
        }

        // Foto del vehículo: columna vehicles.vehicle_photo (no es doc de
        // compliance — va por PATCH normal).
        if (
          typeof localVehicleData.vehiclePhoto === 'string' &&
          shouldUploadUri(localVehicleData.vehiclePhoto)
        ) {
          try {
            console.log('📤 [RegisterConfirm] Subiendo vehiclePhoto...');
            const vehiclePhotoUrl = await supabaseStorage.uploadDriverVehiclePhoto(
              userId,
              localVehicleData.vehiclePhoto,
            );
            console.log('📝 [RegisterConfirm] Actualizando vehículo con vehicle_photo:', vehicleId);
            await vehiclesService.updateVehicle(vehicleId, {
              vehicle_photo: vehiclePhotoUrl,
            });
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error subiendo/persistiendo vehiclePhoto:', error);
            uploadErrors.push('vehiclePhoto');
          }
        }

        if (hasAnyPeriodicDoc) {
          try {
            console.log('📝 [RegisterConfirm] Enviando docs periódicos del vehículo:', vehicleId);
            await vehiclesService.submitPeriodicDocuments(vehicleId, localVehicleData);
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error enviando docs periódicos:', error);
          }
        }
      }

      if (uploadErrors.length > 0) {
        throw new Error(`PHOTO_UPLOAD_FAILED:${uploadErrors.join(',')}`);
      }
    } finally {
      // Limpieza del flag se hace en handleConfirmAndRegister
    }
  };

  const handleConfirmAndRegister = async () => {
    if (!phoneVerified && !emailVerified) {
      Alert.alert('Verificación requerida', 'Verifica tu teléfono o tu correo antes de continuar.');
      return;
    }

    let uploadsFlagSet = false;

    try {
      setLoading(true);

      // 🚧 Gate: bloquear overlay/tracking antes de cualquier navegación/login
      if (role === 'driver' && !uploadsFlagSet) {
        try {
          console.log('⏳ [RegisterConfirm] (pre) Marcando uploadsInProgress=true');
          await setRegistrationUploadsInProgress(true);
          uploadsFlagSet = true;
        } catch (e) {
          console.warn('⚠️ [RegisterConfirm] No se pudo marcar uploadsInProgress al inicio:', e);
        }
      }

      const driverDataForApi = driverData
        ? (({ profilePhoto, licensePhotoFront, licensePhotoBack, ...rest }) => rest)(driverData)
        : undefined;
      const vehicleDataForApi = vehicleData
        ? (({ insurancePhoto, registrationPhotoFront, registrationPhotoBack, vehiclePhoto, ...rest }) => rest)(
            vehicleData,
          )
        : undefined;

      if (context === 'register_upgrade_driver') {
        console.log('📝 Iniciando upgrade de cliente a conductor...');

        if (!driverData || !vehicleData) {
          throw new Error('MISSING_DRIVER_DATA');
        }

        const result = await registrationService.upgradeClientToDriver(driverDataForApi, vehicleDataForApi);

        console.log('✅ Upgrade cliente→conductor completado:', result);

        const effectiveUserId = user?.id;
        if (!effectiveUserId) {
          throw new Error('NOT_AUTHENTICATED');
        }

        await uploadAndPersistDriverPhotos(effectiveUserId);

        Alert.alert(
          t('authScreens.registerConfirm.alerts.upgradeSuccessTitle'),
          t('authScreens.registerConfirm.alerts.upgradeSuccessMessage'),
        );

        navigation.goBack();
        return;
      }

      console.log('📝 Creando usuario...');

      // Crear usuario
      const safeEmail = email?.trim() || '';

      const result =
        createdUserResult ||
        (await registrationService.createUser({
          name,
          email: safeEmail,
          phone,
          password,
          role,
          method,
          authProvider,
          phoneVerified,
          emailVerified,
          driverData: driverDataForApi,
          vehicleData: vehicleDataForApi,
          googleIdToken,
        }));

      if (!createdUserResult) {
        setCreatedUserResult(result);
      }

      console.log('✅ Usuario creado:', result);

      // Hacer login automático
      if (authProvider === 'google') {
        await registerWithGoogle(result);
      } else if (authProvider === 'phone') {
        await loginWithPhoneAndSMS(
          {
            ...result.user,
            phone,
          },
          result.token,
        );
      } else {
        if (!safeEmail || !password) {
          throw new Error('EMAIL_PASSWORD_REQUIRED');
        }
        await login(safeEmail, password);
      }

      const effectiveUserId = result?.user?.userId || result?.user?.uid || result?.user?.id;
      if (effectiveUserId) {
        await uploadAndPersistDriverPhotos(effectiveUserId);
      }

      Alert.alert(
        t('authScreens.registerConfirm.alerts.registerSuccessTitle'),
        role === 'driver'
          ? t('authScreens.registerConfirm.alerts.registerSuccessMessageDriver')
          : t('authScreens.registerConfirm.alerts.registerSuccessMessageClient'),
      );

      // Redirigir a HomeScreen
      if (role !== 'driver') {
        navigation.reset({ index: 0, routes: [{ name: 'Login' as never }] });
      }
    } catch (error: any) {
      console.error('Error creando usuario:', error);
      if (error?.message === 'MISSING_DRIVER_DATA') {
        Alert.alert(
          t('authScreens.registerConfirm.alerts.missingDriverDataTitle'),
          t('authScreens.registerConfirm.alerts.missingDriverDataMessage'),
        );
      } else {
        Alert.alert(
          t('authScreens.registerConfirm.alerts.genericErrorTitle'),
          error?.message || t('authScreens.registerConfirm.alerts.genericErrorMessage'),
        );
      }
    } finally {
      if (uploadsFlagSet) {
        try {
          console.log('✅ [RegisterConfirm] Limpiando uploadsInProgress=false');
          await setRegistrationUploadsInProgress(false);
        } catch (e) {
          console.warn('⚠️ [RegisterConfirm] No se pudo limpiar uploadsInProgress:', e);
        }
      }
      setLoading(false);
    }
  };

  /**
   * Regresa siempre al paso anterior. Si RegisterConfirm quedó como raíz
   * del stack (checkpoint reanudado usa `replace`), `goBack` no tiene a
   * dónde ir: se navega al paso lógico previo con `replace`.
   */
  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (role === 'driver') {
      navigation.replace('DriverData', {
        name,
        email,
        phone: phone || '',
        password,
        role: 'driver',
        method,
        authProvider,
        googleIdToken,
        phoneVerified: Boolean(phoneVerified),
        emailVerified,
        driverData,
        vehicleData,
        context,
      });
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('authScreens.registerConfirm.header.title')}</Text>
            <Text style={styles.subtitle}>
              {t('authScreens.registerConfirm.header.subtitle')}
            </Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: '100%' }]} />
              </View>
              <Text style={styles.progressText}>
                {t('authScreens.registerConfirm.progress', { current: 4, total: 4 })}
              </Text>
            </View>
          </View>

          <AnimatedCard delay={0} style={styles.card}>
            <RegisterConfirmSummary
              name={name}
              email={email}
              phone={phone}
              role={role}
              authProvider={authProvider}
              phoneVerified={phoneVerified}
              driverData={driverData}
              vehicleData={vehicleData}
              driverPhotoPreviews={driverPhotoPreviews}
              vehiclePhotoPreviews={vehiclePhotoPreviews}
              colors={colors}
              accentColor={readableGold}
              t={t}
              styles={styles}
            />

            <RegisterConfirmActions
              loading={loading}
              onBack={handleBack}
              onConfirm={handleConfirmAndRegister}
              t={t}
              styles={styles}
              accentColor={readableGold}
            />
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
  summaryContainer: {},
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.35)',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: colors.text,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dataLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginRight: 16,
  },
  dataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
    lineHeight: 19,
  },
  actions: {
    gap: 12,
    marginTop: 24,
  },
  actionButton: {
    borderRadius: 16,
  },
  photoPreviewGroup: {
    marginTop: 16,
  },
  photoPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  photoPreviewCard: {
    width: 108,
    marginRight: 12,
  },
  photoPreviewImage: {
    width: 108,
    height: 76,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoPreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 15,
  },
  photoHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 10,
    lineHeight: 16,
  },
});
