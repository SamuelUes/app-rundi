import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import { launchCameraSafely } from '../../../utils/cameraUtils';
import { LoadingIcon } from '../../ui/LoadingIcon';
import StorageImage from '../../shared/StorageImage';
import alertService from '../../../services/alertService';
import designatedCrewService from '../../../services/designatedCrewService';

interface Props {
  visible: boolean;
  userId: string;
  currentPath: string | null;
  onCancel: () => void;
  onReady: () => void;
}

export function ArrivalVehiclePhotoModal({ visible, userId, currentPath, onCancel, onReady }: Props) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const capture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await launchCameraSafely({ allowsEditing: true, quality: 0.75 });
    const uri = result && !result.canceled ? result.assets?.[0]?.uri : undefined;
    if (uri) setLocalUri(uri);
  };

  const confirm = async () => {
    if (!localUri && currentPath) {
      onReady();
      return;
    }
    if (!localUri) {
      alertService.showErrorAlert(t('driver.crew.arrivalPhoto.required'));
      return;
    }
    setUploading(true);
    try {
      await designatedCrewService.uploadArrivalPhoto(userId, localUri);
      setLocalUri(null);
      onReady();
    } catch {
      alertService.showErrorAlert(t('driver.crew.errors.generic'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={uploading ? undefined : onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('driver.crew.arrivalPhoto.title')}</Text>
          <Text style={styles.subtitle}>{t('driver.crew.arrivalPhoto.subtitle')}</Text>
          <View style={styles.preview}>
            {localUri ? (
              <Image source={{ uri: localUri }} style={styles.image} />
            ) : currentPath ? (
              <StorageImage uri={currentPath} style={styles.image} resizeMode="cover" />
            ) : null}
          </View>
          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.secondary]} onPress={capture} disabled={uploading} accessibilityRole="button">
              <Text style={styles.secondaryLabel}>
                {t(localUri || currentPath ? 'driver.crew.arrivalPhoto.retake' : 'driver.crew.arrivalPhoto.take')}
              </Text>
            </Pressable>
            <Pressable style={[styles.button, styles.primary]} onPress={confirm} disabled={uploading} accessibilityRole="button">
              {uploading ? (
                <LoadingIcon size={16} color="#241A09" />
              ) : (
                <Text style={styles.primaryLabel}>
                  {t(!localUri && currentPath ? 'driver.crew.arrivalPhoto.useCurrent' : 'driver.crew.arrivalPhoto.confirm')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
    sheet: { borderRadius: 24, padding: 20, gap: 12, backgroundColor: colors.background },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSecondary },
    preview: { height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)' },
    image: { width: '100%', height: '100%' },
    actions: { flexDirection: 'row', gap: 10 },
    button: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    secondary: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.06)' },
    primary: { backgroundColor: '#B38737' },
    secondaryLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    primaryLabel: { fontSize: 15, fontWeight: '700', color: '#241A09' },
  });
