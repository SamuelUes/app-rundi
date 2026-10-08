import React from 'react';
import { View, Text, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

type ThemeValue = 'light' | 'dark' | 'auto';

interface SettingsConfigSectionProps {
  theme: string;
  notificationsEnabled: boolean;
  mapTrafficEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  colors: any;
  onThemeChange: (value: ThemeValue) => void;
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
  const themeOptions: { value: ThemeValue; label: string }[] = [
    { value: 'light', label: t('shared.profile.config.themeOptions.light') },
    { value: 'dark', label: t('shared.profile.config.themeOptions.dark') },
    { value: 'auto', label: t('shared.profile.config.themeOptions.auto') },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.profile.config.title')}</Text>

      <View style={styles.themeRow}>
        <View style={styles.themeRowHeader}>
          <View style={styles.rowIcon}>
            <Ionicons name="contrast-outline" size={18} color={colors.primary} />
          </View>
          <Text style={styles.rowTitle}>{t('shared.profile.config.theme')}</Text>
        </View>
        <View style={styles.segmentedTrack}>
          {themeOptions.map((option) => {
            const active = theme === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => onThemeChange(option.value)}
                activeOpacity={0.75}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="notifications-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('shared.profile.config.notifications')}</Text>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={onToggleNotifications}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
          ios_backgroundColor={colors.border}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="map-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('shared.profile.config.traffic')}</Text>
        </View>
        <Switch
          value={mapTrafficEnabled}
          onValueChange={onToggleTraffic}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
          ios_backgroundColor={colors.border}
        />
      </View>

      <View style={[styles.row, styles.rowLast, !notificationsEnabled && styles.rowDisabled]}>
        <View style={styles.rowIcon}>
          <Ionicons name="volume-high-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('shared.profile.config.sounds')}</Text>
        </View>
        <Switch
          value={soundEnabled && vibrationEnabled}
          onValueChange={onToggleSoundVibration}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
          ios_backgroundColor={colors.border}
          disabled={!notificationsEnabled}
        />
      </View>
    </View>
  );
}
