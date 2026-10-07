import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import type { CountryDialOption } from '../../../utils/phoneUtils';
import PhoneNumberModal from '../../shared/PhoneNumberModal';

interface RegisterBaseFieldsProps {
  name: string;
  email: string;
  isEmailMethod: boolean;
  isPhoneMethod: boolean;
  loading: boolean;
  colors: any;
  selectedCountry: CountryDialOption;
  normalizedPhone: string;
  phone: string;
  phoneDigits: string;
  phoneModalVisible: boolean;
  countryOptions: CountryDialOption[];
  onSetName: (v: string) => void;
  onSetEmail: (v: string) => void;
  onOpenPhoneModal: () => void;
  onPhoneModalClose: () => void;
  onPhoneModalConfirm: (data: {
    country: CountryDialOption;
    digits: string;
    normalizedPhone: string;
    formattedPhone: string;
  }) => void;
  t: TFunction;
  styles: any;
}

export function RegisterBaseFields({
  name,
  email,
  isEmailMethod,
  isPhoneMethod,
  loading,
  colors,
  selectedCountry,
  normalizedPhone,
  phone,
  phoneDigits,
  phoneModalVisible,
  countryOptions,
  onSetName,
  onSetEmail,
  onOpenPhoneModal,
  onPhoneModalClose,
  onPhoneModalConfirm,
  t,
  styles,
}: RegisterBaseFieldsProps) {
  return (
    <>
      {/* Name */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {`${t('authScreens.register.fields.nameLabel')} *`}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.register.fields.namePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={onSetName}
          editable={!loading}
        />
      </View>

      {/* Email */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {`${t('authScreens.register.fields.emailLabel')}${isEmailMethod ? ' *' : ''}`}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('authScreens.register.fields.emailPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={onSetEmail}
          keyboardType="email-address"
          editable={!loading}
        />
        <Text style={styles.helperText}>
          {isEmailMethod
            ? t('authScreens.register.fields.emailHelperRequired')
            : t('authScreens.register.fields.emailHelperOptional')}
        </Text>
      </View>

      {/* Phone */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          {`${t('authScreens.register.fields.phoneLabel')}${isPhoneMethod ? ' *' : ''}`}
        </Text>

        <TouchableOpacity
          style={styles.phoneSummary}
          onPress={onOpenPhoneModal}
          disabled={loading}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <View style={styles.phoneSummaryFlagDial}>
            <Text style={styles.phoneSummaryDial}>{selectedCountry.dialCode}</Text>
          </View>
          <View style={styles.phoneSummaryValueContainer}>
            <Text
              style={
                normalizedPhone
                  ? styles.phoneSummaryValue
                  : styles.phoneSummaryPlaceholder
              }
              numberOfLines={1}
            >
              {normalizedPhone ? phone : t('authScreens.register.fields.phonePlaceholder')}
            </Text>
          </View>
          <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={styles.helperText}>
          {isPhoneMethod
            ? t('authScreens.register.fields.phoneHelperRequired')
            : t('authScreens.register.fields.phoneHelperOptional')}
        </Text>
      </View>

      <PhoneNumberModal
        visible={phoneModalVisible}
        onClose={onPhoneModalClose}
        onConfirm={onPhoneModalConfirm}
        countryOptions={countryOptions}
        initialCountry={selectedCountry}
        initialDigits={phoneDigits}
        loading={loading}
      />
    </>
  );
}
