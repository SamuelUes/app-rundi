import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
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
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.optionCard} onPress={onEarnings}>
        <Image
          source={require('../../../assets/icons/profit-icon/profiticon.png')}
          style={styles.optionIconImage}
        />
        <Text style={styles.optionText}>{t('driver.profile.options.viewEarnings')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onRideHistory}>
        <Image
          source={require('../../../assets/icons/historial-icon/historialicon2.png')}
          style={styles.optionIconImage}
        />
        <Text style={styles.optionText}>{t('driver.profile.options.rideHistory')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onSettings}>
        <Image
          source={require('../../../assets/icons/settings-icon/settingsicon.png')}
          style={styles.optionIconImage}
        />
        <Text style={styles.optionText}>{t('driver.profile.options.settings')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onHelp}>
        <Image
          source={require('../../../assets/icons/help-icon/helpicon.png')}
          style={styles.optionIconImage}
        />
        <Text style={styles.optionText}>{t('driver.profile.options.help')}</Text>
        <Text style={styles.optionArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={onSupportComplaints}>
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
