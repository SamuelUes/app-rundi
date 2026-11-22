import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import EmergencyButton from '../../shared/EmergencyButton';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import type { TFunction } from 'i18next';

interface DriverHomeHeaderProps {
  userName: string | undefined;
  userPhotoUri?: string | null;
  isAvailable: boolean;
  activeRideId: string | undefined;
  onNavigateProfile: () => void;
  onLogout: () => void;
  styles: any;
  t: TFunction;
}

export function DriverHomeHeader({
  userName,
  userPhotoUri,
  isAvailable,
  activeRideId,
  onNavigateProfile,
  onLogout,
  styles,
  t,
}: DriverHomeHeaderProps) {
  const initial = (userName ?? '').trim().charAt(0).toUpperCase() || 'C';
  const { colors } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const openEmergency = useRef<(() => void) | null>(null);
  const registerEmergency = useCallback((open: (() => void) | null) => {
    openEmergency.current = open;
  }, []);

  return (
    <View style={styles.overlayHeader} pointerEvents="box-none">
      <View style={[styles.leftHeaderGroup, { alignItems: 'flex-start' }]}>
        <Pressable
          style={styles.chipButton}
          onPress={() => setMenuOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={`${t('common.components.emergencyButton.modalTitle')}, ${t('driver.home.menu.logout')}`}
          accessibilityState={{ expanded: menuOpen }}
        >
          <MaterialIcons name={menuOpen ? 'close' : 'menu'} size={24} color={colors.text} />
        </Pressable>
        {menuOpen && (
          <View style={[menuStyles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              style={menuStyles.action}
              onPress={() => {
                setMenuOpen(false);
                openEmergency.current?.();
              }}
              accessibilityRole="button"
            >
              <MaterialIcons name="phone-in-talk" size={20} color={colors.error} />
              <Text style={[menuStyles.label, { color: colors.text }]}>
                {t('common.components.emergencyButton.modalTitle')}
              </Text>
            </Pressable>
            <View style={[menuStyles.divider, { backgroundColor: colors.border }]} />
            <Pressable
              style={menuStyles.action}
              onPress={() => {
                setMenuOpen(false);
                onLogout();
              }}
              accessibilityRole="button"
            >
              <MaterialIcons name="logout" size={20} color={colors.error} />
              <Text style={[menuStyles.label, { color: colors.error }]}>
                {t('driver.home.menu.logout')}
              </Text>
            </Pressable>
          </View>
        )}
        <EmergencyButton rideId={activeRideId} hideTrigger onReady={registerEmergency} />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.profileChip,
          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
        ]}
        onPress={onNavigateProfile}
        accessibilityRole="button"
      >
        <View style={styles.profileAvatarWrap}>
          <View style={styles.profileAvatar}>
            {userPhotoUri ? (
              <Image
                source={{ uri: userPhotoUri }}
                style={styles.profileAvatarImage}
              />
            ) : (
              <Text style={styles.profileAvatarText}>{initial}</Text>
            )}
          </View>
          <View
            style={[
              styles.profileStatusDot,
              { backgroundColor: isAvailable ? '#34C759' : '#8A857E' },
            ]}
          />
        </View>
        <Text style={styles.profileName} numberOfLines={1}>
          {userName || t('driver.home.header.profileFallback')}
        </Text>
      </Pressable>
    </View>
  );
}

const menuStyles = StyleSheet.create({
  panel: {
    minWidth: 190,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 5,
    boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.16)',
    elevation: 8,
  },
  action: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  label: { fontSize: 14, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 10 },
});
