import React from 'react';
import { Text, Pressable, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import type { TFunction } from 'i18next';

interface DriverHomeNavChipsProps {
  userRole: string | undefined;
  onNavigate: (route: any) => void;
  onLogout: () => void;
  styles: any;
  t: TFunction;
}

interface NavChipConfig {
  route: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  labelKey: string;
  driverOnly?: boolean;
}

const NAV_CHIPS: NavChipConfig[] = [
  { route: 'Earnings', icon: 'insights', labelKey: 'driver.home.menu.earnings' },
  {
    route: 'RechargeFunds',
    icon: 'account-balance-wallet',
    labelKey: 'driver.home.menu.commissions',
    driverOnly: true,
  },
  { route: 'RideHistory', icon: 'receipt-long', labelKey: 'driver.home.menu.history' },
  { route: 'PaymentMethods', icon: 'credit-card', labelKey: 'driver.home.menu.paymentMethods' },
  { route: 'Settings', icon: 'settings', labelKey: 'driver.home.menu.settings' },
  { route: 'Help', icon: 'help-outline', labelKey: 'driver.home.menu.help' },
];

export function DriverHomeNavChips({
  userRole,
  onNavigate,
  onLogout,
  styles,
  t,
}: DriverHomeNavChipsProps) {
  const { isDark } = useTheme();
  const isDriver = userRole === 'driver' || userRole === 'designated_driver';
  const chipInk = isDark ? '#F5F1EA' : '#1C1917';
  const dangerColor = isDark ? '#EF8A80' : '#C62828';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.navChipsRow}
    >
      {NAV_CHIPS.filter((item) => !item.driverOnly || isDriver).map((item) => (
        <Pressable
          key={item.route}
          style={({ pressed }) => [
            styles.navChip,
            pressed && styles.navChipPressed,
          ]}
          onPress={() => onNavigate(item.route)}
          accessibilityRole="button"
          accessibilityLabel={t(item.labelKey)}
        >
          <MaterialIcons name={item.icon} size={16} color="#B38737" />
          <Text style={[styles.navChipLabel, { color: chipInk }]}>
            {t(item.labelKey)}
          </Text>
        </Pressable>
      ))}

      <Pressable
        style={({ pressed }) => [
          styles.navChip,
          styles.navChipDanger,
          pressed && styles.navChipPressed,
        ]}
        onPress={onLogout}
        accessibilityRole="button"
        accessibilityLabel={t('driver.home.menu.logout')}
      >
        <MaterialIcons name="logout" size={16} color={dangerColor} />
        <Text style={[styles.navChipLabel, { color: dangerColor }]}>
          {t('driver.home.menu.logout')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
