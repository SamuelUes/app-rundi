import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import StorageImage from '../../shared/StorageImage';
import type { TFunction } from 'i18next';

interface AvailableRidesPhotoModalProps {
  visible: boolean;
  photoUrl: string | null;
  isDark: boolean;
  colors: any;
  onClose: () => void;
  styles: any;
  t: TFunction;
}

export function AvailableRidesPhotoModal({
  visible,
  photoUrl,
  isDark,
  colors,
  onClose,
  styles,
  t,
}: AvailableRidesPhotoModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: isDark ? '#1F1F1F' : '#FFFFFF' }]}>
          <StorageImage
            uri={photoUrl}
            style={styles.modalImage}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={[styles.closeModalButton, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={styles.closeModalText}>{t('driver.available.modal.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
