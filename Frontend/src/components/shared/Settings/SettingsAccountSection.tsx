import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface SettingsAccountSectionProps {
  userRole: string | undefined;
  colors: any;
  onNavigateToAccount: () => void;
  onUpgradeToDriver: () => void;
  onDeleteAccount: () => void;
  t: TFunction;
  styles: any;
}

export function SettingsAccountSection({
  userRole,
  colors,
  onNavigateToAccount,
  onUpgradeToDriver,
  onDeleteAccount,
  t,
  styles,
}: SettingsAccountSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.sections.account')}</Text>

      <TouchableOpacity style={styles.option} onPress={onNavigateToAccount}>
        <View style={styles.optionLeft}>
          <Text style={styles.optionTitle}>{t('settings.account.title')}</Text>
          <Text style={styles.optionDescription}>{t('settings.account.description')}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>

      {userRole === 'client' && (
        <TouchableOpacity style={styles.option} onPress={onUpgradeToDriver}>
          <View style={styles.optionLeft}>
            <Text style={styles.optionTitle}>{t('settings.account.upgradeTitle')}</Text>
            <Text style={styles.optionDescription}>{t('settings.account.upgradeDescription')}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.option, styles.optionLast]} onPress={onDeleteAccount}>
        <View style={styles.optionLeft}>
          <Text style={[styles.optionTitle, { color: colors.error }]}>{t('settings.account.deleteTitle')}</Text>
          <Text style={styles.optionDescription}>{t('settings.account.deleteDescription')}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}
