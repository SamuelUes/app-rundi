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
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getDepartments, getMunicipalitiesByDepartment } from '../../constants/nicaraguaLocations';

export default function RegisterScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+505');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'client' | 'driver'>('client');
  const [loading, setLoading] = useState(false);

  // Validación de contraseñas
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const passwordsDontMatch = password && confirmPassword && password !== confirmPassword;

  // Datos del conductor
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [department, setDepartment] = useState('');
  const [municipality, setMunicipality] = useState('');
  
  // Lista de departamentos y municipios
  const departments = getDepartments();
  const municipalities = department ? getMunicipalitiesByDepartment(department) : [];

  // Datos del vehículo
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [vehicleType, setVehicleType] = useState('moto');

  // Documentos del vehículo
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');

  // Función para formatear fecha automáticamente (AAAA-MM-DD)
  const formatDate = (text: string, currentValue: string) => {
    // Remover todo excepto números
    const numbers = text.replace(/[^\d]/g, '');
    
    // Si está borrando, permitir
    if (text.length < currentValue.length) {
      return text;
    }
    
    // Formatear según la longitud
    if (numbers.length <= 4) {
      return numbers;
    } else if (numbers.length <= 6) {
      return `${numbers.slice(0, 4)}-${numbers.slice(4)}`;
    } else {
      return `${numbers.slice(0, 4)}-${numbers.slice(4, 6)}-${numbers.slice(6, 8)}`;
    }
  };

  // Handlers para fechas con formato automático
  const handleLicenseExpiryChange = (text: string) => {
    const formatted = formatDate(text, licenseExpiry);
    setLicenseExpiry(formatted);
  };

  const handleRegistrationExpiryChange = (text: string) => {
    const formatted = formatDate(text, registrationExpiry);
    setRegistrationExpiry(formatted);
  };

  const handleInsuranceExpiryChange = (text: string) => {
    const formatted = formatDate(text, insuranceExpiry);
    setInsuranceExpiry(formatted);
  };

  // Función para formatear teléfono
  const handlePhoneChange = (text: string) => {
    // Si el usuario intenta borrar el prefijo, mantenerlo
    if (!text.startsWith('+505')) {
      setPhone('+505');
      return;
    }
    
    // Solo permitir números después del prefijo
    const numbers = text.slice(4).replace(/[^\d]/g, '');
    
    // Limitar a 8 dígitos (estándar de Nicaragua)
    if (numbers.length <= 8) {
      setPhone('+505' + numbers);
    }
  };

  const handleRegister = async () => {
    if (!name || !email || !phone || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos obligatorios (Nombre, Email, Teléfono, Contraseña)');
      return;
    }

    // Validar que el teléfono tenga al menos el prefijo + 8 dígitos
    if (phone.length < 12) { // +505 (4) + 8 dígitos = 12
      Alert.alert('Error', 'El número de teléfono debe tener 8 dígitos');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }

    // Validar campos de conductor si el rol es driver
    if (role === 'driver') {
      if (!licenseNumber || !department || !municipality || !plate || !brand || !model || !year || !color) {
        Alert.alert('Error', 'Por favor completa todos los campos obligatorios del conductor y vehículo (incluyendo departamento y municipio)');
        return;
      }
    }

    setLoading(true);
    try {
      const registerData: any = {
        name,
        email,
        phone,
        password,
        role,
      };

      // Agregar datos de conductor y vehículo si el rol es driver
      if (role === 'driver') {
        registerData.driverData = {
          licenseNumber,
          licenseExpiry: licenseExpiry || null,
          licensePhoto: null, // Por ahora null, se puede agregar upload después
          department,
          municipality,
        };

        registerData.vehicleData = {
          plate,
          brand,
          model,
          year: parseInt(year),
          color,
          type: vehicleType,
          registrationNumber: registrationNumber || null,
          registrationExpiry: registrationExpiry || null,
          registrationPhoto: null,
          insuranceNumber: insuranceNumber || null,
          insuranceCompany: insuranceCompany || null,
          insuranceExpiry: insuranceExpiry || null,
          insurancePhoto: null,
        };
      }

      await register(registerData);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Regístrate para continuar</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre completo *"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="tu@email.com"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Teléfono *</Text>
            <TextInput
              style={styles.input}
              placeholder="+505 12345678"
              placeholderTextColor={colors.textSecondary}
              value={phone}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              maxLength={12}
            />
            <Text style={styles.helperText}>
              Formato: +505 seguido de 8 dígitos
            </Text>

            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={styles.input}
              placeholder="Contraseña (mín. 6 caracteres) *"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Text style={styles.label}>Confirmar contraseña</Text>
            <TextInput
              style={[
                styles.input,
                passwordsMatch ? styles.inputSuccess : undefined,
                passwordsDontMatch ? styles.inputError : undefined,
              ]}
              placeholder="Confirmar contraseña *"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
            {passwordsMatch && (
              <Text style={styles.successText}>✓ Las contraseñas coinciden</Text>
            )}
            {passwordsDontMatch && (
              <Text style={styles.errorText}>✗ Las contraseñas no coinciden</Text>
            )}

            <Text style={styles.roleLabel}>¿Eres cliente o conductor?</Text>
            <View style={styles.roleButtons}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'client' && styles.roleButtonActive,
                ]}
                onPress={() => setRole('client')}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    role === 'client' && styles.roleButtonTextActive,
                  ]}
                >
                  Cliente
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'driver' && styles.roleButtonActive,
                ]}
                onPress={() => setRole('driver')}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    role === 'driver' && styles.roleButtonTextActive,
                  ]}
                >
                  Conductor
                </Text>
              </TouchableOpacity>
            </View>

            {/* Formulario de conductor */}
            {role === 'driver' && (
              <View style={styles.driverForm}>
                <Text style={styles.sectionTitle}>📋 Datos de Licencia</Text>
                
                <Text style={styles.label}>Número de Licencia *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Número de Licencia *"
                  placeholderTextColor={colors.textSecondary}
                  value={licenseNumber}
                  onChangeText={setLicenseNumber}
                />

                <Text style={styles.label}>Vencimiento Licencia (AÑO-MES-DÍA)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2025-12-31"
                  placeholderTextColor={colors.textSecondary}
                  value={licenseExpiry}
                  onChangeText={handleLicenseExpiryChange}
                  keyboardType="numeric"
                  maxLength={10}
                />

                <Text style={styles.sectionTitle}>📍 Ubicación</Text>

                <Text style={styles.label}>Departamento *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={department}
                    onValueChange={(itemValue) => {
                      setDepartment(itemValue);
                      setMunicipality(''); // Reset municipality when department changes
                    }}
                    style={styles.picker}
                  >
                    <Picker.Item label="Selecciona un departamento" value="" />
                    {departments.map((dept) => (
                      <Picker.Item key={dept} label={dept} value={dept} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>Municipio *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={municipality}
                    onValueChange={(itemValue) => setMunicipality(itemValue)}
                    style={styles.picker}
                    enabled={!!department}
                  >
                    <Picker.Item label="Selecciona un municipio" value="" />
                    {municipalities.map((mun) => (
                      <Picker.Item key={mun} label={mun} value={mun} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.sectionTitle}>🚗 Datos del Vehículo</Text>

                <Text style={styles.label}>Placa/Matrícula *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Placa/Matrícula *"
                  placeholderTextColor={colors.textSecondary}
                  value={plate}
                  onChangeText={setPlate}
                  autoCapitalize="characters"
                />

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Text style={styles.label}>Marca *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Marca *"
                      placeholderTextColor={colors.textSecondary}
                      value={brand}
                      onChangeText={setBrand}
                    />
                  </View>

                  <View style={styles.halfInput}>
                    <Text style={styles.label}>Modelo *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Modelo *"
                      placeholderTextColor={colors.textSecondary}
                      value={model}
                      onChangeText={setModel}
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.halfInput}>
                    <Text style={styles.label}>Año *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Año *"
                      placeholderTextColor={colors.textSecondary}
                      value={year}
                      onChangeText={setYear}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.halfInput}>
                    <Text style={styles.label}>Color *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Color *"
                      placeholderTextColor={colors.textSecondary}
                      value={color}
                      onChangeText={setColor}
                    />
                  </View>
                </View>

                <Text style={styles.label}>Tipo de Vehículo *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={vehicleType}
                    onValueChange={(itemValue) => setVehicleType(itemValue)}
                    style={styles.picker}
                  >
                    <Picker.Item label="🏍️ Moto" value="moto" />
                    <Picker.Item label="🚗 Sedán" value="sedan" />
                    <Picker.Item label="🚙 SUV" value="suv" />
                    <Picker.Item label="🛻 Pickup / Camioneta" value="pickup" />
                    <Picker.Item label="🚐 Van" value="van" />
                    <Picker.Item label="🚙 Jeep" value="jeep" />
                    <Picker.Item label="🚙 Crossover" value="crossover" />
                    <Picker.Item label="🚗 Hatchback" value="hatchback" />
                    <Picker.Item label="🚗 Coupe" value="coupe" />
                    <Picker.Item label="🚗 Convertible" value="convertible" />
                    <Picker.Item label="🚛 Camión" value="truck" />
                  </Picker>
                </View>

                <Text style={styles.sectionTitle}>📄 Documentos del Vehículo</Text>

                <Text style={styles.label}>Número de Circulación/Matrícula</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Número de Circulación/Matrícula"
                  placeholderTextColor={colors.textSecondary}
                  value={registrationNumber}
                  onChangeText={setRegistrationNumber}
                />

                <Text style={styles.label}>Vencimiento Circulación (AÑO-MES-DÍA)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2025-12-31"
                  placeholderTextColor={colors.textSecondary}
                  value={registrationExpiry}
                  onChangeText={handleRegistrationExpiryChange}
                  keyboardType="numeric"
                  maxLength={10}
                />

                <Text style={styles.label}>Número de Póliza de Seguro</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Número de Póliza de Seguro"
                  placeholderTextColor={colors.textSecondary}
                  value={insuranceNumber}
                  onChangeText={setInsuranceNumber}
                />

                <Text style={styles.label}>Compañía de Seguros</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Compañía de Seguros"
                  placeholderTextColor={colors.textSecondary}
                  value={insuranceCompany}
                  onChangeText={setInsuranceCompany}
                />

                <Text style={styles.label}>Vencimiento Seguro (AÑO-MES-DÍA)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2025-12-31"
                  placeholderTextColor={colors.textSecondary}
                  value={insuranceExpiry}
                  onChangeText={handleInsuranceExpiryChange}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
            )}

            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.registerButtonText}>
                {loading ? 'Registrando...' : 'Registrarse'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.loginButtonText}>
                ¿Ya tienes cuenta? Inicia sesión
              </Text>
            </TouchableOpacity>
          </View>
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
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: -12,
    marginBottom: 16,
    marginLeft: 4,
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  roleButtonActive: {
    borderColor: colors.text,
    backgroundColor: colors.text,
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  roleButtonTextActive: {
    color: colors.card,
  },
  registerButton: {
    backgroundColor: colors.text,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  loginButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  driverForm: {
    marginTop: 20,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text,
    backgroundColor: colors.card,
  },
  inputSuccess: {
    borderColor: '#10b981',
    borderWidth: 2,
  },
  inputError: {
    borderColor: '#ef4444',
    borderWidth: 2,
  },
  successText: {
    color: '#10b981',
    fontSize: 12,
    marginTop: -12,
    marginBottom: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: -12,
    marginBottom: 12,
    fontWeight: '600',
  },
});
