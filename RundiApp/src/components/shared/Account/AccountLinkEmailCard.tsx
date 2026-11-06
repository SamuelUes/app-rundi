import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface AccountLinkEmailCardProps {
  email: string;
  password: string;
  confirmPassword: string;
  submitting: boolean;
  colors: any;
  onSetEmail: (text: string) => void;
  onSetPassword: (text: string) => void;
  onSetConfirmPassword: (text: string) => void;
  onSubmit: () => void;
  styles: any;
  t: TFunction;
}

export function AccountLinkEmailCard({
  email,
  password,
  confirmPassword,
  submitting,
  colors,
  onSetEmail,
  onSetPassword,
  onSetConfirmPassword,
  onSubmit,
  styles,
  t,
}: AccountLinkEmailCardProps) {
  return (
    <View style={styles.accountCard}>
      <Text style={styles.accountTitle}>{t('shared.account.cards.linkEmail.title')}</Text>
      <Text style={styles.accountDescription}>
        {t('shared.account.cards.linkEmail.description')}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={t('shared.account.cards.linkEmail.emailPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
        autoComplete="email"
        importantForAutofill="yes"
        value={email}
        onChangeText={onSetEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t('shared.account.cards.linkEmail.passwordPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={onSetPassword}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        autoComplete="new-password"
        importantForAutofill="yes"
      />
      <TextInput
        style={styles.input}
        placeholder={t('shared.account.cards.linkEmail.confirmPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={confirmPassword}
        onChangeText={onSetConfirmPassword}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        autoComplete="new-password"
        importantForAutofill="yes"
      />
      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        disabled={submitting}
        onPress={onSubmit}
      >
        {submitting ? (
          <LoadingIcon size={20} color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{t('shared.account.cards.linkEmail.button')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
