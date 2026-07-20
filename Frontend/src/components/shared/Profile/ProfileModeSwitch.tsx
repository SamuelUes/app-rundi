import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface ProfileModeSwitchProps {
  modeTitle: string;
  modeDescription: string;
  modeButtonLabel: string;
  switchingToDriver: boolean;
  isDriverCapable: boolean;
  onPress: () => void;
  styles: any;
}

export function ProfileModeSwitch({
  modeTitle,
  modeDescription,
  modeButtonLabel,
  switchingToDriver,
  isDriverCapable,
  onPress,
  styles,
}: ProfileModeSwitchProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{modeTitle}</Text>
      <View style={styles.optionCard}>
        <View style={styles.modeUseTextContainer}>
          <Text style={styles.optionText}>{modeDescription}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.modeUseButton,
            switchingToDriver ? styles.modeUseButtonDisabled : null,
          ]}
          onPress={onPress}
          disabled={switchingToDriver}
        >
          <Text style={styles.modeUseButtonText}>{modeButtonLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
