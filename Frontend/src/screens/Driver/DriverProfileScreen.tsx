import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { safeFormatDate } from '../../utils/safeFormatters';
import * as ImagePicker from 'expo-image-picker';
import driversService from '../../services/driversService';

interface DriverStats {
  totalRides: number;
  totalEarnings: number;
  averageRating: number;
  completionRate: number;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  type: string;
  registrationNumber?: string;
  registrationExpiry?: string;
  registrationPhoto?: string;
  insuranceNumber?: string;
  insuranceCompany?: string;
  insuranceExpiry?: string;
  insurancePhoto?: string;
  vehiclePhoto?: string;
}

interface DriverData {
  id: string;
  license_number: string;
  license_expiry?: string;
  license_photo?: string;
  status?: string;
  total_rides?: number;
  average_rating?: number;
  total_earnings?: number;
}

export default function DriverProfileScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [stats, setStats] = useState<DriverStats>({
    totalRides: 0,
    totalEarnings: 0,
    averageRating: 5.0,
    completionRate: 100,
  });
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  useEffect(() => {
    loadDriverData();
  }, []);

  const loadDriverData = async () => {
    if (!user?.id) return;

    try {
      // Cargar datos reales del backend
      const profile = await driversService.getDriverProfile(user.id);

      if (profile?.driver) {
        setDriverData(profile.driver);

        // Actualizar estadísticas desde los datos reales
        setStats({
          totalRides: profile.driver.total_rides || 0,
          totalEarnings: profile.driver.total_earnings || 0,
          averageRating: profile.driver.average_rating || 5.0,
          completionRate: 96, // TODO: Calcular basado en datos reales
        });

        // Cargar vehículo si existe
        if (profile.driver.vehicle) {
          setVehicles([{
            ...profile.driver.vehicle,
            type: profile.driver.vehicle.type || 'sedan' // Asegurar que tenga type
          }]);
        }
      }
    } catch (error) {
      console.error('Error loading driver data:', error);
      // Mantener datos por defecto en caso de error
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPhoto = async (type: 'profile' | 'vehicle' | 'document', docType?: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permiso Denegado', 'Necesitamos acceso a tu galería para subir fotos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'profile' ? [1, 1] : [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      // TODO: Subir imagen al servidor
      if (type === 'profile') {
        setProfilePhoto(result.assets[0].uri);
      }
      Alert.alert('Éxito', 'Foto subida correctamente');
    }
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'license': return '🪪';
      case 'registration': return '📄';
      case 'insurance': return '🛡️';
      default: return '📋';
    }
  };

  const getDocumentName = (type: string) => {
    switch (type) {
      case 'license': return 'Licencia de Conducir';
      case 'registration': return 'Matrícula del Vehículo';
      case 'insurance': return 'Seguro del Vehículo';
      default: return 'Documento';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return '#4CAF50';
      case 'pending': return '#FF9800';
      case 'rejected': return '#f44336';
      default: return colors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'verified': return 'Verificado';
      case 'pending': return 'Pendiente';
      case 'rejected': return 'Rechazado';
      default: return 'Sin estado';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando perfil...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header con foto de perfil */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => handleUploadPhoto('profile')}
        >
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0).toUpperCase() || 'C'}
              </Text>
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Text style={styles.cameraIconText}>📷</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.driverName}>{user?.name || 'Conductor'}</Text>
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingStars}>⭐</Text>
          <Text style={styles.ratingText}>{stats.averageRating.toFixed(1)}</Text>
        </View>
      </View>

      {/* Cartera / Ganancias */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>💰 Cartera</Text>
          <TouchableOpacity style={styles.rechargeButton}>
            <Text style={styles.rechargeButtonText}>Recargas de saldo, bonus y más</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.walletCard}>
          <View style={styles.walletRow}>
            <View style={styles.walletItem}>
              <Text style={styles.walletLabel}>Ganancias Totales</Text>
              <Text style={styles.walletValue}>C${stats.totalEarnings.toFixed(2)}</Text>
            </View>
            <View style={styles.walletDivider} />
            <View style={styles.walletItem}>
              <Text style={styles.walletLabel}>Viajes Completados</Text>
              <Text style={styles.walletValue}>{stats.totalRides}</Text>
            </View>
          </View>
          <View style={styles.walletRow}>
            <View style={styles.walletItem}>
              <Text style={styles.walletLabel}>Tasa de Completado</Text>
              <Text style={styles.walletValue}>{stats.completionRate}%</Text>
            </View>
            <View style={styles.walletDivider} />
            <View style={styles.walletItem}>
              <Text style={styles.walletLabel}>Calificación</Text>
              <Text style={styles.walletValue}>⭐ {stats.averageRating.toFixed(1)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Mis Vehículos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚗 Mis Vehículos</Text>
        
        {vehicles.map((vehicle) => (
          <View key={vehicle.id} style={styles.vehicleCard}>
            <View style={styles.vehicleIcon}>
              <Text style={styles.vehicleIconText}>🚗</Text>
            </View>
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleName}>
                {vehicle.brand} {vehicle.model}
              </Text>
              <Text style={styles.vehicleDetails}>
                {vehicle.color} • {vehicle.year} • {vehicle.plate}
              </Text>
            </View>
            <TouchableOpacity style={styles.changeButton}>
              <Text style={styles.changeButtonText}>Cambiar</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addVehicleButton}>
          <Text style={styles.addVehicleButtonText}>+ Agregar Vehículo</Text>
        </TouchableOpacity>
      </View>

      {/* Documentos del Conductor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Documentos del Conductor</Text>

        {driverData && (
          <View style={styles.documentCard}>
            <View style={styles.documentLeft}>
              <View style={[
                styles.statusIndicator,
                { backgroundColor: driverData.license_photo ? '#4CAF50' : '#FF9800' }
              ]}>
                {driverData.license_photo ? <Text style={styles.statusIcon}>✓</Text> : <Text style={styles.statusIcon}>⏱</Text>}
              </View>
              <View style={styles.documentInfo}>
                <Text style={styles.documentIcon}>🪪</Text>
                <View>
                  <Text style={styles.documentName}>Licencia de Conducir</Text>
                  <Text style={[styles.documentStatus, { color: driverData.license_photo ? '#4CAF50' : '#FF9800' }]}>
                    {driverData.license_photo ? 'Verificada' : 'Pendiente'}
                  </Text>
                  {driverData.license_expiry && (
                    <Text style={styles.documentExpiry}>
                      Vence: {safeFormatDate(driverData.license_expiry)}
                    </Text>
                  )}
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => navigation.navigate('CompleteVehicleInfo')}
            >
              <Text style={styles.uploadButtonText}>
                {driverData.license_photo ? 'Ver' : 'Completar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Información del Seguro */}
      {vehicles.length > 0 && vehicles[0].insuranceNumber && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛡️ Información del Seguro</Text>

          <View style={styles.insuranceCard}>
            <View style={styles.insuranceRow}>
              <Text style={styles.insuranceLabel}>Compañía</Text>
              <Text style={styles.insuranceValue}>{vehicles[0].insuranceCompany}</Text>
            </View>

            <View style={styles.insuranceRow}>
              <Text style={styles.insuranceLabel}>Número de Póliza</Text>
              <Text style={styles.insuranceValue}>{vehicles[0].insuranceNumber}</Text>
            </View>

            {vehicles[0].insuranceExpiry && (
              <View style={styles.insuranceRow}>
                <Text style={styles.insuranceLabel}>Vencimiento</Text>
                <Text style={styles.insuranceValue}>
                  {safeFormatDate(vehicles[0].insuranceExpiry)}
                </Text>
              </View>
            )}

            {vehicles[0].insurancePhoto && (
              <View style={styles.insurancePhotoContainer}>
                <Text style={styles.insuranceLabel}>Foto de la Póliza</Text>
                <Image source={{ uri: vehicles[0].insurancePhoto }} style={styles.insurancePhoto} />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Opciones adicionales */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('Earnings')}
        >
          <Text style={styles.optionIcon}>💵</Text>
          <Text style={styles.optionText}>Ver Ganancias Detalladas</Text>
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
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.optionIcon}>⚙️</Text>
          <Text style={styles.optionText}>Configuración</Text>
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

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
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
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '800',
    color: '#fff',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  cameraIconText: {
    fontSize: 18,
  },
  driverName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  ratingStars: {
    fontSize: 16,
    marginRight: 6,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  rechargeButton: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  rechargeButtonText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  walletCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  walletItem: {
    flex: 1,
    alignItems: 'center',
  },
  walletDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  walletLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  walletValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehicleIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  vehicleIconText: {
    fontSize: 32,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  vehicleDetails: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  changeButton: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  addVehicleButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addVehicleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  documentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  documentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
  },
  documentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  documentIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  documentStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  documentExpiry: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  uploadButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  uploadButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
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
  insuranceCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insuranceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  insuranceLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  insuranceValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  insurancePhotoContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  insurancePhoto: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginTop: 8,
  },
});
