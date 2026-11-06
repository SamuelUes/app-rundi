import React from 'react';
import { View, Text, TouchableOpacity, Switch, Platform } from 'react-native';
import IonIcons from '@expo/vector-icons/Ionicons';
import type { TFunction } from 'i18next';

interface DriverProfileModeToggleProps {
  userMode: string;
  colors: any;
  onModeButtonPress: () => void;
  t: TFunction;
  styles: any;
}

export function DriverProfileModeToggle({
  userMode,
  colors,
  onModeButtonPress,
  t,
  styles,
}: DriverProfileModeToggleProps) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{t('driver.profile.mode.title')}</Text>
      <View style={styles.profileModeCard}>
        <View style={styles.profileModeHeader}>
          <View style={styles.preferenceIconWrapper}>
            <IonIcons name="car-sport-sharp" size={24} color={colors.primary} />
          </View>
          <View style={styles.preferenceInfo}>
            <Text style={styles.preferenceSubtitle}>
              {t('driver.profile.mode.description')}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.modeToggleButton,
            styles.profileModeAction,
            userMode === 'driver' ? styles.modeToggleButtonActive : null,
          ]}
          onPress={onModeButtonPress}
        >
          <Text
            style={[
              styles.modeToggleButtonText,
              userMode === 'driver' ? styles.modeToggleButtonTextActive : null,
            ]}
          >
            {userMode === 'driver'
              ? t('driver.profile.mode.switchToClient')
              : t('driver.profile.mode.switchToDriver')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface DriverProfileOverlayProps {
  overlayToggleEnabled: boolean;
  overlayPermissionGranted: boolean;
  overlayCheckingPermission: boolean;
  colors: any;
  onOverlayToggle: (value: boolean) => void;
  t: TFunction;
  styles: any;
}

export function DriverProfileOverlay({
  overlayToggleEnabled,
  overlayPermissionGranted,
  overlayCheckingPermission,
  colors,
  onOverlayToggle,
  t,
  styles,
}: DriverProfileOverlayProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('driver.profile.overlay.title')}</Text>
      <View style={styles.preferenceCard}>
        <View style={styles.preferenceHeader}>
          <View style={styles.preferenceIconWrapper}>
            <IonIcons name="notifications" size={24} color={colors.primary} />
          </View>
          <View style={styles.preferenceInfo}>
            <Text style={styles.preferenceTitle}>
              {t(
                Platform.OS === 'ios'
                  ? 'driver.profile.overlay.subtitleIos'
                  : 'driver.profile.overlay.subtitle'
              )}
            </Text>
            <Text style={styles.preferenceSubtitle}>
              {t(
                Platform.OS === 'ios'
                  ? 'driver.profile.overlay.descriptionIos'
                  : 'driver.profile.overlay.description'
              )}
            </Text>
            {Platform.OS === 'android' ? (
              <Text style={styles.preferenceHint}>
                {overlayPermissionGranted
                  ? t('driver.profile.overlay.hintAndroidGranted')
                  : t('driver.profile.overlay.hintAndroidMissing')}
              </Text>
            ) : (
              <Text style={styles.preferenceHint}>
                {overlayPermissionGranted
                  ? t('driver.profile.overlay.hintIosGranted')
                  : t('driver.profile.overlay.hintIosMissing')}
              </Text>
            )}
          </View>
          <Switch
            value={overlayToggleEnabled}
            onValueChange={onOverlayToggle}
            disabled={(Platform.OS !== 'android' && Platform.OS !== 'ios') || overlayCheckingPermission}
            thumbColor={overlayToggleEnabled ? '#ffffff' : '#f4f4f4'}
            trackColor={{ false: '#bdbdbd', true: colors.primary }}
          />
        </View>
      </View>
    </View>
  );
}

interface DriverProfileVoiceAssistantProps {
  voiceAssistantSwitch: boolean;
  colors: any;
  onVoiceAssistantToggle: (value: boolean) => void;
  t: TFunction;
  styles: any;
}

export function DriverProfileVoiceAssistant({
  voiceAssistantSwitch,
  colors,
  onVoiceAssistantToggle,
  t,
  styles,
}: DriverProfileVoiceAssistantProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('driver.profile.voice.title')}</Text>

      <View style={styles.voiceAssistantCard}>
        <View style={styles.voiceAssistantHeader}>
          <View style={styles.voiceAssistantTitleBlock}>
            <Text style={styles.voiceAssistantTitle}>{t('driver.profile.voice.cardTitle')}</Text>
            <Text style={styles.voiceAssistantSubtitle}>
              {t('driver.profile.voice.subtitle')}
            </Text>
          </View>
          <Switch
            value={voiceAssistantSwitch}
            onValueChange={onVoiceAssistantToggle}
            thumbColor={voiceAssistantSwitch ? '#ffffff' : '#f4f4f4'}
            trackColor={{ false: '#bdbdbd', true: colors.primary }}
          />
        </View>

        <View style={styles.voiceAssistantBenefits}>
          <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.rides')}</Text>
          <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.arrivals')}</Text>
          <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.payments')}</Text>
        </View>

        <Text style={styles.voiceAssistantFooter}>
          {t('driver.profile.voice.footer')}
        </Text>
      </View>
    </View>
  );
}
