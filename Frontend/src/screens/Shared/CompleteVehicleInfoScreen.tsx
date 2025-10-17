import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { safeFormatDate } from '../../utils/safeFormatters';
import Button from '../../components/Button';
import driversService from '../../services/driversService';
import uploadService from '../../services/uploadService';

interface VehicleData {
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
  user_id?: string;
  license_number: string;
  license_expiry?: string;
  license_photo?: string;
  status?: string;
  total_rides?: number;
  average_rating?: number;
  total_earnings?: number;
  created_at?: string;
  updated_at?: string;
  // Datos de Firestore
  name?: string;
  email?: string;
  role?: string;
}

export default function CompleteVehicleInfoScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);
  const [driverData, setDriverData] = useState<DriverData | null>(null);

  // Estados para las fotos
  const [vehiclePhoto, setVehiclePhoto] = useState<string | null>(null);
  const [registrationPhoto, setRegistrationPhoto] = useState<string | null>(null);
  const [insurancePhoto, setInsurancePhoto] = useState<string | null>(null);
  const [licensePhoto, setLicensePhoto] = useState<string | null>(null);

  // Estados de carga para uploads
  const [uploadingVehiclePhoto, setUploadingVehiclePhoto] = useState(false);
  const [uploadingRegistrationPhoto, setUploadingRegistrationPhoto] = useState(false);
  const [uploadingInsurancePhoto, setUploadingInsurancePhoto] = useState(false);
  const [uploadingLicensePhoto, setUploadingLicensePhoto] = useState(false);

  // Cargar datos existentes
  useEffect(() => {
    loadExistingData();
  }, []);

  const loadExistingData = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const profile = await driversService.getDriverProfile(user.id);

      console.log('🔍 Perfil completo recibido:', profile);
      console.log('👤 Datos del driver:', profile?.driver);
      console.log('🚗 Datos del vehículo:', profile?.driver?.vehicle);

      if (profile?.driver) {
        setDriverData(profile.driver);
        if (profile.driver.vehicle) {
          setVehicleData(profile.driver.vehicle);
          // Cargar fotos existentes
          setVehiclePhoto(profile.driver.vehicle.vehiclePhoto || null);
          setRegistrationPhoto(profile.driver.vehicle.registrationPhoto || null);
          setInsurancePhoto(profile.driver.vehicle.insurancePhoto || null);
        }
        setLicensePhoto(profile.driver.licensePhoto || null);
      }
    } catch (error) {
      console.error('Error cargando datos existentes:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos existentes');
    } finally {
      setLoading(false);
    }
  };

  const handleTakePhoto = async (type: 'vehicle' | 'registration' | 'insurance' | 'license') => {
    try {
      const photoAsset = await uploadService.takePhoto();
      if (photoAsset?.uri) {
        await uploadPhoto(type, photoAsset.uri);
      }
    } catch (error) {
      console.error('Error tomando foto:', error);
    }
  };

  const handleSelectFromGallery = async (type: 'vehicle' | 'registration' | 'insurance' | 'license') => {
    try {
      const photoAsset = await uploadService.pickImageFromGallery();
      if (photoAsset?.uri) {
        await uploadPhoto(type, photoAsset.uri);
      }
    } catch (error) {
      console.error('Error seleccionando foto:', error);
    }
  };

  const uploadPhoto = async (type: 'vehicle' | 'registration' | 'insurance' | 'license', photoUri: string) => {
    if (!user?.id) return;

    // Set loading state
    switch (type) {
      case 'vehicle':
        setUploadingVehiclePhoto(true);
        break;
      case 'registration':
        setUploadingRegistrationPhoto(true);
        break;
      case 'insurance':
        setUploadingInsurancePhoto(true);
        break;
      case 'license':
        setUploadingLicensePhoto(true);
        break;
    }

    try {
      let result;

      switch (type) {
        case 'vehicle':
          result = await uploadService.uploadVehiclePhotos([photoUri]);
          setVehiclePhoto(result[0].url);
          break;
        case 'registration':
          result = await uploadService.uploadDocument(photoUri, 'registration');
          setRegistrationPhoto(result.url);
          break;
        case 'insurance':
          result = await uploadService.uploadDocument(photoUri, 'insurance');
          setInsurancePhoto(result.url);
          break;
        case 'license':
          result = await uploadService.uploadLicense(photoUri);
          setLicensePhoto(result.url);
          break;
      }

      Alert.alert('Éxito', 'Foto subida correctamente');
    } catch (error) {
      console.error('Error subiendo foto:', error);
      Alert.alert('Error', 'No se pudo subir la foto');
    } finally {
      // Clear loading state
      switch (type) {
        case 'vehicle':
          setUploadingVehiclePhoto(false);
          break;
        case 'registration':
          setUploadingRegistrationPhoto(false);
          break;
        case 'insurance':
          setUploadingInsurancePhoto(false);
          break;
        case 'license':
          setUploadingLicensePhoto(false);
          break;
      }
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      // Aquí podríamos actualizar otros campos si es necesario
      // Por ahora solo guardamos las fotos que se subieron

      Alert.alert(
        'Información Actualizada',
        'Los datos se han guardado correctamente',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error guardando información:', error);
      Alert.alert('Error', 'No se pudieron guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando información...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Completar Información del Vehículo</Text>
        <Text style={styles.subtitle}>
          Sube las fotos faltantes para completar tu perfil de conductor
        </Text>
      </View>

      {/* Información del Conductor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Información del Conductor</Text>

        {driverData && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Número de Licencia</Text>
            <Text style={styles.infoValue}>{driverData?.license_number || 'No especificado'}</Text>

            <Text style={styles.infoLabel}>Vencimiento Licencia</Text>
            <Text style={styles.infoValue}>
              {driverData?.license_expiry ? safeFormatDate(driverData.license_expiry) : 'No especificado'}
            </Text>

            <Text style={styles.infoLabel}>Estado del Conductor</Text>
            <Text style={styles.infoValue}>
              {driverData?.status === 'pending' ? 'Pendiente de Verificación' :
               driverData?.status === 'verified' ? 'Verificado' :
               driverData?.status === 'rejected' ? 'Rechazado' :
               driverData?.status || 'Desconocido'}
              {driverData.status === 'pending' ? 'Pendiente de Verificación' :
               driverData.status === 'verified' ? 'Verificado' :
               driverData.status === 'rejected' ? 'Rechazado' :
               driverData.status || 'Desconocido'}
            </Text>
          </View>
        )}

        {/* Foto de Licencia */}
        <View style={styles.photoSection}>
          <Text style={styles.photoTitle}>
            📄 Foto de Licencia {licensePhoto ? '✅' : '❌'}
          </Text>

          {licensePhoto ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: licensePhoto }} style={styles.photo} />
              <TouchableOpacity
                style={styles.changePhotoButton}
                onPress={() => Alert.alert(
                  'Cambiar Foto',
                  '¿Qué deseas hacer?',
                  [
                    { text: 'Tomar Foto', onPress: () => handleTakePhoto('license') },
                    { text: 'Seleccionar de Galería', onPress: () => handleSelectFromGallery('license') },
                    { text: 'Cancelar', style: 'cancel' },
                  ]
                )}
                disabled={uploadingLicensePhoto}
              >
                <Text style={styles.changePhotoText}>
                  {uploadingLicensePhoto ? '⏳ Subiendo...' : 'Cambiar'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => Alert.alert(
                'Foto de Licencia',
                '¿Qué deseas hacer?',
                [
                  { text: 'Tomar Foto', onPress: () => handleTakePhoto('license') },
                  { text: 'Seleccionar de Galería', onPress: () => handleSelectFromGallery('license') },
                  { text: 'Cancelar', style: 'cancel' },
                ]
              )}
              disabled={uploadingLicensePhoto}
            >
              <Text style={styles.uploadIcon}>
                {uploadingLicensePhoto ? '⏳' : '📷'}
              </Text>
              <Text style={styles.uploadText}>
                {uploadingLicensePhoto ? 'Subiendo...' : 'Subir Foto de Licencia'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Información del Vehículo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚗 Información del Vehículo</Text>

        {vehicleData && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Marca</Text>
            <Text style={styles.infoValue}>{vehicleData.brand}</Text>

            <Text style={styles.infoLabel}>Modelo</Text>
            <Text style={styles.infoValue}>{vehicleData.model}</Text>

            <Text style={styles.infoLabel}>Año</Text>
            <Text style={styles.infoValue}>{vehicleData.year}</Text>

            <Text style={styles.infoLabel}>Color</Text>
            <Text style={styles.infoValue}>{vehicleData.color}</Text>

            <Text style={styles.infoLabel}>Placa</Text>
            <Text style={styles.infoValue}>{vehicleData.plate}</Text>

            <Text style={styles.infoLabel}>Tipo de Vehículo</Text>
            <Text style={styles.infoValue}>
              {vehicleData.type === 'sedan' ? 'Sedán' :
               vehicleData.type === 'suv' ? 'SUV' :
               vehicleData.type === 'van' ? 'Van' :
               vehicleData.type === 'moto' ? 'Moto' : vehicleData.type}
            </Text>

            {/* Información de Matrícula/Circulación */}
            {vehicleData.registrationNumber && (
              <>
                <Text style={styles.infoLabel}>Número de Circulación</Text>
                <Text style={styles.infoValue}>{vehicleData.registrationNumber}</Text>
              </>
            )}

            {vehicleData.registrationExpiry && (
              <>
                <Text style={styles.infoLabel}>Vencimiento Circulación</Text>
                <Text style={styles.infoValue}>
                  {safeFormatDate(vehicleData.registrationExpiry)}
                </Text>
              </>
            )}

            {/* Información del Seguro */}
            {vehicleData.insuranceNumber && (
              <>
                <Text style={styles.infoLabel}>Número de Póliza de Seguro</Text>
                <Text style={styles.infoValue}>{vehicleData.insuranceNumber}</Text>
              </>
            )}

            {vehicleData.insuranceCompany && (
              <>
                <Text style={styles.infoLabel}>Compañía de Seguros</Text>
                <Text style={styles.infoValue}>{vehicleData.insuranceCompany}</Text>
              </>
            )}

            {vehicleData.insuranceExpiry && (
              <>
                <Text style={styles.infoLabel}>Vencimiento del Seguro</Text>
                <Text style={styles.infoValue}>
                  {safeFormatDate(vehicleData.insuranceExpiry)}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Foto del Vehículo */}
        <View style={styles.photoSection}>
          <Text style={styles.photoTitle}>
            🚗 Foto del Vehículo {vehiclePhoto ? '✅' : '❌'}
          </Text>

          {vehiclePhoto ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: vehiclePhoto }} style={styles.photo} />
              <TouchableOpacity
                style={styles.changePhotoButton}
                onPress={() => Alert.alert(
                  'Cambiar Foto',
                  '¿Qué deseas hacer?',
                  [
                    { text: 'Tomar Foto', onPress: () => handleTakePhoto('vehicle') },
                    { text: 'Seleccionar de Galería', onPress: () => handleSelectFromGallery('vehicle') },
                    { text: 'Cancelar', style: 'cancel' },
                  ]
                )}
                disabled={uploadingVehiclePhoto}
              >
                <Text style={styles.changePhotoText}>
                  {uploadingVehiclePhoto ? '⏳ Subiendo...' : 'Cambiar'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => Alert.alert(
                'Foto del Vehículo',
                '¿Qué deseas hacer?',
                [
                  { text: 'Tomar Foto', onPress: () => handleTakePhoto('vehicle') },
                  { text: 'Seleccionar de Galería', onPress: () => handleSelectFromGallery('vehicle') },
                  { text: 'Cancelar', style: 'cancel' },
                ]
              )}
              disabled={uploadingVehiclePhoto}
            >
              <Text style={styles.uploadIcon}>
                {uploadingVehiclePhoto ? '⏳' : '📷'}
              </Text>
              <Text style={styles.uploadText}>
                {uploadingVehiclePhoto ? 'Subiendo...' : `Subir Foto ${vehicleData?.type === 'moto' ? 'Lateral' : 'Frontal'}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto de Matrícula */}
        <View style={styles.photoSection}>
          <Text style={styles.photoTitle}>
            📄 Foto de Matrícula {registrationPhoto ? '✅' : '❌'}
          </Text>

          {registrationPhoto ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: registrationPhoto }} style={styles.photo} />
              <TouchableOpacity
                style={styles.changePhotoButton}
                onPress={() => Alert.alert(
                  'Cambiar Foto',
                  '¿Qué deseas hacer?',
                  [
                    { text: 'Tomar Foto', onPress: () => handleTakePhoto('registration') },
                    { text: 'Seleccionar de Galería', onPress: () => handleSelectFromGallery('registration') },
                    { text: 'Cancelar', style: 'cancel' },
                  ]
                )}
                disabled={uploadingRegistrationPhoto}
              >
                <Text style={styles.changePhotoText}>
                  {uploadingRegistrationPhoto ? '⏳ Subiendo...' : 'Cambiar'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => Alert.alert(
                'Foto de Matrícula',
                '¿Qué deseas hacer?',
                [
                  { text: 'Tomar Foto', onPress: () => handleTakePhoto('registration') },
                  { text: 'Seleccionar de Galería', onPress: () => handleSelectFromGallery('registration') },
                  { text: 'Cancelar', style: 'cancel' },
                ]
              )}
              disabled={uploadingRegistrationPhoto}
            >
              <Text style={styles.uploadIcon}>
                {uploadingRegistrationPhoto ? '⏳' : '📷'}
              </Text>
              <Text style={styles.uploadText}>
                {uploadingRegistrationPhoto ? 'Subiendo...' : 'Subir Foto de Matrícula'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto de Seguro */}
        <View style={styles.photoSection}>
          <Text style={styles.photoTitle}>
            🛡️ Foto de Seguro {insurancePhoto ? '✅' : '❌'}
          </Text>

          {insurancePhoto ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: insurancePhoto }} style={styles.photo} />
              <TouchableOpacity
                style={styles.changePhotoButton}
                onPress={() => Alert.alert(
                  'Cambiar Foto',
                  '¿Qué deseas hacer?',
                  [
                    { text: 'Tomar Foto', onPress: () => handleTakePhoto('insurance') },
                    { text: 'Seleccionar de Galería', onPress: () => handleSelectFromGallery('insurance') },
                    { text: 'Cancelar', style: 'cancel' },
                  ]
                )}
                disabled={uploadingInsurancePhoto}
              >
                <Text style={styles.changePhotoText}>
                  {uploadingInsurancePhoto ? '⏳ Subiendo...' : 'Cambiar'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => Alert.alert(
                'Foto de Seguro',
                '¿Qué deseas hacer?',
                [
                  { text: 'Tomar Foto', onPress: () => handleTakePhoto('insurance') },
                  { text: 'Seleccionar de Galería', onPress: () => handleSelectFromGallery('insurance') },
                  { text: 'Cancelar', style: 'cancel' },
                ]
              )}
              disabled={uploadingInsurancePhoto}
            >
              <Text style={styles.uploadIcon}>
                {uploadingInsurancePhoto ? '⏳' : '📷'}
              </Text>
              <Text style={styles.uploadText}>
                {uploadingInsurancePhoto ? 'Subiendo...' : 'Subir Foto de Seguro'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Resumen de Documentos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Estado de Documentos</Text>

        <View style={styles.documentsSummary}>
          <View style={styles.documentRow}>
            <Text style={styles.documentLabel}>📄 Licencia de Conducir</Text>
            <View style={styles.documentStatus}>
              <Text style={[styles.documentStatusText, { color: driverData?.license_photo ? '#10b981' : '#ef4444' }]}>
                {driverData?.license_photo ? '✅ Completo' : '❌ Pendiente'}
              </Text>
            </View>
          </View>

          <View style={styles.documentRow}>
            <Text style={styles.documentLabel}>🚗 Foto del Vehículo</Text>
            <View style={styles.documentStatus}>
              <Text style={[styles.documentStatusText, { color: vehiclePhoto ? '#10b981' : '#ef4444' }]}>
                {vehiclePhoto ? '✅ Completo' : '❌ Pendiente'}
              </Text>
            </View>
          </View>

          <View style={styles.documentRow}>
            <Text style={styles.documentLabel}>📋 Matrícula/Circulación</Text>
            <View style={styles.documentStatus}>
              <Text style={[styles.documentStatusText, { color: registrationPhoto ? '#10b981' : '#ef4444' }]}>
                {registrationPhoto ? '✅ Completo' : '❌ Pendiente'}
              </Text>
            </View>
          </View>

          <View style={styles.documentRow}>
            <Text style={styles.documentLabel}>🛡️ Póliza de Seguro</Text>
            <View style={styles.documentStatus}>
              <Text style={[styles.documentStatusText, { color: insurancePhoto ? '#10b981' : '#ef4444' }]}>
                {insurancePhoto ? '✅ Completo' : '❌ Pendiente'}
              </Text>
            </View>
          </View>
        </View>

        {/* Mensaje de completitud */}
        <View style={styles.completionMessage}>
          <Text style={styles.completionTitle}>
            {(() => {
              const totalDocs = 4;
              const completedDocs = [
                driverData?.license_photo,
                vehiclePhoto,
                registrationPhoto,
                insurancePhoto
              ].filter(Boolean).length;

              if (completedDocs === totalDocs) {
                return '🎉 ¡Perfil Completo!';
              } else if (completedDocs >= totalDocs * 0.75) {
                return '📈 ¡Casi listo!';
              } else if (completedDocs >= totalDocs * 0.5) {
                return '⚡ ¡Vas por buen camino!';
              } else {
                return '📎 Documentos Pendientes';
              }
            })()}
          </Text>
          <Text style={styles.completionText}>
            {(() => {
              const totalDocs = 4;
              const completedDocs = [
                driverData?.license_photo,
                vehiclePhoto,
                registrationPhoto,
                insurancePhoto
              ].filter(Boolean).length;

              return `${completedDocs} de ${totalDocs} documentos completados`;
            })()}
          </Text>
        </View>
      </View>

      {/* Botón Guardar */}
      <View style={styles.saveContainer}>
        <Button
          title={saving ? 'Guardando...' : 'Guardar Cambios'}
          onPress={handleSave}
          style={styles.saveButton}
          disabled={saving || uploadingLicensePhoto || uploadingRegistrationPhoto || uploadingInsurancePhoto || uploadingVehiclePhoto}
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
    padding: 24,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  photoSection: {
    marginBottom: 24,
  },
  photoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  uploadButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  uploadIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  changePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changePhotoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  saveContainer: {
    padding: 24,
    paddingBottom: 48,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  documentsSummary: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  documentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  documentLabel: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  documentStatus: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  documentStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  completionMessage: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  completionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  completionText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
