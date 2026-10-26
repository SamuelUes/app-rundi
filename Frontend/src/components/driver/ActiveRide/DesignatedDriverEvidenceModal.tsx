import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { launchCameraSafely } from '../../../utils/cameraUtils';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import alertService from '../../../services/alertService';
import inspectionsService from '../../../services/inspectionsService';
import { uploadDesignatedDriverEvidencePhoto } from '../../../services/supabaseStorage';
import {
  isDesignatedDriverEvidenceComplete,
  REQUIRED_DESIGNATED_DRIVER_PHOTOS,
  type DesignatedDriverPhotoSet,
  type DesignatedDriverPhotoType,
} from '../../../utils/designatedDriverEvidence';

interface DesignatedDriverEvidenceModalProps {
  visible: boolean;
  rideId: string;
  driverId: string;
  onClose: () => void;
  onCompleted: () => void;
  onCancelRide: () => void;
}

const PHOTO_LABELS: Record<DesignatedDriverPhotoType, string> = {
  insurance_document: 'insurance',
  registration_document: 'registration',
  front_driver_seat: 'frontDriverSeat',
  front_passenger_seat: 'frontPassengerSeat',
  rear_left_seat: 'rearLeftSeat',
  rear_right_seat: 'rearRightSeat',
};

export function DesignatedDriverEvidenceModal({
  visible,
  rideId,
  driverId,
  onClose,
  onCompleted,
  onCancelRide,
}: DesignatedDriverEvidenceModalProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const [photos, setPhotos] = useState<DesignatedDriverPhotoSet>({});
  const [documentsConfirmed, setDocumentsConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadIndex, setUploadIndex] = useState(0);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const canSubmit = isDesignatedDriverEvidenceComplete(photos, documentsConfirmed);

  const capturePhoto = async (type: DesignatedDriverPhotoType) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('driver.activeRide.evidence.permissionTitle'), t('driver.activeRide.evidence.permissionMessage'));
        return;
      }
      const result = await launchCameraSafely({
        allowsEditing: true,
        quality: 0.75,
      });
      const uri = result && !result.canceled ? result.assets?.[0]?.uri : undefined;
      if (uri) setPhotos((current) => ({ ...current, [type]: uri }));
    } catch {
      alertService.showErrorAlert(t('driver.activeRide.evidence.cameraError'));
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || uploading) return;
    setUploading(true);
    setUploadIndex(0);
    try {
      const uploadedPhotos = {} as Record<DesignatedDriverPhotoType, string>;
      for (const [index, type] of REQUIRED_DESIGNATED_DRIVER_PHOTOS.entries()) {
        const uri = photos[type];
        if (!uri) throw new Error(t('driver.activeRide.evidence.requiredPhoto'));
        uploadedPhotos[type] = await uploadDesignatedDriverEvidencePhoto(rideId, driverId, uri, type);
        setUploadIndex(index + 1);
      }
      await inspectionsService.submitDesignatedDriverRideInspection(rideId, uploadedPhotos, true);
      setPhotos({});
      setDocumentsConfirmed(false);
      onCompleted();
      onClose();
    } catch (error: any) {
      alertService.showErrorAlert(error?.message || t('driver.activeRide.evidence.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={uploading ? undefined : onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t('driver.activeRide.evidence.title')}</Text>
              <Text style={styles.subtitle}>{t('driver.activeRide.evidence.subtitle')}</Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              disabled={uploading}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('driver.activeRide.evidence.close')}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {REQUIRED_DESIGNATED_DRIVER_PHOTOS.map((type) => {
              const uri = photos[type];
              return (
                <View key={type} style={styles.photoRow}>
                  <View style={styles.photoPreview}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.photoImage} />
                    ) : (
                      <MaterialIcons name="photo-camera" size={22} color={colors.textSecondary} />
                    )}
                  </View>
                  <View style={styles.photoCopy}>
                    <Text style={styles.photoTitle}>{t(`driver.activeRide.evidence.photos.${PHOTO_LABELS[type]}`)}</Text>
                    <Text style={styles.photoState}>
                      {uri ? t('driver.activeRide.evidence.captured') : t('driver.activeRide.evidence.required')}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.captureButton, (uploading || !visible) && styles.disabled]}
                    onPress={() => capturePhoto(type)}
                    disabled={uploading}
                    accessibilityRole="button"
                    accessibilityLabel={t(uri ? 'driver.activeRide.evidence.retakePhoto' : 'driver.activeRide.evidence.takePhoto', {
                      photo: t(`driver.activeRide.evidence.photos.${PHOTO_LABELS[type]}`),
                    })}
                  >
                    <Text style={styles.captureButtonText}>
                      {t(uri ? 'driver.activeRide.evidence.retake' : 'driver.activeRide.evidence.take')}
                    </Text>
                  </Pressable>
                </View>
              );
            })}

            <Pressable
              style={styles.attestation}
              onPress={() => setDocumentsConfirmed((current) => !current)}
              disabled={uploading}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: documentsConfirmed, disabled: uploading }}
            >
              <View style={[styles.checkbox, documentsConfirmed && styles.checkboxChecked]}>
                {documentsConfirmed ? <MaterialIcons name="check" size={17} color={colors.background} /> : null}
              </View>
              <Text style={styles.attestationText}>{t('driver.activeRide.evidence.attestation')}</Text>
            </Pressable>
          </ScrollView>

          {uploading ? (
            <View style={styles.progressRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.progressText}>
                {t('driver.activeRide.evidence.uploadProgress', { current: uploadIndex, total: REQUIRED_DESIGNATED_DRIVER_PHOTOS.length })}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.submitButton, (!canSubmit || uploading) && styles.disabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || uploading}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit || uploading }}
          >
            {uploading ? <ActivityIndicator color={colors.background} /> : null}
            <Text style={styles.submitButtonText}>{t('driver.activeRide.evidence.submit')}</Text>
          </Pressable>

          <Pressable
            style={styles.cancelLink}
            onPress={() => {
              onClose();
              onCancelRide();
            }}
            disabled={uploading}
            accessibilityRole="button"
          >
            <Text style={styles.cancelLinkText}>{t('driver.activeRide.evidence.cancelIfExpired')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  sheet: {
    maxHeight: '92%',
    borderRadius: 22,
    padding: 18,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
  },
  headerCopy: { flex: 1, gap: 5 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  list: { flexShrink: 1 },
  listContent: { gap: 9, paddingBottom: 12 },
  photoRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 13,
    backgroundColor: isDark ? colors.surface : colors.background,
  },
  photoPreview: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  photoImage: { width: '100%', height: '100%' },
  photoCopy: { flex: 1, gap: 3 },
  photoTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  photoState: { color: colors.textSecondary, fontSize: 11 },
  captureButton: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  captureButtonText: { color: colors.onPrimary || colors.background, fontSize: 11, fontWeight: '700' },
  attestation: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  attestationText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  progressText: { color: colors.textSecondary, fontSize: 12 },
  submitButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 13,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  submitButtonText: { color: colors.onPrimary || colors.background, fontSize: 14, fontWeight: '800' },
  cancelLink: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelLinkText: { color: colors.error, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.48 },
});
