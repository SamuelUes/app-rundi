import React from 'react';
import { View, Text, Pressable } from 'react-native';
import StorageImage from '../../shared/StorageImage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import type { TFunction } from 'i18next';

interface HomeScreenHeaderProps {
  userName: string | undefined;
  userPhotoUri?: string | null;
  onNavigateProfile: () => void;
  onCenterMap: () => void;
  styles: any;
  t: TFunction;
}

export function HomeScreenHeader({
  userName,
  userPhotoUri,
  onNavigateProfile,
  onCenterMap,
  styles,
  t,
}: HomeScreenHeaderProps) {
  const { isDark } = useTheme();
  const initial = (userName ?? '').trim().charAt(0).toUpperCase() || 'U';
  const iconColor = isDark ? '#F5F1EA' : '#1C1917';

  return (
    <>
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
              <StorageImage uri={userPhotoUri} style={styles.profileAvatarImage} />
            ) : (
              <Text style={styles.profileAvatarText}>{initial}</Text>
            )}
          </View>
        </View>
        <Text style={styles.profileName} numberOfLines={1}>
          {userName || t('client.home.profile.fallbackName')}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.mapFab, pressed && styles.mapFabPressed]}
        onPress={onCenterMap}
        accessibilityRole="button"
        accessibilityLabel={t('client.home.map.recenter')}
      >
        <MaterialIcons name="my-location" size={21} color={iconColor} />
      </Pressable>
    </>
  );
}
