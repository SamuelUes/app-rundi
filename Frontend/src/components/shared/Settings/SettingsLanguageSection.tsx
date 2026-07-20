import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface LanguageOption {
  value: string;
  label: string;
}

interface SettingsLanguageSectionProps {
  languageOptions: LanguageOption[];
  preference: string;
  language: string;
  onChangeLanguage: (value: any) => void;
  t: TFunction;
  styles: any;
}

export function SettingsLanguageSection({
  languageOptions,
  preference,
  language,
  onChangeLanguage,
  t,
  styles,
}: SettingsLanguageSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.sections.language')}</Text>
      <View style={[styles.option, styles.optionLast]}>
        <View style={styles.optionLeft}>
          <Text style={styles.optionTitle}>{t('settings.language.title')}</Text>
          <Text style={styles.optionDescription}>{t('settings.language.description')}</Text>
        </View>
      </View>
      <View style={styles.languageOptions}>
        {languageOptions.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.languageButton,
              (preference === option.value || (option.value !== 'device' && language === option.value)) &&
                styles.languageButtonActive,
            ]}
            onPress={() => onChangeLanguage(option.value)}
          >
            <Text
              style={[
                styles.languageButtonText,
                (preference === option.value || (option.value !== 'device' && language === option.value)) &&
                  styles.languageButtonTextActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
