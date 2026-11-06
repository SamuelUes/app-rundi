import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import IonIcons from '@expo/vector-icons/Ionicons';

interface ProfileModeSwitchProps {
  modeTitle: string;
  modeDescription: string;
  modeButtonLabel: string;
  switchingToDriver: boolean;
  isDriverCapable: boolean;
  colors: any;
  onPress: () => void;
  styles: any;
}

export function ProfileModeSwitch({
  modeTitle,
  modeDescription,
  modeButtonLabel,
  switchingToDriver,
  isDriverCapable,
  colors,
  onPress,
  styles,
}: ProfileModeSwitchProps) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{modeTitle}</Text>
      <View style={styles.profileModeCard}>
        <View style={styles.profileModeHeader}>
          <View style={styles.preferenceIconWrapper}>
            <IonIcons
              name={isDriverCapable ? 'swap-horizontal-outline' : 'car-sport-sharp'}
              size={24}
              color={colors.primary}
            />
          </View>
          <View style={styles.preferenceInfo}>
            <Text style={styles.preferenceSubtitle}>{modeDescription}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.modeToggleButton, switchingToDriver && styles.modeToggleButtonDisabled]}
          onPress={onPress}
          disabled={switchingToDriver}
          accessibilityRole="button"
        >
          <Text style={styles.modeToggleButtonText}>{modeButtonLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
