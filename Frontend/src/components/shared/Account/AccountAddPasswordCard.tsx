import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface AccountAddPasswordCardProps {
  password: string;
  confirmPassword: string;
  submitting: boolean;
  colors: any;
  onSetPassword: (text: string) => void;
  onSetConfirmPassword: (text: string) => void;
  onSubmit: () => void;
  styles: any;
  t: TFunction;
}

export function AccountAddPasswordCard({
  password,
  confirmPassword,
  submitting,
  colors,
  onSetPassword,
  onSetConfirmPassword,
  onSubmit,
  styles,
  t,
}: AccountAddPasswordCardProps) {
  return (
    <View style={styles.accountCard}>
      <Text style={styles.accountTitle}>{t('shared.account.cards.addPassword.title')}</Text>
      <Text style={styles.accountDescription}>
        {t('shared.account.cards.addPassword.description')}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={t('shared.account.cards.addPassword.newPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={onSetPassword}
      />
      <TextInput
        style={styles.input}
        placeholder={t('shared.account.cards.addPassword.confirmPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={confirmPassword}
        onChangeText={onSetConfirmPassword}
      />
      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        disabled={submitting}
        onPress={onSubmit}
      >
        {submitting ? (
          <LoadingIcon size={20} color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{t('shared.account.cards.addPassword.button')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
