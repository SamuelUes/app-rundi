import React from 'react';
import { Pressable, View, Text } from 'react-native';
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
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
          onPress={onRetry}
        >
          <Text style={styles.retryButtonText}>{t('shared.preflight.buttons.retry')}</Text>
        </Pressable>
      )}
      {role === 'driver' && (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          onPress={onSwitchMode}
        >
          <Text style={styles.secondaryButtonText}>
            {userMode === 'client'
              ? t('shared.preflight.buttons.continueAsClient')
              : t('shared.preflight.buttons.useAsClient')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
