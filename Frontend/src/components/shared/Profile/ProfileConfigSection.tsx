import React from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TFunction } from 'i18next';

interface ProfileConfigSectionProps {
  theme: 'light' | 'dark' | 'auto';
  notificationsEnabled: boolean;
  mapTrafficEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  colors: any;
  onThemeChange: (value: 'light' | 'dark' | 'auto') => void;
  onToggleNotifications: (value: boolean) => void;
  onToggleTraffic: (value: boolean) => void;
  onToggleSounds: (value: boolean) => void;
  onNavigateSettings: () => void;
  onNavigateRideHistory: () => void;
  onNavigatePayments: () => void;
  onNavigateHelp: () => void;
  onNavigateSupport: () => void;
  styles: any;
  t: TFunction;
}

export function ProfileConfigSection({
  theme,
  notificationsEnabled,
  mapTrafficEnabled,
  soundEnabled,
  vibrationEnabled,
  colors,
  onThemeChange,
  onToggleNotifications,
  onToggleTraffic,
  onToggleSounds,
  onNavigateSettings,
  onNavigateRideHistory,
  onNavigatePayments,
  onNavigateHelp,
  onNavigateSupport,
  styles,
  t,
}: ProfileConfigSectionProps) {
  const switchColors = {
    thumbColor: '#ffffff',
    trackColor: { false: '#bdbdbd', true: colors.primary },
  };

  return (
    <>
      {/* Preferencias */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('shared.profile.config.title')}</Text>
        <View style={styles.preferenceCard}>
          {/* Tema */}
          <View style={styles.prefThemeBlock}>
            <View style={styles.prefRowHeader}>
              <View style={styles.prefRowIcon}>
                <MaterialIcons name="brightness-6" size={20} color={colors.primary} />
              </View>
              <Text style={styles.prefRowTitle}>{t('shared.profile.config.theme')}</Text>
            </View>
            <View style={styles.themeChipsRow}>
              <TouchableOpacity
                style={[styles.themeChip, theme === 'light' && styles.themeChipActive]}
                onPress={() => onThemeChange('light')}
                accessibilityRole="button"
                accessibilityState={{ selected: theme === 'light' }}
              >
                <Text style={[styles.themeChipText, theme === 'light' && styles.themeChipTextActive]}>
                  {t('shared.profile.config.themeOptions.light')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.themeChip, theme === 'dark' && styles.themeChipActive]}
                onPress={() => onThemeChange('dark')}
                accessibilityRole="button"
                accessibilityState={{ selected: theme === 'dark' }}
              >
                <Text style={[styles.themeChipText, theme === 'dark' && styles.themeChipTextActive]}>
                  {t('shared.profile.config.themeOptions.dark')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.themeChip, theme === 'auto' && styles.themeChipActive]}
                onPress={() => onThemeChange('auto')}
                accessibilityRole="button"
                accessibilityState={{ selected: theme === 'auto' }}
              >
                <Text style={[styles.themeChipText, theme === 'auto' && styles.themeChipTextActive]}>
                  {t('shared.profile.config.themeOptions.auto')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notificaciones Push */}
          <View style={styles.prefRow}>
            <View style={styles.prefRowIcon}>
              <MaterialIcons name="notifications-none" size={20} color={colors.primary} />
            </View>
            <Text style={styles.prefRowTitle}>{t('shared.profile.config.notifications')}</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={onToggleNotifications}
              {...switchColors}
            />
          </View>

          {/* Tráfico en el mapa */}
          <View style={styles.prefRow}>
            <View style={styles.prefRowIcon}>
              <MaterialIcons name="map" size={20} color={colors.primary} />
            </View>
            <Text style={styles.prefRowTitle}>{t('shared.profile.config.traffic')}</Text>
            <Switch
              value={mapTrafficEnabled}
              onValueChange={onToggleTraffic}
              {...switchColors}
            />
          </View>

          {/* Sonidos de la app */}
          <View style={[styles.prefRow, styles.prefRowLast, !notificationsEnabled && styles.prefRowDisabled]}>
            <View style={styles.prefRowIcon}>
              <MaterialIcons name="volume-up" size={20} color={colors.primary} />
            </View>
            <Text style={styles.prefRowTitle}>{t('shared.profile.config.sounds')}</Text>
            <Switch
              value={soundEnabled && vibrationEnabled}
              onValueChange={onToggleSounds}
              disabled={!notificationsEnabled}
              {...switchColors}
            />
          </View>
        </View>
      </View>

      {/* Navegación — patrón DriverProfileOptions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.optionCard} onPress={onNavigatePayments} accessibilityRole="button">
          <MaterialIcons name="payments" size={22} color={colors.primary} style={{ marginRight: 14 }} />
          <Text style={styles.optionText}>{t('shared.profile.config.payments')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard} onPress={onNavigateRideHistory} accessibilityRole="button">
          <MaterialIcons name="receipt-long" size={22} color={colors.primary} style={{ marginRight: 14 }} />
          <Text style={styles.optionText}>{t('shared.profile.config.rideHistory')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard} onPress={onNavigateSettings} accessibilityRole="button">
          <MaterialIcons name="settings" size={22} color={colors.primary} style={{ marginRight: 14 }} />
          <Text style={styles.optionText}>{t('shared.profile.config.advanced')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.optionCard} onPress={onNavigateHelp} accessibilityRole="button">
          <MaterialIcons name="help-outline" size={22} color={colors.primary} style={{ marginRight: 14 }} />
          <Text style={styles.optionText}>{t('shared.profile.config.help')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, styles.optionCardLast]}
          onPress={onNavigateSupport}
          accessibilityRole="button"
        >
          <MaterialIcons name="support-agent" size={22} color={colors.primary} style={{ marginRight: 14 }} />
          <Text style={styles.optionText}>{t('shared.profile.support.title')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
