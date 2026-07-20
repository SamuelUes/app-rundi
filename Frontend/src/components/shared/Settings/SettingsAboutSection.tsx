import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';

interface SettingsAboutSectionProps {
  t: TFunction;
  styles: any;
}

export function SettingsAboutSection({
  t,
  styles,
}: SettingsAboutSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.sections.about')}</Text>

      <View style={styles.option}>
        <View style={styles.optionLeft}>
          <Text style={styles.optionTitle}>{t('settings.about.version')}</Text>
          <Text style={styles.optionDescription}>{t('settings.about.versionValue')}</Text>
        </View>
      </View>

      <View style={styles.option}>
        <View style={styles.optionLeft}>
          <Text style={styles.optionTitle}>{t('settings.about.domain')}</Text>
          <Text style={styles.optionDescription}>{t('settings.about.domainValue')}</Text>
        </View>
      </View>
    </View>
  );
}
