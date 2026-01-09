/**
 * Driver Data Screen
 * Pantalla para que conductores ingresen datos de licencia y vehículo
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import registrationService from '../../services/registrationService';
import { getDepartments, getMunicipalitiesByDepartment } from '../../constants/nicaraguaLocations';
import { AuthStackParamList } from '../../navigation/types';
import { useTranslation } from 'react-i18next';

type DriverDataNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'DriverData'>;
type DriverDataRouteProp = RouteProp<AuthStackParamList, 'DriverData'>;

interface Props {
  navigation: DriverDataNavigationProp;
  route: DriverDataRouteProp;
}

export default function DriverDataScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const {
    name,
    email,
    phone,
    password,
    method,
    authProvider,
    googleIdToken,
    phoneVerified,
    context,
  } = route.params;

  const driverContext: 'register_driver' | 'register_upgrade_driver' =
    context === 'register_upgrade_driver' ? 'register_upgrade_driver' : 'register_driver';

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'license' | 'vehicle'>('license');

  // Datos de Licencia
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [department, setDepartment] = useState('');
  const [municipality, setMunicipality] = useState('');

  // Datos del Vehículo
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [type, setType] = useState('sedan');
  const [passengers, setPassengers] = useState('');

  // Listas
  const departments_list = getDepartments();
  const municipalities = department ? getMunicipalitiesByDepartment(department) : [];

  // Validar que los datos requeridos estén completos
  const isLicenseComplete = licenseNumber && licenseExpiry && department && municipality;
  const isVehicleComplete = plate && brand && model && year && color && type;
  const isComplete = isLicenseComplete && isVehicleComplete;

  const handleContinue = async () => {
    if (!isComplete) {
      Alert.alert(
        t('authScreens.driverData.alerts.errorTitle'),
        t('authScreens.driverData.alerts.incomplete'),
      );
      return;
    }

    setLoading(true);
    try {
      console.log('💾 Guardando datos del conductor...');

      // Guardar datos temporales solo para flujo de registro inicial
      if (driverContext === 'register_driver') {
        await registrationService.saveTemporaryData({
          name,
          email,
          phone,
          password,
          role: 'driver',
          method,
          authProvider,
          phoneVerified,
          driverData: {
            licenseNumber,
            licenseExpiry,
            department,
            municipality,
          },
          vehicleData: {
            plate: plate.toUpperCase(),
            brand,
            model,
            year: parseInt(year, 10),
            color,
            type: type as 'sedan' | 'suv' | 'van' | 'moto',
            passengers: passengers || undefined,
          },
          googleIdToken,
          lastStep: 'driverData',
        });

        console.log('✅ Datos guardados');
      }

      // Navegar a pantalla de confirmación
      
      navigation.navigate('RegisterConfirm', {
        name,
        email,
        phone,
        password,
        role: 'driver',
        method,
        authProvider,
        googleIdToken,
        phoneVerified,
        driverData: {
          licenseNumber,
          licenseExpiry,
          department,
          municipality,
        },
        vehicleData: {
          plate: plate.toUpperCase(),
          brand,
          model,
          year: parseInt(year, 10),
          color,
          type: type as 'sedan' | 'suv' | 'van' | 'moto',
          passengers: passengers || undefined,
        },
        context: driverContext,
      });
    } catch (error: any) {
      console.error('Error guardando datos:', error);
      Alert.alert(
        t('authScreens.driverData.alerts.errorTitle'),
        error?.message || t('authScreens.driverData.alerts.saveFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (text: string, currentValue: string) => {
    const numbers = text.replace(/[^\d]/g, '');

    if (text.length < currentValue.length) {
      return text;
    }

    if (numbers.length <= 4) {
      return numbers;
    } else if (numbers.length <= 6) {
      const year = numbers.slice(0, 4);
      const month = numbers.slice(4, 6);
      return `${year}-${month}`;
    } else {
      const year = numbers.slice(0, 4);
      const month = numbers.slice(4, 6);
      const day = numbers.slice(6, 8);
      return `${year}-${month}-${day}`;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('authScreens.driverData.headerTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {t('authScreens.driverData.headerSubtitle')}
            </Text>
          </View>

          {/* Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'license' && styles.tabActive]}
              onPress={() => setActiveTab('license')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'license' && styles.tabTextActive,
                ]}
              >
                {t('authScreens.driverData.tabs.license')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'vehicle' && styles.tabActive]}
              onPress={() => setActiveTab('vehicle')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'vehicle' && styles.tabTextActive,
                ]}
              >
                {t('authScreens.driverData.tabs.vehicle')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contenido por Tab */}
          {activeTab === 'license' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('authScreens.driverData.license.sectionTitle')}
              </Text>

              {/* Número de Licencia */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.license.licenseNumberLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.driverData.license.licenseNumberPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={licenseNumber}
                  onChangeText={setLicenseNumber}
                  editable={!loading}
                />
              </View>

              {/* Fecha de Vencimiento */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.license.expiryLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.driverData.license.expiryPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={licenseExpiry}
                  onChangeText={(text) => setLicenseExpiry(formatDate(text, licenseExpiry))}
                  editable={!loading}
                />
              </View>

              {/* Departamento */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.license.departmentLabel')}
                </Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={department}
                    onValueChange={setDepartment}
                    enabled={!loading}
                    style={styles.picker}
                  >
                    <Picker.Item
                      label={t('authScreens.driverData.license.departmentPlaceholder')}
                      value=""
                    />
                    {departments_list.map((dept) => (
                      <Picker.Item key={dept} label={dept} value={dept} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Municipio */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.license.municipalityLabel')}
                </Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={municipality}
                    onValueChange={setMunicipality}
                    enabled={!loading && department !== ''}
                    style={styles.picker}
                  >
                    <Picker.Item
                      label={t('authScreens.driverData.license.municipalityPlaceholder')}
                      value=""
                    />
                    {municipalities.map((mun) => (
                      <Picker.Item key={mun} label={mun} value={mun} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Info */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  {t('authScreens.driverData.license.info')}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('authScreens.driverData.vehicle.sectionTitle')}
              </Text>

              {/* Placa */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.vehicle.plateLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.driverData.vehicle.platePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={plate}
                  onChangeText={setPlate}
                  editable={!loading}
                />
              </View>

              {/* Marca */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.vehicle.brandLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.driverData.vehicle.brandPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={brand}
                  onChangeText={setBrand}
                  editable={!loading}
                />
              </View>

              {/* Modelo */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.vehicle.modelLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.driverData.vehicle.modelPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={model}
                  onChangeText={setModel}
                  editable={!loading}
                />
              </View>

              {/* Año */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.vehicle.yearLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.driverData.vehicle.yearPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={year}
                  onChangeText={setYear}
                  keyboardType="numeric"
                  editable={!loading}
                />
              </View>

              {/* Color */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.vehicle.colorLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.driverData.vehicle.colorPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={color}
                  onChangeText={setColor}
                  editable={!loading}
                />
              </View>

              {/* Tipo */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.vehicle.typeLabel')}
                </Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={type}
                    onValueChange={setType}
                    enabled={!loading}
                    style={styles.picker}
                  >
                    <Picker.Item
                      label={t('authScreens.driverData.vehicle.typeOptions.sedan')}
                      value="sedan"
                    />
                    <Picker.Item
                      label={t('authScreens.driverData.vehicle.typeOptions.suv')}
                      value="suv"
                    />
                    <Picker.Item
                      label={t('authScreens.driverData.vehicle.typeOptions.van')}
                      value="van"
                    />
                    <Picker.Item
                      label={t('authScreens.driverData.vehicle.typeOptions.moto')}
                      value="moto"
                    />
                  </Picker>
                </View>
              </View>

              {/* Pasajeros */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {t('authScreens.driverData.vehicle.passengersLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.driverData.vehicle.passengersPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={passengers}
                  onChangeText={setPassengers}
                  keyboardType="numeric"
                  editable={!loading}
                />
              </View>

              {/* Info */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  {t('authScreens.driverData.vehicle.info')}
                </Text>
              </View>
            </View>
          )}

          {/* Botones */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>
                {t('authScreens.driverData.buttons.back')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.continueButton, !isComplete && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading || !isComplete}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.label}>
                  {t('authScreens.driverData.buttons.continue')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Progreso */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '50%' }]} />
          </View>
          <Text style={styles.progressText}>
            {t('authScreens.driverData.progress', { current: 3, total: 4 })}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: 'rgba(212, 156, 35, 1)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: 'rgba(212, 156, 35, 1)',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text,
  },
  infoBox: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  infoText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  backButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  continueButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(201, 149, 36, 1)',
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  progressContainer: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
