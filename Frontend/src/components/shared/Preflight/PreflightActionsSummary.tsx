import React from 'react';
import { View, Text } from 'react-native';
import type { PreflightAction } from '../../../stores/preflightStore';
import type { TFunction } from 'i18next';

interface PreflightActionsSummaryProps {
  actions: PreflightAction[];
  styles: any;
  t: TFunction;
}

export function PreflightActionsSummary({ actions, styles, t }: PreflightActionsSummaryProps) {
  if (actions.length === 0) return null;

  return (
    <View style={styles.actionsContainer}>
      <Text style={styles.actionsTitle}>{t('shared.preflight.actionsSummary.title')}</Text>
      {actions.slice(0, 3).map((action, idx) => (
        <View key={idx} style={styles.actionItem}>
          <Text style={styles.actionBullet}>•</Text>
          <Text style={styles.actionText}>{action.title}</Text>
        </View>
      ))}
      {actions.length > 3 && (
        <Text style={styles.actionsMore}>
          {t('shared.preflight.actionsSummary.more', { count: actions.length - 3 })}
        </Text>
      )}
    </View>
  );
}
