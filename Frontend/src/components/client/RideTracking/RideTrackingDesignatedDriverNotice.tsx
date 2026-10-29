import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';

interface RideTrackingDesignatedDriverNoticeProps {
  visible: boolean;
  top: number;
  onDismiss: () => void;
}

export function RideTrackingDesignatedDriverNotice({
  visible,
  top,
  onDismiss,
}: RideTrackingDesignatedDriverNoticeProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={[styles.position, { top }]}>
      <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}1A` }]}>
          <MaterialIcons name="verified-user" size={20} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>{t('shared.rideTracking.designatedNotice.title')}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{t('shared.rideTracking.designatedNotice.body')}</Text>
        </View>
        <Pressable
          style={styles.dismiss}
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('shared.rideTracking.designatedNotice.dismiss')}
        >
          <MaterialIcons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 20,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: 'rgba(0,0,0,0.18)',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 13, fontWeight: '800' },
  body: { fontSize: 12, lineHeight: 17 },
  dismiss: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
