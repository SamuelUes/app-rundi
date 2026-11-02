import React from 'react';
import { View, Text, TextInput } from 'react-native';
import type { TFunction } from 'i18next';
import type { CountryDialOption } from '../../../utils/format/phoneUtils';
import PhoneField from '../../ui/PhoneField';

interface RegisterBaseFieldsProps {
  name: string;
  email: string;
  isEmailMethod: boolean;
  isPhoneMethod: boolean;
  loading: boolean;
  colors: any;
  selectedCountry: CountryDialOption;
  phoneDigits: string;
  countryOptions: CountryDialOption[];
  onSetName: (v: string) => void;
  onSetEmail: (v: string) => void;
  onCountryChange: (countryCode: string) => void;
  onChangeDigits: (digits: string) => void;
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
  phoneDigits,
  countryOptions,
  onSetName,
  onSetEmail,
  onCountryChange,
  onChangeDigits,
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

        <PhoneField
          countryOptions={countryOptions}
          selectedCountry={selectedCountry}
          onCountryChange={onCountryChange}
          digits={phoneDigits}
          onChangeDigits={onChangeDigits}
          disabled={loading}
          accessibilityLabel={t('authScreens.register.fields.phoneLabel')}
        />

        <Text style={styles.helperText}>
          {isPhoneMethod
            ? t('authScreens.register.fields.phoneHelperRequired')
            : t('authScreens.register.fields.phoneHelperOptional')}
        </Text>
      </View>
    </>
  );
}
