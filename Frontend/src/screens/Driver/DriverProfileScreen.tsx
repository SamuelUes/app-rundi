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
  Modal,
  TextInput,
  Animated,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { safeFormatDate } from '../../utils/safeFormatters';
import * as ImagePicker from 'expo-image-picker';
import driversService from '../../services/driversService';
import vehiclesService from '../../services/vehiclesService';
import designatedDriverService from '../../services/designatedDriverService';
import supabaseStorage from '../../services/supabaseStorage';

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
  is_active?: boolean;
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
  license_photo_front?: string;
  license_photo_back?: string;
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
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [vehicleFormData, setVehicleFormData] = useState({
    plate: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    type: 'sedan',
    is_4x4: false,
    motor: '',
    chasis: '',
    vin: '',
    cylinders: '',
    passengers: '',
    fuel_type: 'Gasolina',
    tonnage: '',
    vehicle_class: 'PARTICULAR',
    service_type: 'PRIVADO',
    lien: 'NINGUNO',
    emission_date: '',
    registration_number: '',
    registration_expiry: '',
    insurance_number: '',
    insurance_company: '',
    insurance_start_date: '',
    insurance_expiry: '',
  });
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [designatedDriverRequestStatus, setDesignatedDriverRequestStatus] = useState<string | null>(null);
  const [loadingRequestStatus, setLoadingRequestStatus] = useState(false);
  
  // Animaciones
  const cardScaleAnim = useMemo(() => new Animated.Value(0.95), []);
  const cardOpacityAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    // Animar entrada del card de Conductor Designado
    Animated.parallel([
      Animated.timing(cardScaleAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardScaleAnim, cardOpacityAnim]);

  useEffect(() => {
    loadDriverData();
    loadDesignatedDriverStatus();
    
    // Escuchar cambios de foco para recargar datos cuando se regrese a la pantalla
    const unsubscribe = navigation.addListener('focus', () => {
      loadDriverData();
      loadDesignatedDriverStatus();
    });

    return unsubscribe;
  }, [navigation]);

  // Cargar estado de solicitud de Conductor Designado
  const loadDesignatedDriverStatus = async () => {
    try {
      if (!user?.id) return;
      
      console.log('📋 Cargando estado de solicitud de Conductor Designado...');
      const status = await designatedDriverService.getDesignatedDriverRequestStatus();
      
      console.log('✅ Estado de solicitud obtenido:', status.requestStatus);
      setDesignatedDriverRequestStatus(status.requestStatus);
    } catch (error) {
      console.error('⚠️ Error cargando estado de solicitud:', error);
      // Si hay error, asumir que no hay solicitud
      setDesignatedDriverRequestStatus(null);
    }
  };

  const loadDriverData = async () => {
    if (!user?.id) {
      console.log('⚠️ No hay user.id disponible');
      setLoading(false);
      return;
    }

    try {
      console.log('📱 Cargando datos del conductor para:', user.id);
      
      // Cargar datos reales del backend
      const profile = await driversService.getDriverProfile(user.id);
      
      console.log('✅ Perfil cargado:', profile);

      if (profile?.driver) {
        setDriverData(profile.driver);

        // Actualizar estadísticas desde los datos reales
        setStats({
          totalRides: profile.driver.total_rides || 0,
          totalEarnings: profile.driver.total_earnings || 0,
          averageRating: profile.driver.average_rating || 5.0,
          completionRate: 96, // TODO: Calcular basado en datos reales
        });

        // ✅ NUEVO: Cargar TODOS los vehículos del conductor
        try {
          console.log('🚗 Cargando todos los vehículos del conductor...');
          const allVehicles = await vehiclesService.getDriverVehicles();
          
          if (allVehicles && allVehicles.length > 0) {
            console.log(`✅ ${allVehicles.length} vehículos cargados`);
            console.log('📋 Primer vehículo cargado:', JSON.stringify(allVehicles[0], null, 2));
            setVehicles(allVehicles);
          } else {
            console.log('⚠️ No hay vehículos registrados');
            setVehicles([]);
          }
        } catch (vehicleError: any) {
          console.error('❌ Error cargando vehículos:', vehicleError);
          // Si falla, usar el vehículo del perfil como fallback
          if (profile.driver.vehicle) {
            console.log('🔄 Usando vehículo del perfil como fallback:', JSON.stringify(profile.driver.vehicle, null, 2));
            setVehicles([{
              ...profile.driver.vehicle,
              type: profile.driver.vehicle.type || 'sedan'
            }]);
          }
        }

        // ✅ NUEVO: Cargar foto de perfil
        if (profile.driver.profile_photo) {
          console.log('📸 Cargando foto de perfil:', profile.driver.profile_photo);
          setProfilePhoto(profile.driver.profile_photo);
        } else if (profile.driver.profilePhoto) {
          console.log('📸 Cargando foto de perfil (profilePhoto):', profile.driver.profilePhoto);
          setProfilePhoto(profile.driver.profilePhoto);
        } else {
          console.log('⚠️ No hay foto de perfil registrada');
          setProfilePhoto(null);
        }
      } else {
        console.warn('⚠️ No se encontraron datos del conductor en la respuesta');
      }
    } catch (error: any) {
      console.error('❌ Error cargando datos del conductor:', error);
      console.error('Error details:', error.message);
      // Mantener datos por defecto en caso de error
      Alert.alert('Error', 'No se pudieron cargar los datos del perfil. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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

    if (!result.canceled && result.assets[0] && user?.id) {
      setUploadingPhoto(true);
      try {
        if (type === 'profile') {
          console.log('📸 Subiendo foto de perfil a Supabase...');
          
          // Subir foto a Supabase Storage
          const photoUrl = await supabaseStorage.uploadProfilePhoto(
            user.id,
            result.assets[0].uri
          );
          
          console.log('✅ Foto subida a Supabase:', photoUrl);
          
          // Actualizar foto en estado local
          setProfilePhoto(photoUrl);
          
          // Actualizar en la base de datos (drivers table)
          console.log('💾 Actualizando foto en drivers table...');
          const updateResult = await driversService.updateDriver({
            profile_photo: photoUrl
          });
          
          console.log('✅ Foto de perfil actualizada en BD');
          Alert.alert('Éxito', 'Foto de perfil actualizada correctamente');
        }
      } catch (error: any) {
        console.error('❌ Error subiendo foto:', error);
        Alert.alert('Error', error.message || 'No se pudo subir la foto. Intenta nuevamente.');
      } finally {
        setUploadingPhoto(false);
      }
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

  const handleAddVehicle = async () => {
    if (!vehicleFormData.plate || !vehicleFormData.brand || !vehicleFormData.model || !vehicleFormData.color) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
      return;
    }

    setAddingVehicle(true);
    try {
      console.log('🚗 Agregando nuevo vehículo...');
      
      const newVehicle = await vehiclesService.addVehicle({
        plate: vehicleFormData.plate.toUpperCase(),
        brand: vehicleFormData.brand,
        model: vehicleFormData.model,
        year: vehicleFormData.year,
        color: vehicleFormData.color,
        type: vehicleFormData.type,
        is_4x4: vehicleFormData.is_4x4,
        motor: vehicleFormData.motor || undefined,
        chasis: vehicleFormData.chasis || undefined,
        vin: vehicleFormData.vin || undefined,
        cylinders: vehicleFormData.cylinders ? parseInt(vehicleFormData.cylinders) : undefined,
        passengers: vehicleFormData.passengers ? parseInt(vehicleFormData.passengers) : undefined,
        fuel_type: vehicleFormData.fuel_type || undefined,
        tonnage: vehicleFormData.tonnage || undefined,
        vehicle_class: vehicleFormData.vehicle_class || undefined,
        service_type: vehicleFormData.service_type || undefined,
        lien: vehicleFormData.lien || 'NINGUNO',
        emission_date: vehicleFormData.emission_date || undefined,
        registration_number: vehicleFormData.registration_number || undefined,
        registration_expiry: vehicleFormData.registration_expiry || undefined,
        insurance_number: vehicleFormData.insurance_number || undefined,
        insurance_company: vehicleFormData.insurance_company || undefined,
        insurance_start_date: vehicleFormData.insurance_start_date || undefined,
        insurance_expiry: vehicleFormData.insurance_expiry || undefined,
      });

      console.log('✅ Vehículo agregado exitosamente');
      
      // Recargar vehículos
      await loadDriverData();
      
      // Limpiar formulario y cerrar modal
      setVehicleFormData({
        plate: '',
        brand: '',
        model: '',
        year: new Date().getFullYear(),
        color: '',
        type: 'sedan',
        is_4x4: false,
        motor: '',
        chasis: '',
        vin: '',
        cylinders: '',
        passengers: '',
        fuel_type: 'Gasolina',
        tonnage: '',
        vehicle_class: 'PARTICULAR',
        service_type: 'PRIVADO',
        lien: 'NINGUNO',
        emission_date: '',
        registration_number: '',
        registration_expiry: '',
        insurance_number: '',
        insurance_company: '',
        insurance_start_date: '',
        insurance_expiry: '',
      });
      setShowAddVehicleModal(false);
      
      Alert.alert('Éxito', 'Vehículo agregado correctamente');
    } catch (error: any) {
      console.error('❌ Error agregando vehículo:', error);
      Alert.alert('Error', error.message || 'Error al agregar vehículo');
    } finally {
      setAddingVehicle(false);
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

  // Validar si un vehículo tiene datos completos
  const isVehicleComplete = (vehicle: Vehicle): boolean => {
    const hasBasicInfo = vehicle.plate && vehicle.brand && vehicle.model && vehicle.year && vehicle.color && vehicle.type;
    const hasRegistration = vehicle.registrationNumber && vehicle.registrationExpiry && vehicle.registrationPhoto;
    const hasInsurance = vehicle.insuranceNumber && vehicle.insuranceCompany && vehicle.insuranceExpiry && vehicle.insurancePhoto;
    const hasVehiclePhoto = vehicle.vehiclePhoto;
    
    return !!(hasBasicInfo && hasRegistration && hasInsurance && hasVehiclePhoto);
  };

  // Obtener mensaje de por qué un vehículo está incompleto
  const getIncompleteReason = (vehicle: Vehicle): string => {
    const issues: string[] = [];
    
    if (!vehicle.plate || !vehicle.brand || !vehicle.model || !vehicle.year || !vehicle.color || !vehicle.type) {
      issues.push('Información básica incompleta');
    }
    if (!vehicle.registrationNumber || !vehicle.registrationExpiry || !vehicle.registrationPhoto) {
      issues.push('Datos de registro incompletos');
    }
    if (!vehicle.insuranceNumber || !vehicle.insuranceCompany || !vehicle.insuranceExpiry || !vehicle.insurancePhoto) {
      issues.push('Datos de seguro incompletos');
    }
    if (!vehicle.vehiclePhoto) {
      issues.push('Foto del vehículo faltante');
    }
    
    return issues.join(', ');
  };

  const handleSwitchVehicle = async (vehicleId: string) => {
    try {
      // Buscar el vehículo a cambiar
      const vehicleToSwitch = vehicles.find(v => v.id === vehicleId);
      
      if (!vehicleToSwitch) {
        Alert.alert('Error', 'Vehículo no encontrado');
        return;
      }

      // Validar que el vehículo esté completo
      if (!isVehicleComplete(vehicleToSwitch)) {
        const reason = getIncompleteReason(vehicleToSwitch);
        Alert.alert(
          'Vehículo Incompleto',
          `No puedes cambiar a este vehículo porque:\n\n${reason}\n\nPor favor, completa la información en la pantalla de verificación.`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Completar Información',
              onPress: () => navigation.navigate('VehicleVerification', { vehicleId: vehicleToSwitch.id })
            }
          ]
        );
        return;
      }

      console.log('🔄 Cambiando vehículo activo a:', vehicleId);
      
      await vehiclesService.switchVehicle(vehicleId);
      
      console.log('✅ Vehículo cambiado exitosamente');
      
      // Recargar vehículos
      await loadDriverData();
      
      Alert.alert('Éxito', `Vehículo ${vehicleToSwitch.brand} ${vehicleToSwitch.model} activado correctamente`);
    } catch (error: any) {
      console.error('❌ Error cambiando vehículo:', error);
      Alert.alert('Error', error.message || 'Error al cambiar vehículo');
    }
  };

  // Solicitar acceso a Conductor Designado
  const handleRequestDesignatedDriverAccess = async () => {
    try {
      setLoadingRequestStatus(true);
      
      console.log('🚙 Solicitando acceso a Conductor Designado...');
      const result = await designatedDriverService.requestDesignatedDriverAccess();
      
      console.log('✅ Solicitud enviada:', result);
      
      // Actualizar estado local
      setDesignatedDriverRequestStatus('pending');
      
      Alert.alert(
        'Solicitud Enviada',
        'Tu solicitud ha sido enviada correctamente.\n\nNuestro equipo la revisará en 24 horas y te notificaremos cuando sea aprobada.'
      );
    } catch (error: any) {
      console.error('❌ Error solicitando acceso:', error);
      Alert.alert('Error', error.message || 'Error al enviar solicitud');
    } finally {
      setLoadingRequestStatus(false);
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
    <>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header con foto de perfil */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => handleUploadPhoto('profile')}
          disabled={uploadingPhoto}
        >
          {uploadingPhoto ? (
            <View style={styles.avatarPlaceholder}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : profilePhoto ? (
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
          <Text style={styles.ratingText}>{(typeof stats.averageRating === 'number' ? stats.averageRating : 5.0).toFixed(1)}</Text>
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
              <Text style={styles.walletValue}>C${(typeof stats.totalEarnings === 'number' ? stats.totalEarnings : 0).toFixed(2)}</Text>
            </View>
            <View style={styles.walletDivider} />
            <View style={styles.walletItem}>
              <Text style={styles.walletLabel}>Viajes Completados</Text>
            </View>
            <View style={styles.walletDivider} />
            <View style={styles.walletItem}>
              <Text style={styles.walletLabel}>Calificación</Text>
              <Text style={styles.walletValue}>⭐ {(typeof stats.averageRating === 'number' ? stats.averageRating : 5.0).toFixed(1)}</Text>
            </View>
          </View>
        </View>
      </View>
      {/* Mis Vehículos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚗 Mis Vehículos</Text>
        
        {vehicles.map((vehicle) => (
          <View key={vehicle.id} style={[styles.vehicleCard, vehicle.is_active && styles.vehicleCardActive]}>
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
              {vehicle.is_active && (
                <Text style={styles.activeVehicleLabel}>✅ Vehículo Activo</Text>
              )}
            </View>
            <View style={styles.vehicleButtonsContainer}>
              <TouchableOpacity 
                style={[styles.verifyButton]}
                onPress={() => navigation.navigate('VehicleVerification', { vehicleId: vehicle.id })}
              >
                <Text style={styles.verifyButtonText}>
                  {isVehicleComplete(vehicle) ? 'Ver' : 'Verificar'}
                </Text>
              </TouchableOpacity>
              {vehicles.length > 1 && (
                <TouchableOpacity 
                  style={[styles.changeButton, vehicle.is_active && styles.changeButtonActive]}
                  onPress={() => handleSwitchVehicle(vehicle.id)}
                >
                  <Text style={[styles.changeButtonText, vehicle.is_active && styles.changeButtonTextActive]}>
                    {vehicle.is_active ? '✓ Activo' : 'Cambiar'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        <TouchableOpacity 
          style={styles.addVehicleButton}
          onPress={() => setShowAddVehicleModal(true)}
        >
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
                { backgroundColor: ((driverData.license_photo_front && driverData.license_photo_back) || driverData.license_photo) ? '#4CAF50' : '#FF9800' }
              ]}>
                {((driverData.license_photo_front && driverData.license_photo_back) || driverData.license_photo) ? <Text style={styles.statusIcon}>✓</Text> : <Text style={styles.statusIcon}>⏱</Text>}
              </View>
              <View style={styles.documentInfo}>
                <Text style={styles.documentIcon}>🪪</Text>
                <View>
                  <Text style={styles.documentName}>Licencia de Conducir</Text>
                  <Text style={[styles.documentStatus, { 
                    color: (driverData.license_photo_front && driverData.license_photo_back) || driverData.license_photo 
                      ? '#4CAF50' 
                      : '#FF9800' 
                  }]}>
                    {(driverData.license_photo_front && driverData.license_photo_back) || driverData.license_photo 
                      ? '✅ Completo' 
                      : '❌ Pendiente'}
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
              onPress={() => navigation.navigate('DriversDocumentsInspection')}
            >
              <Text style={styles.uploadButtonText}>
                {(driverData.license_photo_front && driverData.license_photo_back && driverData.license_number && driverData.license_expiry) 
                  ? 'Ver' 
                  : (driverData.license_photo_front && driverData.license_photo_back) || driverData.license_photo
                    ? 'Actualizar'
                    : 'Completar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Solicitar Conductor Designado */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚙 Conductor Designado</Text>
        
        <Animated.View 
          style={[
            styles.designatedDriverCard,
            {
              transform: [{ scale: cardScaleAnim }],
              opacity: cardOpacityAnim,
            }
          ]}
        >
          <View style={styles.designatedDriverContent}>
            <Text style={styles.designatedDriverTitle}>Amplía tus oportunidades</Text>
            <Text style={styles.designatedDriverDescription}>
              Conviértete en conductor designado y accede a viajes premium donde el cliente proporciona el vehículo. Gana más con viajes de lujo.
            </Text>
            
            <View style={styles.designatedDriverBenefits}>
              <Text style={styles.benefitItem}>✓ Viajes de conductor designado</Text>
              <Text style={styles.benefitItem}>✓ Mayor tarifa por viaje</Text>
              <Text style={styles.benefitItem}>✓ Clientes premium</Text>
              <Text style={styles.benefitItem}>✓ Mantén tus viajes normales</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.designatedDriverButton,
              designatedDriverRequestStatus === 'pending' && styles.designatedDriverButtonDisabled
            ]}
            onPress={() => {
              // Si ya hay solicitud pendiente, no permitir enviar otra
              if (designatedDriverRequestStatus === 'pending') {
                Alert.alert(
                  'Solicitud Pendiente',
                  'Ya tienes una solicitud pendiente. Nuestro equipo la revisará en 24 horas.'
                );
                return;
              }

              Alert.alert(
                'Solicitar Conductor Designado',
                '¿Deseas solicitar acceso al programa de conductor designado?\n\nRequisitos:\n• Vehículo 4x4 o SUV\n• Licencia válida\n• Documentos verificados\n• Calificación mínima 4.8 estrellas',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Solicitar',
                    onPress: handleRequestDesignatedDriverAccess
                  }
                ]
              );
            }}
            disabled={designatedDriverRequestStatus === 'pending' || loadingRequestStatus}
          >
            {loadingRequestStatus ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.designatedDriverButtonText}>
                {designatedDriverRequestStatus === 'pending' ? 'Solicitud Enviada' : 'Solicitar Acceso'}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
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

    {/* Modal para agregar vehículo */}
    <Modal
      visible={showAddVehicleModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowAddVehicleModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Agregar Nuevo Vehículo</Text>
            <TouchableOpacity onPress={() => setShowAddVehicleModal(false)}>
              <Text style={styles.modalCloseButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalForm}>
            {/* SECCIÓN: INFORMACIÓN BÁSICA */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>📋 Información Básica</Text>
              
              <Text style={styles.formLabel}>Placa *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="ABC-123"
                value={vehicleFormData.plate}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, plate: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Marca *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Toyota"
                value={vehicleFormData.brand}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, brand: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Modelo *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Corolla"
                value={vehicleFormData.model}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, model: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Año *</Text>
              <TextInput
                style={styles.formInput}
                placeholder={new Date().getFullYear().toString()}
                value={vehicleFormData.year.toString()}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, year: parseInt(text) || new Date().getFullYear() })}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Color *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Blanco"
                value={vehicleFormData.color}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, color: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Tipo</Text>
              <TextInput
                style={styles.formInput}
                placeholder="sedan"
                value={vehicleFormData.type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, type: text })}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* SECCIÓN: ESPECIFICACIONES TÉCNICAS */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>⚙️ Especificaciones Técnicas</Text>
              
              <Text style={styles.formLabel}>Motor</Text>
              <TextInput
                style={styles.formInput}
                placeholder="2.0L"
                value={vehicleFormData.motor}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, motor: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Chasis</Text>
              <TextInput
                style={styles.formInput}
                placeholder="ABC123456"
                value={vehicleFormData.chasis}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, chasis: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>VIN</Text>
              <TextInput
                style={styles.formInput}
                placeholder="VIN123456789"
                value={vehicleFormData.vin}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, vin: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Cilindros</Text>
              <TextInput
                style={styles.formInput}
                placeholder="4"
                value={vehicleFormData.cylinders}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, cylinders: text })}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Pasajeros</Text>
              <TextInput
                style={styles.formInput}
                placeholder="5"
                value={vehicleFormData.passengers}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, passengers: text })}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Tipo de Combustible</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Gasolina"
                value={vehicleFormData.fuel_type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, fuel_type: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Tonelaje</Text>
              <TextInput
                style={styles.formInput}
                placeholder="2.50"
                value={vehicleFormData.tonnage}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, tonnage: text })}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* SECCIÓN: CLASIFICACIÓN */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>🏷️ Clasificación</Text>
              
              <Text style={styles.formLabel}>Clase de Vehículo</Text>
              <TextInput
                style={styles.formInput}
                placeholder="PARTICULAR"
                value={vehicleFormData.vehicle_class}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, vehicle_class: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Tipo de Servicio</Text>
              <TextInput
                style={styles.formInput}
                placeholder="PRIVADO"
                value={vehicleFormData.service_type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, service_type: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Gravamen</Text>
              <TextInput
                style={styles.formInput}
                placeholder="NINGUNO"
                value={vehicleFormData.lien}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, lien: text })}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* SECCIÓN: DOCUMENTOS */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>📄 Documentos</Text>
              
              <Text style={styles.formLabel}>Fecha de Emisión</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                value={vehicleFormData.emission_date}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, emission_date: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Número de Registro</Text>
              <TextInput
                style={styles.formInput}
                placeholder="B2301230"
                value={vehicleFormData.registration_number}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, registration_number: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Vencimiento de Registro</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                value={vehicleFormData.registration_expiry}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, registration_expiry: text })}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* SECCIÓN: SEGURO */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>🛡️ Seguro</Text>
              
              <Text style={styles.formLabel}>Número de Seguro</Text>
              <TextInput
                style={styles.formInput}
                placeholder="RCO30201102"
                value={vehicleFormData.insurance_number}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_number: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Compañía de Seguro</Text>
              <TextInput
                style={styles.formInput}
                placeholder="BAC"
                value={vehicleFormData.insurance_company}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_company: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Inicio de Seguro</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                value={vehicleFormData.insurance_start_date}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_start_date: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Vencimiento de Seguro</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                value={vehicleFormData.insurance_expiry}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_expiry: text })}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowAddVehicleModal(false)}
            >
              <Text style={styles.modalCancelButtonText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalSubmitButton, addingVehicle && styles.modalSubmitButtonDisabled]}
              onPress={handleAddVehicle}
              disabled={addingVehicle}
            >
              {addingVehicle ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitButtonText}>Agregar Vehículo</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
    letterSpacing: 0.3,
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
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  walletRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  walletItem: {
    flex: 1,
    alignItems: 'center',
  },
  walletDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 14,
  },
  walletLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  walletValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.3,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
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
  changeButtonActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  changeButtonTextActive: {
    color: colors.background,
    fontWeight: '700',
  },
  vehicleButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  verifyButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  verifyButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  vehicleCardActive: {
    borderColor: '#D4AF37',
    borderWidth: 2,
    backgroundColor: colors.card,
  },
  activeVehicleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
    marginTop: 4,
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  documentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIndicator: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statusIcon: {
    fontSize: 22,
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
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
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalCloseButton: {
    fontSize: 24,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalForm: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  formInput: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitButtonDisabled: {
    opacity: 0.6,
  },
  modalSubmitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.background,
  },
  formSection: {
    marginBottom: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  designatedDriverCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    marginHorizontal: 0,
  },
  designatedDriverContent: {
    marginBottom: 18,
  },
  designatedDriverTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2196F3',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  designatedDriverDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
    fontWeight: '500',
  },
  designatedDriverBenefits: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  benefitItem: {
    fontSize: 12,
    color: '#1565C0',
    marginBottom: 6,
    fontWeight: '600',
    lineHeight: 16,
  },
  designatedDriverButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  designatedDriverButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  designatedDriverButtonDisabled: {
    backgroundColor: '#90CAF9',
    opacity: 0.8,
    shadowOpacity: 0.1,
  },
});
