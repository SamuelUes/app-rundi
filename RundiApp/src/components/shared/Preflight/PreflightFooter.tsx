import React from 'react';
import { Pressable, View, Text } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TFunction } from 'i18next';

interface PreflightFooterProps {
  canRetry: boolean;
  role: string;
  userMode: string | undefined;
  onRetry: () => void;
  onSwitchMode: () => void;
  styles: any;
  colors: any;
  t: TFunction;
}

export function PreflightFooter({
  canRetry,
  role,
  userMode,
  onRetry,
  onSwitchMode,
  styles,
  colors,
  t,
}: PreflightFooterProps) {
  if (!canRetry && role !== 'driver') {
    return null;
  }

  return (
    <View style={styles.footer}>
      {canRetry && (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
          onPress={onRetry}
        >
          <MaterialIcons name="refresh" size={20} color="#241A09" style={styles.retryButtonIcon} />
          <Text style={styles.retryButtonText}>{t('shared.preflight.buttons.retry')}</Text>
        </Pressable>
      )}
      {role === 'driver' && (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.continueClientButton, pressed && styles.buttonPressed]}
          onPress={onSwitchMode}
        >
          <MaterialIcons
            name="person-outline"
            size={18}
            color={colors.textSecondary}
            style={styles.continueClientButtonIcon}
          />
          <Text style={styles.continueClientButtonText}>
            {userMode === 'client'
              ? t('shared.preflight.buttons.useAsClient')
              : t('shared.preflight.buttons.continueAsClient')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
