/**
 * Driver Data Screen
 * Pantalla para que conductores ingresen datos de licencia y vehículo
 */

import React, { useState, useMemo } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import registrationService from '../../services/registrationService';
import { getDepartments, getMunicipalitiesByDepartment } from '../../constants/nicaraguaLocations';

export default function DriverDataScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Datos del registro anterior
  const { name, email, phone, password, role, authProvider, phoneVerified } = route.params || {};

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
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
      return;
    }

    setLoading(true);
    try {
      console.log('💾 Guardando datos del conductor...');

      // Guardar datos temporales
      await registrationService.saveTemporaryData({
        name,
        email,
        phone,
        password,
        role,
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
          year: parseInt(year),
          color,
          type: type as 'sedan' | 'suv' | 'van' | 'moto',
          passengers: passengers ? passengers : undefined,
        },
      });

      console.log('✅ Datos guardados');

      // Navegar a pantalla de confirmación
      
      navigation.navigate('RegisterConfirm', {
        name,
        email,
        phone,
        password,
        role,
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
          year: parseInt(year),
          color,
          type: type as 'sedan' | 'suv' | 'van' | 'moto',
          passengers: passengers ? passengers : undefined,
        },
      });
    } catch (error: any) {
      console.error('Error guardando datos:', error);
      Alert.alert('Error', error.message || 'Error al guardar datos');
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
            <Text style={styles.title}>Datos del Conductor</Text>
            <Text style={styles.subtitle}>
              Completa tu información de licencia y vehículo
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
                📋 Licencia
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
                🚗 Vehículo
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contenido por Tab */}
          {activeTab === 'license' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Información de Licencia</Text>

              {/* Número de Licencia */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Número de Licencia *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: 123456789"
                  placeholderTextColor={colors.textSecondary}
                  value={licenseNumber}
                  onChangeText={setLicenseNumber}
                  editable={!loading}
                />
              </View>

              {/* Fecha de Vencimiento */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Vencimiento (YYYY-MM-DD) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2030-12-31"
                  placeholderTextColor={colors.textSecondary}
                  value={licenseExpiry}
                  onChangeText={(text) => setLicenseExpiry(formatDate(text, licenseExpiry))}
                  editable={!loading}
                />
              </View>

              {/* Departamento */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Departamento *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={department}
                    onValueChange={setDepartment}
                    enabled={!loading}
                    style={styles.picker}
                  >
                    <Picker.Item label="Selecciona departamento" value="" />
                    {departments_list.map((dept) => (
                      <Picker.Item key={dept} label={dept} value={dept} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Municipio */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Municipio *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={municipality}
                    onValueChange={setMunicipality}
                    enabled={!loading && department !== ''}
                    style={styles.picker}
                  >
                    <Picker.Item label="Selecciona municipio" value="" />
                    {municipalities.map((mun) => (
                      <Picker.Item key={mun} label={mun} value={mun} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Info */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💡 Asegúrate de que tu licencia sea válida y no esté vencida
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Información del Vehículo</Text>

              {/* Placa */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Placa *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: ABC-123"
                  placeholderTextColor={colors.textSecondary}
                  value={plate}
                  onChangeText={setPlate}
                  editable={!loading}
                />
              </View>

              {/* Marca */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Marca *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Toyota"
                  placeholderTextColor={colors.textSecondary}
                  value={brand}
                  onChangeText={setBrand}
                  editable={!loading}
                />
              </View>

              {/* Modelo */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Modelo *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Corolla"
                  placeholderTextColor={colors.textSecondary}
                  value={model}
                  onChangeText={setModel}
                  editable={!loading}
                />
              </View>

              {/* Año */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Año *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: 2020"
                  placeholderTextColor={colors.textSecondary}
                  value={year}
                  onChangeText={setYear}
                  keyboardType="numeric"
                  editable={!loading}
                />
              </View>

              {/* Color */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Color *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Blanco"
                  placeholderTextColor={colors.textSecondary}
                  value={color}
                  onChangeText={setColor}
                  editable={!loading}
                />
              </View>

              {/* Tipo */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Tipo de Vehículo *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={type}
                    onValueChange={setType}
                    enabled={!loading}
                    style={styles.picker}
                  >
                    <Picker.Item label="Sedán" value="sedan" />
                    <Picker.Item label="SUV" value="suv" />
                    <Picker.Item label="Van" value="van" />
                    <Picker.Item label="Moto" value="moto" />
                  </Picker>
                </View>
              </View>

              {/* Pasajeros */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Capacidad de Pasajeros</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: 4"
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
                  💡 Asegúrate de que todos los datos coincidan con tu registro vehicular
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
              <Text style={styles.backButtonText}>← Volver</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.continueButton, !isComplete && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading || !isComplete}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.continueButtonText}>Continuar →</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Progreso */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '50%' }]} />
          </View>
          <Text style={styles.progressText}>Paso 3 de 4</Text>
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
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
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
    backgroundColor: colors.primary,
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
