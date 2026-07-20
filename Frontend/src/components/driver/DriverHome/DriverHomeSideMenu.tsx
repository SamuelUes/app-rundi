import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface DriverHomeSideMenuProps {
  visible: boolean;
  menuOpacity: Animated.Value;
  menuTranslate: Animated.Value;
  panelWidth: number;
  userRole: string | undefined;
  colors: any;
  onClose: () => void;
  onNavigate: (route: any) => void;
  onLogout: () => void;
  styles: any;
  t: TFunction;
}

export function DriverHomeSideMenu({
  visible,
  menuOpacity,
  menuTranslate,
  panelWidth,
  userRole,
  colors,
  onClose,
  onNavigate,
  onLogout,
  styles,
  t,
}: DriverHomeSideMenuProps) {
  if (!visible) return null;

  return (
    <Animated.View style={[styles.menuOverlay, { opacity: menuOpacity }]}>
      <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[
          styles.menuContainer,
          {
            transform: [{ translateX: menuTranslate }],
            width: panelWidth,
          },
        ]}
      >
        <View style={styles.menuTopAccent} />
        <View style={styles.menuHeaderRow}>
          <Text style={styles.menuHeader}>{t('driver.home.menu.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.menuCloseBtn}>
            <Text style={styles.menuCloseIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={() => onNavigate('Earnings')}>
            <View style={styles.menuIconBadge}>
              <Text style={styles.menuEmoji}>💵</Text>
            </View>
            <Text style={styles.menuLabel}>{t('driver.home.menu.earnings')}</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
          {(userRole === 'driver' || userRole === 'designated_driver') && (
            <TouchableOpacity style={styles.menuItem} onPress={() => onNavigate('RechargeFunds')}>
              <View style={styles.menuIconBadge}>
                <Text style={styles.menuEmoji}>💼</Text>
              </View>
              <Text style={styles.menuLabel}>{t('driver.home.menu.commissions')}</Text>
              <Text style={styles.menuItemArrow}>›</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.menuItem} onPress={() => onNavigate('RideHistory')}>
            <View style={styles.menuIconBadge}>
              <Text style={styles.menuEmoji}>📜</Text>
            </View>
            <Text style={styles.menuLabel}>{t('driver.home.menu.history')}</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => onNavigate('Settings')}>
            <View style={styles.menuIconBadge}>
              <MaterialIcons name="settings" size={24} color={colors.primary} />
            </View>
            <Text style={styles.menuLabel}>{t('driver.home.menu.settings')}</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => onNavigate('Help')}>
            <View style={styles.menuIconBadge}>
              <MaterialIcons name="help-outline" size={24} color={colors.primary} />
            </View>
            <Text style={styles.menuLabel}>{t('driver.home.menu.help')}</Text>
            <Text style={styles.menuItemArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuDivider} />

        <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={onLogout}>
          <View style={[styles.menuIconBadge, styles.logoutIconBadge]}>
            <Text style={styles.logoutEmoji}>🚪</Text>
          </View>
          <Text style={styles.logoutLabel}>{t('driver.home.menu.logout')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}
