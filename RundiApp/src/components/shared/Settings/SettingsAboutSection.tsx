import React from 'react';
import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { TFunction } from 'i18next';

interface SettingsAboutSectionProps {
  colors: any;
  t: TFunction;
  styles: any;
}

export function SettingsAboutSection({
  colors,
  t,
  styles,
}: SettingsAboutSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.sections.about')}</Text>

      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('settings.about.version')}</Text>
          <Text style={styles.rowDescription}>{t('settings.about.versionValue')}</Text>
        </View>
      </View>

      <View style={[styles.row, styles.rowLast]}>
        <View style={styles.rowIcon}>
          <Ionicons name="link-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('settings.about.domain')}</Text>
          <Text style={styles.rowDescription}>{t('settings.about.domainValue')}</Text>
        </View>
      </View>
    </View>
  );
}
