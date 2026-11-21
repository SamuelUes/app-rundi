import React, { useState, useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';

const REASONS = ['wait_too_long', 'price_too_high', 'plans_changed', 'wrong_details', 'other'] as const;
type Reason = typeof REASONS[number];

interface Props {
  visible: boolean;
  busy: boolean;
  hasOffers: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reasons: string) => void;
}

export function CancelSearchSheet({ visible, busy, hasOffers, error, onClose, onConfirm }: Props) {
  const [reasons, setReasons] = useState<Reason[]>([]);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const close = () => {
    if (busy) return;
    setReasons([]);
    onClose();
  };
  const toggleReason = (item: Reason) =>
    setReasons((current) =>
      current.includes(item) ? current.filter((r) => r !== item) : [...current, item],
    );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t('client.homeOffers.cancelConfirmNo')} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text, flex: 1 }]}>{t('client.homeOffers.cancelConfirmTitle')}</Text>
            <Pressable
              onPress={close}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('client.homeOffers.a11y.close')}
              style={styles.closeBtn}
              hitSlop={8}
            >
              <MaterialIcons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t(hasOffers ? 'client.homeOffers.cancelConfirmBody' : 'client.homeOffers.cancelConfirmBodyEmpty')}
          </Text>
          <Text style={[styles.prompt, { color: colors.text }]}>{t('client.homeOffers.cancelReasons.prompt')}</Text>
          <ScrollView style={styles.reasons} keyboardShouldPersistTaps="handled">
            {REASONS.map((item) => {
              const checked = reasons.includes(item);
              return (
                <Pressable
                  key={item}
                  onPress={() => toggleReason(item)}
                  disabled={busy}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: busy }}
                  style={[styles.reason, { borderColor: checked ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.reasonText, { color: colors.text }]}>{t(`client.homeOffers.cancelReasons.${item}`)}</Text>
                  <MaterialIcons name={checked ? 'check-box' : 'check-box-outline-blank'} size={21} color={checked ? colors.primary : colors.textSecondary} />
                </Pressable>
              );
            })}
          </ScrollView>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <Pressable
            style={[styles.confirm, { backgroundColor: colors.error, opacity: !reasons.length || busy ? 0.5 : 1 }]}
            disabled={!reasons.length || busy}
            onPress={() => onConfirm(reasons.join(','))}
            accessibilityRole="button"
          >
            <Text style={styles.confirmText}>{t('client.homeOffers.cancelConfirmYes')}</Text>
          </Pressable>
          <Pressable
            onPress={() => onConfirm('')}
            disabled={busy}
            style={styles.keep}
            accessibilityRole="button"
          >
            <Text style={[styles.keepText, { color: colors.textSecondary }]}>{t('client.homeOffers.cancelConfirmSkip')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  overlay: { 
    flex: 1, 
    justifyContent: 'flex-end', 
    backgroundColor: 'rgba(0,0,0,0.5)' 
  },
  sheet: { 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    paddingHorizontal: 20, 
    paddingTop: 10, 
    maxHeight: '90%' 
  },
  handle: { 
    width: 36, 
    height: 4, 
    borderRadius: 2, 
    alignSelf: 'center', 
    marginBottom: 18 
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  closeBtn: { padding: 4, marginTop: -4 },
  title: { 
    fontSize: 21, 
    fontWeight: '800' 
  },
  subtitle: { 
    fontSize: 14, 
    lineHeight: 20, 
    marginTop: 6 },
  prompt: { fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  reasons: { flexGrow: 0 },
  reason: { 
    minHeight: 48, 
    borderWidth: 0, 
    borderRadius: 12, 
    paddingHorizontal: 14, 
    marginBottom: 8, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    backgroundColor: colors.surface2,  
  },
  reasonText: { fontSize: 14, flex: 1, marginRight: 8 },
  confirm: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  confirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  error: { fontSize: 13, marginTop: 4 },
  keep: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  keepText: { fontWeight: '700', fontSize: 14 },
});
