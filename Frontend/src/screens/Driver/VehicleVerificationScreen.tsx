import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Alert,
  ActivityIndicator,
  Platform,
  TextInput
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import supabaseStorage from '../../services/supabaseStorage';
import vehiclesService from '../../services/vehiclesService';

interface VehicleVerificationProps {
  route: any;
  navigation: any;
}

export default function VehicleVerificationScreen({ route, navigation }: VehicleVerificationProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  const { vehicleId } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [vehiclePhoto, setVehiclePhoto] = useState<string | null>(null);
  const [registrationPhotoFront, setRegistrationPhotoFront] = useState<string | null>(null);
  const [registrationPhotoBack, setRegistrationPhotoBack] = useState<string | null>(null);
  const [insurancePhoto, setInsurancePhoto] = useState<string | null>(null);
  
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Solicitar permisos para la cámara
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permisos necesarios', 
            'Se requiere acceso a la cámara para tomar fotos del vehículo.'
          );
        }
      }
    })();
  }, []);

  // Cargar datos existentes del vehículo
  useEffect(() => {
    const loadVehicleData = async () => {
      try {
        if (!vehicleId) {
          console.log('⚠️ vehicleId no disponible');
          return;
        }

        console.log('🚗 Cargando datos existentes del vehículo:', vehicleId);
        setLoading(true);

        // Obtener vehículos del conductor
        const vehicles = await vehiclesService.getDriverVehicles();
        
        if (!vehicles || vehicles.length === 0) {
          console.warn('⚠️ No hay vehículos disponibles');
          setLoading(false);
          return;
        }
        
        // Buscar el vehículo por ID
        const vehicle = vehicles.find((v: any) => v.id === vehicleId);
        
        if (vehicle) {
          console.log('✅ Datos del vehículo cargados:', {
            registrationNumber: vehicle.registrationNumber,
            registrationExpiry: vehicle.registrationExpiry,
            insuranceNumber: vehicle.insuranceNumber,
            insuranceCompany: vehicle.insuranceCompany,
            insuranceExpiry: vehicle.insuranceExpiry,
            vehiclePhoto: vehicle.vehiclePhoto ? '✅' : '❌',
            registrationPhotoFront: vehicle.registrationPhotoFront ? '✅' : '❌',
            registrationPhotoBack: vehicle.registrationPhotoBack ? '✅' : '❌',
            insurancePhoto: vehicle.insurancePhoto ? '✅' : '❌',
          });

          // Cargar datos existentes (ya están mapeados a camelCase por normalizeVehicle)
          if (vehicle.registrationNumber) {
            setRegistrationNumber(vehicle.registrationNumber);
          }
          if (vehicle.registrationExpiry) {
            setRegistrationExpiry(vehicle.registrationExpiry);
          }
          if (vehicle.insuranceNumber) {
            setInsuranceNumber(vehicle.insuranceNumber);
          }
          if (vehicle.insuranceCompany) {
            setInsuranceCompany(vehicle.insuranceCompany);
          }
          if (vehicle.insuranceExpiry) {
            setInsuranceExpiry(vehicle.insuranceExpiry);
          }
          if (vehicle.vehiclePhoto) {
            setVehiclePhoto(vehicle.vehiclePhoto);
          }
          if (vehicle.registrationPhotoFront) {
            setRegistrationPhotoFront(vehicle.registrationPhotoFront);
          }
          if (vehicle.registrationPhotoBack) {
            setRegistrationPhotoBack(vehicle.registrationPhotoBack);
          }
          if (vehicle.insurancePhoto) {
            setInsurancePhoto(vehicle.insurancePhoto);
          }
        } else {
          console.log('⚠️ Vehículo no encontrado con ID:', vehicleId);
        }

        setLoading(false);
      } catch (error) {
        console.error('❌ Error cargando datos del vehículo:', error);
        setLoading(false);
      }
    };

    loadVehicleData();
  }, [vehicleId]);

  // Verificar si faltan datos y fotos
  const allDataProvided = vehiclePhoto && registrationPhotoFront && registrationPhotoBack && insurancePhoto && 
                          registrationNumber && registrationExpiry && insuranceNumber && insuranceCompany && insuranceExpiry;
  
  // Tomar foto con la cámara
  const takePhoto = async (setPhotoFunction: React.Dispatch<React.SetStateAction<string | null>>) => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setPhotoFunction(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo tomar la foto');
      console.error('Error al tomar foto:', error);
    }
  };

  // Subir fotos y datos del vehículo
  const uploadVehicleVerification = async () => {
    if (!user || !allDataProvided) {
      Alert.alert('Error', 'Faltan datos o fotos para continuar');
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      const photos = [
        { uri: vehiclePhoto as string, type: 'vehicle_photo' },
        { uri: registrationPhotoFront as string, type: 'registration_front' },
        { uri: registrationPhotoBack as string, type: 'registration_back' },
        { uri: insurancePhoto as string, type: 'insurance_photo' },
      ];

      const uploadedUrls: Record<string, string> = {};
      let totalProgress = 0;

      // Subir cada foto
      for (const [index, photo] of photos.entries()) {
        if (!photo.uri) continue;
        
        totalProgress = index / photos.length;
        setUploadProgress(totalProgress);
        
        // Subir la foto a Supabase
        let downloadUrl: string;
        
        if (photo.type === 'registration_front' || photo.type === 'registration_back') {
          downloadUrl = await supabaseStorage.uploadRegistrationPhoto(
            user.id,
            photo.uri,
            photo.type === 'registration_front' ? 'front' : 'back'
          );
        } else if (photo.type === 'insurance_photo') {
          downloadUrl = await supabaseStorage.uploadInsurancePhoto(user.id, photo.uri);
        } else {
          // vehicle_photo - usar uploadImage genérico
          const timestamp = Date.now();
          const path = `vehicles/${user.id}/vehicle_${timestamp}.jpg`;
          downloadUrl = await supabaseStorage.uploadImage(photo.uri, 'drivers-documents', path);
        }
        
        uploadedUrls[photo.type] = downloadUrl;
        
        totalProgress = (index + 1) / photos.length;
        setUploadProgress(totalProgress);
      }

      // Actualizar vehículo con datos de verificación
      console.log('💾 Actualizando datos de verificación del vehículo...');
      const updateResult = await vehiclesService.updateVehicle(vehicleId, {
        registration_number: registrationNumber,
        registration_expiry: registrationExpiry,
        registration_photo_front: uploadedUrls['registration_front'],
        registration_photo_back: uploadedUrls['registration_back'],
        insurance_number: insuranceNumber,
        insurance_company: insuranceCompany,
        insurance_expiry: insuranceExpiry,
        insurance_photo: uploadedUrls['insurance_photo'],
        vehicle_photo: uploadedUrls['vehicle_photo'],
      });

      setLoading(false);
      Alert.alert(
        'Éxito', 
        'Vehículo verificado correctamente. Ahora puedes realizar viajes.',
        [{ 
          text: 'Aceptar', 
          onPress: () => {
            navigation.goBack();
          }
        }]
      );

    } catch (error) {
      console.error('Error al verificar vehículo:', error);
      setLoading(false);
      Alert.alert('Error', 'No se pudieron subir los datos. Inténtelo de nuevo.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🚗 Verificación del Vehículo</Text>
        <Text style={styles.subtitle}>Completa la información y sube las fotos de tu vehículo para poder realizar viajes.</Text>
      </View>
      
      {/* Datos del Vehículo */}
      <View style={styles.dataSection}>
        <Text style={styles.sectionTitle}>Información de Registro</Text>
        
        <Text style={styles.label}>Número de Registro *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: B2301230"
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>Vencimiento de Registro (YYYY-MM-DD) *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: 2029-02-14"
          value={registrationExpiry}
          onChangeText={setRegistrationExpiry}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>Número de Seguro *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: RCO30201102"
          value={insuranceNumber}
          onChangeText={setInsuranceNumber}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>Compañía de Seguro *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: BAC"
          value={insuranceCompany}
          onChangeText={setInsuranceCompany}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>Vencimiento de Seguro (YYYY-MM-DD) *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: 2030-02-12"
          value={insuranceExpiry}
          onChangeText={setInsuranceExpiry}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Fotos del Vehículo */}
      <View style={styles.photoSection}>
        <Text style={styles.sectionTitle}>Fotos del Vehículo</Text>
        
        {/* Foto del Vehículo */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>1. Foto General del Vehículo</Text>
          {vehiclePhoto ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: vehiclePhoto }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setVehiclePhoto)}
              >
                <Text style={styles.retakeButtonText}>Volver a tomar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setVehiclePhoto)}
            >
              <Text style={styles.photoButtonText}>📷 Tomar Foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto Registro Frente */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>2. Frente del Registro</Text>
          {registrationPhotoFront ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: registrationPhotoFront }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setRegistrationPhotoFront)}
              >
                <Text style={styles.retakeButtonText}>Volver a tomar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setRegistrationPhotoFront)}
            >
              <Text style={styles.photoButtonText}>📷 Tomar Foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto Registro Atrás */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>3. Reverso del Registro</Text>
          {registrationPhotoBack ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: registrationPhotoBack }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setRegistrationPhotoBack)}
              >
                <Text style={styles.retakeButtonText}>Volver a tomar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setRegistrationPhotoBack)}
            >
              <Text style={styles.photoButtonText}>📷 Tomar Foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto Seguro */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>4. Póliza de Seguro</Text>
          {insurancePhoto ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: insurancePhoto }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setInsurancePhoto)}
              >
                <Text style={styles.retakeButtonText}>Volver a tomar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setInsurancePhoto)}
            >
              <Text style={styles.photoButtonText}>📷 Tomar Foto</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.noticeContainer}>
        <Text style={styles.noticeText}>
          ⚠️ Asegúrate de que todas las fotos sean claras y legibles. Estos documentos serán verificados por nuestro equipo.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Verificando vehículo... {Math.round(uploadProgress * 100)}%</Text>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.submitButton, !allDataProvided && styles.submitButtonDisabled]}
          onPress={uploadVehicleVerification}
          disabled={!allDataProvided}
        >
          <Text style={styles.submitButtonText}>
            {allDataProvided ? 'Verificar Vehículo' : 'Complete todos los datos y fotos'}
          </Text>
        </TouchableOpacity>
      )}
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  dataSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoSection: {
    padding: 20,
    paddingTop: 0,
  },
  photoContainer: {
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: colors.text,
  },
  photoButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewContainer: {
    alignItems: 'center',
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  retakeButton: {
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  retakeButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  noticeContainer: {
    padding: 16,
    marginHorizontal: 20,
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    marginBottom: 20,
  },
  noticeText: {
    color: '#856404',
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    marginHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
