import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface SettingsPrivacySectionProps {
  colors: any;
  onOpenTerms: () => void;
  t: TFunction;
  styles: any;
}

export function SettingsPrivacySection({
  colors,
  onOpenTerms,
  t,
  styles,
}: SettingsPrivacySectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.sections.privacy')}</Text>

      <TouchableOpacity style={styles.row} activeOpacity={0.7}>
        <View style={styles.rowIcon}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('settings.privacy.policy')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.primary} />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={onOpenTerms} activeOpacity={0.7}>
        <View style={styles.rowIcon}>
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('settings.privacy.terms')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}
