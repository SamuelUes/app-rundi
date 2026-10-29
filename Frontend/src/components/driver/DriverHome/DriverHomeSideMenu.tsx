import React from 'react';
import { View, Text, Pressable, Animated, Image } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TFunction } from 'i18next';

interface DriverHomeSideMenuProps {
  visible: boolean;
  menuOpacity: Animated.Value;
  menuTranslate: Animated.Value;
  panelWidth: number;
  userName: string | undefined;
  userPhotoUri?: string | null;
  userRole: string | undefined;
  colors: any;
  onClose: () => void;
  onNavigate: (route: any) => void;
  onLogout: () => void;
  styles: any;
  t: TFunction;
}

type MenuRoute = 'Earnings' | 'RechargeFunds' | 'RideHistory' | 'PaymentMethods' | 'Settings' | 'Help';

interface MenuItemConfig {
  route: MenuRoute;
  icon: keyof typeof MaterialIcons.glyphMap;
  labelKey: string;
  driverOnly?: boolean;
}

const MENU_ITEMS: MenuItemConfig[] = [
  { route: 'Earnings', icon: 'insights', labelKey: 'driver.home.menu.earnings' },
  {
    route: 'RechargeFunds',
    icon: 'account-balance-wallet',
    labelKey: 'driver.home.menu.commissions',
    driverOnly: true,
  },
  { route: 'PaymentMethods', icon: 'credit-card', labelKey: 'driver.home.menu.paymentMethods' },
  { route: 'RideHistory', icon: 'receipt-long', labelKey: 'driver.home.menu.history' },
  { route: 'Settings', icon: 'settings', labelKey: 'driver.home.menu.settings' },
  { route: 'Help', icon: 'help-outline', labelKey: 'driver.home.menu.help' },
];

export function DriverHomeSideMenu({
  visible,
  menuOpacity,
  menuTranslate,
  panelWidth,
  userName,
  userPhotoUri,
  userRole,
  colors,
  onClose,
  onNavigate,
  onLogout,
  styles,
  t,
}: DriverHomeSideMenuProps) {
  if (!visible) return null;

  const isDriver = userRole === 'driver' || userRole === 'designated_driver';
  const initial = (userName ?? '').trim().charAt(0).toUpperCase() || 'C';
  const displayName = userName || t('driver.home.header.profileFallback');

  return (
    <Animated.View style={[styles.menuOverlay, { opacity: menuOpacity }]}>
      <Pressable style={styles.menuBackdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.menuContainer,
          {
            transform: [{ translateX: menuTranslate }],
            width: panelWidth,
          },
        ]}
      >
        <View style={styles.menuHeaderRow}>
          <View style={styles.menuAvatar}>
            {userPhotoUri ? (
              <Image
                source={{ uri: userPhotoUri }}
                style={styles.menuAvatarImage}
              />
            ) : (
              <Text style={styles.menuAvatarText}>{initial}</Text>
            )}
          </View>
          <View style={styles.menuHeaderTextCol}>
            <Text style={styles.menuHeaderName} numberOfLines={1}>
              {displayName}
            </Text>
            {Boolean(userName) && (
              <Text style={styles.menuHeaderRole}>
                {t('driver.home.header.profileFallback')}
              </Text>
            )}
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.menuCloseBtn,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <MaterialIcons name="close" size={17} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.menuSection}>
          {MENU_ITEMS.filter((item) => !item.driverOnly || isDriver).map((item) => (
            <Pressable
              key={item.route}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: 'rgba(179,135,55,0.08)' },
              ]}
              onPress={() => onNavigate(item.route)}
              accessibilityRole="button"
            >
              <View style={styles.menuItemIcon}>
                <MaterialIcons name={item.icon} size={19} color="#B38737" />
              </View>
              <Text style={styles.menuLabel}>{t(item.labelKey)}</Text>
              <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>

        <View style={styles.menuDivider} />

        <Pressable
          style={({ pressed }) => [
            styles.menuItem,
            styles.logoutItem,
            pressed && { opacity: 0.8 },
          ]}
          onPress={onLogout}
          accessibilityRole="button"
        >
          <View style={[styles.menuItemIcon, styles.logoutIconBadge]}>
            <MaterialIcons name="logout" size={18} color="#D32F2F" />
          </View>
          <Text style={styles.logoutLabel}>{t('driver.home.menu.logout')}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
