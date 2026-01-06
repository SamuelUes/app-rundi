import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function WebNotice() {
  if (Platform.OS !== 'web') return null;

  const { t } = useTranslation();

  const formatInstruction = (textKey: string) => {
    const raw = t(textKey as any, {
      interpolation: { escapeValue: false },
    }) as string;
    const parts = raw.split('{bold|');
    if (parts.length === 1) {
      return <Text style={styles.recommend}>{raw}</Text>;
    }
    const [before, rest] = parts;
    const [boldContent, after] = rest.split('}');
    return (
      <Text style={styles.recommend}>
        {before}
        <Text style={styles.bold}>{boldContent}</Text>
        {after}
      </Text>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.notice}>
        <Text style={styles.title}>{t('common.components.webNotice.title')}</Text>
        <Text style={styles.text}>{t('common.components.webNotice.descriptionPrimary')}</Text>
        <Text style={styles.text}>{t('common.components.webNotice.descriptionSecondary')}</Text>
        <Text style={styles.bullet}>{t('common.components.webNotice.bullets.maps')}</Text>
        <Text style={styles.bullet}>{t('common.components.webNotice.bullets.gps')}</Text>
        <Text style={styles.bullet}>{t('common.components.webNotice.bullets.tracking')}</Text>

        <View style={styles.separator} />

        <Text style={styles.recommendTitle}>
          {t('common.components.webNotice.instructionsTitle')}
        </Text>
        {formatInstruction('common.components.webNotice.instructions.step1')}
        <Text style={styles.recommend}>
          {t('common.components.webNotice.instructions.step2')}
        </Text>
        <Text style={styles.recommend}>
          {t('common.components.webNotice.instructions.step3')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 20,
  },
  notice: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    maxWidth: 600,
    marginHorizontal: 'auto',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  text: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  bullet: {
    fontSize: 14,
    marginLeft: 16,
    marginBottom: 4,
    color: '#666',
  },
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
  },
  recommendTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  recommend: {
    fontSize: 14,
    marginBottom: 6,
    color: '#555',
  },
  bold: {
    fontWeight: '700',
  },
});
