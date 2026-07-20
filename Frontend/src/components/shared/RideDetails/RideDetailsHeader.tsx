import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
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
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Image
            source={require('../../../assets/icons/back_button/back_button2x.png')}
            style={styles.backIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{t('shared.rideDetail.header.title')}</Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(safeString(status)) }]}>
          <Text style={styles.statusText}>{getStatusText(safeString(status))}</Text>
        </View>
      </View>
      <Text style={styles.rideId}>
        {t('shared.rideDetail.header.rideId', {
          id: typeof rideId === 'string' ? rideId.slice(-8) : safeString(rideId),
        })}
      </Text>
    </View>
  );
}
