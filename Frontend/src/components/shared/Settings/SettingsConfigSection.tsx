import React from 'react';
import { View, Text, Switch, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface SettingsConfigSectionProps {
  theme: string;
  notificationsEnabled: boolean;
  mapTrafficEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  colors: any;
  onThemeChange: (value: 'light' | 'dark' | 'auto') => void;
  onToggleNotifications: (value: boolean) => void;
  onToggleTraffic: (value: boolean) => void;
  onToggleSoundVibration: (value: boolean) => void;
  t: TFunction;
  styles: any;
}

export function SettingsConfigSection({
  theme,
  notificationsEnabled,
  mapTrafficEnabled,
  soundEnabled,
  vibrationEnabled,
  colors,
  onThemeChange,
  onToggleNotifications,
  onToggleTraffic,
  onToggleSoundVibration,
  t,
  styles,
}: SettingsConfigSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.profile.config.title')}</Text>

      <View style={styles.optionCard}>
        <Text style={styles.optionText}>{t('shared.profile.config.theme')}</Text>
        <View style={styles.themeChipsRow}>
          <TouchableOpacity
            style={[styles.themeChip, theme === 'light' && styles.themeChipActive]}
            onPress={() => onThemeChange('light')}
          >
            <Text style={[styles.themeChipText, theme === 'light' && styles.themeChipTextActive]}>
              {t('shared.profile.config.themeOptions.light')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.themeChip, theme === 'dark' && styles.themeChipActive]}
            onPress={() => onThemeChange('dark')}
          >
            <Text style={[styles.themeChipText, theme === 'dark' && styles.themeChipTextActive]}>
              {t('shared.profile.config.themeOptions.dark')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.themeChip, theme === 'auto' && styles.themeChipActive]}
            onPress={() => onThemeChange('auto')}
          >
            <Text style={[styles.themeChipText, theme === 'auto' && styles.themeChipTextActive]}>
              {t('shared.profile.config.themeOptions.auto')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.optionCard}>
        <Text style={styles.optionText}>{t('shared.profile.config.notifications')}</Text>
        <Switch
          value={notificationsEnabled}
          onValueChange={onToggleNotifications}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>

      <View style={styles.optionCard}>
        <Text style={styles.optionText}>{t('shared.profile.config.traffic')}</Text>
        <Switch
          value={mapTrafficEnabled}
          onValueChange={onToggleTraffic}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>

      <View style={styles.optionCard}>
        <Text style={styles.optionText}>{t('shared.profile.config.sounds')}</Text>
        <Switch
          value={soundEnabled && vibrationEnabled}
          onValueChange={onToggleSoundVibration}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
          disabled={!notificationsEnabled}
        />
      </View>
    </View>
  );
}
