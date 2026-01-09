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
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import registrationService from '../../services/registrationService';
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
  const { register, registerWithGoogle, loginWithPhoneAndSMS } = useAuth();
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
    driverData,
    vehicleData,
    googleIdToken,
    context,
  } = route.params;

  const [loading, setLoading] = useState(false);

  const handleConfirmAndRegister = async () => {
    if (!phoneVerified) {
      Alert.alert(
        t('authScreens.registerConfirm.alerts.phoneNotVerifiedTitle'),
        t('authScreens.registerConfirm.alerts.phoneNotVerifiedMessage'),
      );
      return;
    }

    setLoading(true);
    try {
      const registrationContext: 'register_driver' | 'register_upgrade_driver' =
        context === 'register_upgrade_driver' ? 'register_upgrade_driver' : 'register_driver';

      if (registrationContext === 'register_upgrade_driver') {
        console.log('📝 Iniciando upgrade de cliente a conductor...');

        if (!driverData || !vehicleData) {
          throw new Error('MISSING_DRIVER_DATA');
        }

        const result = await registrationService.upgradeClientToDriver(driverData, vehicleData);

        console.log('✅ Upgrade cliente→conductor completado:', result);

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

      const result = await registrationService.createUser({
        name,
        email: safeEmail,
        phone,
        password,
        role,
        method,
        authProvider,
        phoneVerified,
        driverData,
        vehicleData,
        googleIdToken,
      });

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
        await register({
          email: safeEmail,
          password,
          name,
          phone,
          role,
          driverData,
          vehicleData,
          googleIdToken,
        });
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
                <ActivityIndicator color="#FFFFFF" />
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
});
