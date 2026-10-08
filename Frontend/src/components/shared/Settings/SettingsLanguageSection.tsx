import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface LanguageOption {
  value: string;
  label: string;
}

interface SettingsLanguageSectionProps {
  languageOptions: LanguageOption[];
  preference: string;
  language: string;
  colors: any;
  onChangeLanguage: (value: any) => void;
  t: TFunction;
  styles: any;
}

export function SettingsLanguageSection({
  languageOptions,
  preference,
  language,
  colors,
  onChangeLanguage,
  t,
  styles,
}: SettingsLanguageSectionProps) {
  const isOptionActive = (value: string) =>
    preference === value || (value !== 'device' && language === value);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('settings.sections.language')}</Text>
      <View style={[styles.row, styles.rowLast]}>
        <View style={styles.rowIcon}>
          <Ionicons name="globe-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{t('settings.language.title')}</Text>
          <Text style={styles.rowDescription}>{t('settings.language.description')}</Text>
        </View>
      </View>
      <View style={styles.languageOptions}>
        {languageOptions.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.languageButton,
              isOptionActive(option.value) && styles.languageButtonActive,
            ]}
            onPress={() => onChangeLanguage(option.value)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.languageButtonText,
                isOptionActive(option.value) && styles.languageButtonTextActive,
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
