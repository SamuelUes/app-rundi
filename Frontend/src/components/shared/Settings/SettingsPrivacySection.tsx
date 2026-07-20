import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface SettingsPrivacySectionProps {
  onOpenTerms: () => void;
  t: TFunction;
  styles: any;
}

export function SettingsPrivacySection({
  onOpenTerms,
  t,
  styles,
}: SettingsPrivacySectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.sections.privacy')}</Text>

      <TouchableOpacity style={styles.option}>
        <Text style={styles.optionTitle}>{t('settings.privacy.policy')}</Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.option, styles.optionLast]} onPress={onOpenTerms}>
        <Text style={styles.optionTitle}>{t('settings.privacy.terms')}</Text>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}
