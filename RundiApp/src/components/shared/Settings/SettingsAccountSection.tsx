import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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

      <TouchableOpacity style={styles.row} onPress={onNavigateToAccount} activeOpacity={0.7}>
        <View style={styles.rowIcon}>
          <Ionicons name="person-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('settings.account.title')}</Text>
          <Text style={styles.rowDescription}>{t('settings.account.description')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.primary} />
      </TouchableOpacity>

      {userRole === 'client' && (
        <TouchableOpacity style={styles.row} onPress={onUpgradeToDriver} activeOpacity={0.7}>
          <View style={styles.rowIcon}>
            <Ionicons name="car-sport-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{t('settings.account.upgradeTitle')}</Text>
            <Text style={styles.rowDescription}>{t('settings.account.upgradeDescription')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.primary} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={onDeleteAccount} activeOpacity={0.7}>
        <View style={[styles.rowIcon, styles.rowIconDanger]}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, styles.rowTitleDanger]}>{t('settings.account.deleteTitle')}</Text>
          <Text style={styles.rowDescription}>{t('settings.account.deleteDescription')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}
