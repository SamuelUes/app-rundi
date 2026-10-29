import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import { LoadingIcon } from '../../ui/LoadingIcon';
import alertService from '../../../services/alertService';
import designatedCrewService from '../../../services/designatedCrewService';
import type { CrewInvite } from '../../../types/designatedCrew';

export function DesignatedCrewInviteCard({ invite }: { invite: CrewInvite }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets.top), [colors, isDark, insets.top]);
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);

  const respond = async (accept: boolean) => {
    setPending(accept ? 'accept' : 'reject');
    try {
      await designatedCrewService.respondInvite(accept);
    } catch (error: any) {
      alertService.showErrorAlert(
        String(error?.message || '').includes('EXPIRED') ? t('driver.crew.invite.expired') : t('driver.crew.errors.generic'),
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.header}>
        <Ionicons name="people" size={20} color="#B38737" />
        <Text style={styles.title}>{t('driver.crew.invite.title')}</Text>
      </View>
      <Text style={styles.body}>{t('driver.crew.invite.body', { name: invite.captain.name })}</Text>
      <Text style={styles.meta}>
        ★ {Number(invite.captain.rating || 0).toFixed(1)} · {t('driver.crew.invite.license', { license: invite.captain.licenseNumber })}
      </Text>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.reject]} onPress={() => respond(false)} disabled={pending !== null} accessibilityRole="button">
          {pending === 'reject' ? <LoadingIcon size={16} color={colors.text} /> : <Text style={styles.rejectLabel}>{t('driver.crew.invite.reject')}</Text>}
        </Pressable>
        <Pressable style={[styles.button, styles.accept]} onPress={() => respond(true)} disabled={pending !== null} accessibilityRole="button">
          {pending === 'accept' ? <LoadingIcon size={16} color="#241A09" /> : <Text style={styles.acceptLabel}>{t('driver.crew.invite.accept')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean, top: number) =>
  StyleSheet.create({
    card: {
      position: 'absolute', top: top + 72, left: 16, right: 16, zIndex: 40, borderRadius: 22, padding: 16, gap: 8,
      backgroundColor: isDark ? '#241F1B' : '#FFFFFF',
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.26, shadowRadius: 16, elevation: 14,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    body: { fontSize: 14, color: colors.text, lineHeight: 20 },
    meta: { fontSize: 13, color: colors.textSecondary },
    actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
    button: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    reject: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.06)' },
    accept: { backgroundColor: '#B38737' },
    rejectLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    acceptLabel: { fontSize: 15, fontWeight: '700', color: '#241A09' },
  });
