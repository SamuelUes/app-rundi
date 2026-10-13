import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import type { TFunction } from 'i18next';

interface RideDetailsHeaderProps {
  rideId: string;
  status: string;
  getStatusColor: (status: string) => string;
  getStatusText: (status: string) => string;
  safeString: (value: any, fallback?: string) => string;
  onBack: () => void;
  t: TFunction;
  styles: any;
}

export function RideDetailsHeader({
  rideId,
  status,
  getStatusColor,
  getStatusText,
  safeString,
  onBack,
  t,
  styles,
}: RideDetailsHeaderProps) {
  const { colors } = useTheme();
  const statusColor = getStatusColor(safeString(status));

  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{t('shared.rideDetail.header.title')}</Text>
          <Text style={styles.rideId}>
            {t('shared.rideDetail.header.rideId', {
              id: typeof rideId === 'string' ? rideId.slice(-8) : safeString(rideId),
            })}
          </Text>
        </View>

        <View style={[styles.statusPill, { backgroundColor: statusColor + '26' }]}>
          <View style={[styles.statusPillDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusPillText, { color: statusColor }]}>
            {getStatusText(safeString(status))}
          </Text>
        </View>
      </View>
    </View>
  );
}
