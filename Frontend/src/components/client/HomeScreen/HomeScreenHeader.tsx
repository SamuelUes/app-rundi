import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import type { TFunction } from 'i18next';

interface HomeScreenHeaderProps {
  userName: string | undefined;
  profileIconImage: any;
  onNavigateProfile: () => void;
  onCenterMap: () => void;
  styles: any;
  t: TFunction;
}

export function HomeScreenHeader({
  userName,
  profileIconImage,
  onNavigateProfile,
  onCenterMap,
  styles,
  t,
}: HomeScreenHeaderProps) {
  return (
    <>
      <TouchableOpacity
        style={styles.profileContainer}
        activeOpacity={0.85}
        onPress={onNavigateProfile}
      >
        <Text style={styles.profileName}>{userName || t('client.home.profile.fallbackName')}</Text>
        <Image source={profileIconImage} style={styles.profileAvatar} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.centerMapButton}
        onPress={onCenterMap}
        activeOpacity={0.85}
      >
        <Text style={styles.centerMapIcon}>↻</Text>
      </TouchableOpacity>
    </>
  );
}
