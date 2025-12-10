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
  Switch,
  Linking,
  Platform,
  AppState,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { safeFormatDate } from '../../utils/safeFormatters';
import * as ExpoImagePicker from 'expo-image-picker';
import driversService from '../../services/driversService';
import vehiclesService from '../../services/vehiclesService';
import designatedDriverService from '../../services/designatedDriverService';
import supabaseStorage from '../../services/supabaseStorage';
import { initializeFirebase } from '../../config/firebase';
import { getDatabase, ref, get } from 'firebase/database';
import proximityService from '../../services/proximityService';
import { overlayManager } from '../../native/overlay';

import { FormattedInput } from '../../components/FormattedInput';
import ImagePickerComponent from '../../components/ImagePicker';
import earningsService from '../../services/earningsService';

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
  isActive?: boolean;
  is_active?: boolean;
  registrationNumber?: string;
  registrationExpiry?: string;
  registrationPhoto?: string;
  registrationPhotoFront?: string;
  registrationPhotoBack?: string;
  insuranceNumber?: string;
  insuranceCompany?: string;
  insuranceExpiry?: string;
  insurancePhoto?: string;
  vehiclePhoto?: string;
}

interface DriverData {
  id: string;
  // Campos en camelCase (del backend)
  licenseNumber?: string;
  licenseExpiry?: string;
  licensePhoto?: string;
  licensePhotoFront?: string;
  licensePhotoBack?: string;
  documentsStatus?: string;
  accountStatus?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  // Campos en snake_case (compatibilidad)
  license_number?: string;
  license_expiry?: string;
  license_photo?: string;
  license_photo_front?: string;
  license_photo_back?: string;
  documents_status?: string;
  account_status?: string;
  status?: string;
  totalRides?: number;
  total_rides?: number;
  averageRating?: number;
  average_rating?: number;
  totalEarnings?: number;
  total_earnings?: number;
  first_name?: string;
  last_name?: string;
}

const normalizeDocumentsStatus = (driver: DriverData | null) => {
  if (!driver) {
    return null;
  }

  const raw = driver.documentsStatus || driver.documents_status || '';
  if (!raw) {
    return null;
  }

  const normalized = String(raw).toLowerCase();

  if (['verified'].includes(normalized)) {
    return 'verified';
  }

  if (['pending', 'pending_verification', 'in_review', 'under_review', 'review', 'verifying'].includes(normalized)) {
    return 'pending';
  }

  if (['suspended'].includes(normalized)) {
    return 'suspended';
  }

  if (['rejected', 'declined', 'denied'].includes(normalized)) {
    return 'rejected';
  }

  return normalized;
};

export default function DriverProfileScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user } = useAuth();
  const { settings: voiceSettings, setEnabled: setVoiceAssistantEnabled, initialized: voiceAssistantInitialized } = useVoiceAssistant();

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [stats, setStats] = useState<DriverStats>({
    totalRides: 0,
    totalEarnings: 0,
    averageRating: 5.0,
    completionRate: 100,
  });
  const [dailyStats, setDailyStats] = useState<{ rides: number; earnings: number }>({ rides: 0, earnings: 0 });
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
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
    registration_photo_front: null as string | null,
    registration_photo_back: null as string | null,
    insurance_number: '',
    insurance_company: '',
    insurance_start_date: '',
    insurance_expiry: '',
    insurance_photo: null as string | null,
    vehicle_photo: null as string | null,
  });
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [designatedDriverRequestStatus, setDesignatedDriverRequestStatus] = useState<string | null>(null);
  const [loadingRequestStatus, setLoadingRequestStatus] = useState(false);
  const [voiceAssistantSwitch, setVoiceAssistantSwitch] = useState<boolean>(voiceSettings.enabled);
  const [overlayToggleEnabled, setOverlayToggleEnabled] = useState<boolean>(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState<boolean>(Platform.OS !== 'android');
  const [overlayCheckingPermission, setOverlayCheckingPermission] = useState<boolean>(false);

  const normalizedDocumentStatus = normalizeDocumentsStatus(driverData);
  const normalizedAccountStatus = useMemo(() => {
    if (!driverData) {
      return null;
    }

    const raw = driverData.accountStatus || driverData.account_status || driverData.status || '';
    if (!raw) {
      return null;
    }

    const normalized = String(raw).toLowerCase();

    if (['active', 'verified', 'approved'].includes(normalized)) return 'active';
    if (['pending', 'pending_verification', 'in_review'].includes(normalized)) return 'pending';
    if (['suspended'].includes(normalized)) return 'suspended';
    if (['rejected', 'disabled', 'denied'].includes(normalized)) return 'rejected';

    return 'pending';
  }, [driverData]);
  const hasBothLicensePhotos = Boolean(
    driverData &&
    ((driverData.license_photo_front || driverData.licensePhotoFront) &&
      (driverData.license_photo_back || driverData.licensePhotoBack)),
  );

  const hasSingleLicensePhoto = Boolean(
    driverData && (driverData.license_photo || driverData.licensePhoto),
  );

  const hasLicenseNumber = Boolean(
    driverData && (driverData.license_number || driverData.licenseNumber),
  );

  const hasLicenseExpiry = Boolean(
    driverData && (driverData.license_expiry || driverData.licenseExpiry),
  );

  const hasCompleteDocuments = Boolean(
    driverData &&
      (hasBothLicensePhotos || hasSingleLicensePhoto) &&
      hasLicenseNumber &&
      hasLicenseExpiry,
  );

  const driverLicenseExpiry = driverData?.license_expiry || driverData?.licenseExpiry || null;

  const documentStatusColor = normalizedDocumentStatus === 'verified'
    ? '#4CAF50'
    : normalizedDocumentStatus === 'rejected' || normalizedDocumentStatus === 'suspended'
      ? '#f44336'
      : normalizedDocumentStatus === 'pending'
        ? '#FF9800'
        : hasCompleteDocuments
          ? '#4CAF50'
          : '#FF9800';

  const documentStatusIcon = normalizedDocumentStatus === 'verified'
    ? '✓'
    : normalizedDocumentStatus === 'rejected'
      ? '✕'
      : normalizedDocumentStatus === 'suspended'
        ? '⚠️'
        : '⏱';

  const documentStatusText = normalizedDocumentStatus === 'verified'
    ? '✅ Verificado'
    : normalizedDocumentStatus === 'rejected'
      ? '❌ Rechazado'
      : normalizedDocumentStatus === 'suspended'
        ? '⚠️ Suspendido'
        : normalizedDocumentStatus === 'pending'
          ? '⏱ Pendiente de revisión'
          : hasCompleteDocuments
            ? '✅ Completo (en revisión)'
            : '❌ Pendiente';

  const documentButtonLabel = normalizedDocumentStatus === 'verified'
    ? 'Ver'
    : normalizedDocumentStatus === 'pending'
      ? 'Ver detalles'
      : normalizedDocumentStatus === 'rejected' || normalizedDocumentStatus === 'suspended'
        ? 'Corregir'
        : hasCompleteDocuments
          ? 'Enviar a revisión'
          : 'Completar';

  const displayFirstName = driverData?.firstName || driverData?.first_name || user?.name?.split(' ')?.[0] || user?.name || 'Conductor';
  const displayLastName = driverData?.lastName || driverData?.last_name || '';
  const displayName = [displayFirstName, displayLastName].filter(Boolean).join(' ').trim() || 'Conductor';
  const displayEmail = driverData?.email || user?.email || null;

  const renderAccountStatusBadge = () => {
    if (!normalizedAccountStatus) {
      return null;
    }

    let label = 'Cuenta';
    let badgeColor = '#9E9E9E';

    switch (normalizedAccountStatus) {
      case 'active':
        label = 'Cuenta activa';
        badgeColor = '#4CAF50';
        break;
      case 'pending':
        label = 'Cuenta pendiente';
        badgeColor = '#FF9800';
        break;
      case 'suspended':
        label = 'Cuenta suspendida';
        badgeColor = '#f44336';
        break;
      case 'rejected':
        label = 'Cuenta rechazada';
        badgeColor = '#f44336';
        break;
      default:
        label = `Cuenta ${normalizedAccountStatus}`;
        badgeColor = '#9E9E9E';
        break;
    }

    return (
      <View style={[styles.accountStatusBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.accountStatusBadgeText}>{label}</Text>
      </View>
    );
  };
  
  // Animaciones
  const cardScaleAnim = useMemo(() => new Animated.Value(0.95), []);
  const cardOpacityAnim = useMemo(() => new Animated.Value(0), []);

  const formatCurrency = (value: number = 0) => `C$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;

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
    if (!voiceAssistantInitialized) return;
    setVoiceAssistantSwitch(voiceSettings.enabled);
  }, [voiceAssistantInitialized, voiceSettings.enabled]);

  useEffect(() => {
    loadDriverData();
    loadDesignatedDriverStatus();
    loadEarningsStats();
    loadOverlayPreference();

    let unsubscribeOverlay: (() => void) | undefined;
    if (Platform.OS === 'android') {
      unsubscribeOverlay = proximityService.subscribeOverlayEnabled((enabled) => {
        setOverlayToggleEnabled(enabled);
      });
    }

    const appStateListener = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Invalidar cache para forzar recarga desde AsyncStorage
        proximityService.invalidateOverlayCache();
        loadOverlayPreference();
      }
    });

    // Escuchar cambios de foco para recargar datos cuando se regrese a la pantalla
    const unsubscribe = navigation.addListener('focus', () => {
      loadDriverData();
      loadDesignatedDriverStatus();
      loadEarningsStats();
      loadOverlayPreference();
    });

    return () => {
      unsubscribe();
      if (unsubscribeOverlay) {
        unsubscribeOverlay();
      }
      appStateListener.remove();
    };
  }, [navigation]);

  useEffect(() => {
    if (user?.id) {
      loadSelectedVehicle(user.id);
    }
  }, [user?.id]);

  const loadEarningsStats = async () => {
    try {
      const [todayResponse, totalsResponse] = await Promise.all([
        earningsService.getDriverEarnings('today'),
        earningsService.getDriverStats(),
      ]);

      if (todayResponse?.summary) {
        setDailyStats({
          rides: todayResponse.summary.totalRides ?? 0,
          earnings:
            todayResponse.summary.netEarnings ?? todayResponse.summary.totalEarnings ?? 0,
        });
      } else {
        setDailyStats({ rides: 0, earnings: 0 });
      }

      if (totalsResponse) {
        setStats((prev) => ({
          ...prev,
          totalRides: totalsResponse.totalRides ?? prev.totalRides ?? 0,
          totalEarnings:
            totalsResponse.totalNetEarnings ?? totalsResponse.totalEarnings ?? prev.totalEarnings ?? 0,
        }));
      }
    } catch (error) {
      console.error('Error cargando estadísticas de ganancias del conductor:', error);
    }
  };

  const loadOverlayPreference = async () => {
    if (Platform.OS !== 'android') {
      setOverlayToggleEnabled(false);
      setOverlayPermissionGranted(true);
      return;
    }

    try {
      const [enabled, hasPermission] = await Promise.all([
        proximityService.getOverlayEnabled(),
        overlayManager.hasPermission(),
      ]);
      if (enabled && !hasPermission) {
        await proximityService.setOverlayEnabled(false);
        setOverlayToggleEnabled(false);
      } else {
        setOverlayToggleEnabled(enabled);
      }
      setOverlayPermissionGranted(hasPermission);
    } catch (error) {
      console.warn('⚠️ Error cargando preferencia de overlay:', error);
    }
  };

  const handleOverlayToggle = async (nextValue: boolean) => {
    if (Platform.OS !== 'android') {
      Alert.alert('No disponible', 'La función de aparecer encima solo está disponible en Android.');
      return;
    }

    setOverlayCheckingPermission(true);
    try {
      if (nextValue) {
        // Guardar preferencia ANTES de abrir ajustes
        await proximityService.setOverlayEnabled(true);
        setOverlayToggleEnabled(true);
        
        Alert.alert(
          'Activa el permiso',
          'Abre la pantalla de "Mostrar encima de otras apps" y asegúrate de habilitarlo para Rundi.'
        );
        await overlayManager.openSystemSettings();
        
        // Invalidar cache y recargar preferencia desde storage después de volver de ajustes
        proximityService.invalidateOverlayCache();
        const currentPref = await proximityService.getOverlayEnabled();
        setOverlayToggleEnabled(currentPref);
        
        const hasPermission = await overlayManager.hasPermission();
        setOverlayPermissionGranted(hasPermission);
        await proximityService.debugLogOverlayState('activation-post-settings');
        
        if (!hasPermission) {
          await proximityService.setOverlayEnabled(false);
          setOverlayToggleEnabled(false);
          Alert.alert(
            'Permiso no concedido',
            'No se detectó el permiso activo. Vuelve a intentarlo desde la pantalla de ajustes.'
          );
        } else {
          await proximityService.debugTriggerFallbackOverlay('activation');
        }
      } else {
        Alert.alert(
          'Desactiva el permiso',
          'Abre la pantalla de "Mostrar encima de otras apps" y deshabilítalo para Rundi.'
        );
        await overlayManager.openSystemSettings();
        const hasPermission = await overlayManager.hasPermission();
        await proximityService.debugLogOverlayState('deactivation-post-settings');
        if (hasPermission) {
          Alert.alert(
            'Permiso sigue activo',
            'El permiso aún está activo. Desactívalo manualmente en la pantalla de ajustes.'
          );
        }
      }
    } catch (error: any) {
      console.error('❌ Error actualizando preferencia de overlay:', error);
      Alert.alert('Error', error?.message || 'No se pudo actualizar la preferencia. Intenta de nuevo.');
      await loadOverlayPreference();
    } finally {
      setOverlayCheckingPermission(false);
    }
  };

  const handleVoiceAssistantToggle = async (value: boolean) => {
    setVoiceAssistantSwitch(value);
    try {
      await setVoiceAssistantEnabled(value);
    } catch (error) {
      console.error('❌ Error actualizando asistente de voz:', error);
      setVoiceAssistantSwitch((prev) => !prev);
    }
  };

  // Cargar estado de solicitud de Conductor Designado
  const loadDesignatedDriverStatus = async () => {
    try {
      if (!user?.id) return;
      

      console.log('📋 Cargando estado de solicitud de Conductor Designado...');
      const status = await designatedDriverService.getDesignatedDriverRequestStatus();
      
      console.log('✅ Estado de solicitud obtenido:', status);
      // Backend devuelve: { success, status, ... }
      // Guardamos solo el campo status (pending, not_requested, approved, etc.)
      setDesignatedDriverRequestStatus(status?.status ?? null);
    } catch (error) {
      console.error('⚠️ Error cargando estado de solicitud:', error);
      // Si hay error, asumir que no hay solicitud
      setDesignatedDriverRequestStatus(null);
    }
  };

  const loadDriverData = async () => {
    setLoading(true);
    if (!user?.id) {
      console.log('⚠️ No hay user.id disponible');
      setLoading(false);
      return;
    }

    try {
      console.log('📱 Cargando datos del conductor para:', user.id);
      
      // ✅ Usar getMyDriverProfile() para obtener el perfil del usuario autenticado
      const profile = await driversService.getMyDriverProfile();
      
      console.log('✅ Perfil cargado:', profile);

      // ✅ El servicio retorna directamente el objeto driver, no envuelto
      if (profile) {
        setDriverData(profile);

        // Actualizar estadísticas desde los datos reales
        setStats({
          totalRides: profile.totalRides || profile.total_rides || 0,
          totalEarnings: profile.earnings || profile.total_earnings || 0,
          averageRating: profile.rating || profile.average_rating || 5.0,
          completionRate: 96, // TODO: Calcular basado en datos reales
        });

        // ✅ NUEVO: Cargar vehículos desde el perfil o desde la BD
        try {
          console.log('🚗 Cargando vehículos del conductor...');
          
          // Prioridad 1: Usar vehículos del perfil si existen
          if (profile.vehicles && Array.isArray(profile.vehicles) && profile.vehicles.length > 0) {
            console.log(`✅ ${profile.vehicles.length} vehículos encontrados en el perfil`);
            console.log('📋 Primer vehículo:', JSON.stringify(profile.vehicles[0], null, 2));
            setVehicles(profile.vehicles);
          } else {
            // Prioridad 2: Intentar cargar de la BD
            console.log('📡 Intentando cargar vehículos de la BD...');
            const allVehicles = await vehiclesService.getDriverVehicles();
            
            if (allVehicles && allVehicles.length > 0) {
              console.log(`✅ ${allVehicles.length} vehículos cargados de la BD`);
              console.log('📋 Primer vehículo cargado:', JSON.stringify(allVehicles[0], null, 2));
              setVehicles(allVehicles);
            } else {
              console.log('⚠️ No hay vehículos registrados');
              setVehicles([]);
            }
          }
        } catch (vehicleError: any) {
          console.error('❌ Error cargando vehículos:', vehicleError);
          // Si falla, usar los vehículos del perfil si existen
          if (profile.vehicles && Array.isArray(profile.vehicles)) {
            console.log('🔄 Usando vehículos del perfil como fallback');
            setVehicles(profile.vehicles);
          }
        }

        // ✅ NUEVO: Cargar foto de perfil
        if (profile.profilePhoto) {
          console.log('📸 Cargando foto de perfil:', profile.profilePhoto);
          setProfilePhoto(profile.profilePhoto);
        } else if (profile.profile_photo) {
          console.log('📸 Cargando foto de perfil (profile_photo):', profile.profile_photo);
          setProfilePhoto(profile.profile_photo);
        } else {
          console.log('⚠️ No hay foto de perfil registrada');
          setProfilePhoto(null);
        }
      } else {
        console.warn('⚠️ No se encontraron datos del conductor en la respuesta');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar datos del conductor';
      console.warn('⚠️ Error cargando datos del conductor:', message);
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedVehicle = async (userUuid: string) => {
    try {
      const { app } = await initializeFirebase();
      if (!app) {
        console.warn('⚠️ Firebase app no inicializado, no se pudo cargar vehículo seleccionado');
        return;
      }
      const db = getDatabase(app);
      const vehicleRef = ref(db, `driversInfo/${userUuid}/vehicle`);
      const snapshot = await get(vehicleRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        const vehicleId = typeof data === 'string' ? data : data?.id;
        setSelectedVehicleId(vehicleId ?? null);
      } else {
        setSelectedVehicleId(null);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar vehículo seleccionado';
      console.warn('⚠️ Error cargando vehículo seleccionado:', message);
    }
  };

  const handleUploadPhoto = async (type: 'profile' | 'vehicle' | 'document', docType?: string) => {
    const { status } = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permiso Denegado', 'Necesitamos acceso a tu galería para subir fotos');
      return;
    }

    const result = await ExpoImagePicker.launchImageLibraryAsync({
      mediaTypes: ExpoImagePicker.MediaTypeOptions.Images,
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
        registration_photo_front: vehicleFormData.registration_photo_front || undefined,
        registration_photo_back: vehicleFormData.registration_photo_back || undefined,
        insurance_number: vehicleFormData.insurance_number || undefined,
        insurance_company: vehicleFormData.insurance_company || undefined,
        insurance_start_date: vehicleFormData.insurance_start_date || undefined,
        insurance_expiry: vehicleFormData.insurance_expiry || undefined,
        insurance_photo: vehicleFormData.insurance_photo || undefined,
        vehicle_photo: vehicleFormData.vehicle_photo || undefined,
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
        registration_photo_front: null,
        registration_photo_back: null,
        insurance_number: '',
        insurance_company: '',
        insurance_start_date: '',
        insurance_expiry: '',
        insurance_photo: null,
        vehicle_photo: null,
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
    const hasRegistration = vehicle.registrationNumber && vehicle.registrationExpiry && vehicle.registrationPhotoFront && vehicle.registrationPhotoBack;
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
    if (!vehicle.registrationNumber || !vehicle.registrationExpiry || !vehicle.registrationPhotoFront || !vehicle.registrationPhotoBack) {
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

      if (!vehicleToSwitch.is_active && !vehicleToSwitch.isActive) {
        Alert.alert('Vehículo no autorizado', 'Este vehículo aún no ha sido aprobado por el equipo administrativo.');
        return;
      }

      if (!isVehicleComplete(vehicleToSwitch)) {
        const reason = getIncompleteReason(vehicleToSwitch);
        Alert.alert(
          'Vehículo incompleto',
          `No puedes cambiar a este vehículo porque:\n\n${reason}\n\nPor favor, completa la información en la pantalla de verificación.`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Completar información',
              onPress: () => navigation.navigate('VehicleVerification', { vehicleId: vehicleToSwitch.id })
            }
          ]
        );
        return;
      }

      await vehiclesService.switchVehicle(vehicleId);

      setSelectedVehicleId(vehicleId);
      setVehicles((prev) =>
        prev.map((vehicle) =>
          vehicle.id === vehicleId
            ? {
                ...vehicle,
                is_active: vehicle.is_active ?? vehicle.isActive ?? true,
                isActive: true,
              }
            : { ...vehicle }
        )
      );

     // Alert.alert('Éxito', 'Vehículo seleccionado correctamente');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cambiar vehículo';
      console.error('❌ Error cambiando vehículo:', message);
      Alert.alert('Error', message || 'No se pudo cambiar el vehículo');
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
      {/* Header estilo ProfileScreen */}
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
          <Text style={styles.headerTitle}>Mi Perfil</Text>
          <View style={styles.headerTopSpacer} />
        </View>

        <View style={styles.headerMainRow}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => handleUploadPhoto('profile')}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {displayName.charAt(0).toUpperCase() || 'C'}
                </Text>
              </View>
            )}
            <View style={styles.cameraIcon}>
              <Text style={styles.cameraIconText}>📷</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <Text style={styles.driverName}>{displayName}</Text>
            {displayEmail && <Text style={styles.driverEmail}>{displayEmail}</Text>}
            <Text style={styles.memberId}>ID: {user?.id}</Text>

            <View style={styles.headerBottomRow}>
              {renderAccountStatusBadge()}
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingStars}>⭐</Text>
                <Text style={styles.ratingText}>{(typeof stats.averageRating === 'number' ? stats.averageRating : 5.0).toFixed(1)}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('Account')}>
              <View style={styles.editProfileBadge}>
                  <Text style={styles.editProfileText}>Editar perfil</Text>
               </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Content Card */}
      <View style={styles.contentCard}>
        {/* Cartera / Ganancias - Cards Flotantes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Cartera</Text>
            <TouchableOpacity style={styles.rechargeButton}>
              <Text style={styles.rechargeButtonText}>Recargas de saldo, bonus y más</Text>
            </TouchableOpacity>
          </View>

          {/* Cards flotantes individuales */}
          <View style={styles.earningsCardsContainer}>
            {/* Fila superior: Ganancias Totales + Ganancias Hoy, centradas */}
            <View style={styles.earningsCardsRowTop}>
              <View style={styles.earningCard}>
                <View style={styles.earningCardIcon}>
                  <Text style={styles.earningCardIconText}>💵</Text>
                </View>
                <Text style={styles.earningCardValue}>{formatCurrency(stats.totalEarnings)}</Text>
                <Text style={styles.earningCardLabel}>Ganancias Totales</Text>
              </View>
              <View style={styles.earningCard}>
                <View style={styles.earningCardIconGreen}>
                  <Text style={styles.earningCardIconText}>💰</Text>
                </View>
                <Text style={styles.earningCardValue}>{formatCurrency(dailyStats.earnings)}</Text>
                <Text style={styles.earningCardLabel}>Ganancias Hoy</Text>
              </View>
            </View>

            {/* Fila inferior: Viajes Hechos + Viajes Hoy + Calificación, en una sola línea */}
            <View style={styles.earningsCardsRow}>
              <View style={styles.earningCard}>
                <View style={styles.earningCardIcon}>
                  <Text style={styles.earningCardIconText}>🚗</Text>
                </View>
                <Text style={styles.earningCardValue}>{stats.totalRides}</Text>
                <Text style={styles.earningCardLabel}>Viajes Hechos</Text>
              </View>

              <View style={styles.earningCard}>
                <View style={styles.earningCardIconBlue}>
                  <Text style={styles.earningCardIconText}>📍</Text>
                </View>
                <Text style={styles.earningCardValue}>{dailyStats.rides}</Text>
                <Text style={styles.earningCardLabel}>Viajes Hoy</Text>
              </View>

              <View style={styles.earningCard}>
                <View style={styles.earningCardIconYellow}>
                  <Text style={styles.earningCardIconText}>⭐</Text>
                </View>
                <Text style={styles.earningCardValue}>{(typeof stats.averageRating === 'number' ? stats.averageRating : 5).toFixed(1)}</Text>
                <Text style={styles.earningCardLabel}>Calificación</Text>
              </View>
            </View>
          </View>
        </View>
      {/* Mis Vehículos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mis Vehículos</Text>
        
        {vehicles && vehicles.length > 0 ? (
          <>
            {vehicles.map((vehicle) => {
              const isSelectedVehicle = selectedVehicleId === vehicle.id;
              const isApproved = Boolean(vehicle.is_active ?? vehicle.isActive);

              return (
                <View key={vehicle.id} style={[styles.vehicleCard, isSelectedVehicle && styles.vehicleCardActive]}>
                  <View style={styles.vehicleMainInfo}>
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
                      {isSelectedVehicle && (
                        <Text style={styles.activeVehicleLabel}>Vehículo seleccionado</Text>
                      )}
                      {!isApproved && (
                        <Text style={styles.pendingVehicleLabel}>En revisión administrativa</Text>
                      )}
                    </View>
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
                        style={[styles.changeButton, isSelectedVehicle && styles.changeButtonActive]}
                        onPress={() => handleSwitchVehicle(vehicle.id)}
                        disabled={isSelectedVehicle || !isApproved}
                      >
                        <Text style={[styles.changeButtonText, isSelectedVehicle && styles.changeButtonTextActive, (!isApproved && !isSelectedVehicle) && styles.changeButtonTextDisabled]}>
                          {isSelectedVehicle ? 'Seleccionado' : isApproved ? 'Cambiar' : 'No disponible'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <View style={styles.emptyVehiclesContainer}>
            <Text style={styles.emptyVehiclesText}>No hay vehículos registrados</Text>
          </View>
        )}

        <TouchableOpacity 
          style={styles.addVehicleButton}
          onPress={() => setShowAddVehicleModal(true)}
        >
          <Text style={styles.addVehicleButtonText}>+ Agregar Vehículo</Text>
        </TouchableOpacity>
      </View>

     

      {/* Documentos del Conductor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Documentos del Conductor</Text>

        {driverData && (
          <View style={styles.documentCard}>
            <View style={styles.documentLeft}>
              <View style={[styles.statusIndicator, { backgroundColor: documentStatusColor }]}>
                <Text style={styles.statusIcon}>{documentStatusIcon}</Text>
              </View>
              <View style={styles.documentInfo}>
                <Text style={styles.documentIcon}>🪪</Text>
                <View>
                  <Text style={styles.documentName}>Licencia de Conducir</Text>
                  <Text style={[styles.documentStatus, { color: documentStatusColor }]}>{documentStatusText}</Text>
                  {driverLicenseExpiry && (
                    <Text style={styles.documentExpiry}>
                      Vence: {safeFormatDate(driverLicenseExpiry)}
                    </Text>
                  )}
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => navigation.navigate('DriversDocumentsInspection')}
            >
              <Text style={styles.uploadButtonText}>{documentButtonLabel}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Solicitar Conductor Designado */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conductor Designado</Text>
        
        <View style={styles.designatedDriverCard}>
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
        </View>
      </View>

 {/* Preferencias de notificación avanzada */}
 <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alertas de viajes cercanos</Text>
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceHeader}>
            <View style={styles.preferenceIconWrapper}>
              <Text style={styles.preferenceIcon}>🫧</Text>
            </View>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceTitle}>Burbuja flotante con solicitudes cercanas</Text>
              <Text style={styles.preferenceSubtitle}>
                Muestra una tarjeta encima de otras apps cuando haya un viaje cercano. Ideal si usas otras apps de navegación.
              </Text>
              {Platform.OS === 'android' ? (
                <Text style={styles.preferenceHint}>
                  Requiere el permiso "Mostrar encima de otras apps". {overlayPermissionGranted ? 'Permiso activo.' : 'Ábrelo desde Ajustes → Aplicaciones → Rundi → Mostrar encima.'}
                </Text>
              ) : (
                <Text style={styles.preferenceHint}>
                  Disponible únicamente en Android.
                </Text>
              )}
            </View>
            <Switch
              value={overlayToggleEnabled}
              onValueChange={handleOverlayToggle}
              disabled={Platform.OS !== 'android' || overlayCheckingPermission}
              thumbColor={overlayToggleEnabled ? '#ffffff' : '#f4f4f4'}
              trackColor={{ false: '#bdbdbd', true: colors.primary }}
            />
          </View>
        </View>
      </View>

      {/* Asistente de Voz */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Asistente de Voz</Text>

        <View style={styles.voiceAssistantCard}>
          <View style={styles.voiceAssistantHeader}>
            <View style={styles.voiceAssistantTitleBlock}>
              <Text style={styles.voiceAssistantTitle}>Indicaciones habladas</Text>
              <Text style={styles.voiceAssistantSubtitle}>
                Recibe avisos de nuevos viajes, recordatorios cuando llegas al cliente y alertas de pago sin mirar la pantalla.
              </Text>
            </View>
            <Switch
              value={voiceAssistantSwitch}
              onValueChange={handleVoiceAssistantToggle}
              thumbColor={voiceAssistantSwitch ? '#ffffff' : '#f4f4f4'}
              trackColor={{ false: '#bdbdbd', true: colors.primary }}
            />
          </View>

          <View style={styles.voiceAssistantBenefits}>
            <Text style={styles.voiceAssistantBenefit}>• Anuncios de viajes cercanos automáticamente</Text>
            <Text style={styles.voiceAssistantBenefit}>• Recordatorios al llegar al punto de recogida</Text>
            <Text style={styles.voiceAssistantBenefit}>• Alertas cuando falta confirmar un pago en efectivo</Text>
          </View>

          <Text style={styles.voiceAssistantFooter}>
            Puedes desactivarlo cuando quieras. Recomendado mantenerlo activo para conducir con manos libres.
          </Text>
        </View>
      </View>

      {/* Información del Seguro */}
      {vehicles.length > 0 && vehicles[0].insuranceNumber && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información del Seguro</Text>

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
           <Image
              source={require('../../assets/icons/profit-icon/profiticon.png')}
              style={styles.optionIconImage}
            />
          <Text style={styles.optionText}>Ver Ganancias Detalladas</Text>
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
          onPress={() => navigation.navigate('Settings')}
        >
           <Image
              source={require('../../assets/icons/settings-icon/settingsicon.png')}
              style={styles.optionIconImage}
            />
          <Text style={styles.optionText}>Configuración</Text>
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

      <View style={{ height: 40 }} />
      </View>
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
              <Text style={styles.formSectionTitle}>Información Básica</Text>
              
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
              <Text style={styles.formSectionTitle}>📄 Documentos de Registro</Text>
              
              <Text style={styles.formLabel}>Fecha de Emisión</Text>
              <FormattedInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                format="date"
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
              <FormattedInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                format="date"
                value={vehicleFormData.registration_expiry}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, registration_expiry: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <ImagePickerComponent
                label="Foto Frontal del Registro"
                imageUri={vehicleFormData.registration_photo_front}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, registration_photo_front: uri })}
              />

              <ImagePickerComponent
                label="Foto Trasera del Registro"
                imageUri={vehicleFormData.registration_photo_back}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, registration_photo_back: uri })}
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
              <FormattedInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                format="date"
                value={vehicleFormData.insurance_start_date}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_start_date: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>Vencimiento de Seguro</Text>
              <FormattedInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                format="date"
                value={vehicleFormData.insurance_expiry}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_expiry: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <ImagePickerComponent
                label="Póliza de Seguro"
                imageUri={vehicleFormData.insurance_photo}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, insurance_photo: uri })}
              />
            </View>

            {/* SECCIÓN: FOTOS DEL VEHÍCULO */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>📸 Fotos del Vehículo</Text>
              
              <ImagePickerComponent
                label="Foto General del Vehículo"
                imageUri={vehicleFormData.vehicle_photo}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, vehicle_photo: uri })}
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
    backgroundColor: 'rgba(204, 180, 136, 0.91)',
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
  // Header estilo ProfileScreen
  header: {
    backgroundColor: 'rgba(211, 153, 46, 0.81)',
    paddingVertical: 45,
    paddingHorizontal: 24,
    alignItems: 'stretch',
    marginBottom: -10,
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
  headerContent: {
    flex: 1,
  },
  headerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  headerTopSpacer: {
    width: 50,
    height: 50,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.button || colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  memberId: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 1)',
  },
  editProfileBadge: {
    backgroundColor: 'rgba(26, 29, 173, 0.51)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  editProfileText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  // Content Card
  contentCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    paddingBottom: 32,
    marginTop: -16,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  avatarPlaceholder: {
    width: 110,
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
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconText: {
    fontSize: 14,
  },
  driverName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  driverEmail: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 1)',
    marginBottom: 4,
  },
  accountStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  accountStatusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(230, 230, 230, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  ratingStars: {
    fontSize: 14,
    marginRight: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
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
  // Cards flotantes para ganancias
  earningsCardsContainer: {
    gap: 12,
  },
  earningsCardsRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'center',
    width: '75%',
  },
  earningsCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  earningsCardsRowSingle: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  earningCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  earningCardWide: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  earningCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  earningCardIconGreen: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  earningCardIconBlue: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  earningCardIconYellow: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 193, 7, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  earningCardIconText: {
    fontSize: 22,
  },
  earningCardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  earningCardLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  voiceAssistantCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  voiceAssistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  voiceAssistantTitleBlock: {
    flex: 1,
    paddingRight: 16,
  },
  voiceAssistantTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  voiceAssistantSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  voiceAssistantBenefits: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  voiceAssistantBenefit: {
    fontSize: 13,
    color: colors.text,
    marginBottom: 4,
  },
  voiceAssistantFooter: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
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
  vehicleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  vehicleMainInfo: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-start',
    marginRight: 12,
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
  pendingVehicleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
    marginTop: 4,
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
  changeButtonTextDisabled: {
    color: colors.textSecondary,
  },
  vehicleButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    alignSelf: 'center',
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
  preferenceCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginTop: 16,
  },
  preferenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preferenceIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: `${colors.primary}22`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 18,
  },
  preferenceIcon: { fontSize: 26 },
  preferenceInfo: { flex: 1, marginRight: 12 },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  preferenceSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  preferenceHint: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textSecondary,
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
    padding: 16,
    borderWidth: 1,
    borderColor: '#2196F3',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    marginTop: 12,
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
  emptyVehiclesContainer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 16,
  },
  emptyVehiclesText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
