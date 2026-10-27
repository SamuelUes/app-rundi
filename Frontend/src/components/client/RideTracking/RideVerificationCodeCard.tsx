import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';

interface RideVerificationCodeCardProps {
  code: string | null | undefined;
  visible: boolean;
  top: number;
}

export function RideVerificationCodeCard({
  code,
  visible,
  top,
}: RideVerificationCodeCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!visible || !code) return null;

  const digits = String(code).padStart(4, '0').slice(0, 4).split('');

  return (
    <View pointerEvents="box-none" style={[styles.position, { top }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.primary,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <MaterialIcons name="pin" size={13} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {t('shared.rideTracking.verificationCode.title')}
          </Text>
        </View>
        <View style={styles.digitsRow}>
          {digits.map((digit, index) => (
            <View
              key={index}
              style={[styles.digitBox, { borderColor: colors.primary, backgroundColor: `${colors.primary}26` }]}
            >
              <Text style={[styles.digitText, { color: colors.text }]}>{digit}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    left: 72, // a la derecha del botón de regresar (16 + 46 + 10)
    right: 16,
    zIndex: 20,
  },
  card: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.3,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  digitsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  digitBox: {
    width: 38,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
