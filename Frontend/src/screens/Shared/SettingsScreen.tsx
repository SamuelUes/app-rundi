import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFCM } from '../../context/FCMContext';
import LoadingOverlay from '../../components/LoadingOverlay';

export default function SettingsScreen({ navigation }: any) {
  const { theme, setTheme, colors, mapTrafficEnabled, setMapTrafficEnabled } = useTheme();
  const { user, logout, logoutInProgress } = useAuth();
  const { isConfigured, hasPermission, isFCMAvailable, configureFCM, sendTestNotification } = useFCM();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

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
      paddingVertical: 16,
      backgroundColor: colors.card,
      marginHorizontal: 20,
      marginBottom: 8,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
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
          <Text style={styles.sectionTitle}>Apariencia</Text>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Tema</Text>
              <Text style={styles.optionDescription}>
                {theme === 'light' ? 'Claro' : theme === 'dark' ? 'Oscuro' : 'Automático'}
              </Text>
              <View style={styles.themeOptions}>
                <TouchableOpacity
                  style={[styles.themeButton, theme === 'light' && styles.themeButtonActive]}
                  onPress={() => handleThemeChange('light')}
                >
                  <Text style={[styles.themeButtonText, theme === 'light' && styles.themeButtonTextActive]}>
                    ☀️ Claro
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.themeButton, theme === 'dark' && styles.themeButtonActive]}
                  onPress={() => handleThemeChange('dark')}
                >
                  <Text style={[styles.themeButtonText, theme === 'dark' && styles.themeButtonTextActive]}>
                    🌙 Oscuro
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.themeButton, theme === 'auto' && styles.themeButtonActive]}
                  onPress={() => handleThemeChange('auto')}
                >
                  <Text style={[styles.themeButtonText, theme === 'auto' && styles.themeButtonTextActive]}>
                    🔄 Auto
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>

          <TouchableOpacity style={styles.option} onPress={handleNavigateToAccount}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Mi cuenta</Text>
              <Text style={styles.optionDescription}>Gestiona correo, contraseña y teléfono</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.option, styles.optionLast]} onPress={handleDeleteAccount}>
            <View style={styles.optionLeft}>
              <Text style={[styles.optionTitle, { color: colors.error }]}>Eliminar mi cuenta</Text>
              <Text style={styles.optionDescription}>Proceso guiado para solicitar eliminación</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificaciones</Text>

          <View style={styles.notificationCard}>
            <View style={styles.notificationHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Notificaciones Push</Text>
                <Text style={styles.notificationDescription}>
                  Recibe alertas en tiempo real sobre viajes, mensajes y actualizaciones importantes.
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.notificationStatusRow}>
              <View
                style={[styles.statusIndicator, notificationsEnabled && styles.statusIndicatorActive]}
              >
                <Text style={styles.statusIndicatorText}>
                  {notificationsEnabled ? 'Activas' : 'Inactivas'}
                </Text>
              </View>
              <Text style={styles.notificationStatusText}>
                {notificationsEnabled
                  ? 'Recibirás notificaciones cuando asignemos un conductor, cambie el estado del viaje o llegue un mensaje.'
                  : 'Activa las notificaciones para recibir avisos cuando encontremos conductor o haya novedades de tu viaje.'}
              </Text>
            </View>

            {!isFCMAvailable && (
              <View style={styles.noteBox}>
                <Text style={styles.noteTitle}>Expo Go detectado</Text>
                <Text style={styles.noteText}>
                  Compila la app con un build de desarrollo o producción para habilitar las notificaciones push.
                </Text>
              </View>
            )}

            {isFCMAvailable && !notificationsEnabled && (
              <TouchableOpacity
                style={[styles.notificationButton, styles.notificationButtonSecondary]}
                onPress={() => handleToggleNotifications(true)}
              >
                <Text
                  style={[styles.notificationButtonText, styles.notificationButtonSecondaryText]}
                >
                  Activar notificaciones
                </Text>
              </TouchableOpacity>
            )}

            {notificationsEnabled && (
              <TouchableOpacity style={styles.notificationButton} onPress={sendTestNotification}>
                <Text style={styles.notificationButtonText}>Probar notificación</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sonido y Vibración</Text>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Sonido</Text>
              <Text style={styles.optionDescription}>Reproducir sonido con notificaciones</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              disabled={!notificationsEnabled}
            />
          </View>

          <View style={[styles.option, styles.optionLast]}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Vibración</Text>
              <Text style={styles.optionDescription}>Vibrar con notificaciones</Text>
            </View>
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              disabled={!notificationsEnabled}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mapas y ubicación</Text>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Tráfico en el mapa</Text>
              <Text style={styles.optionDescription}>
                Muestra la capa de tráfico en tiempo real en Google Maps
              </Text>
            </View>
            <Switch
              value={mapTrafficEnabled}
              onValueChange={setMapTrafficEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.option, styles.optionLast]}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Ubicación en segundo plano</Text>
              <Text style={styles.optionDescription}>
                Permitir acceso a ubicación cuando la app está cerrada
              </Text>
            </View>
            <Switch
              value={false}
              onValueChange={() => {}}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              disabled
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacidad y Seguridad</Text>

          <TouchableOpacity style={styles.option}>
            <Text style={styles.optionTitle}>Política de Privacidad</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.option, styles.optionLast]}>
            <Text style={styles.optionTitle}>Términos y Condiciones</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acerca de</Text>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Versión</Text>
              <Text style={styles.optionDescription}>1.0.01</Text>
            </View>
          </View>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Dominio</Text>
              <Text style={styles.optionDescription}>conduce.online</Text>
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
    </View>
  );
}
