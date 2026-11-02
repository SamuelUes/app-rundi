import React from 'react';
import { View } from 'react-native';
import { AnimatedButton } from '../../ui/AnimatedButton';
import type { TFunction } from 'i18next';

interface RegisterConfirmActionsProps {
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
  t: TFunction;
  styles: any;
  accentColor: string;
}

export function RegisterConfirmActions({
  loading,
  onBack,
  onConfirm,
  t,
  styles,
  accentColor,
}: RegisterConfirmActionsProps) {
  return (
    <View style={styles.actions}>
      <AnimatedButton
        title={t('authScreens.registerConfirm.buttons.confirm')}
        onPress={onConfirm}
        size="large"
        iconName="check-circle"
        loading={loading}
        style={styles.actionButton}
      />
      <AnimatedButton
        title={t('authScreens.registerConfirm.buttons.back')}
        onPress={onBack}
        size="large"
        variant="outline"
        iconName="arrow-back"
        color={accentColor}
        disabled={loading}
        style={styles.actionButton}
      />
    </View>
  );
}
