/**
 * Register Confirm Screen
 * Pantalla de confirmación final antes de crear el usuario
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { LoadingIcon } from '../../components/LoadingIcon';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import registrationService from '../../services/auth/registrationService';
import driversService from '../../services/driversService';
import vehiclesService from '../../services/vehiclesService';
import supabaseStorage from '../../services/supabaseStorage';
import { setRegistrationUploadsInProgress } from '../../services/proximityService';
import { AuthStackParamList } from '../../navigation/types';
import { useTranslation } from 'react-i18next';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
          shouldUploadUri(localVehicleData.registrationPhotoBack));

      if (hasAnyVehiclePhotoToUpload) {
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
            await vehiclesService.updateVehicle(vehicleId, { insurance_photo: insuranceUrl });
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error subiendo/persistiendo insurancePhoto:', error);
            uploadErrors.push('insurancePhoto');
          }
        }

        if (
          typeof localVehicleData.registrationPhotoFront === 'string' &&
          shouldUploadUri(localVehicleData.registrationPhotoFront)
        ) {
          try {
            console.log('📤 [RegisterConfirm] Subiendo registrationPhotoFront...');
            const url = await supabaseStorage.uploadRegistrationPhoto(userId, localVehicleData.registrationPhotoFront, 'front');
            console.log('📝 [RegisterConfirm] Actualizando vehículo con registration_photo_front:', vehicleId);
            await vehiclesService.updateVehicle(vehicleId, { registration_photo_front: url });
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error subiendo/persistiendo registrationPhotoFront:', error);
            uploadErrors.push('registrationPhotoFront');
          }
        }

        if (
          typeof localVehicleData.registrationPhotoBack === 'string' &&
          shouldUploadUri(localVehicleData.registrationPhotoBack)
        ) {
          try {
            console.log('📤 [RegisterConfirm] Subiendo registrationPhotoBack...');
            const url = await supabaseStorage.uploadRegistrationPhoto(userId, localVehicleData.registrationPhotoBack, 'back');
            console.log('📝 [RegisterConfirm] Actualizando vehículo con registration_photo_back:', vehicleId);
            await vehiclesService.updateVehicle(vehicleId, { registration_photo_back: url });
          } catch (error) {
            console.warn('⚠️ [RegisterConfirm] Error subiendo/persistiendo registrationPhotoBack:', error);
            uploadErrors.push('registrationPhotoBack');
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('authScreens.registerConfirm.header.title')}</Text>
            <Text style={styles.subtitle}>
              {t('authScreens.registerConfirm.header.subtitle')}
            </Text>
          </View>

          {/* Resumen de Datos */}
          <View style={styles.summaryContainer}>
            {/* Datos Básicos */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('authScreens.registerConfirm.sections.basic')}
              </Text>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>
                  {t('authScreens.registerConfirm.data.name')}:
                </Text>
                <Text style={styles.dataValue}>{name}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>
                  {t('authScreens.registerConfirm.data.email')}:
                </Text>
                <Text style={styles.dataValue}>{email}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>
                  {t('authScreens.registerConfirm.data.phone')}:
                </Text>
                <Text style={styles.dataValue}>{phone}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>
                  {t('authScreens.registerConfirm.data.role')}:
                </Text>
                <Text style={styles.dataValue}>
                  {role === 'driver'
                    ? t('authScreens.registerConfirm.data.roleLabel.driver')
                    : t('authScreens.registerConfirm.data.roleLabel.client')}
                </Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>
                  {t('authScreens.registerConfirm.data.authMethod')}:
                </Text>
                <Text style={styles.dataValue}>
                  {authProvider === 'google'
                    ? t('authScreens.registerConfirm.data.authMethodLabel.google')
                    : authProvider === 'phone'
                      ? t('authScreens.registerConfirm.data.authMethodLabel.phone')
                      : t('authScreens.registerConfirm.data.authMethodLabel.emailPassword')}
                </Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>
                  {t('authScreens.registerConfirm.data.phoneVerified')}:
                </Text>
                <Text style={[styles.dataValue, { color: phoneVerified ? colors.success : colors.error }]}>
                  {phoneVerified
                    ? t('authScreens.registerConfirm.data.phoneVerifiedYes')
                    : t('authScreens.registerConfirm.data.phoneVerifiedNo')}
                </Text>
              </View>
            </View>

            {/* Datos del Conductor (si aplica) */}
            {role === 'driver' && driverData && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t('authScreens.registerConfirm.sections.license')}
                </Text>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.licenseNumber')}:
                  </Text>
                  <Text style={styles.dataValue}>{driverData.licenseNumber}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.expiration')}:
                  </Text>
                  <Text style={styles.dataValue}>{driverData.licenseExpiry}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.department')}:
                  </Text>
                  <Text style={styles.dataValue}>{driverData.department}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.municipality')}:
                  </Text>
                  <Text style={styles.dataValue}>{driverData.municipality}</Text>
                </View>

                {driverPhotoPreviews.length > 0 && (
                  <View style={styles.photoPreviewGroup}>
                    <Text style={styles.photoPreviewTitle}>
                      {t('authScreens.registerConfirm.sections.photos')}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {driverPhotoPreviews.map((photo) => (
                        <View style={styles.photoPreviewCard} key={photo.key}>
                          <Image source={{ uri: photo.uri }} style={styles.photoPreviewImage} />
                          <Text style={styles.photoPreviewLabel} numberOfLines={2}>
                            {photo.label}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                    <Text style={styles.photoHint}>
                      {t('authScreens.registerConfirm.photos.hint')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Datos del Vehículo (si aplica) */}
            {role === 'driver' && vehicleData && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {t('authScreens.registerConfirm.sections.vehicle')}
                </Text>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.plate')}:
                  </Text>
                  <Text style={styles.dataValue}>{vehicleData.plate}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.brand')}:
                  </Text>
                  <Text style={styles.dataValue}>{vehicleData.brand}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.model')}:
                  </Text>
                  <Text style={styles.dataValue}>{vehicleData.model}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.year')}:
                  </Text>
                  <Text style={styles.dataValue}>{vehicleData.year}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.color')}:
                  </Text>
                  <Text style={styles.dataValue}>{vehicleData.color}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>
                    {t('authScreens.registerConfirm.data.type')}:
                  </Text>
                  <Text style={styles.dataValue}>
                    {vehicleData.type === 'sedan' && t('authScreens.registerConfirm.data.typeLabel.sedan')}
                    {vehicleData.type === 'suv' && t('authScreens.registerConfirm.data.typeLabel.suv')}
                    {vehicleData.type === 'van' && t('authScreens.registerConfirm.data.typeLabel.van')}
                    {vehicleData.type === 'moto' && t('authScreens.registerConfirm.data.typeLabel.moto')}
                  </Text>
                </View>

                {vehicleData.passengers && (
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>
                      {t('authScreens.registerConfirm.data.passengers')}:
                    </Text>
                    <Text style={styles.dataValue}>{vehicleData.passengers}</Text>
                  </View>
                )}

                {vehiclePhotoPreviews.length > 0 && (
                  <View style={styles.photoPreviewGroup}>
                    <Text style={styles.photoPreviewTitle}>
                      {t('authScreens.registerConfirm.sections.vehiclePhotos')}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {vehiclePhotoPreviews.map((photo) => (
                        <View style={styles.photoPreviewCard} key={photo.key}>
                          <Image source={{ uri: photo.uri }} style={styles.photoPreviewImage} />
                          <Text style={styles.photoPreviewLabel} numberOfLines={2}>
                            {photo.label}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                    <Text style={styles.photoHint}>
                      {t('authScreens.registerConfirm.photos.hint')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Información Importante */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>
                {t('authScreens.registerConfirm.sections.importantInfo')}
              </Text>
              <Text style={styles.infoText}>
                {t('authScreens.registerConfirm.infoBox.line1')}
              </Text>
              <Text style={styles.infoText}>
                {t('authScreens.registerConfirm.infoBox.line2')}
              </Text>
              <Text style={styles.infoText}>
                {t('authScreens.registerConfirm.infoBox.line3')}
              </Text>
            </View>
          </View>

          {/* Botones */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>
                {t('authScreens.registerConfirm.buttons.back')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, loading && styles.buttonDisabled]}
              onPress={handleConfirmAndRegister}
              disabled={loading}
            >
              {loading ? (
                <LoadingIcon size={24} color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  {t('authScreens.registerConfirm.buttons.confirm')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Progreso */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '100%' }]} />
          </View>
          <Text style={styles.progressText}>
            {t('authScreens.registerConfirm.progress', { current: 4, total: 4 })}
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
  summaryContainer: {
    marginBottom: 24,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dataLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  dataValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  infoBox: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
    lineHeight: 16,
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
    color: 'rgba(10, 28, 129, 1))',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(231, 168, 86, 1)',
    alignItems: 'center',
  },
  confirmButtonText: {
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
    backgroundColor: 'rgba(231, 168, 86, 1)',
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  photoPreviewGroup: {
    marginTop: 12,
    gap: 8,
  },
  photoPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  photoPreviewCard: {
    width: 120,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  photoPreviewImage: {
    width: '100%',
    height: 90,
    backgroundColor: '#eee',
  },
  photoPreviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  photoHint: {
    fontSize: 11,
    color: colors.textSecondary,
  },
});
