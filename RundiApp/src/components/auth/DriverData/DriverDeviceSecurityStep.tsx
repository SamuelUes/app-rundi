import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import BiometricService from '../../../services/user/biometricService';

type Props = { onVerified: () => void; onBack: () => void };

export function DriverDeviceSecurityStep({ onVerified, onBack }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
    back: { alignSelf: 'flex-start', padding: 12, backgroundColor: colors.surface, borderRadius: 14 },
    content: { flex: 1, justifyContent: 'center', gap: 22 },
    icon: { width: 76, height: 76, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.text, fontSize: 28, fontWeight: '700' },
    subtitle: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
    info: { backgroundColor: colors.surface, borderRadius: 14, padding: 18, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    infoText: { flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    error: { color: colors.error, fontSize: 14, lineHeight: 20 },
    button: { backgroundColor: colors.primary, borderRadius: 14, padding: 17, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    footer: { paddingBottom: 24 },
  }), [colors]);

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!(await BiometricService.hasDeviceCredential())) {
        setError(t('authScreens.driverData.deviceSecurity.noSecurity'));
        return;
      }
      const result = await BiometricService.authenticateWithDeviceCredential(
        t('authScreens.driverData.deviceSecurity.prompt'),
      );
      if (result.success) onVerified();
      else setError(t('authScreens.driverData.deviceSecurity.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common.actions.back')}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <View style={styles.content}>
        <View style={styles.icon}><Ionicons name="finger-print-outline" size={42} color={colors.primary} /></View>
        <Text style={styles.title}>{t('authScreens.driverData.deviceSecurity.title')}</Text>
        <Text style={styles.subtitle}>{t('authScreens.driverData.deviceSecurity.subtitle')}</Text>
        <View style={styles.info}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
          <Text style={styles.infoText}>{t('authScreens.driverData.deviceSecurity.info')}</Text>
        </View>
        {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      </View>
      <View style={styles.footer}>
        <Pressable onPress={() => void verify()} disabled={busy} style={styles.button} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="lock-open-outline" size={20} color="#FFFFFF" />}
          <Text style={styles.buttonText}>{t('authScreens.driverData.deviceSecurity.action')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
