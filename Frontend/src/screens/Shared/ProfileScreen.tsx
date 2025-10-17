import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ProfileSkeleton } from '../../components/SkeletonLoader';
import Button from '../../components/Button';
import driversService from '../../services/driversService';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

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
      const profile = await driversService.getDriverProfile(user.id);
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

  const handleLogout = () => {
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>
            {user.role === 'client' ? '👤 Cliente' : '🚗 Conductor'}
          </Text>
        </View>
      </View>

      {/* Info Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Información Personal</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📧 Email</Text>
            <Text style={styles.infoValue}>{user.email}</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>👤 Rol</Text>
            <Text style={styles.infoValue}>
              {user.role === 'client' ? 'Cliente' : 'Conductor'}
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>🆔 ID de Usuario</Text>
            <Text style={styles.infoValueSmall}>{user.id}</Text>
          </View>
        </View>
      </View>

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
              {/* Verificar si falta información importante */}
              {(!driverProfile.driver.vehicle.vehiclePhoto || 
                !driverProfile.driver.vehicle.registrationPhoto || 
                !driverProfile.driver.vehicle.insurancePhoto) && (
                <View style={styles.warningCard}>
                  <Text style={styles.warningIcon}>⚠️</Text>
                  <View style={styles.warningContent}>
                    <Text style={styles.warningTitle}>Información Incompleta</Text>
                    <Text style={styles.warningText}>
                      Falta completar información importante de tu vehículo. 
                      Es urgente que completes los siguientes datos:
                    </Text>
                    {!driverProfile.driver.vehicle.vehiclePhoto && (
                      <Text style={styles.warningItem}>
                        📸 Foto del vehículo ({driverProfile.driver.vehicle.type === 'moto' ? 'lateral' : 'frontal'})
                      </Text>
                    )}
                    {!driverProfile.driver.vehicle.registrationPhoto && (
                      <Text style={styles.warningItem}>📄 Foto de matrícula</Text>
                    )}
                    {!driverProfile.driver.vehicle.insurancePhoto && (
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

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.optionIcon}>⚙️</Text>
          <Text style={styles.optionText}>Configuración</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('RideHistory')}
        >
          <Text style={styles.optionIcon}>📜</Text>
          <Text style={styles.optionText}>Historial de Viajes</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('PaymentMethods')}
        >
          <Text style={styles.optionIcon}>💳</Text>
          <Text style={styles.optionText}>Métodos de Pago</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('Help')}
        >
          <Text style={styles.optionIcon}>❓</Text>
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
        <Text style={styles.appVersion}>Drive Angel v1.0.0</Text>
        <Text style={styles.appCopyright}>© 2025 Todos los derechos reservados</Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors?.background || '#fff',
  },
  header: {
    backgroundColor: colors.card,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    marginBottom: 16,
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
    color: colors.text,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 24,
    padding: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
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
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    marginHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  optionArrow: {
    fontSize: 20,
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
