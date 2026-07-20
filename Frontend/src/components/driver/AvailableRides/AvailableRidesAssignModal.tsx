import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import type { TFunction } from 'i18next';

interface AvailableRidesAssignModalProps {
  visible: boolean;
  assignRideIdInput: string;
  normalizedAssignRideId: string | null;
  assigningProgrammedRide: boolean;
  isDark: boolean;
  colors: any;
  onInputChange: (text: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  styles: any;
  t: TFunction;
}

export function AvailableRidesAssignModal({
  visible,
  assignRideIdInput,
  normalizedAssignRideId,
  assigningProgrammedRide,
  isDark,
  colors,
  onInputChange,
  onCancel,
  onConfirm,
  styles,
  t,
}: AvailableRidesAssignModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!assigningProgrammedRide) {
          onCancel();
        }
      }}
    >
      <View style={styles.assignOverlay}>
        <View
          style={[
            styles.assignModalCard,
            {
              backgroundColor: isDark ? '#1F1F1F' : '#FFFFFF',
              borderColor: isDark ? '#353535' : '#E9E0CF',
            },
          ]}
        >
          <View style={[styles.assignModalTopAccent, { backgroundColor: colors.primary }]} />
          <Text style={[styles.assignModalTitle, { color: colors.text }]}>
            {t('driver.available.assignModal.title')}
          </Text>
          <Text style={[styles.assignModalSubtitle, { color: colors.text + '99' }]}>
            {t('driver.available.assignModal.subtitle')}
          </Text>
          <View
            style={[
              styles.assignInputWrap,
              {
                borderColor: colors.border,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              },
            ]}
          >
            <Text style={[styles.assignInputLabel, { color: colors.text + 'AA' }]}>Ride ID</Text>
            <TextInput
              value={assignRideIdInput}
              onChangeText={onInputChange}
              placeholder={t('driver.available.assignModal.placeholder')}
              placeholderTextColor={colors.text + '66'}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!assigningProgrammedRide}
              style={[
                styles.assignInput,
                {
                  color: colors.text,
                },
              ]}
            />
          </View>

          <View style={styles.assignActionsRow}>
            <TouchableOpacity
              style={[styles.assignActionButton, styles.assignCancelButton, { borderColor: colors.border }]}
              disabled={assigningProgrammedRide}
              onPress={onCancel}
            >
              <Text style={[styles.assignActionText, { color: colors.text }]}>{t('driver.available.assignModal.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.assignActionButton, { backgroundColor: colors.primary }]}
              disabled={assigningProgrammedRide || !normalizedAssignRideId}
              onPress={onConfirm}
            >
              <Text style={styles.assignActionTextPrimary}>
                {assigningProgrammedRide
                  ? t('driver.available.assignModal.assigning')
                  : t('driver.available.assignModal.confirm')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
