import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import EmergencyButton from '../../shared/EmergencyButton';
import type { TFunction } from 'i18next';

interface DriverHomeHeaderProps {
  userName: string | undefined;
  activeRideId: string | undefined;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onNavigateProfile: () => void;
  styles: any;
  t: TFunction;
}

export function DriverHomeHeader({
  userName,
  activeRideId,
  onToggleMenu,
  onCloseMenu,
  onNavigateProfile,
  styles,
  t,
}: DriverHomeHeaderProps) {
  return (
    <View style={styles.overlayHeader}>
      <View style={styles.leftHeaderGroup}>
        <TouchableOpacity
          style={styles.menuButton}
          activeOpacity={0.85}
          onPress={onToggleMenu}
          accessibilityRole="button"
        >
          <View style={styles.menuIconGlyph}>
            <View style={styles.menuIconLine} />
            <View style={styles.menuIconLine} />
            <View style={styles.menuIconLine} />
          </View>
        </TouchableOpacity>

        <EmergencyButton
          rideId={activeRideId}
          style={styles.emergencyHeaderButton}
          onOpen={onCloseMenu}
        />
      </View>

      <TouchableOpacity
        style={styles.rightHeaderGroup}
        activeOpacity={0.9}
        onPress={onNavigateProfile}
      >
        <View style={styles.headerNameBubble}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {userName || t('driver.home.header.profileFallback')}
          </Text>
          <Image
            source={require('../../../assets/icons/profile/profile-icon2.png')}
            style={styles.profileBubbleIcon}
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}
