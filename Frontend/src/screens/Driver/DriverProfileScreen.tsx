import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  TextInput,
  Animated,
  Switch,
  Linking,
  Platform,
  AppState,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/LoadingIcon';
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
import { ensureVehicleIconSource } from '../../utils/vehicleIcons';

import { FormattedInput } from '../../components/FormattedInput';
import ImagePickerComponent from '../../components/ImagePicker';
import earningsService from '../../services/earningsService';
import { useTranslation } from 'react-i18next';

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
  designatedRoleRequested?: string;
  designated_rol_requested?: string;
  designatedRolRequested?: string;
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
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user, userMode, setUserMode } = useAuth();
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
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const handleGoToSupportComplaints = () => {
  navigation.navigate('SupportComplaints');
  };

  const extractDesignatedRequestStatus = (driver: DriverData | null | undefined) =>
    driver?.designated_rol_requested || driver?.designatedRoleRequested || driver?.designatedRolRequested || null;

  const normalizedDocumentStatus = normalizeDocumentsStatus(driverData);
  const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';
  const hasActiveVehicle = useMemo(
    () => Array.isArray(vehicles) && vehicles.some((vehicle) => (vehicle.is_active ?? vehicle.isActive) === true),
    [vehicles],
  );
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

  const documentStatusIconName = normalizedDocumentStatus === 'verified'
    ? 'check' as const
    : normalizedDocumentStatus === 'rejected'
      ? 'close' as const
      : normalizedDocumentStatus === 'suspended'
        ? 'warning' as const
        : 'schedule' as const;

  const documentStatusText =
    normalizedDocumentStatus === 'verified'
      ? t('driver.profile.documents.status.verified')
      : normalizedDocumentStatus === 'rejected'
        ? t('driver.profile.documents.status.rejected')
        : normalizedDocumentStatus === 'suspended'
          ? t('driver.profile.documents.status.suspended')
          : normalizedDocumentStatus === 'pending'
            ? t('driver.profile.documents.status.pending')
            : hasCompleteDocuments
              ? t('driver.profile.documents.status.complete')
              : t('driver.profile.documents.status.missing');

  const documentButtonLabel =
    normalizedDocumentStatus === 'verified'
      ? t('driver.profile.documents.button.view')
      : normalizedDocumentStatus === 'pending'
        ? t('driver.profile.documents.button.details')
        : normalizedDocumentStatus === 'rejected' || normalizedDocumentStatus === 'suspended'
          ? t('driver.profile.documents.button.fix')
          : hasCompleteDocuments
            ? t('driver.profile.documents.button.submit')
            : t('driver.profile.documents.button.complete');

  const displayFirstName =
    driverData?.firstName ||
    driverData?.first_name ||
    user?.name?.split(' ')?.[0] ||
    user?.name ||
    t('driver.profile.header.nameFallback');
  const displayLastName = driverData?.lastName || driverData?.last_name || '';
  const displayName =
    [displayFirstName, displayLastName].filter(Boolean).join(' ').trim() ||
    t('driver.profile.header.nameFallback');
  const displayEmail = driverData?.email || user?.email || null;

  const normalizedDesignatedRequestStatus = designatedDriverRequestStatus
    ? String(designatedDriverRequestStatus).toLowerCase()
    : null;

  const isDesignatedRequestPending = normalizedDesignatedRequestStatus === 'requested';
  const isDesignatedDriverApproved = normalizedDesignatedRequestStatus === 'approved' || normalizedDesignatedRequestStatus === 'verified';
  const isDesignatedRequestRejected = normalizedDesignatedRequestStatus === 'rejected' || normalizedDesignatedRequestStatus === 'revoked';

  const designatedStatusLabelMap: Record<string, string> = {
    pending: t('driver.profile.designated.statusLabel.pending'),
    requested: t('driver.profile.designated.statusLabel.requested'),
    approved: t('driver.profile.designated.statusLabel.approved'),
    verified: t('driver.profile.designated.statusLabel.verified'),
    rejected: t('driver.profile.designated.statusLabel.rejected'),
    revoked: t('driver.profile.designated.statusLabel.revoked'),
  };

  const designatedStatusHelperMap: Record<string, string> = {
    pending: t('driver.profile.designated.statusHelper.pending'),
    requested: t('driver.profile.designated.statusHelper.requested'),
    approved: t('driver.profile.designated.statusHelper.approved'),
    verified: t('driver.profile.designated.statusHelper.verified'),
    rejected: t('driver.profile.designated.statusHelper.rejected'),
    revoked: t('driver.profile.designated.statusHelper.revoked'),
  };

  const designatedStatusLabel = normalizedDesignatedRequestStatus
    ? designatedStatusLabelMap[normalizedDesignatedRequestStatus] ||
      t('driver.profile.designated.statusLabel.unknown')
    : t('driver.profile.designated.statusLabel.pending');
  const designatedStatusHelper = normalizedDesignatedRequestStatus
    ? designatedStatusHelperMap[normalizedDesignatedRequestStatus] ||
      t('driver.profile.designated.statusHelper.default')
    : t('driver.profile.designated.statusHelper.default');

  const designatedButtonLabel = (() => {
    if (isDesignatedDriverApproved) {
      return t('driver.profile.designated.button.approved');
    }
    if (isDesignatedRequestPending) {
      return t('driver.profile.designated.button.pending');
    }
    if (isDesignatedRequestRejected) {
      return t('driver.profile.designated.button.rejected');
    }
    return t('driver.profile.designated.button.default');
  })();

  const designatedButtonDisabled =
    loadingRequestStatus || isDesignatedRequestPending || isDesignatedDriverApproved || isDesignatedRequestRejected;

  const renderAccountStatusBadge = () => {
    if (!normalizedAccountStatus) {
      return null;
    }

    let label = t('driver.profile.accountStatus.label');
    let badgeColor = '#9E9E9E';

    switch (normalizedAccountStatus) {
      case 'active':
        label = t('driver.profile.accountStatus.active');
        badgeColor = '#4CAF50';
        break;
      case 'pending':
        label = t('driver.profile.accountStatus.pending');
        badgeColor = '#FF9800';
        break;
      case 'suspended':
        label = t('driver.profile.accountStatus.suspended');
        badgeColor = '#f44336';
        break;
      case 'rejected':
        label = t('driver.profile.accountStatus.rejected');
        badgeColor = '#f44336';
        break;
      default:
        label = t('driver.profile.accountStatus.other', { status: normalizedAccountStatus });
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
      Alert.alert(
        t('driver.profile.overlay.alerts.notAvailableTitle'),
        t('driver.profile.overlay.alerts.notAvailableBody'),
      );
      return;
    }

    setOverlayCheckingPermission(true);
    try {
      if (nextValue) {
        // Guardar preferencia ANTES de abrir ajustes
        await proximityService.setOverlayEnabled(true);
        setOverlayToggleEnabled(true);
        
        Alert.alert(
          t('driver.profile.overlay.alerts.enableTitle'),
          t('driver.profile.overlay.alerts.enableBody'),
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
            t('driver.profile.overlay.alerts.permissionMissingTitle'),
            t('driver.profile.overlay.alerts.permissionMissingBody'),
          );
        } else {
          await proximityService.debugTriggerFallbackOverlay('activation');
        }
      } else {
        Alert.alert(
          t('driver.profile.overlay.alerts.disableTitle'),
          t('driver.profile.overlay.alerts.disableBody'),
        );
        await overlayManager.openSystemSettings();
        const hasPermission = await overlayManager.hasPermission();
        await proximityService.debugLogOverlayState('deactivation-post-settings');
        if (hasPermission) {
          Alert.alert(
            t('driver.profile.overlay.alerts.permissionStillOnTitle'),
            t('driver.profile.overlay.alerts.permissionStillOnBody'),
          );
        }
      }
    } catch (error: any) {
      console.error('❌ Error actualizando preferencia de overlay:', error);
      Alert.alert(
        t('driver.profile.overlay.alerts.errorTitle'),
        error?.message || t('driver.profile.overlay.alerts.errorBody'),
      );
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

  const handleModeButtonPress = async () => {
    if (!user) {
      return;
    }

    const targetMode: 'client' | 'driver' = userMode === 'driver' ? 'client' : 'driver';

    if (targetMode === userMode) {
      return;
    }

    if (targetMode === 'driver') {
      if (!isDriverCapable) {
        Alert.alert(
          t('driver.profile.mode.alerts.unavailableTitle'),
          t('driver.profile.mode.alerts.unavailableBody'),
        );
        return;
      }

      if (!driverData || vehicles.length === 0) {
        Alert.alert(
          t('driver.profile.mode.alerts.loadingTitle'),
          t('driver.profile.mode.alerts.loadingBody'),
        );
        return;
      }

      const accountOk = normalizedAccountStatus === 'active';
      const documentsOk = normalizedDocumentStatus === 'verified';
      const vehicleOk = hasActiveVehicle;

      if (!accountOk || !documentsOk || !vehicleOk) {
        const reasons: string[] = [];
        if (!accountOk) {
          reasons.push(t('driver.profile.mode.alerts.reasons.account'));
        }
        if (!documentsOk) {
          reasons.push(t('driver.profile.mode.alerts.reasons.documents'));
        }
        if (!vehicleOk) {
          reasons.push(t('driver.profile.mode.alerts.reasons.vehicle'));
        }

        const message = `${reasons.join('\n')}\n\n${t('driver.profile.mode.alerts.requirementsBody')}`;
        const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [
          { text: t('driver.profile.mode.alerts.close'), style: 'cancel' },
        ];

        if (!documentsOk) {
          buttons.push({
            text: t('driver.profile.mode.alerts.viewDocuments'),
            onPress: () => navigation.navigate('DriversDocumentsInspection'),
          });
        }

        if (!vehicleOk) {
          buttons.push({
            text: t('driver.profile.mode.alerts.viewVehicles'),
            onPress: () => navigation.navigate('CompleteVehicleInfo'),
          });
        }

        Alert.alert(t('driver.profile.mode.alerts.cannotEnableTitle'), message, buttons);
        return;
      }
    }

    try {
      await setUserMode(targetMode);
    } catch (error: any) {
      console.error('❌ Error actualizando modo de usuario:', error);
      Alert.alert(
        t('driver.profile.mode.alerts.errorTitle'),
        error?.message || t('driver.profile.mode.alerts.errorBody'),
      );
    }
  };

  // Cargar estado de solicitud de Conductor Designado
  const loadDesignatedDriverStatus = async () => {
    try {
      if (!user?.id) return;

      console.log('📋 Refrescando estado de Conductor Designado desde Supabase...');
      const profile = await driversService.getMyDriverProfile();
      const status = extractDesignatedRequestStatus(profile) || 'pending';

      console.log('✅ Estado de solicitud actualizado:', status);
      setDesignatedDriverRequestStatus(status);
    } catch (error) {
      console.error('⚠️ Error cargando estado de solicitud:', error);
      setDesignatedDriverRequestStatus((prev) => prev || 'pending');
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
        setDesignatedDriverRequestStatus(extractDesignatedRequestStatus(profile) || 'pending');

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
      Alert.alert(
        t('driver.profile.alerts.permissions.galleryTitle'),
        t('driver.profile.alerts.permissions.galleryBody'),
      );
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
          Alert.alert(
            t('driver.profile.alerts.upload.successTitle'),
            t('driver.profile.alerts.upload.successBody'),
          );
        }
      } catch (error: any) {
        console.error('❌ Error subiendo foto:', error);
        Alert.alert(
          t('driver.profile.alerts.upload.errorTitle'),
          error?.message || t('driver.profile.alerts.upload.errorBody'),
        );
      } finally {
        setUploadingPhoto(false);
      }
    }
  };
  const getDocumentIconName = (type: string): React.ComponentProps<typeof MaterialIcons>['name'] => {
    switch (type) {
      case 'license': return 'badge';
      case 'registration': return 'description';
      case 'insurance': return 'security';
      default: return 'assignment';
    }
  };

  const getDocumentName = (type: string) => {
    switch (type) {
      case 'license':
        return t('driver.profile.documents.types.license');
      case 'registration':
        return t('driver.profile.documents.types.registration');
      case 'insurance':
        return t('driver.profile.documents.types.insurance');
      default:
        return t('driver.profile.documents.types.default');
    }
  };

  const handleAddVehicle = async () => {
    if (!vehicleFormData.plate || !vehicleFormData.brand || !vehicleFormData.model || !vehicleFormData.color) {
      Alert.alert(
        t('driver.profile.alerts.vehicles.formErrorTitle'),
        t('driver.profile.alerts.vehicles.formErrorBody'),
      );
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
      
      Alert.alert(
        t('driver.profile.alerts.vehicles.addSuccessTitle'),
        t('driver.profile.alerts.vehicles.addSuccessBody'),
      );
    } catch (error: any) {
      console.error('❌ Error agregando vehículo:', error);
      Alert.alert(
        t('driver.profile.alerts.vehicles.addErrorTitle'),
        error?.message || t('driver.profile.alerts.vehicles.genericFormError'),
      );
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
      case 'verified':
        return t('driver.profile.documents.status.verified');
      case 'pending':
        return t('driver.profile.documents.status.pending');
      case 'rejected':
        return t('driver.profile.documents.status.rejected');
      default:
        return t('driver.profile.documents.status.missing');
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
      issues.push(t('driver.profile.alerts.vehicles.issues.basicInfo'));
    }
    if (!vehicle.registrationNumber || !vehicle.registrationExpiry || !vehicle.registrationPhotoFront || !vehicle.registrationPhotoBack) {
      issues.push(t('driver.profile.alerts.vehicles.issues.registration'));
    }
    if (!vehicle.insuranceNumber || !vehicle.insuranceCompany || !vehicle.insuranceExpiry || !vehicle.insurancePhoto) {
      issues.push(t('driver.profile.alerts.vehicles.issues.insurance'));
    }
    if (!vehicle.vehiclePhoto) {
      issues.push(t('driver.profile.alerts.vehicles.issues.vehiclePhoto'));
    }
    
    return issues.join(', ');
  };

  const handleSwitchVehicle = async (vehicleId: string) => {
    try {
      // Buscar el vehículo a cambiar
      const vehicleToSwitch = vehicles.find(v => v.id === vehicleId);
      
      if (!vehicleToSwitch) {
        Alert.alert(
          t('driver.profile.alerts.vehicles.notFoundTitle'),
          t('driver.profile.alerts.vehicles.notFoundBody'),
        );
        return;
      }

      if (!vehicleToSwitch.is_active && !vehicleToSwitch.isActive) {
        Alert.alert(
          t('driver.profile.alerts.vehicles.notApprovedTitle'),
          t('driver.profile.alerts.vehicles.notApprovedBody'),
        );
        return;
      }

      if (!isVehicleComplete(vehicleToSwitch)) {
        const reason = getIncompleteReason(vehicleToSwitch);
        Alert.alert(
          t('driver.profile.alerts.vehicles.incompleteTitle'),
          t('driver.profile.alerts.vehicles.incompleteBody', { reason }),
          [
            { text: t('driver.profile.alerts.vehicles.cancel'), style: 'cancel' },
            {
              text: t('driver.profile.alerts.vehicles.viewDocuments'),
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
      Alert.alert(
        t('driver.profile.alerts.vehicles.switchErrorTitle'),
        message || t('driver.profile.alerts.vehicles.switchErrorBody'),
      );
    }
  };

  // Solicitar acceso a Conductor Designado
  const handleRequestDesignatedDriverAccess = async () => {
    try {
      setLoadingRequestStatus(true);
      
      console.log('🚙 Solicitando acceso a Conductor Designado...');
      const result = await designatedDriverService.requestDesignatedDriverAccess();
      await driversService.updateDriver({
        designated_rol_requested: 'requested',
      });
      await loadDesignatedDriverStatus();
      await loadDriverData();
      console.log('✅ Solicitud enviada:', result);
      setDesignatedDriverRequestStatus('requested');
    } catch (error: any) {
      console.error('❌ Error solicitando acceso:', error);
      Alert.alert(
        t('driver.profile.designated.alerts.errorTitle'),
        error?.message || t('driver.profile.designated.alerts.errorBody'),
      );
    } finally {
      setLoadingRequestStatus(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={styles.loadingText}>{t('driver.profile.loading.message')}</Text>
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
          <Text style={styles.headerTitle}>{t('driver.profile.header.title')}</Text>
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
                <LoadingIcon size={32} color="#fff" />
              </View>
            ) : profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {displayName.charAt(0).toUpperCase() || t('driver.profile.header.initialFallback')}
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
            <Text style={styles.memberId}>{t('driver.profile.header.memberId', { id: user?.id ?? '' })}</Text>

            <View style={styles.headerBottomRow}>
              {renderAccountStatusBadge()}
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingStars}>⭐</Text>
                <Text style={styles.ratingText}>{(typeof stats.averageRating === 'number' ? stats.averageRating : 5.0).toFixed(1)}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={() => navigation.navigate('Account')}>
              <View style={styles.editProfileBadge}>
                  <Text style={styles.editProfileText}>{t('driver.profile.header.edit')}</Text>
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
            <Text style={styles.sectionTitle}>{t('driver.profile.stats.walletTitle')}</Text>
            <TouchableOpacity style={styles.rechargeButton}>
              <Text style={styles.rechargeButtonText}>{t('driver.profile.stats.walletCta')}</Text>
            </TouchableOpacity>
          </View>

          {/* Cards flotantes individuales */}
          <View style={styles.earningsCardsContainer}>
            {/* Fila superior: Ganancias Totales + Ganancias Hoy, centradas */}
            <View style={styles.earningsCardsRowTop}>
              <View style={[styles.earningCard, styles.earningCardTop]}>
                <View style={styles.earningCardIcon}>
                  <Text style={styles.earningCardIconText}>💵</Text>
                </View>
                <Text
                  style={styles.earningCardValue}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.6}
                >
                  {formatCurrency(stats.totalEarnings)}
                </Text>
                <Text
                  style={styles.earningCardLabel}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('driver.profile.stats.totalEarnings')}
                </Text>
              </View>
              <View style={[styles.earningCard, styles.earningCardTop]}>
                <View style={styles.earningCardIconGreen}>
                  <Text style={styles.earningCardIconText}>💰</Text>
                </View>
                <Text
                  style={styles.earningCardValue}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.6}
                >
                  {formatCurrency(dailyStats.earnings)}
                </Text>
                <Text
                  style={styles.earningCardLabel}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('driver.profile.stats.todaysEarnings')}
                </Text>
              </View>
            </View>

            {/* Fila inferior: Viajes Hechos + Viajes Hoy + Calificación, en una sola línea */}
            <View style={styles.earningsCardsRow}>
              <View style={[styles.earningCard, styles.earningCardBottom]}>
                <View style={styles.earningCardIcon}>
                  <Text style={styles.earningCardIconText}>🚗</Text>
                </View>
                <Text
                  style={styles.earningCardValue}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.6}
                >
                  {stats.totalRides}
                </Text>
                <Text
                  style={styles.earningCardLabel}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('driver.profile.stats.totalRides')}
                </Text>
              </View>

              <View style={[styles.earningCard, styles.earningCardBottom]}>
                <View style={styles.earningCardIconBlue}>
                  <Text style={styles.earningCardIconText}>📍</Text>
                </View>
                <Text
                  style={styles.earningCardValue}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.6}
                >
                  {dailyStats.rides}
                </Text>
                <Text
                  style={styles.earningCardLabel}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('driver.profile.stats.todaysRides')}
                </Text>
              </View>

              <View style={[styles.earningCard, styles.earningCardBottom]}>
                <View style={styles.earningCardIconYellow}>
                  <Text style={styles.earningCardIconText}>⭐</Text>
                </View>
                <Text
                  style={styles.earningCardValue}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.6}
                >
                  {(typeof stats.averageRating === 'number' ? stats.averageRating : 5).toFixed(1)}
                </Text>
                <Text
                  style={styles.earningCardLabel}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('driver.profile.stats.rating')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      {/* Mis Vehículos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.vehicles.title')}</Text>
        
        {vehicles && vehicles.length > 0 ? (
          <>
            {vehicles.map((vehicle) => {
              const isSelectedVehicle = selectedVehicleId === vehicle.id;
              const isApproved = Boolean(vehicle.is_active ?? vehicle.isActive);

              return (
                <View key={vehicle.id} style={[styles.vehicleCard, isSelectedVehicle && styles.vehicleCardActive]}>
                  <View style={styles.vehicleMainInfo}>
                    <View style={styles.vehicleIcon}>
                      <Image source={ensureVehicleIconSource(vehicle.type)} style={styles.vehicleIconImage} />
                    </View>
                    <View style={styles.vehicleInfo}>
                      <Text style={styles.vehicleName}>
                        {vehicle.brand} {vehicle.model}
                      </Text>
                      <Text style={styles.vehicleDetails}>
                        {vehicle.color} • {vehicle.year} • {vehicle.plate}
                      </Text>
                      {isSelectedVehicle && (
                        <Text style={styles.activeVehicleLabel}>{t('driver.profile.vehicles.selectedLabel')}</Text>
                      )}
                      {!isApproved && (
                        <Text style={styles.pendingVehicleLabel}>{t('driver.profile.vehicles.pendingLabel')}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.vehicleButtonsContainer}>
                    <TouchableOpacity 
                      style={[styles.verifyButton]}
                      onPress={() => navigation.navigate('VehicleVerification', { vehicleId: vehicle.id })}
                    >
                      <Text style={styles.verifyButtonText}>
                        {isVehicleComplete(vehicle)
                          ? t('driver.profile.vehicles.view')
                          : t('driver.profile.vehicles.verify')}
                      </Text>
                    </TouchableOpacity>
                    {vehicles.length > 1 && (
                      <TouchableOpacity 
                        style={[styles.changeButton, isSelectedVehicle && styles.changeButtonActive]}
                        onPress={() => handleSwitchVehicle(vehicle.id)}
                        disabled={isSelectedVehicle || !isApproved}
                      >
                        <Text style={[styles.changeButtonText, isSelectedVehicle && styles.changeButtonTextActive, (!isApproved && !isSelectedVehicle) && styles.changeButtonTextDisabled]}>
                          {isSelectedVehicle
                            ? t('driver.profile.vehicles.selected')
                            : isApproved
                              ? t('driver.profile.vehicles.switch')
                              : t('driver.profile.vehicles.unavailable')}
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
            <Text style={styles.emptyVehiclesText}>{t('driver.profile.vehicles.empty')}</Text>
          </View>
        )}

        <TouchableOpacity 
          style={styles.addVehicleButton}
          onPress={() => setShowAddVehicleModal(true)}
        >
          <Text style={styles.addVehicleButtonText}>{t('driver.profile.vehicles.addButton')}</Text>
        </TouchableOpacity>
      </View>

     

      {/* Documentos del Conductor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.documents.title')}</Text>

        {driverData && (
          <View style={styles.documentCard}>
            <View style={styles.documentLeft}>
              <View style={[styles.statusIndicator, { backgroundColor: documentStatusColor }]}>
                <MaterialIcons name={documentStatusIconName} size={20} color="#fff" />
              </View>
              <View style={styles.documentInfo}>
                <MaterialIcons name="badge" size={28} color={colors.textSecondary} />
                <View>
                  <Text style={styles.documentName}>{t('driver.profile.documents.licenseName')}</Text>
                  <Text style={[styles.documentStatus, { color: documentStatusColor }]}>{documentStatusText}</Text>
                  {driverLicenseExpiry && (
                    <Text style={styles.documentExpiry}>
                      {t('driver.profile.documents.expires', { date: safeFormatDate(driverLicenseExpiry) })}
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
        <Text style={styles.sectionTitle}>{t('driver.profile.designated.title')}</Text>
        
        <View style={styles.designatedDriverCard}>
          <View style={styles.designatedDriverContent}>
            <Text style={styles.designatedDriverTitle}>{t('driver.profile.designated.heroTitle')}</Text>
            <Text style={styles.designatedDriverDescription}>
              {t('driver.profile.designated.heroDescription')}
            </Text>
            
            <View style={styles.designatedDriverBenefits}>
              <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.rides')}</Text>
              <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.higherFare')}</Text>
              <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.premiumClients')}</Text>
              <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.keepRegular')}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.designatedDriverButton,
              designatedButtonDisabled && styles.designatedDriverButtonDisabled
            ]}
            onPress={() => {
              // Si ya hay solicitud pendiente, no permitir enviar otra
              if (isDesignatedRequestPending) {
                Alert.alert(
                  t('driver.profile.designated.alerts.pendingTitle'),
                  t('driver.profile.designated.alerts.pendingBody'),
                );
                return;
              }

              if (isDesignatedDriverApproved) {
                Alert.alert(
                  t('driver.profile.designated.alerts.approvedTitle'),
                  t('driver.profile.designated.alerts.approvedBody'),
                );
                return;
              }

              if (isDesignatedRequestRejected) {
                Alert.alert(
                  t('driver.profile.designated.alerts.rejectedTitle'),
                  t('driver.profile.designated.alerts.rejectedBody'),
                );
                return;
              }

              Alert.alert(
                t('driver.profile.designated.alerts.confirmTitle'),
                t('driver.profile.designated.alerts.confirmBody'),
                [
                  { text: t('driver.profile.designated.alerts.confirmCancel'), style: 'cancel' },
                  {
                    text: t('driver.profile.designated.alerts.confirmSubmit'),
                    onPress: handleRequestDesignatedDriverAccess
                  }
                ]
              );
            }}
            disabled={designatedButtonDisabled}
          >
            {loadingRequestStatus ? (
              <LoadingIcon size={20} color="#fff" />
            ) : (
              <Text style={styles.designatedDriverButtonText}>
                {designatedButtonLabel}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.mode.title')}</Text>
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceHeader}>
            <View style={styles.preferenceIconWrapper}>
              <MaterialIcons name="directions-car" size={24} color={colors.primary} />
            </View>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceTitle}>{t('driver.profile.mode.title')}</Text>
              <Text style={styles.preferenceSubtitle}>
                {t('driver.profile.mode.description')}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.modeToggleButton,
                userMode === 'driver' ? styles.modeToggleButtonActive : null,
              ]}
              onPress={handleModeButtonPress}
            >
              <Text
                style={[
                  styles.modeToggleButtonText,
                  userMode === 'driver' ? styles.modeToggleButtonTextActive : null,
                ]}
              >
                {userMode === 'driver'
                  ? t('driver.profile.mode.switchToClient')
                  : t('driver.profile.mode.switchToDriver')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.overlay.title')}</Text>
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceHeader}>
            <View style={styles.preferenceIconWrapper}>
              <MaterialIcons name="notifications" size={24} color={colors.primary} />
            </View>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceTitle}>{t('driver.profile.overlay.subtitle')}</Text>
              <Text style={styles.preferenceSubtitle}>
                {t('driver.profile.overlay.description')}
              </Text>
              {Platform.OS === 'android' ? (
                <Text style={styles.preferenceHint}>
                  {overlayPermissionGranted
                    ? t('driver.profile.overlay.hintAndroidGranted')
                    : t('driver.profile.overlay.hintAndroidMissing')}
                </Text>
              ) : (
                <Text style={styles.preferenceHint}>
                  {t('driver.profile.overlay.hintIos')}
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
        <Text style={styles.sectionTitle}>{t('driver.profile.voice.title')}</Text>

        <View style={styles.voiceAssistantCard}>
          <View style={styles.voiceAssistantHeader}>
            <View style={styles.voiceAssistantTitleBlock}>
              <Text style={styles.voiceAssistantTitle}>{t('driver.profile.voice.cardTitle')}</Text>
              <Text style={styles.voiceAssistantSubtitle}>
                {t('driver.profile.voice.subtitle')}
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
            <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.rides')}</Text>
            <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.arrivals')}</Text>
            <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.payments')}</Text>
          </View>

          <Text style={styles.voiceAssistantFooter}>
            {t('driver.profile.voice.footer')}
          </Text>
        </View>
      </View>

      {/* Información del Seguro */}
      {vehicles.length > 0 && vehicles[0].insuranceNumber && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('driver.profile.insurance.title')}</Text>

          <View style={styles.insuranceCard}>
            <View style={styles.insuranceRow}>
              <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.company')}</Text>
              <Text style={styles.insuranceValue}>{vehicles[0].insuranceCompany}</Text>
            </View>

            <View style={styles.insuranceRow}>
              <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.number')}</Text>
              <Text style={styles.insuranceValue}>{vehicles[0].insuranceNumber}</Text>
            </View>

            {vehicles[0].insuranceExpiry && (
              <View style={styles.insuranceRow}>
                <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.expiry')}</Text>
                <Text style={styles.insuranceValue}>
                  {safeFormatDate(vehicles[0].insuranceExpiry)}
                </Text>
              </View>
            )}

            {vehicles[0].insurancePhoto && (
              <View style={styles.insurancePhotoContainer}>
                <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.photo')}</Text>
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
          <Text style={styles.optionText}>{t('driver.profile.options.viewEarnings')}</Text>
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
            <Text style={styles.optionText}>{t('driver.profile.options.rideHistory')}</Text>
            <Text style={styles.optionArrow}>›</Text>
          </TouchableOpacity>

        {/* Tarjetas desactivadas temporalmente
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('PaymentMethods')}
        >
           <Image
              source={require('../../assets/icons/payment-icon/paymenticon.png')}
              style={styles.optionIconImage}
            />
          <Text style={styles.optionText}>{t('driver.profile.options.paymentMethods')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>
        */}

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('Settings')}
        >
           <Image
              source={require('../../assets/icons/settings-icon/settingsicon.png')}
              style={styles.optionIconImage}
            />
          <Text style={styles.optionText}>{t('driver.profile.options.settings')}</Text>
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
          <Text style={styles.optionText}>{t('driver.profile.options.help')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
           style={styles.optionCard}
            onPress={handleGoToSupportComplaints}
             >
             <Image
              source={require('../../assets/icons/report-icon/reporticon.png')}
              style={styles.optionIconImage}
             />
             <Text style={styles.optionText}>{t('shared.profile.support.title')}</Text>
                      {/* <Text style={styles.supportAccessSubtitle}>
                        {t('shared.profile.support.subtitle', 'Revisa y continúa conversaciones con soporte')}
                      </Text> */}
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
            <Text style={styles.modalTitle}>{t('driver.profile.modal.title')}</Text>
            <TouchableOpacity onPress={() => setShowAddVehicleModal(false)}>
              <Text style={styles.modalCloseButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalForm}>
            {/* SECCIÓN: INFORMACIÓN BÁSICA */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>{t('driver.profile.modal.labels.basicInfo')}</Text>
              
              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.plate')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.plate')}
                value={vehicleFormData.plate}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, plate: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.brand')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.brand')}
                value={vehicleFormData.brand}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, brand: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.model')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.model')}
                value={vehicleFormData.model}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, model: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.year')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.year', { year: currentYear })}
                value={vehicleFormData.year.toString()}
                onChangeText={(text) =>
                  setVehicleFormData({
                    ...vehicleFormData,
                    year: parseInt(text, 10) || currentYear,
                  })
                }
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.color')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.color')}
                value={vehicleFormData.color}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, color: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.type')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.type')}
                value={vehicleFormData.type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, type: text })}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* SECCIÓN: ESPECIFICACIONES TÉCNICAS */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`⚙️ ${t('driver.profile.modal.labels.specs')}`}
              </Text>
              
              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.engine')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.engine')}
                value={vehicleFormData.motor}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, motor: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.chassis')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.chassis')}
                value={vehicleFormData.chasis}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, chasis: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.vin')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.vin')}
                value={vehicleFormData.vin}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, vin: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.cylinders')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.cylinders')}
                value={vehicleFormData.cylinders}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, cylinders: text })}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.passengers')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.passengers')}
                value={vehicleFormData.passengers}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, passengers: text })}
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.fuelType')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.fuelType')}
                value={vehicleFormData.fuel_type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, fuel_type: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.tonnage')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.tonnage')}
                value={vehicleFormData.tonnage}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, tonnage: text })}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* SECCIÓN: CLASIFICACIÓN */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`🏷️ ${t('driver.profile.modal.labels.classification')}`}
              </Text>
              
              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.vehicleClass')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.vehicleClass')}
                value={vehicleFormData.vehicle_class}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, vehicle_class: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.serviceType')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.serviceType')}
                value={vehicleFormData.service_type}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, service_type: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.lien')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.lien')}
                value={vehicleFormData.lien}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, lien: text })}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* SECCIÓN: DOCUMENTOS */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`📄 ${t('driver.profile.modal.labels.documents')}`}
              </Text>
              
              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.emissionDate')}</Text>
              <FormattedInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.emissionDate')}
                format="date"
                value={vehicleFormData.emission_date}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, emission_date: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.registrationNumber')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.registrationNumber')}
                value={vehicleFormData.registration_number}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, registration_number: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.registrationExpiry')}</Text>
              <FormattedInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.registrationExpiry')}
                format="date"
                value={vehicleFormData.registration_expiry}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, registration_expiry: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <ImagePickerComponent
                label={t('driver.profile.modal.labels.registrationFront')}
                imageUri={vehicleFormData.registration_photo_front}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, registration_photo_front: uri })}
              />

              <ImagePickerComponent
                label={t('driver.profile.modal.labels.registrationBack')}
                imageUri={vehicleFormData.registration_photo_back}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, registration_photo_back: uri })}
              />
            </View>

            {/* SECCIÓN: SEGURO */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`🛡️ ${t('driver.profile.modal.labels.insurance')}`}
              </Text>
              
              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceNumber')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.insuranceNumber')}
                value={vehicleFormData.insurance_number}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_number: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceCompany')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.insuranceCompany')}
                value={vehicleFormData.insurance_company}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_company: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceStart')}</Text>
              <FormattedInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.insuranceStart')}
                format="date"
                value={vehicleFormData.insurance_start_date}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_start_date: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.formLabel}>{t('driver.profile.modal.labels.insuranceExpiry')}</Text>
              <FormattedInput
                style={styles.formInput}
                placeholder={t('driver.profile.modal.placeholders.insuranceExpiry')}
                format="date"
                value={vehicleFormData.insurance_expiry}
                onChangeText={(text) => setVehicleFormData({ ...vehicleFormData, insurance_expiry: text })}
                placeholderTextColor={colors.textSecondary}
              />

              <ImagePickerComponent
                label={t('driver.profile.modal.labels.insurancePhoto')}
                imageUri={vehicleFormData.insurance_photo}
                onImageSelected={(uri: string) => setVehicleFormData({ ...vehicleFormData, insurance_photo: uri })}
              />
            </View>

            {/* SECCIÓN: FOTOS DEL VEHÍCULO */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {`📸 ${t('driver.profile.modal.labels.photos')}`}
              </Text>
              
              <ImagePickerComponent
                label={t('driver.profile.modal.labels.vehiclePhoto')}
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
              <Text style={styles.modalCancelButtonText}>{t('driver.profile.modal.buttons.cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalSubmitButton, addingVehicle && styles.modalSubmitButtonDisabled]}
              onPress={handleAddVehicle}
              disabled={addingVehicle}
            >
              {addingVehicle ? (
                <LoadingIcon size={20} color="#fff" />
              ) : (
                <Text style={styles.modalSubmitButtonText}>{t('driver.profile.modal.buttons.submit')}</Text>
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
    backgroundColor: '#6e44ff',
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
    gap: 12,
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
  earningCardTop: {
    minHeight: 72,
  },
  earningCardBottom: {
    minHeight: 32,
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
    textAlign: 'center',
    alignSelf: 'stretch',
    includeFontPadding: false,
  },
  earningCardLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
    minHeight: 30,
    alignSelf: 'stretch',
    includeFontPadding: false,
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
  vehicleIconImage: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
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
    flexWrap: 'wrap',
    flexShrink: 10,
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
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  addVehicleButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
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
  modeToggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  modeToggleButtonActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modeToggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modeToggleButtonTextActive: {
    color: colors.primary,
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
