import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';

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
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
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
            <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.headerContent}>
          <Text style={styles.name}>{userName}</Text>
          <Text style={styles.email}>{userEmail}</Text>
          <Text style={styles.memberId}>{userIdLabel}</Text>

          <View style={styles.headerBottomRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>

            <TouchableOpacity onPress={onEditProfile}>
              <View style={styles.editProfileBadge}>
                <Text style={styles.editProfileText}>{headerEditLabel}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}
