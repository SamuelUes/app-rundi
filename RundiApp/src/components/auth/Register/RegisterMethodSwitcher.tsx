import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface RegisterMethodSwitcherProps {
  isEmailMethod: boolean;
  isPhoneMethod: boolean;
  loading: boolean;
  onSelectEmail: () => void;
  onSelectPhone: () => void;
  t: TFunction;
  styles: any;
}

export function RegisterMethodSwitcher({
  isEmailMethod,
  isPhoneMethod,
  loading,
  onSelectEmail,
  onSelectPhone,
  t,
  styles,
}: RegisterMethodSwitcherProps) {
  return (
    <View style={styles.methodSwitcher}>
      <TouchableOpacity
        style={[styles.methodButton, isEmailMethod && styles.methodButtonActive]}
        onPress={onSelectEmail}
        disabled={loading}
      >
        <Text
          style={[styles.methodButtonText, isEmailMethod && styles.methodButtonTextActive]}
        >
          {t('authScreens.register.methods.email')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.methodButton, isPhoneMethod && styles.methodButtonActive]}
        onPress={onSelectPhone}
        disabled={loading}
      >
        <Text
          style={[styles.methodButtonText, isPhoneMethod && styles.methodButtonTextActive]}
        >
          {t('authScreens.register.methods.phone')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
