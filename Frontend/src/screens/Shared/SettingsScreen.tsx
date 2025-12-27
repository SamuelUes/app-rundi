import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFCM } from '../../context/FCMContext';
import LoadingOverlay from '../../components/LoadingOverlay';
import TermsAndConditionsModal from '../../components/TermsAndConditionsModal';
import phoneAuthService from '../../services/auth/phoneAuthService';

export default function SettingsScreen({ navigation }: any) {
  const { theme, setTheme, colors, mapTrafficEnabled, setMapTrafficEnabled } = useTheme();
  const { user, logout, logoutInProgress } = useAuth();
  const { isConfigured, hasPermission, isFCMAvailable, configureFCM, sendTestNotification } = useFCM();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const notificationsEnabled = isFCMAvailable && hasPermission && isConfigured;

  const handleToggleNotifications = async (value: boolean) => {
    try {
      if (value) {
        if (!isFCMAvailable) {
          Alert.alert(
            'Compila la app',
            'Las notificaciones push solo funcionan en una compilación de desarrollo o producción. Usa “npx expo run:android” o “npx expo run:ios”.',
          );
          return;
        }
        await configureFCM();
      } else if (notificationsEnabled) {
        Alert.alert(
          'Desactivar notificaciones',
          'Para desactivar las notificaciones push debes abrir los ajustes del sistema y revocar los permisos de la app.',
        );
      }
    } catch (error) {
      console.warn('Error actualizando notificaciones', error);
    }
  };

  const handleThemeChange = (value: 'light' | 'dark' | 'auto') => {
    setTheme(value);
  };

  const handleNavigateToAccount = () => {
    navigation.navigate('Account' as any);
  };

  const handleDeleteAccount = () => {
    navigation.navigate('DeleteAccount');
  };

  const handleOpenTerms = () => {
    setShowTermsModal(true);
  };

  const handleUpgradeToDriver = async () => {
    if (!user) {
      return;
    }

    if (user.role !== 'client') {
      Alert.alert(
        'No disponible',
        'Solo las cuentas de cliente pueden iniciar el registro como conductor desde aquí.',
      );
      return;
    }

    const name = user.name || '';
    const email = user.email || '';
    const phone = user.phone || '';
    const normalizedPhone = phone.trim();

    try {
      if (normalizedPhone) {
        await phoneAuthService.sendVerificationCode(normalizedPhone);

        navigation.navigate('PhoneVerification', {
          name,
          email,
          phone: normalizedPhone,
          password: undefined,
          method: 'phone',
          authProvider: 'phone',
          googleIdToken: undefined,
          role: 'driver',
          phoneVerified: false,
          context: 'register_upgrade_driver',
        });
      } else {
        navigation.navigate('DriverPhone', {
          name,
          email,
          phone: undefined,
          password: undefined,
          method: 'phone',
          authProvider: 'phone',
          googleIdToken: undefined,
          context: 'register_upgrade_driver',
        });
      }
    } catch (error: any) {
      console.error('Error al enviar código SMS para upgrade a conductor:', error);
      Alert.alert(
        'Error',
        error?.message || 'No se pudo enviar el código SMS. Intenta nuevamente.',
      );
    }
  };

  const handleLogout = () => {
    if (logoutInProgress) {
      return;
    }
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.replace('Login');
          },
        },
      ],
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.card,
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    section: {
      marginTop: 20,
      paddingVertical: 8,
    },
    notificationCard: {
      backgroundColor: colors.card,
      marginHorizontal: 20,
      marginBottom: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    notificationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    notificationDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      maxWidth: '85%',
    },
    notificationStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
    },
    statusIndicator: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: '#FF9800',
    },
    statusIndicatorActive: {
      backgroundColor: '#4CAF50',
    },
    statusIndicatorText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    notificationStatusText: {
      flex: 1,
      marginLeft: 12,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    noteBox: {
      marginTop: 16,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    noteTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    noteText: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    notificationButton: {
      marginTop: 16,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    notificationButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },
    notificationButtonSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.primary,
    },
    notificationButtonSecondaryText: {
      color: colors.primary,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      paddingHorizontal: 20,
      paddingVertical: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionLast: {
      marginBottom: 20,
    },
    optionLeft: {
      flex: 1,
      marginRight: 12,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 4,
    },
    optionDescription: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    themeOptions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    themeButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    themeButtonActive: {
      backgroundColor: '#2196F3',
      borderColor: '#2196F3',
    },
    themeButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    themeButtonTextActive: {
      color: '#FFFFFF',
    },
    arrow: {
      fontSize: 24,
      color: colors.textSecondary,
    },
    logoutButton: {
      backgroundColor: colors.error,
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 40,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    logoutButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });

  return (
    <View style={styles.container}>
      <LoadingOverlay visible={logoutInProgress} message="Cerrando sesión..." />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Configuración</Text>
        <Text style={styles.headerSubtitle}>
          {user?.name} • {user?.role === 'driver' ? 'Conductor' : 'Cliente'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>

          <TouchableOpacity style={styles.option} onPress={handleNavigateToAccount}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Mi cuenta</Text>
              <Text style={styles.optionDescription}>Gestiona correo, contraseña y teléfono</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          {user?.role === 'client' && (
            <TouchableOpacity style={styles.option} onPress={handleUpgradeToDriver}>
              <View style={styles.optionLeft}>
                <Text style={styles.optionTitle}>Quiero ser conductor</Text>
                <Text style={styles.optionDescription}>
                  Completa tus datos y documentos para ofrecer viajes en Rundi.
                </Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.option, styles.optionLast]} onPress={handleDeleteAccount}>
            <View style={styles.optionLeft}>
              <Text style={[styles.optionTitle, { color: colors.error }]}>Eliminar mi cuenta</Text>
              <Text style={styles.optionDescription}>Proceso guiado para solicitar eliminación</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacidad y Seguridad</Text>

          <TouchableOpacity style={styles.option}>
            <Text style={styles.optionTitle}>Política de Privacidad</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.option, styles.optionLast]} onPress={handleOpenTerms}>
            <Text style={styles.optionTitle}>Términos y Condiciones</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acerca de</Text>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Versión</Text>
              <Text style={styles.optionDescription}>Beta - 1.6.4</Text>
            </View>
          </View>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Dominio</Text>
              <Text style={styles.optionDescription}>rundiapp.com</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.option, styles.optionLast]}>
            <Text style={styles.optionTitle}>Licencias de código abierto</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.logoutButton, logoutInProgress && { opacity: 0.7 }]} onPress={handleLogout} disabled={logoutInProgress}>
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>

      <TermsAndConditionsModal
        visible={showTermsModal}
        requireCheck={false}
        saving={false}
        acceptLabel="Aceptar"
        onAccept={() => setShowTermsModal(false)}
        onRequestClose={() => setShowTermsModal(false)}
      />
    </View>
  );
}
