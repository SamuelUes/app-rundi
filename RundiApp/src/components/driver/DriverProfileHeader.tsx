import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { LoadingIcon } from '../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface DriverProfileHeaderProps {
  displayName: string;
  displayEmail: string | null;
  userId: string | undefined;
  profilePhoto: string | null;
  uploadingPhoto: boolean;
  averageRating: number;
  accountStatusBadge: React.ReactNode;
  onUploadPhoto: (type: 'profile' | 'vehicle' | 'document') => void;
  onGoBack: () => void;
  onEditProfile: () => void;
  styles: any;
  t: TFunction;
}

export function DriverProfileHeader({
  displayName,
  displayEmail,
  userId,
  profilePhoto,
  uploadingPhoto,
  averageRating,
  accountStatusBadge,
  onUploadPhoto,
  onGoBack,
  onEditProfile,
  styles,
  t,
}: DriverProfileHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerTopRow}>
        <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('driver.profile.header.title')}</Text>
        <View style={styles.headerTopSpacer} />
      </View>

      <View style={styles.headerMainRow}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => onUploadPhoto('profile')}
          disabled={uploadingPhoto}
        >
          {uploadingPhoto ? (
            <View style={styles.avatarPlaceholder}>
              <LoadingIcon size={32} color="#fff" />
            </View>
          ) : profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {displayName.charAt(0).toUpperCase() || t('driver.profile.header.initialFallback')}
              </Text>
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Text style={styles.cameraIconText}>📷</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.driverName} numberOfLines={2}>{displayName}</Text>
          {displayEmail && <Text style={styles.driverEmail} numberOfLines={1}>{displayEmail}</Text>}
          <Text style={styles.memberId} numberOfLines={2} ellipsizeMode="middle">
            {t('driver.profile.header.memberId', { id: userId ?? '' })}
          </Text>

          <View style={styles.headerBottomRow}>
            {accountStatusBadge}
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingStars}>⭐</Text>
              <Text style={styles.ratingText}>{(typeof averageRating === 'number' ? averageRating : 5.0).toFixed(1)}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.editProfileBadge} onPress={onEditProfile}>
            <Text style={styles.editProfileText}>{t('driver.profile.header.edit')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
