import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, Switch } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useFCM } from '../../context/FCMContext';
import { ProfileSkeleton } from '../../components/SkeletonLoader';
import Button from '../../components/Button';
import driversService from '../../services/driversService';
import LoadingOverlay from '../../components/LoadingOverlay';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, logoutInProgress } = useAuth();
  const { theme, setTheme, colors, mapTrafficEnabled, setMapTrafficEnabled } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const { isConfigured, hasPermission, isFCMAvailable, configureFCM } = useFCM();
  const notificationsEnabled = isFCMAvailable && hasPermission && isConfigured;
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  // Cargar perfil del conductor si es conductor
  useEffect(() => {
    const loadDriverProfile = async () => {
      if (user?.role === 'driver' && user?.id) {
        await loadDriverProfileData();
      }
    };

    loadDriverProfile();
  }, [user]);

  const loadDriverProfileData = async () => {
    if (!user?.id) return;

    setLoadingProfile(true);
    try {
      // ✅ Obtener perfil del conductor autenticado
      const profile = await driversService.getMyDriverProfile();
      console.log('Perfil de conductor cargado:', profile);
      console.log('Datos del vehículo:', profile?.driver?.vehicle);
      setDriverProfile(profile);
    } catch (error) {
      console.error('Error cargando perfil de conductor:', error);
      setDriverProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  };

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

  const handleLogout = () => {
    if (logoutInProgress) {
      return;
    }
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // La navegación se maneja automáticamente por AppNavigator
          },
        },
      ],
    );
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text>No hay usuario autenticado</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <LoadingOverlay visible={logoutInProgress} message="Cerrando sesión..." />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Image
              source={require('../../assets/icons/back_button/back_button.png')}
              style={styles.backIcon}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Perfil</Text>
          <View style={styles.headerTopSpacer} />
        </View>

        <View style={styles.headerMainRow}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.headerContent}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <Text style={styles.memberId}>ID de Usuario: {user.id}</Text>

            <View style={styles.headerBottomRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>
                  {user.role === 'client' ? 'Cliente' : 'Conductor'}
                </Text>
              </View>

              <TouchableOpacity onPress={() => navigation.navigate('Account')}>
                <View style={styles.editProfileBadge}>
                <Text style={styles.editProfileText}>Editar perfil</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.contentCard}>
        {/* Información del Vehículo (solo conductores) */}
        {user.role === 'driver' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🚗 Información del Vehículo</Text>
              <TouchableOpacity 
                style={styles.refreshIcon}
                onPress={loadDriverProfileData}
                disabled={loadingProfile}
              >
                <Text style={styles.refreshIconText}>
                  {loadingProfile ? '⏳' : '🔄'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {loadingProfile ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Cargando información del vehículo...</Text>
                <Text style={styles.loadingSubtext}>Verificando datos en la base de datos</Text>
              </View>
            ) : driverProfile?.driver?.vehicle ? (
              <>
                {/* Mostrar un mensaje especial para conductores verificados */}
                {driverProfile.driver.status === 'verified' && (
                  <View style={styles.successCard}>
                    <Text style={styles.successIcon}>✅</Text>
                    <View style={styles.successContent}>
                      <Text style={styles.successTitle}>Conductor Verificado</Text>
                      <Text style={styles.successText}>
                        Tu información ha sido verificada correctamente. Ya puedes recibir viajes.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Verificar si falta información importante Y no está verificado */}
                {driverProfile.driver.status !== 'verified' && 
                 (!driverProfile.driver.vehicle.vehicle_photo || 
                  (!driverProfile.driver.vehicle.registration_photo_front || !driverProfile.driver.vehicle.registration_photo_back) || 
                  !driverProfile.driver.vehicle.insurance_photo) && (
                  <View style={styles.warningCard}>
                    <Text style={styles.warningIcon}>⚠️</Text>
                    <View style={styles.warningContent}>
                      <Text style={styles.warningTitle}>Información Incompleta</Text>
                      <Text style={styles.warningText}>
                        Falta completar información importante de tu vehículo. 
                        Es urgente que completes los siguientes datos:
                      </Text>
                      {!driverProfile?.driver?.vehicle?.vehicle_photo && (
                        <Text style={styles.warningItem}>
                          📷 Foto del vehículo ({driverProfile?.driver?.vehicle?.type === 'moto' ? 'lateral' : 'frontal'})
                        </Text>
                      )}
                      {(!driverProfile?.driver?.vehicle?.registration_photo_front || !driverProfile?.driver?.vehicle?.registration_photo_back) && (
                        <Text style={styles.warningItem}>📄 Foto de matrícula</Text>
                      )}
                      {!driverProfile?.driver?.vehicle?.insurance_photo && (
                        <Text style={styles.warningItem}>🛡️ Foto de seguro</Text>
                      )}
                      <TouchableOpacity 
                        style={styles.completeButton}
                        onPress={() => navigation.navigate('CompleteVehicleInfo')}
                      >
                        <Text style={styles.completeButtonText}>Completar Ahora</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🚙 Marca</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.brand}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🚗 Modelo</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.model}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>📅 Año</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.year}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🎨 Color</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.color}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🔢 Placa</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.plate}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🚘 Tipo</Text>
                    <Text style={styles.infoValue}>
                      {driverProfile.driver.vehicle.type === 'sedan' ? 'Sedán' :
                       driverProfile.driver.vehicle.type === 'suv' ? 'SUV' :
                       driverProfile.driver.vehicle.type === 'van' ? 'Van' :
                       driverProfile.driver.vehicle.type === 'moto' ? 'Moto' : driverProfile.driver.vehicle.type}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.warningCard}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <View style={styles.warningContent}>
                  <Text style={styles.warningTitle}>Sin Información del Vehículo</Text>
                  <Text style={styles.warningText}>
                    No hay información de tu vehículo registrada. Es urgente que completes esta información para poder recibir viajes.
                  </Text>
                  <View style={styles.warningButtons}>
                    <TouchableOpacity 
                      style={styles.refreshButton}
                      onPress={loadDriverProfileData}
                      disabled={loadingProfile}
                    >
                      <Text style={styles.refreshButtonText}>
                        {loadingProfile ? '🔄 Cargando...' : '🔄 Refrescar'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.completeButton}
                      onPress={() => navigation.navigate('CompleteVehicleInfo')}
                    >
                      <Text style={styles.completeButtonText}>Registrar Vehículo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Opciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuración</Text>

          {/* Tema rápido */}
          <View style={styles.optionCard}>
            <Text style={styles.optionText}>Tema</Text>
            <View style={styles.themeChipsRow}>
              <TouchableOpacity
                style={[styles.themeChip, theme === 'light' && styles.themeChipActive]}
                onPress={() => handleThemeChange('light')}
              >
                <Text style={[styles.themeChipText, theme === 'light' && styles.themeChipTextActive]}>Claro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.themeChip, theme === 'dark' && styles.themeChipActive]}
                onPress={() => handleThemeChange('dark')}
              >
                <Text style={[styles.themeChipText, theme === 'dark' && styles.themeChipTextActive]}>Oscuro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.themeChip, theme === 'auto' && styles.themeChipActive]}
                onPress={() => handleThemeChange('auto')}
              >
                <Text style={[styles.themeChipText, theme === 'auto' && styles.themeChipTextActive]}>Auto</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notificaciones Push */}
          <View style={styles.optionCard}>
            <Text style={styles.optionText}>Notificaciones Push</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Tráfico en el mapa */}
          <View style={styles.optionCard}>
            <Text style={styles.optionText}>Tráfico en el mapa</Text>
            <Switch
              value={mapTrafficEnabled}
              onValueChange={setMapTrafficEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Sonidos de la app (agrupa sonido + vibración) */}
          <View style={styles.optionCard}>
            <Text style={styles.optionText}>Sonidos de la app</Text>
            <Switch
              value={soundEnabled && vibrationEnabled}
              onValueChange={(value) => {
                setSoundEnabled(value);
                setVibrationEnabled(value);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              disabled={!notificationsEnabled}
            />
          </View>

          {/* Navegación a pantallas relacionadas */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('Settings')}
          >
            <Image
              source={require('../../assets/icons/settings-icon/settingsicon.png')}
              style={styles.optionIconImage}
            />
            <Text style={styles.optionText}>Configuración avanzada</Text>
            <Text style={styles.optionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('RideHistory')}
          >
            <Image
              source={require('../../assets/icons/historial-icon/historialicon2.png')}
              style={styles.optionIconImage}
            />
            <Text style={styles.optionText}>Historial de Viajes</Text>
            <Text style={styles.optionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('PaymentMethods')}
          >
            <Image
              source={require('../../assets/icons/payment-icon/paymenticon.png')}
              style={styles.optionIconImage}
            />
            <Text style={styles.optionText}>Métodos de Pago</Text>
            <Text style={styles.optionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('Help')}
          >
            <Image
              source={require('../../assets/icons/help-icon/helpicon.png')}
              style={styles.optionIconImage}
            />
            <Text style={styles.optionText}>Ayuda</Text>
            <Text style={styles.optionArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Botón Cerrar Sesión */}
        <View style={styles.logoutContainer}>
          <Button
            title="Cerrar Sesión"
            onPress={handleLogout}
            style={styles.logoutButton}
          />
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>Rundi Beta - 1.6.4</Text>
          <Text style={styles.appCopyright}>© 2025 Todos los derechos reservados</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(204, 180, 136, 0.91)',
  },
  header: {
    backgroundColor: 'rgba(211, 153, 46, 0.81)',
    paddingVertical: 65,
    paddingHorizontal: 24,
    alignItems: 'stretch',
    marginBottom: -20,
    borderRadius: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  contentCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    paddingBottom: 32,
    marginTop: -16,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 24,
    height: 24,
   // tintColor: colors.card,
    resizeMode: 'contain',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  headerTopSpacer: {
    width: 36,
    height: 36,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 1)',
    marginBottom: 4,
  },
  memberId: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 1)',
  },
  headerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  roleBadge: {
    backgroundColor: 'rgba(230, 230, 230, 0.18)',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
  },
  editProfileBadge: {
    backgroundColor: 'rgba(93, 95, 179, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    paddingLeft: 2,
    marginLeft: 6,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  editProfileText: {
    marginLeft: 12,
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  section: {
    marginTop: 14,
    paddingHorizontal: 20,  
    paddingVertical: 14,
    
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: -20,
    padding: 12,
  },
  themeChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginLeft: 8,
  },
  themeChipActive: {
    backgroundColor: 'rgba(202, 151, 57, 1)',
    borderColor: 'rgba(209, 165, 84, 1)',
  },
  themeChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  themeChipTextActive: {
    color: '#ffffffff',
  },
  refreshIcon: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  refreshIconText: {
    fontSize: 16,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 2,
    textAlign: 'right',
  },
  infoValueSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    flex: 2,
    textAlign: 'right',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  warningCard: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#FFE69C',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 12,
    lineHeight: 20,
  },
  warningItem: {
    fontSize: 13,
    color: '#856404',
    marginLeft: 8,
    marginBottom: 4,
  },
  warningButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  successCard: {
    backgroundColor: '#D4EDDA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#C3E6CB',
  },
  successIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  successContent: {
    flex: 1,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#155724',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#155724',
    marginBottom: 12,
    lineHeight: 20,
  },
  completeButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  refreshButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  optionCard: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  optionIconImage: {
    width: 25,
    height: 25,
    marginRight: 14,
    resizeMode: 'contain',
    tintColor: colors.text,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  optionArrow: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  logoutContainer: {
    paddingHorizontal: 24,
    marginTop: 32,
    marginBottom: 24,
    alignItems: 'center',
    paddingVertical: 24,
  },
  logoutButton: {
    backgroundColor: colors.error,
  },
  appInfo: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  appVersion: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  appCopyright: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
