import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface RegisterPhoneSubmitProps {
  isPhoneFormValid: boolean;
  loading: boolean;
  onSubmit: () => void;
  t: TFunction;
  styles: any;
}

export function RegisterPhoneSubmit({
  isPhoneFormValid,
  loading,
  onSubmit,
  t,
  styles,
}: RegisterPhoneSubmitProps) {
  return (
    <View style={styles.phoneActionsRow}>
      <TouchableOpacity
        style={[
          styles.phoneNextButton,
          (!isPhoneFormValid || loading) && styles.buttonDisabled,
        ]}
        onPress={onSubmit}
        disabled={!isPhoneFormValid || loading}
      >
        {loading ? (
          <LoadingIcon size={24} color="#FFFFFF" />
        ) : (
          <Text style={styles.phoneNextIcon}>
            {t('authScreens.register.buttons.phoneNext')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
