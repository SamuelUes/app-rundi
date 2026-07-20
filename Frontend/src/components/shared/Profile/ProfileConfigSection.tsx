import React from 'react';
import { View, Text, TouchableOpacity, Image, Switch } from 'react-native';
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
  onNavigateHelp,
  onNavigateSupport,
  styles,
  t,
}: ProfileConfigSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.profile.config.title')}</Text>

      {/* Tema rápido */}
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

      {/* Notificaciones Push */}
      <View style={styles.optionCard}>
        <Text style={styles.optionText}>{t('shared.profile.config.notifications')}</Text>
        <Switch
          value={notificationsEnabled}
          onValueChange={onToggleNotifications}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>

      {/* Tráfico en el mapa */}
      <View style={styles.optionCard}>
        <Text style={styles.optionText}>{t('shared.profile.config.traffic')}</Text>
        <Switch
          value={mapTrafficEnabled}
          onValueChange={onToggleTraffic}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>

      {/* Sonidos de la app */}
      <View style={styles.optionCard}>
        <Text style={styles.optionText}>{t('shared.profile.config.sounds')}</Text>
        <Switch
          value={soundEnabled && vibrationEnabled}
          onValueChange={onToggleSounds}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
          disabled={!notificationsEnabled}
        />
      </View>

      {/* Navegación a pantallas relacionadas */}
      <TouchableOpacity style={styles.optionCard} onPress={onNavigateSettings}>
        <Image
          source={require('../../../assets/icons/settings-icon/settingsicon.png')}
          style={styles.optionIconImage}
        />
        <Text style={styles.optionText}>{t('shared.profile.config.advanced')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onNavigateRideHistory}>
        <Image
          source={require('../../../assets/icons/historial-icon/historialicon2.png')}
          style={styles.optionIconImage}
        />
        <Text style={styles.optionText}>{t('shared.profile.config.rideHistory')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onNavigateHelp}>
        <Image
          source={require('../../../assets/icons/help-icon/helpicon.png')}
          style={styles.optionIconImage}
        />
        <Text style={styles.optionText}>{t('shared.profile.config.help')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onNavigateSupport}>
        <Image
          source={require('../../../assets/icons/report-icon/reporticon.png')}
          style={styles.optionIconImage}
        />
        <Text style={styles.optionText}>{t('shared.profile.support.title')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}
