import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Alert,
  Platform,
  StyleSheet
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import * as ImagePicker from 'expo-image-picker';
import supabaseStorage from '../../services/supabaseStorage';
import inspectionsService from '../../services/inspectionsService';
import ridesService from '../../services/ridesService';

interface VehicleInspectionProps {
  route: any;
  navigation: any;
}

export default function VehicleInspectionScreen({ route, navigation }: VehicleInspectionProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const ns = 'driver.vehicleInspection';
  
  const { rideId, clientName, clientVehicleInfo } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [rearPhoto, setRearPhoto] = useState<string | null>(null);
  const [frontInteriorPhoto, setFrontInteriorPhoto] = useState<string | null>(null);
  const [rearInteriorPhoto, setRearInteriorPhoto] = useState<string | null>(null);
  
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Solicitar permisos para la cámara
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            t(`${ns}.alerts.permissionTitle`), 
            t(`${ns}.alerts.permissionMessage`)
          );
        }
      }
    })();
  }, []);

  // Verificar si faltan fotos
  const allPhotosProvided = frontPhoto && rearPhoto && frontInteriorPhoto && rearInteriorPhoto;
  
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
      Alert.alert(
        t(`${ns}.alerts.cameraErrorTitle`),
        t(`${ns}.alerts.cameraErrorMessage`)
      );
      console.error('Error al tomar foto:', error);
    }
  };

  // Subir fotos a Supabase Storage y actualizar datos del viaje
  const uploadPhotosAndContinue = async () => {
    if (!user || !rideId || !allPhotosProvided) {
      Alert.alert(
        t(`${ns}.alerts.missingDataTitle`),
        t(`${ns}.alerts.missingDataMessage`)
      );
      return;
    }

    setLoading(true);
    setUploadProgress(0);

    try {
      const photos = [
        { uri: frontPhoto as string, type: 'vehicle_front' },
        { uri: rearPhoto as string, type: 'vehicle_rear' },
        { uri: frontInteriorPhoto as string, type: 'interior_front' },
        { uri: rearInteriorPhoto as string, type: 'interior_rear' },
      ];

      const uploadedUrls: Record<string, string> = {};
      let totalProgress = 0;

      // Subir cada foto
      for (const [index, photo] of photos.entries()) {
        if (!photo.uri) continue;
        
        // Actualizar progreso de subida
        totalProgress = index / photos.length;
        setUploadProgress(totalProgress);
        
        // Subir la foto a Supabase
        const downloadUrl = await supabaseStorage.uploadVehicleInspectionPhoto(
          rideId,
          user.id,
          photo.uri,
          photo.type as 'vehicle_front' | 'vehicle_rear' | 'interior_front' | 'interior_rear'
        );
        
        // Guardar URL en el registro
        uploadedUrls[photo.type] = downloadUrl;
        
        // Actualizar progreso
        totalProgress = (index + 1) / photos.length;
        setUploadProgress(totalProgress);
      }

      // 1. Guardar en Supabase (designated_driver_inspections table)
      const inspectionId = await inspectionsService.saveDesignatedDriverInspection({
        ride_id: rideId,
        driver_id: user.id,
        vehicle_front_photo: uploadedUrls['vehicle_front'],
        vehicle_rear_photo: uploadedUrls['vehicle_rear'],
        interior_front_photo: uploadedUrls['interior_front'],
        interior_rear_photo: uploadedUrls['interior_rear'],
        status: 'completed',
        inspected_at: new Date().toISOString()
      });

      console.log('✅ Inspección guardada en Supabase con ID:', inspectionId);

      // ✅ Iniciar el viaje vía startRide (canal validado: driver, sesión y
      // estado permitido) y adjuntar la inspección — antes se usaba
      // updateRideStatus, un endpoint genérico sin control de transiciones.
      try {
        await ridesService.updateRideStatus(rideId, 'in_progress', {
          vehicleInspection: {
            timestamp: Date.now(),
            driver_id: user.id,
            photos: uploadedUrls,
            inspected: true,
            storage_provider: 'supabase',
            inspection_id: inspectionId
          }
        });

        console.log('✅ Firebase Realtime actualizado con inspection_id:', inspectionId);
      } catch (error) {
        console.warn('⚠️ Error actualizando inspection en Cloud Function:', error);
        // No lanzar error - la inspección ya se guardó en Supabase
      }

      setLoading(false);
      Alert.alert(
        t(`${ns}.alerts.successTitle`), 
        t(`${ns}.alerts.successMessage`),
        [{ 
          text: t(`${ns}.alerts.successButton`), 
          onPress: () => {
            // Volver a la pantalla anterior y pasar señal para iniciar el viaje
            navigation.navigate('ActiveRide', {
              rideId,
              startRideAfterInspection: true
            });
          }
        }]
      );

    } catch (error) {
      console.error('Error al subir fotos:', error);
      setLoading(false);
      Alert.alert(
        t(`${ns}.alerts.uploadErrorTitle`),
        t(`${ns}.alerts.uploadErrorMessage`)
      );
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(`${ns}.header.title`)}</Text>
        <Text style={styles.subtitle}>
          {t(`${ns}.header.subtitle`, { name: clientName || t(`${ns}.header.clientFallback`) })}
        </Text>
      </View>
      
      <View style={styles.photoSection}>
        {/* Foto Frontal */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>{t(`${ns}.steps.frontTitle`)}</Text>
          {frontPhoto ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: frontPhoto }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setFrontPhoto)}
              >
                <Text style={styles.retakeButtonText}>{t(`${ns}.steps.retakePhoto`)}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setFrontPhoto)}
            >
              <Text style={styles.photoButtonText}>{t(`${ns}.steps.takePhoto`)}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto Trasera */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>{t(`${ns}.steps.rearTitle`)}</Text>
          {rearPhoto ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: rearPhoto }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setRearPhoto)}
              >
                <Text style={styles.retakeButtonText}>{t(`${ns}.steps.retakePhoto`)}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setRearPhoto)}
            >
              <Text style={styles.photoButtonText}>{t(`${ns}.steps.takePhoto`)}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto Interior Frontal */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>{t(`${ns}.steps.interiorFrontTitle`)}</Text>
          {frontInteriorPhoto ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: frontInteriorPhoto }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setFrontInteriorPhoto)}
              >
                <Text style={styles.retakeButtonText}>{t(`${ns}.steps.retakePhoto`)}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setFrontInteriorPhoto)}
            >
              <Text style={styles.photoButtonText}>{t(`${ns}.steps.takePhoto`)}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Foto Interior Trasero */}
        <View style={styles.photoContainer}>
          <Text style={styles.photoTitle}>{t(`${ns}.steps.interiorRearTitle`)}</Text>
          {rearInteriorPhoto ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: rearInteriorPhoto }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.retakeButton}
                onPress={() => takePhoto(setRearInteriorPhoto)}
              >
                <Text style={styles.retakeButtonText}>{t(`${ns}.steps.retakePhoto`)}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.photoButton}
              onPress={() => takePhoto(setRearInteriorPhoto)}
            >
              <Text style={styles.photoButtonText}>{t(`${ns}.steps.takePhoto`)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.noticeContainer}>
        <Text style={styles.noticeText}>{t(`${ns}.notice.text`)}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <LoadingIcon size={32} color={colors.primary} />
          <Text style={styles.loadingText}>
            {t(`${ns}.loading.uploading`, { progress: Math.round(uploadProgress * 100) })}
          </Text>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.submitButton, !allPhotosProvided && styles.submitButtonDisabled]}
          onPress={uploadPhotosAndContinue}
          disabled={!allPhotosProvided}
        >
          <Text style={styles.submitButtonText}>
            {allPhotosProvided
              ? t(`${ns}.buttons.complete`)
              : t(`${ns}.buttons.incomplete`)}
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
  photoSection: {
    padding: 20,
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
