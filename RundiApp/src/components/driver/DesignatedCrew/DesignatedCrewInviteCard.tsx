import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import { LoadingIcon } from '../../ui/LoadingIcon';
import alertService from '../../../services/notification/alertService';
import designatedCrewService from '../../../services/driver/designatedCrewService';
import type { CrewInvite } from '../../../types/designatedCrew';

export function DesignatedCrewInviteCard({ invite, onDismissed }: { invite: CrewInvite; onDismissed?: () => void }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets.top), [colors, isDark, insets.top]);
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);

  const respond = async (accept: boolean) => {
    setPending(accept ? 'accept' : 'reject');
    try {
      await designatedCrewService.respondInvite(accept);
      // Rechazar no tiene endpoint v2 (expira sola): el caller la oculta en sesión.
      // En aceptar, la suscripción borra el doc y la tarjeta se desmonta igual.
      onDismissed?.();
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
      <Text style={styles.body}>
        <Text style={styles.bodyName}>{invite.captain.name} </Text>
        {t('driver.crew.invite.body')}
      </Text>
      <View style={styles.metaRow}>
        <Ionicons name="star" size={13} color="#B38737" />
        <Text style={styles.meta}> {Number(invite.captain.rating || 0).toFixed(1)}</Text>
        {invite.captain.licenseNumber ? (
          <Text style={styles.meta}> · {t('driver.crew.invite.license', { license: invite.captain.licenseNumber })}</Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.reject, pressed && { opacity: 0.7 }]}
          onPress={() => respond(false)}
          disabled={pending !== null}
          accessibilityRole="button"
          accessibilityLabel={t('driver.crew.invite.reject')}
        >
          {pending === 'reject' ? (
            <LoadingIcon size={16} color={colors.text} />
          ) : (
            <View style={styles.buttonContent}>
              {/* <Ionicons name="close" size={16} color={colors.textSecondary} /> */}
              <Text style={styles.rejectLabel}>{t('driver.crew.invite.reject')}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, styles.accept, pressed && { opacity: 0.88 }]}
          onPress={() => respond(true)}
          disabled={pending !== null}
          accessibilityRole="button"
          accessibilityLabel={t('driver.crew.invite.accept')}
        >
          {pending === 'accept' ? (
            <LoadingIcon size={16} color="#241A09" />
          ) : (
            <View style={styles.buttonContent}>
              {/* <Ionicons name="checkmark" size={17} color="#241A09" /> */}
              <Text style={styles.acceptLabel}>{t('driver.crew.invite.accept')}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// Overlay a nivel de DriverStack: muestra la tarjeta en cualquier pantalla
// mientras crew_invites/{uid} siga pendiente (expiresAt > ahora). Rechazar la
// oculta solo en sesión — v2 no expone decline, sigue vigente en backend.
export function DesignatedCrewInviteOverlay({ uid }: { uid?: string }) {
  const [invite, setInvite] = useState<CrewInvite | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    if (!uid) return;
    return designatedCrewService.subscribeInvite(uid, setInvite);
  }, [uid]);

  // Al llegar expiresAt re-renderiza para ocultar la tarjeta sin depender de
  // que el listener vuelva a disparar.
  useEffect(() => {
    if (!invite?.expiresAt) return;
    const ms = invite.expiresAt - Date.now();
    if (ms <= 0) {
      setNowTick((n) => n + 1);
      return;
    }
    const timer = setTimeout(() => setNowTick((n) => n + 1), ms + 100);
    return () => clearTimeout(timer);
  }, [invite?.expiresAt]);

  const key = invite ? `${invite.captainId}:${invite.createdAt}` : null;
  if (!invite || invite.expiresAt <= Date.now() || key === dismissedKey) return null;
  return <DesignatedCrewInviteCard invite={invite} onDismissed={() => key && setDismissedKey(key)} />;
}

const createStyles = (colors: any, isDark: boolean, top: number) =>
  StyleSheet.create({
    card: {
      position: 'absolute', top: top + 72, left: 16, right: 16, zIndex: 40, borderRadius: 22, padding: 16, gap: 8,
      backgroundColor: isDark ? '#241F1B' : '#FFFFFF',
      boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.26)', elevation: 14,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 16, fontWeight: '700', color: colors.text },
    body: { fontSize: 14, color: colors.text, lineHeight: 20 },
    bodyName: { fontSize: 15, fontWeight: '800', color: '#B38737' },
    metaRow: { flexDirection: 'row', alignItems: 'center' },
    meta: { fontSize: 13, color: colors.textSecondary },
    actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    button: {
      flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    },
    buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reject: {
      borderWidth: 1,
      borderRadius: 14,
      borderColor: isDark ? 'rgb(211, 8, 8)' : 'rgb(211, 8, 8)',
      backgroundColor: isDark ? 'rgb(215, 57, 57)2)' : 'rgb(232, 87, 87))',
    },
    accept: {
      backgroundColor: '#B38737',
      borderRadius: 14,
      boxShadow: '0px 4px 8px rgba(179, 135, 55, 0.28)', elevation: 4,
    },
    rejectLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
    acceptLabel: { fontSize: 15, fontWeight: '800', color: '#241A09' },
  });
