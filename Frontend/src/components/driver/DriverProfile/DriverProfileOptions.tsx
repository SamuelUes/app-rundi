import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import type { TFunction } from 'i18next';

interface DriverProfileOptionsProps {
  onEarnings: () => void;
  onRideHistory: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onSupportComplaints: () => void;
  t: TFunction;
  styles: any;
}

export function DriverProfileOptions({
  onEarnings,
  onRideHistory,
  onSettings,
  onHelp,
  onSupportComplaints,
  t,
  styles,
}: DriverProfileOptionsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.optionCard} onPress={onEarnings}>
        <MaterialIcons name="insights" size={22} color={colors.primary} style={styles.optionIcon} />
        <Text style={styles.optionText}>{t('driver.profile.options.viewEarnings')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onRideHistory}>
        <MaterialIcons name="receipt-long" size={22} color={colors.primary} style={styles.optionIcon} />
        <Text style={styles.optionText}>{t('driver.profile.options.rideHistory')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onSettings}>
        <MaterialIcons name="settings" size={22} color={colors.primary} style={styles.optionIcon} />
        <Text style={styles.optionText}>{t('driver.profile.options.settings')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onHelp}>
        <MaterialIcons name="help-outline" size={22} color={colors.primary} style={styles.optionIcon} />
        <Text style={styles.optionText}>{t('driver.profile.options.help')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onSupportComplaints}>
        <MaterialIcons name="support-agent" size={22} color={colors.primary} style={styles.optionIcon} />
        <Text style={styles.optionText}>{t('shared.profile.support.title')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}
