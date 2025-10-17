import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FCMConfigComponent } from '../../context/FCMContext';

export default function SettingsScreen({ navigation }: any) {
  const { theme, isDark, setTheme, colors } = useTheme();
  const { user, logout } = useAuth();
  
  // Estados para configuraciones adicionales
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [locationAlways, setLocationAlways] = useState(false);

  const handleThemeChange = (value: 'light' | 'dark' | 'auto') => {
    setTheme(value);
  };

  const handleLogout = () => {
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
      ]
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
    section: {
      marginTop: 20,
      paddingVertical: 8,
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
    logoutButton: {
      backgroundColor: colors.error,
      margin: 20,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    logoutButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    preview: {
      margin: 20,
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    previewText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    arrow: {
      fontSize: 24,
      color: colors.textSecondary,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Configuración</Text>
        <Text style={styles.headerSubtitle}>
          {user?.name} • {user?.role === 'driver' ? 'Conductor' : 'Cliente'}
        </Text>
      </View>

      <ScrollView>
        {/* Tema */}
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
                style={[
                  styles.themeButton,
                  theme === 'light' && styles.themeButtonActive,
                ]}
                onPress={() => handleThemeChange('light')}
              >
                <Text
                  style={[
                    styles.themeButtonText,
                    theme === 'light' && styles.themeButtonTextActive,
                  ]}
                >
                  ☀️ Claro
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.themeButton,
                  theme === 'dark' && styles.themeButtonActive,
                ]}
                onPress={() => handleThemeChange('dark')}
              >
                <Text
                  style={[
                    styles.themeButtonText,
                    theme === 'dark' && styles.themeButtonTextActive,
                  ]}
                >
                  🌙 Oscuro
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.themeButton,
                  theme === 'auto' && styles.themeButtonActive,
                ]}
                onPress={() => handleThemeChange('auto')}
              >
                <Text
                  style={[
                    styles.themeButtonText,
                    theme === 'auto' && styles.themeButtonTextActive,
                  ]}
                >
                  🔄 Auto
                </Text>
              </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Notificaciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificaciones</Text>
          
          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Notificaciones Push</Text>
              <Text style={styles.optionDescription}>
                Recibe alertas de nuevos viajes y actualizaciones
              </Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* FCM Configuration */}
        <FCMConfigComponent />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sonido y Vibración</Text>
          
          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Sonido</Text>
              <Text style={styles.optionDescription}>
                Reproducir sonido con notificaciones
              </Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              disabled={!notifications}
            />
          </View>

          <View style={[styles.option, styles.optionLast]}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Vibración</Text>
              <Text style={styles.optionDescription}>
                Vibrar con notificaciones
              </Text>
            </View>
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              disabled={!notifications}
            />
          </View>
        </View>

        {/* Ubicación */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ubicación</Text>
          
          <View style={[styles.option, styles.optionLast]}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>Ubicación en segundo plano</Text>
              <Text style={styles.optionDescription}>
                Permitir acceso a ubicación cuando la app está cerrada
              </Text>
            </View>
            <Switch
              value={locationAlways}
              onValueChange={setLocationAlways}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Privacidad */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacidad y Seguridad</Text>
          
          <TouchableOpacity style={styles.option}>
            <Text style={styles.optionTitle}>Política de Privacidad</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option}>
            <Text style={styles.optionTitle}>Términos y Condiciones</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.option, styles.optionLast]}>
            <Text style={[styles.optionTitle, { color: colors.error }]}>Eliminar mi cuenta</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Acerca de */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acerca de</Text>
          
          <View style={styles.option}>
            <Text style={styles.optionTitle}>Versión</Text>
            <Text style={styles.optionDescription}>1.0.0</Text>
          </View>

          <View style={styles.option}>
            <Text style={styles.optionTitle}>Dominio</Text>
            <Text style={styles.optionDescription}>driveangel.online</Text>
          </View>

          <TouchableOpacity style={[styles.option, styles.optionLast]}>
            <Text style={styles.optionTitle}>Licencias de código abierto</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Cerrar Sesión */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
