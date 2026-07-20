import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface RegisterConfirmActionsProps {
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
  t: TFunction;
  styles: any;
}

export function RegisterConfirmActions({
  loading,
  onBack,
  onConfirm,
  t,
  styles,
}: RegisterConfirmActionsProps) {
  return (
    <>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          disabled={loading}
        >
          <Text style={styles.backButtonText}>
            {t('authScreens.registerConfirm.buttons.back')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.confirmButton, loading && styles.buttonDisabled]}
          onPress={onConfirm}
          disabled={loading}
        >
          {loading ? (
            <LoadingIcon size={24} color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmButtonText}>
              {t('authScreens.registerConfirm.buttons.confirm')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: '100%' }]} />
      </View>
      <Text style={styles.progressText}>
        {t('authScreens.registerConfirm.progress', { current: 4, total: 4 })}
      </Text>
    </>
  );
}
