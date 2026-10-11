import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProfileHeaderProps {
  headerTitle: string;
  headerEditLabel: string;
  userIdLabel: string;
  roleLabel: string;
  userName: string;
  userEmail: string;
  onBack: () => void;
  onEditProfile: () => void;
  styles: any;
}

export function ProfileHeader({
  headerTitle,
  headerEditLabel,
  userIdLabel,
  roleLabel,
  userName,
  userEmail,
  onBack,
  onEditProfile,
  styles,
}: ProfileHeaderProps) {
  const insets = useSafeAreaInsets();
  const initial = (userName || '').trim().charAt(0).toUpperCase();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerTopRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityRole="button">
          <Image
            source={require('../../../assets/icons/back_button/back_button.png')}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={styles.headerTopSpacer} />
      </View>

      <View style={styles.headerMainRow}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial || 'R'}</Text>
          </View>
        </View>

        <View style={styles.headerContent}>
          <Text style={styles.name} numberOfLines={2}>{userName}</Text>
          {!!userEmail && <Text style={styles.email} numberOfLines={1}>{userEmail}</Text>}
          <Text style={styles.memberId} numberOfLines={2} ellipsizeMode="middle">
            {userIdLabel}
          </Text>

          <View style={styles.headerBottomRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editProfileBadge}
            onPress={onEditProfile}
            accessibilityRole="button"
            accessibilityLabel={headerEditLabel}
          >
            <Text style={styles.editProfileText}>{headerEditLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
