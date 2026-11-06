import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface RegisterPasswordFieldsProps {
  password: string;
  confirmPassword: string;
  passwordStatus: 'idle' | 'match' | 'mismatch';
  showPassword: boolean;
  showConfirmPassword: boolean;
  loading: boolean;
  isEmailFormValid: boolean;
  colors: any;
  onSetPassword: (v: string) => void;
  onSetConfirmPassword: (v: string) => void;
  onToggleShowPassword: () => void;
  onToggleShowConfirmPassword: () => void;
  onSubmit: () => void;
  t: TFunction;
  styles: any;
}

export function RegisterPasswordFields({
  password,
  confirmPassword,
  passwordStatus,
  showPassword,
  showConfirmPassword,
  loading,
  isEmailFormValid,
  colors,
  onSetPassword,
  onSetConfirmPassword,
  onToggleShowPassword,
  onToggleShowConfirmPassword,
  onSubmit,
  t,
  styles,
}: RegisterPasswordFieldsProps) {
  return (
    <>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {`${t('authScreens.register.fields.passwordLabel')} *`}
        </Text>
        <View style={styles.inputWithIcon}>
          <TextInput
            style={[
              styles.inputFlex,
              passwordStatus === 'match' && styles.inputSuccess,
              passwordStatus === 'mismatch' && styles.inputError,
            ]}
            placeholder={t('authScreens.register.fields.passwordPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={onSetPassword}
            secureTextEntry={!showPassword}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            importantForAutofill="yes"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={onToggleShowPassword}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={showPassword ? 'visibility-off' : 'visibility'}
              size={22}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {`${t('authScreens.register.fields.confirmPasswordLabel')} *`}
        </Text>
        <View style={styles.inputWithIcon}>
          <TextInput
            style={[
              styles.inputFlex,
              passwordStatus === 'match' && styles.inputSuccess,
              passwordStatus === 'mismatch' && styles.inputError,
            ]}
            placeholder={t('authScreens.register.fields.confirmPasswordPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={confirmPassword}
            onChangeText={onSetConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            importantForAutofill="yes"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={onToggleShowConfirmPassword}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={showConfirmPassword ? 'visibility-off' : 'visibility'}
              size={22}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
        {passwordStatus === 'match' && (
          <Text style={styles.successText}>
            {t('authScreens.register.statusMessages.passwordMatch')}
          </Text>
        )}
        {passwordStatus === 'mismatch' && (
          <Text style={styles.errorText}>
            {t('authScreens.register.statusMessages.passwordMismatch')}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          (!isEmailFormValid || loading) && styles.buttonDisabled,
        ]}
        onPress={onSubmit}
        disabled={!isEmailFormValid || loading}
      >
        {loading ? (
          <LoadingIcon size={24} color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {t('authScreens.register.buttons.continueEmail')}
          </Text>
        )}
      </TouchableOpacity>
    </>
  );
}
