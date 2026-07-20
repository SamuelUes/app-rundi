import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface PreflightFooterProps {
  canRetry: boolean;
  role: string;
  userMode: string | undefined;
  onRetry: () => void;
  onSwitchMode: () => void;
  styles: any;
  t: TFunction;
}

export function PreflightFooter({
  canRetry,
  role,
  userMode,
  onRetry,
  onSwitchMode,
  styles,
  t,
}: PreflightFooterProps) {
  return (
    <View style={styles.footer}>
      {canRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>{t('shared.preflight.buttons.retry')}</Text>
        </TouchableOpacity>
      )}
      {role === 'driver' && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onSwitchMode}
        >
          <Text style={styles.secondaryButtonText}>
            {userMode === 'client'
              ? t('shared.preflight.buttons.continueAsClient')
              : t('shared.preflight.buttons.useAsClient')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
