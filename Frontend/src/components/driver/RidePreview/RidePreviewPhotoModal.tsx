import React from 'react';
import { View, Text, TouchableOpacity, Modal, Image } from 'react-native';
import type { TFunction } from 'i18next';

interface RidePreviewPhotoModalProps {
  visible: boolean;
  photoUrl: string | null;
  isDark: boolean;
  colors: any;
  onClose: () => void;
  styles: any;
  t: TFunction;
}

export function RidePreviewPhotoModal({
  visible,
  photoUrl,
  isDark,
  colors,
  onClose,
  styles,
  t,
}: RidePreviewPhotoModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: isDark ? '#1F1F1F' : '#FFFFFF' }]}>
          <Image
            source={{ uri: photoUrl || undefined }}
            style={styles.modalImage}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={[styles.closeModalButton, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={styles.closeModalText}>{t('driver.ridePreview.modal.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
