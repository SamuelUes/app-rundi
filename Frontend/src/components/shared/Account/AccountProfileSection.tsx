import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface AccountProfileSectionProps {
  profilePhoto: string | null;
  profileName: string;
  birthDate: string;
  profileEmail: string;
  profilePhone: string;
  displayPhone: string;
  uploadingPhoto: boolean;
  savingProfile: boolean;
  isFirebaseBackend: boolean;
  profileLoading: boolean;
  providersLoading: boolean;
  providersValues: string[];
  providerLabels: Record<string, string>;
  accountError: string | null;
  userName: string;
  colors: any;
  onPickProfilePhoto: () => void;
  onSetProfileName: (v: string) => void;
  onSetBirthDate: (v: string) => void;
  onSetProfileEmail: (v: string) => void;
  onOpenPhoneModal: () => void;
  onSaveProfile: () => void;
  formatBirthDateInput: (v: string) => string;
  buildProviderSummary: (providers: string[], labels: Record<string, string>, empty: string) => string;
  styles: any;
  t: TFunction;
}

export function AccountProfileSection({
  profilePhoto,
  profileName,
  birthDate,
  profileEmail,
  profilePhone,
  displayPhone,
  uploadingPhoto,
  savingProfile,
  isFirebaseBackend,
  profileLoading,
  providersLoading,
  providersValues,
  providerLabels,
  accountError,
  userName,
  colors,
  onPickProfilePhoto,
  onSetProfileName,
  onSetBirthDate,
  onSetProfileEmail,
  onOpenPhoneModal,
  onSaveProfile,
  formatBirthDateInput,
  buildProviderSummary,
  styles,
  t,
}: AccountProfileSectionProps) {
  return (
    <View style={styles.profileEditSection}>
      <View style={styles.avatarWrapper}>
        <View style={styles.avatarCircle}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitial}>
              {(profileName || userName || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.avatarEditButton}
          disabled={uploadingPhoto}
          onPress={onPickProfilePhoto}
        >
          {uploadingPhoto ? (
            <LoadingIcon size={20} color="#fff" />
          ) : (
            <MaterialIcons name="edit" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.profileFormCard}>
        <Text style={styles.profileCardTitle}>{t('shared.account.profile.avatarTitle')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('shared.account.profile.namePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={profileName}
          onChangeText={onSetProfileName}
        />
        <TextInput
          style={styles.input}
          placeholder={t('shared.account.profile.birthPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={birthDate}
          onChangeText={(text) => onSetBirthDate(formatBirthDateInput(text))}
          keyboardType="numeric"
          maxLength={10}
        />
        <TextInput
          style={styles.input}
          placeholder={t('shared.account.profile.emailPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
          value={profileEmail}
          onChangeText={onSetProfileEmail}
        />
        <TouchableOpacity
          style={[styles.input, styles.phoneButton]}
          onPress={onOpenPhoneModal}
        >
          <Text
            style={profilePhone ? styles.phoneValue : styles.phonePlaceholder}
            numberOfLines={1}
          >
            {profilePhone ? displayPhone : t('shared.account.profile.phonePlaceholder')}
          </Text>
        </TouchableOpacity>

        {isFirebaseBackend && (
          <View style={styles.accountSummarySection}>
            <Text style={styles.infoLabel}>{t('shared.account.providers.title')}</Text>
            {profileLoading || providersLoading ? (
              <LoadingIcon size={20} color={colors.primary} />
            ) : (
              <Text style={styles.infoText}>
                {buildProviderSummary(
                  providersValues,
                  providerLabels,
                  t('shared.account.providers.none'),
                )}
              </Text>
            )}

            {!!accountError && (
              <Text style={[styles.helperText, { color: colors.error }]}>{accountError}</Text>
            )}

            {!providersLoading && providersValues.length > 0 && (
              <View style={styles.badgeRow}>
                {providersValues.map((provider) => (
                  <View key={provider} style={styles.badge}>
                    <Text style={styles.badgeText}>{providerLabels[provider] || provider}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, savingProfile && styles.buttonDisabled]}
          disabled={savingProfile}
          onPress={onSaveProfile}
        >
          {savingProfile ? (
            <LoadingIcon size={20} color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('shared.account.profile.saveButton')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
