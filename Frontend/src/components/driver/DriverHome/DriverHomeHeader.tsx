import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import EmergencyButton from '../../shared/EmergencyButton';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import type { TFunction } from 'i18next';

interface DriverHomeHeaderProps {
  userName: string | undefined;
  userPhotoUri?: string | null;
  isAvailable: boolean;
  activeRideId: string | undefined;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onNavigateProfile: () => void;
  styles: any;
  t: TFunction;
}

export function DriverHomeHeader({
  userName,
  userPhotoUri,
  isAvailable,
  activeRideId,
  onToggleMenu,
  onCloseMenu,
  onNavigateProfile,
  styles,
  t,
}: DriverHomeHeaderProps) {
  const { isDark } = useTheme();
  const initial = (userName ?? '').trim().charAt(0).toUpperCase() || 'C';
  const iconColor = isDark ? '#F5F1EA' : '#1C1917';

  return (
    <View style={styles.overlayHeader} pointerEvents="box-none">
      <View style={styles.leftHeaderGroup}>
        <Pressable
          style={({ pressed }) => [
            styles.chipButton,
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
          onPress={onToggleMenu}
          accessibilityRole="button"
          accessibilityLabel={t('driver.home.menu.title')}
        >
          <MaterialIcons name="menu" size={22} color={iconColor} />
        </Pressable>

        <View style={styles.chipButton}>
          <EmergencyButton
            rideId={activeRideId}
            style={styles.emergencyChipButton}
            onOpen={onCloseMenu}
          />
        </View>
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
