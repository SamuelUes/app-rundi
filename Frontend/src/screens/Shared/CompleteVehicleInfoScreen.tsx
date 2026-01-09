import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../../components/Button';
import driversService from '../../services/driversService';
import ImagePicker from '../../components/ImagePicker';
import { 
  uploadLicensePhoto,
  uploadRegistrationPhoto,
  uploadInsurancePhoto,
} from '../../services/supabaseStorage';
import { useTranslation } from 'react-i18next';

interface VehicleData {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  type: string;
  registration_number?: string;
  registration_expiry?: string;
  registration_photo?: string;
  registration_photo_front?: string;
  registration_photo_back?: string;
  insurance_photo?: string;
  vehicle_photo?: string;
  // Campos adicionales del esquema
  motor?: string;
  chasis?: string;
  vin?: string;
  cylinders?: number;
  passengers?: number;
  fuel_type?: string;
  tonnage?: number;
  vehicle_class?: string;
  service_type?: string;
  lien?: string;
  insurance_number?: string;
  insurance_company?: string;
  insurance_expiry?: string;
  insurance_start_date?: string;
  is_4x4?: boolean;
}

interface DriverData {
  license_number: string;
  license_expiry?: string;
  license_photo_front?: string;
  license_photo_back?: string;
  // Campos adicionales del esquema
  department?: string;
  municipality?: string;
  profile_photo?: string;
}

export default function CompleteVehicleInfoScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { t } = useTranslation();

  const getFieldMeta = (key: string) =>
    t(`shared.completeVehicleInfo.fields.${key}`, {
      returnObjects: true,
    }) as { label: string; placeholder: string };
  const fieldLabel = (key: string) => getFieldMeta(key)?.label ?? '';
  const fieldPlaceholder = (key: string) => getFieldMeta(key)?.placeholder ?? '';
  const sections = (t('shared.completeVehicleInfo.sections', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const completionText = (t('shared.completeVehicleInfo.completion', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const photos = (t('shared.completeVehicleInfo.photos', {
    returnObjects: true,
  }) ?? {}) as {
    frontLabel?: string;
    backLabel?: string;
    uploadFront?: string;
    uploadBack?: string;
    uploadPolicy?: string;
    uploadVehicle?: string;
  };
  const buttons = (t('shared.completeVehicleInfo.buttons', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const messages = (t('shared.completeVehicleInfo.messages', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const alertsText = (t('shared.completeVehicleInfo.alerts', {
    returnObjects: true,
  }) ?? {}) as Record<string, string>;
  const defaultLienValue = t('shared.completeVehicleInfo.defaults.noLien');
  const headerText = (t('shared.completeVehicleInfo.header', {
    returnObjects: true,
  }) ?? { title: '', subtitle: '' }) as { title?: string; subtitle?: string };
  const loadingText = t('shared.completeVehicleInfo.loading');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  
  // Estado para verificación de campos completos
  const [isComplete, setIsComplete] = useState({
    personalInfo: false,
    vehicleInfo: false,
    documentsInfo: false,
    licensePhotos: false,
    registrationPhotos: false,
    insurancePhotos: false,
    vehiclePhotos: false,
  });

  // Estados para fotos
  const [licensePhotoFront, setLicensePhotoFront] = useState<string | null>(null);
  const [licensePhotoBack, setLicensePhotoBack] = useState<string | null>(null);
  const [registrationPhotoFront, setRegistrationPhotoFront] = useState<string | null>(null);
  const [registrationPhotoBack, setRegistrationPhotoBack] = useState<string | null>(null);
  const [insurancePhoto, setInsurancePhoto] = useState<string | null>(null);
  const [vehiclePhoto, setVehiclePhoto] = useState<string | null>(null);

  // Estados para URIs locales temporales (antes de subir a Supabase)
  const [tempLicenseFrontUri, setTempLicenseFrontUri] = useState<string | null>(null);
  const [tempLicenseBackUri, setTempLicenseBackUri] = useState<string | null>(null);
  const [tempRegistrationFrontUri, setTempRegistrationFrontUri] = useState<string | null>(null);
  const [tempRegistrationBackUri, setTempRegistrationBackUri] = useState<string | null>(null);
  const [tempInsuranceUri, setTempInsuranceUri] = useState<string | null>(null);
  const [tempVehicleUri, setTempVehicleUri] = useState<string | null>(null);

  // Estados para datos del conductor
  const [department, setDepartment] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');

  // Estados para datos del vehículo
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [insuranceStartDate, setInsuranceStartDate] = useState('');
  const [motor, setMotor] = useState('');
  const [chasis, setChasis] = useState('');
  const [vin, setVin] = useState('');
  const [cylinders, setCylinders] = useState('');
  const [passengers, setPassengers] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [tonnage, setTonnage] = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [lien, setLien] = useState(defaultLienValue);
  const [is4x4, setIs4x4] = useState(false);

  const completedSectionsCount = Object.values(isComplete).filter(Boolean).length;
  const totalSections = Object.values(isComplete).length;
  const allSectionsComplete = totalSections > 0 && completedSectionsCount === totalSections;
  const completionSummary =
    completedSectionsCount > 0
      ? t('shared.completeVehicleInfo.completion.summary', {
          completed: completedSectionsCount,
          total: totalSections,
        })
      : null;

  useEffect(() => {
    loadExistingData();
  }, []);

  // Función para verificar si todos los campos requeridos están completos
  const checkCompleteness = () => {
    // Información personal - número de licencia es obligatorio
    const personalComplete = !!licenseNumber;
    
    // Información del vehículo - campos obligatorios
    const vehicleComplete = !!plate && 
                          !!brand && 
                          !!model && 
                          !!year && 
                          !!color && 
                          !!vehicleType;
    
    // Información de documentos - números y fechas importantes
    const documentsComplete = !!registrationNumber && 
                             !!insuranceNumber && 
                             !!insuranceCompany &&
                             !!registrationExpiry &&
                             !!insuranceExpiry;
    
    // Fotos - todas son importantes para verificación
    const licensePhotosComplete = !!licensePhotoFront && !!licensePhotoBack;
    const registrationPhotosComplete = !!registrationPhotoFront && !!registrationPhotoBack;
    const insurancePhotosComplete = !!insurancePhoto;
    const vehiclePhotosComplete = !!vehiclePhoto;
    
    // Si hay cambio en alguna sección, actualizar el estado
    const newCompletionState = {
      personalInfo: personalComplete,
      vehicleInfo: vehicleComplete,
      documentsInfo: documentsComplete,
      licensePhotos: licensePhotosComplete,
      registrationPhotos: registrationPhotosComplete,
      insurancePhotos: insurancePhotosComplete,
      vehiclePhotos: vehiclePhotosComplete
    };
    
    // Actualizar estado solo si ha cambiado (evitar renders innecesarios)
    if (JSON.stringify(newCompletionState) !== JSON.stringify(isComplete)) {
      setIsComplete(newCompletionState);
      
      // Log para depuración
      console.log('✅ Estado de completitud actualizado:', newCompletionState);
      console.log('📊 Resumen: ' + Object.values(newCompletionState).filter(Boolean).length + 
                 ' de ' + Object.values(newCompletionState).length + ' secciones completadas');
    }
  };

  const loadExistingData = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // ✅ Obtener perfil del conductor autenticado
      const profile = await driversService.getMyDriverProfile();
      console.log('✅ Perfil de conductor cargado exitosamente');

      if (profile?.driver) {
        const driver = profile.driver;
        const vehicle = driver.vehicle;

        // Función helper para convertir fechas
        const formatDate = (dateValue: any) => {
          // Valores null, undefined o string vacío
          if (!dateValue || dateValue === null || dateValue === undefined) {
            return '';
          }
          
          // Si es un objeto vacío {} (problema de serialización del backend)
          if (typeof dateValue === 'object' && Object.keys(dateValue).length === 0) {
            return '';
          }
          
          // Si es un objeto con _seconds (Firestore Timestamp)
          if (typeof dateValue === 'object' && dateValue._seconds) {
            const date = new Date(dateValue._seconds * 1000);
            return date.toISOString().split('T')[0]; // YYYY-MM-DD
          }
          
          // Si es un string de fecha válido
          if (typeof dateValue === 'string' && dateValue.length > 0) {
            // Si ya está en formato YYYY-MM-DD, devolverlo tal como está
            if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
              return dateValue;
            }
            // Si está en formato ISO (YYYY-MM-DDTHH:mm:ss)
            if (dateValue.includes('T')) {
              return dateValue.split('T')[0];
            }
            // Intentar parsear otros formatos
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          }
          
          return '';
        };

        // Función helper para manejar campos de texto que pueden ser undefined
        const safeString = (value: any) => {
          if (value === null || value === undefined) {
            return '';
          }
          return String(value);
        };

        // Cargar datos del conductor
        setDriverData(driver);
        setDepartment(safeString(driver.department));
        setMunicipality(safeString(driver.municipality));
        setLicenseNumber(safeString(driver.license_number));
        setLicenseExpiry(formatDate(driver.license_expiry));
        setLicensePhotoFront(driver.license_photo_front || null);
        setLicensePhotoBack(driver.license_photo_back || null);

        console.log('✅ Datos del conductor cargados:', {
          department: safeString(driver.department),
          municipality: safeString(driver.municipality),
          license_expiry: formatDate(driver.license_expiry),
        });

        // Cargar datos del vehículo si existe
        if (vehicle) {
          setVehicleData(vehicle);
          setPlate(safeString(vehicle.plate));
          setBrand(safeString(vehicle.brand));
          setModel(safeString(vehicle.model));
          setYear(vehicle.year ? vehicle.year.toString() : '');
          setColor(safeString(vehicle.color));
          setVehicleType(safeString(vehicle.type));
          setRegistrationNumber(safeString(vehicle.registration_number));
          setRegistrationExpiry(formatDate(vehicle.registration_expiry));
          setInsuranceNumber(safeString(vehicle.insurance_number));
          setInsuranceCompany(safeString(vehicle.insurance_company));
          setInsuranceExpiry(formatDate(vehicle.insurance_expiry));
          setInsuranceStartDate(formatDate(vehicle.insurance_start_date));
          setMotor(safeString(vehicle.motor));
          setChasis(safeString(vehicle.chasis));
          setVin(safeString(vehicle.vin));
          setCylinders(vehicle.cylinders ? vehicle.cylinders.toString() : '');
          setPassengers(vehicle.passengers ? vehicle.passengers.toString() : '');
          setFuelType(safeString(vehicle.fuel_type));
          setTonnage(vehicle.tonnage ? vehicle.tonnage.toString() : '');
          setVehicleClass(safeString(vehicle.vehicle_class));
          setServiceType(safeString(vehicle.service_type));
          setLien(safeString(vehicle.lien) || defaultLienValue);
          setIs4x4(vehicle.is_4x4 || false);

          console.log('✅ Fechas del vehículo cargadas:', {
            registration_expiry: formatDate(vehicle.registration_expiry),
            insurance_expiry: formatDate(vehicle.insurance_expiry),
            insurance_start_date: formatDate(vehicle.insurance_start_date),
          });

          // Cargar fotos del vehículo
          setRegistrationPhotoFront(vehicle.registration_photo_front || null);
          setRegistrationPhotoBack(vehicle.registration_photo_back || null);
          setInsurancePhoto(vehicle.insurance_photo || null);
          setVehiclePhoto(vehicle.vehicle_photo || null);
        }
        
        // Esperar un momento para que los estados se actualicen antes de verificar completitud
        setTimeout(() => {
          checkCompleteness();
        }, 500);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      Alert.alert(alertsText.loadErrorTitle, alertsText.loadErrorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Funciones para seleccionar fotos (solo guardan URI local temporalmente)
  const handleSelectLicenseFront = async (uri: string) => {
    setTempLicenseFrontUri(uri);
    setLicensePhotoFront(null); // Reset URL actual hasta que se guarde
    // Actualizar estado de completitud
    setTimeout(() => checkCompleteness(), 100);
  };

  const handleSelectLicenseBack = async (uri: string) => {
    setTempLicenseBackUri(uri);
    setLicensePhotoBack(null);
    // Actualizar estado de completitud
    setTimeout(() => checkCompleteness(), 100);
  };

  const handleSelectRegistrationFront = async (uri: string) => {
    setTempRegistrationFrontUri(uri);
    setRegistrationPhotoFront(null);
    // Actualizar estado de completitud
    setTimeout(() => checkCompleteness(), 100);
  };

  const handleSelectRegistrationBack = async (uri: string) => {
    setTempRegistrationBackUri(uri);
    setRegistrationPhotoBack(null);
    // Actualizar estado de completitud
    setTimeout(() => checkCompleteness(), 100);
  };

  const handleSelectInsurance = async (uri: string) => {
    setTempInsuranceUri(uri);
    setInsurancePhoto(null);
    // Actualizar estado de completitud
    setTimeout(() => checkCompleteness(), 100);
  };

  const handleSelectVehicle = async (uri: string) => {
    setTempVehicleUri(uri);
    setVehiclePhoto(null);
    // Actualizar estado de completitud
    setTimeout(() => checkCompleteness(), 100);
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      console.log('🚀 Iniciando proceso completo de subida y guardado...');

      // 1. Subir SOLO fotos nuevas a Supabase
      console.log('📤 Subiendo fotos nuevas a Supabase...');

      const uploadResults: { [key: string]: string } = {};

      // Solo subir fotos que tengan URI temporal (nuevas)
      if (tempLicenseFrontUri) {
        uploadResults.license_photo_front = await uploadLicensePhoto(user.id, tempLicenseFrontUri, 'front');
      }
      if (tempLicenseBackUri) {
        uploadResults.license_photo_back = await uploadLicensePhoto(user.id, tempLicenseBackUri, 'back');
      }
      if (tempRegistrationFrontUri) {
        uploadResults.registration_photo_front = await uploadRegistrationPhoto(user.id, tempRegistrationFrontUri, 'front');
      }
      if (tempRegistrationBackUri) {
        uploadResults.registration_photo_back = await uploadRegistrationPhoto(user.id, tempRegistrationBackUri, 'back');
      }
      if (tempInsuranceUri) {
        uploadResults.insurance_photo = await uploadInsurancePhoto(user.id, tempInsuranceUri);
      }
      if (tempVehicleUri) {
        uploadResults.vehicle_photo = await uploadInsurancePhoto(user.id, tempVehicleUri);
      }

      console.log('✅ Fotos nuevas subidas:', uploadResults);

      // 2. Preparar datos para guardar en BD
      const driverUpdates: any = {};
      const vehicleUpdates: any = {};

      // Datos del conductor
      if (department !== (driverData?.department || '')) driverUpdates.department = department;
      if (municipality !== (driverData?.municipality || '')) driverUpdates.municipality = municipality;
      if (licenseNumber !== (driverData?.license_number || '')) driverUpdates.license_number = licenseNumber;
      if (licenseExpiry !== (driverData?.license_expiry || '')) driverUpdates.license_expiry = licenseExpiry;

      // Fotos nuevas del conductor
      if (uploadResults.license_photo_front) driverUpdates.license_photo_front = uploadResults.license_photo_front;
      if (uploadResults.license_photo_back) driverUpdates.license_photo_back = uploadResults.license_photo_back;

      // Datos del vehículo
      if (plate !== (vehicleData?.plate || '')) vehicleUpdates.plate = plate;
      if (brand !== (vehicleData?.brand || '')) vehicleUpdates.brand = brand;
      if (model !== (vehicleData?.model || '')) vehicleUpdates.model = model;
      if (year !== (vehicleData?.year?.toString() || '')) vehicleUpdates.year = parseInt(year);
      if (color !== (vehicleData?.color || '')) vehicleUpdates.color = color;
      if (vehicleType !== (vehicleData?.type || '')) vehicleUpdates.type = vehicleType;
      if (registrationNumber !== (vehicleData?.registration_number || '')) vehicleUpdates.registration_number = registrationNumber;
      if (registrationExpiry !== (vehicleData?.registration_expiry || '')) vehicleUpdates.registration_expiry = registrationExpiry;
      if (insuranceNumber !== (vehicleData?.insurance_number || '')) vehicleUpdates.insurance_number = insuranceNumber;
      if (insuranceCompany !== (vehicleData?.insurance_company || '')) vehicleUpdates.insurance_company = insuranceCompany;
      if (insuranceExpiry !== (vehicleData?.insurance_expiry || '')) vehicleUpdates.insurance_expiry = insuranceExpiry;
      if (insuranceStartDate !== (vehicleData?.insurance_start_date || '')) vehicleUpdates.insurance_start_date = insuranceStartDate;
      if (motor !== (vehicleData?.motor || '')) vehicleUpdates.motor = motor;
      if (chasis !== (vehicleData?.chasis || '')) vehicleUpdates.chasis = chasis;
      if (vin !== (vehicleData?.vin || '')) vehicleUpdates.vin = vin;
      if (cylinders !== (vehicleData?.cylinders?.toString() || '')) vehicleUpdates.cylinders = parseInt(cylinders);
      if (passengers !== (vehicleData?.passengers?.toString() || '')) vehicleUpdates.passengers = parseInt(passengers);
      if (fuelType !== (vehicleData?.fuel_type || '')) vehicleUpdates.fuel_type = fuelType;
      if (tonnage !== (vehicleData?.tonnage?.toString() || '')) vehicleUpdates.tonnage = parseFloat(tonnage);
      if (vehicleClass !== (vehicleData?.vehicle_class || '')) vehicleUpdates.vehicle_class = vehicleClass;
      if (serviceType !== (vehicleData?.service_type || '')) vehicleUpdates.service_type = serviceType;
      if (lien !== (vehicleData?.lien || defaultLienValue)) vehicleUpdates.lien = lien;
      if (is4x4 !== (vehicleData?.is_4x4 || false)) vehicleUpdates.is_4x4 = is4x4;

      // Fotos nuevas del vehículo
      if (uploadResults.registration_photo_front) vehicleUpdates.registration_photo_front = uploadResults.registration_photo_front;
      if (uploadResults.registration_photo_back) vehicleUpdates.registration_photo_back = uploadResults.registration_photo_back;
      if (uploadResults.insurance_photo) vehicleUpdates.insurance_photo = uploadResults.insurance_photo;
      if (uploadResults.vehicle_photo) vehicleUpdates.vehicle_photo = uploadResults.vehicle_photo;

      // 3. Guardar en PostgreSQL
      console.log('💾 Guardando datos en base de datos...');

      if (Object.keys(driverUpdates).length > 0) {
        console.log('📤 Actualizando conductor:', driverUpdates);
        const driverResult = await driversService.updateDriver(driverUpdates);
        console.log('✅ Respuesta conductor:', driverResult);
      }

      if (vehicleData?.id && Object.keys(vehicleUpdates).length > 0) {
        console.log('📤 Actualizando vehículo:', vehicleUpdates);
        const vehicleResult = await driversService.updateVehicle(vehicleData.id, vehicleUpdates);
        console.log('✅ Respuesta vehículo:', vehicleResult);
      }

      // 4. Actualizar estados locales con las URLs finales
      if (uploadResults.license_photo_front) setLicensePhotoFront(uploadResults.license_photo_front);
      if (uploadResults.license_photo_back) setLicensePhotoBack(uploadResults.license_photo_back);
      if (uploadResults.registration_photo_front) setRegistrationPhotoFront(uploadResults.registration_photo_front);
      if (uploadResults.registration_photo_back) setRegistrationPhotoBack(uploadResults.registration_photo_back);
      if (uploadResults.insurance_photo) setInsurancePhoto(uploadResults.insurance_photo);
      if (uploadResults.vehicle_photo) setVehiclePhoto(uploadResults.vehicle_photo);

      // 5. Limpiar URIs temporales
      setTempLicenseFrontUri(null);
      setTempLicenseBackUri(null);
      setTempRegistrationFrontUri(null);
      setTempRegistrationBackUri(null);
      setTempInsuranceUri(null);
      setTempVehicleUri(null);

      // Actualizar estado de completitud
      checkCompleteness();

      Alert.alert(
        alertsText.saveSuccessTitle,
        alertsText.saveSuccessMessage,
        [{ text: alertsText.confirmButton, onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('❌ Error en el proceso completo:', error);
      Alert.alert(alertsText.saveErrorTitle, alertsText.saveErrorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{loadingText}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{headerText.title}</Text>
        <Text style={styles.subtitle}>{headerText.subtitle}</Text>
        
        {/* Resumen de completitud */}
        <View style={styles.completionSummary}>
          {completionSummary && (
            <Text style={styles.completionSummaryText}>{completionSummary}</Text>
          )}
        </View>
      </View>

      {/* Información Personal */}
      <View style={[styles.section, isComplete.personalInfo && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.personal}</Text>
          {isComplete.personalInfo && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('licenseNumber')}</Text>
          <TextInput
            style={[styles.input, licenseNumber ? styles.inputFilled : styles.inputRequired]}
            value={licenseNumber}
            onChangeText={(text) => {
              setLicenseNumber(text);
              checkCompleteness();
            }}
            placeholder={fieldPlaceholder('licenseNumber')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('licenseExpiry')}</Text>
          <TextInput
            style={styles.input}
            value={licenseExpiry}
            onChangeText={setLicenseExpiry}
            placeholder={fieldPlaceholder('licenseExpiry')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('department')}</Text>
          <TextInput
            style={styles.input}
            value={department}
            onChangeText={setDepartment}
            placeholder={fieldPlaceholder('department')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('municipality')}</Text>
          <TextInput
            style={styles.input}
            value={municipality}
            onChangeText={setMunicipality}
            placeholder={fieldPlaceholder('municipality')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      {/* Vehicle Information */}
      <View style={[styles.section, isComplete.vehicleInfo && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.vehicle}</Text>
          {isComplete.vehicleInfo && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('plate')}</Text>
          <TextInput
            style={[styles.input, plate ? styles.inputFilled : styles.inputRequired]}
            value={plate}
            onChangeText={(text) => {
              setPlate(text);
              checkCompleteness();
            }}
            placeholder={fieldPlaceholder('plate')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('brand')}</Text>
          <TextInput
            style={[styles.input, brand ? styles.inputFilled : styles.inputRequired]}
            value={brand}
            onChangeText={(text) => {
              setBrand(text);
              checkCompleteness();
            }}
            placeholder={fieldPlaceholder('brand')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('model')}</Text>
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            placeholder={fieldPlaceholder('model')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('year')}</Text>
          <TextInput
            style={styles.input}
            value={year}
            onChangeText={setYear}
            placeholder={fieldPlaceholder('year')}
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('color')}</Text>
          <TextInput
            style={styles.input}
            value={color}
            onChangeText={setColor}
            placeholder={fieldPlaceholder('color')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('vehicleType')}</Text>
          <TextInput
            style={styles.input}
            value={vehicleType}
            onChangeText={setVehicleType}
            placeholder={fieldPlaceholder('vehicleType')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('fourByFour')}</Text>
          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>{messages.switchNo}</Text>
            <Switch
              value={is4x4}
              onValueChange={setIs4x4}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={is4x4 ? colors.primary : colors.textSecondary}
            />
            <Text style={styles.switchLabel}>{messages.switchYes}</Text>
          </View>
        </View>
      </View>

      {/* Technical Info */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.technical}</Text>
          <View style={styles.completionBadge}>
            <View style={[styles.completionIcon, styles.iconNotRequired]} />
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{completionText.optional}</Text>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('motor')}</Text>
          <TextInput
            style={styles.input}
            value={motor}
            onChangeText={setMotor}
            placeholder={fieldPlaceholder('motor')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('chasis')}</Text>
          <TextInput
            style={styles.input}
            value={chasis}
            onChangeText={setChasis}
            placeholder={fieldPlaceholder('chasis')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('vin')}</Text>
          <TextInput
            style={styles.input}
            value={vin}
            onChangeText={setVin}
            placeholder={fieldPlaceholder('vin')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('cylinders')}</Text>
          <TextInput
            style={styles.input}
            value={cylinders}
            onChangeText={setCylinders}
            placeholder={fieldPlaceholder('cylinders')}
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('passengers')}</Text>
          <TextInput
            style={styles.input}
            value={passengers}
            onChangeText={setPassengers}
            placeholder={fieldPlaceholder('passengers')}
            keyboardType="numeric"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('fuelType')}</Text>
          <TextInput
            style={styles.input}
            value={fuelType}
            onChangeText={setFuelType}
            placeholder={fieldPlaceholder('fuelType')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('tonnage')}</Text>
          <TextInput
            style={styles.input}
            value={tonnage}
            onChangeText={setTonnage}
            placeholder={fieldPlaceholder('tonnage')}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('vehicleClass')}</Text>
          <TextInput
            style={styles.input}
            value={vehicleClass}
            onChangeText={setVehicleClass}
            placeholder={fieldPlaceholder('vehicleClass')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('serviceType')}</Text>
          <TextInput
            style={styles.input}
            value={serviceType}
            onChangeText={setServiceType}
            placeholder={fieldPlaceholder('serviceType')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('lien')}</Text>
          <TextInput
            style={styles.input}
            value={lien}
            onChangeText={setLien}
            placeholder={fieldPlaceholder('lien')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      {/* Documents */}
      <View style={[styles.section, isComplete.documentsInfo && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.documents}</Text>
          {isComplete.documentsInfo && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('registrationNumber')}</Text>
          <TextInput
            style={styles.input}
            value={registrationNumber}
            onChangeText={setRegistrationNumber}
            placeholder={fieldPlaceholder('registrationNumber')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('registrationExpiry')}</Text>
          <TextInput
            style={styles.input}
            value={registrationExpiry}
            onChangeText={setRegistrationExpiry}
            placeholder={fieldPlaceholder('registrationExpiry')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('insuranceNumber')}</Text>
          <TextInput
            style={styles.input}
            value={insuranceNumber}
            onChangeText={setInsuranceNumber}
            placeholder={fieldPlaceholder('insuranceNumber')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('insuranceCompany')}</Text>
          <TextInput
            style={styles.input}
            value={insuranceCompany}
            onChangeText={setInsuranceCompany}
            placeholder={fieldPlaceholder('insuranceCompany')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('insuranceExpiry')}</Text>
          <TextInput
            style={styles.input}
            value={insuranceExpiry}
            onChangeText={setInsuranceExpiry}
            placeholder={fieldPlaceholder('insuranceExpiry')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{fieldLabel('insuranceStartDate')}</Text>
          <TextInput
            style={styles.input}
            value={insuranceStartDate}
            onChangeText={setInsuranceStartDate}
            placeholder={fieldPlaceholder('insuranceStartDate')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      </View>

      {/* License */}
      <View style={[styles.section, isComplete.licensePhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.license}</Text>
          {isComplete.licensePhotos && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.photoRow}>
          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>{photos.frontLabel ?? ''}</Text>
            <ImagePicker
              imageUri={tempLicenseFrontUri || licensePhotoFront || driverData?.license_photo_front || null}
              onImageSelected={handleSelectLicenseFront}
              label={photos.uploadFront ?? ''}
            />
          </View>

          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>{photos.backLabel ?? ''}</Text>
            <ImagePicker
              imageUri={tempLicenseBackUri || licensePhotoBack || driverData?.license_photo_back || null}
              onImageSelected={handleSelectLicenseBack}
              label={photos.uploadBack ?? ''}
            />
          </View>
        </View>
      </View>

      {/* Registration */}
      <View style={[styles.section, isComplete.registrationPhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.registration}</Text>
          {isComplete.registrationPhotos && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <View style={styles.photoRow}>
          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>{photos.frontLabel ?? ''}</Text>
            <ImagePicker
              imageUri={tempRegistrationFrontUri || registrationPhotoFront || vehicleData?.registration_photo_front || null}
              onImageSelected={handleSelectRegistrationFront}
              label={photos.uploadFront ?? ''}
            />
          </View>

          <View style={styles.photoContainer}>
            <Text style={styles.photoLabel}>{photos.backLabel ?? ''}</Text>
            <ImagePicker
              imageUri={tempRegistrationBackUri || registrationPhotoBack || vehicleData?.registration_photo_back || null}
              onImageSelected={handleSelectRegistrationBack}
              label={photos.uploadBack ?? ''}
            />
          </View>
        </View>
      </View>

      {/* Insurance */}
      <View style={[styles.section, isComplete.insurancePhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.insurance}</Text>
          {isComplete.insurancePhotos && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <ImagePicker
          imageUri={tempInsuranceUri || insurancePhoto || vehicleData?.insurance_photo || null}
          onImageSelected={handleSelectInsurance}
          label={photos.uploadPolicy ?? ''}
        />
      </View>

      {/* Vehicle Photo */}
      <View style={[styles.section, isComplete.vehiclePhotos && styles.completedSection]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{sections.vehiclePhotos}</Text>
          {isComplete.vehiclePhotos && (
            <View style={styles.completionBadge}>
              <View style={[styles.completionIcon, styles.iconComplete]} />
              <Text style={styles.completedText}>{completionText.badge}</Text>
            </View>
          )}
        </View>

        <ImagePicker
          imageUri={tempVehicleUri || vehiclePhoto || vehicleData?.vehicle_photo || null}
          onImageSelected={handleSelectVehicle}
          label={photos.uploadVehicle ?? ''}
        />
      </View>

      {/* Botón Guardar */}
      <View style={styles.buttonContainer}>
        {allSectionsComplete ? (
          <View style={styles.allCompletedBanner}>
            <Text style={styles.allCompletedText}>{completionText.allDone}</Text>
          </View>
        ) : (
          <Text style={styles.incompleteText}>{buttons.incompleteWarning ?? ''}</Text>
        )}
        <Button
          title={
            allSectionsComplete
              ? buttons.saveAllComplete ?? buttons.save ?? ''
              : buttons.save ?? buttons.saveAllComplete ?? ''
          }
          onPress={handleSave}
          disabled={saving}
          loading={saving}
          // El componente Button no acepta la propiedad color directamente
          // Se podría modificar el componente Button para aceptar un prop de color
        />
      </View>
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
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    padding: 20,
    backgroundColor: colors.card,
    marginTop: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  completedSection: {
    borderLeftColor: '#4CAF50', // Verde para secciones completadas
    borderLeftWidth: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  photoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  photoContainer: {
    flex: 1,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  buttonContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputFilled: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.05)', // Verde muy claro
  },
  inputRequired: {
    borderColor: '#FF9800', // Naranja para campos obligatorios sin llenar
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  completionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  completionIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 4,
  },
  iconComplete: {
    backgroundColor: '#4CAF50',
  },
  iconIncomplete: {
    backgroundColor: '#FF9800',
  },
  iconNotRequired: {
    backgroundColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  completionSummary: {
    marginTop: 16,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
  },
  completionSummaryText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'center',
  },
  allCompletedBanner: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allCompletedText: {
    color: '#388E3C',
    fontSize: 16,
    fontWeight: 'bold',
  },
  incompleteText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
});
