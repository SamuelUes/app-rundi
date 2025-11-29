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
  const { register, registerWithGoogle } = useAuth();

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
  } = route.params;

  const [loading, setLoading] = useState(false);

  const handleConfirmAndRegister = async () => {
    if (!phoneVerified) {
      Alert.alert('Error', 'El número telefónico no ha sido verificado');
      return;
    }

    setLoading(true);
    try {
      console.log('📝 Creando usuario...');

      // Crear usuario
      const safeEmail = email?.trim() || '';

      const userData = await registrationService.createUser({
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

      console.log('✅ Usuario creado:', userData);

      // Hacer login automático
      if (authProvider === 'google') {
        await registerWithGoogle(userData);
      } else {
        if (!safeEmail || !password) {
          throw new Error('Correo y contraseña requeridos para completar el registro.');
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

      Alert.alert('✅ ¡Bienvenido!', `Cuenta creada exitosamente para ${role === 'driver' ? 'conductor' : 'cliente'}`);

      // Redirigir a HomeScreen
      navigation.reset({ index: 0, routes: [{ name: 'Login' as never }] });
    } catch (error: any) {
      console.error('Error creando usuario:', error);
      Alert.alert('Error', error.message || 'Error al crear usuario');
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
            <Text style={styles.title}>Confirmar Registro</Text>
            <Text style={styles.subtitle}>
              Revisa tus datos antes de continuar
            </Text>
          </View>

          {/* Resumen de Datos */}
          <View style={styles.summaryContainer}>
            {/* Datos Básicos */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📋 Datos Básicos</Text>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Nombre:</Text>
                <Text style={styles.dataValue}>{name}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Email:</Text>
                <Text style={styles.dataValue}>{email}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Teléfono:</Text>
                <Text style={styles.dataValue}>{phone}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Rol:</Text>
                <Text style={styles.dataValue}>
                  {role === 'driver' ? '🚗 Conductor' : '👤 Cliente'}
                </Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Autenticación:</Text>
                <Text style={styles.dataValue}>
                  {authProvider === 'google' ? '🔐 Google' : '🔑 Email/Password'}
                </Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Teléfono Verificado:</Text>
                <Text style={[styles.dataValue, { color: phoneVerified ? colors.success : colors.error }]}>
                  {phoneVerified ? '✅ Sí' : '❌ No'}
                </Text>
              </View>
            </View>

            {/* Datos del Conductor (si aplica) */}
            {role === 'driver' && driverData && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🪪 Datos de Licencia</Text>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Número de Licencia:</Text>
                  <Text style={styles.dataValue}>{driverData.licenseNumber}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Vencimiento:</Text>
                  <Text style={styles.dataValue}>{driverData.licenseExpiry}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Departamento:</Text>
                  <Text style={styles.dataValue}>{driverData.department}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Municipio:</Text>
                  <Text style={styles.dataValue}>{driverData.municipality}</Text>
                </View>
              </View>
            )}

            {/* Datos del Vehículo (si aplica) */}
            {role === 'driver' && vehicleData && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🚗 Datos del Vehículo</Text>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Placa:</Text>
                  <Text style={styles.dataValue}>{vehicleData.plate}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Marca:</Text>
                  <Text style={styles.dataValue}>{vehicleData.brand}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Modelo:</Text>
                  <Text style={styles.dataValue}>{vehicleData.model}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Año:</Text>
                  <Text style={styles.dataValue}>{vehicleData.year}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Color:</Text>
                  <Text style={styles.dataValue}>{vehicleData.color}</Text>
                </View>

                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>Tipo:</Text>
                  <Text style={styles.dataValue}>
                    {vehicleData.type === 'sedan' && '🚗 Sedán'}
                    {vehicleData.type === 'suv' && '🚙 SUV'}
                    {vehicleData.type === 'van' && '🚐 Van'}
                    {vehicleData.type === 'moto' && '🏍️ Moto'}
                  </Text>
                </View>

                {vehicleData.passengers && (
                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Pasajeros:</Text>
                    <Text style={styles.dataValue}>{vehicleData.passengers}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Información Importante */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>⚠️ Información Importante</Text>
              <Text style={styles.infoText}>
                • Al confirmar, aceptas nuestros Términos de Servicio
              </Text>
              <Text style={styles.infoText}>
                • Tu cuenta será verificada por nuestro equipo
              </Text>
              <Text style={styles.infoText}>
                • Los conductores serán verificados en 24-48 horas
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
              <Text style={styles.backButtonText}>← Volver</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, loading && styles.buttonDisabled]}
              onPress={handleConfirmAndRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirmar y Registrar</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Progreso */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '100%' }]} />
          </View>
          <Text style={styles.progressText}>Paso 4 de 4</Text>
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
    color: colors.primary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
