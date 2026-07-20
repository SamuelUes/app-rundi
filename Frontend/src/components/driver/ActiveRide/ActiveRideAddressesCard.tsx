import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import type { TFunction } from 'i18next';

interface ActiveRideAddressesCardProps {
  originAddress: string | undefined;
  destinationAddress: string | undefined;
  extraDestinations: any[] | undefined;
  originPin: any;
  multiStopPin: any;
  destinationPin: any;
  etaMinutesLabel: string;
  etaDistanceLabel: string;
  colors: any;
  onNavigate: () => void;
  styles: any;
  t: TFunction;
}

export function ActiveRideAddressesCard({
  originAddress,
  destinationAddress,
  extraDestinations,
  originPin,
  multiStopPin,
  destinationPin,
  etaMinutesLabel,
  etaDistanceLabel,
  colors,
  onNavigate,
  styles,
  t,
}: ActiveRideAddressesCardProps) {
  return (
    <View style={[styles.addressesCard, { backgroundColor: colors.card }]}>
      <View style={styles.addressesLeftCol}>
        <Image source={originPin} style={styles.listPinImage} />
        {extraDestinations?.map?.((_: any, idx: number) => (
          <Image key={`pin-${idx}`} source={multiStopPin} style={styles.listPinImage} />
        ))}
        <Image source={destinationPin} style={styles.listPinImage} />
      </View>
      <View style={styles.addressesRightCol}>
        <View style={styles.addressRow}>
          <Text numberOfLines={2} style={[styles.addressRowText, { color: colors.text }]}>
            {originAddress || t('driver.activeRide.labels.originFallback')}
          </Text>
        </View>
        {extraDestinations?.map?.((w: any, i: number) => (
          <View key={`addr-${i}`} style={styles.addressRow}>
            <Text numberOfLines={2} style={[styles.addressRowText, { color: colors.text }]}>
              {w?.address || t('driver.activeRide.labels.stopLabel', { index: i + 1 })}
            </Text>
          </View>
        ))}
        <View style={styles.addressRow}>
          <Text numberOfLines={2} style={[styles.addressRowText, { color: colors.text }]}>
            {destinationAddress || t('driver.activeRide.labels.destinationFallback')}
          </Text>
        </View>
      </View>
      <View style={styles.addressesSideActions}>
        <TouchableOpacity style={[styles.navButtonGreen, { backgroundColor: '#4CAF50' }]} onPress={onNavigate}>
          <Text style={styles.navButtonText}>
            {t('driver.activeRide.navigation.button')}
          </Text>
        </TouchableOpacity>
        <View style={[styles.etaMiniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.etaTitle, { color: colors.textSecondary }]}>
            {t('driver.activeRide.labels.estimatedTitle')}
          </Text>
          <Text style={[styles.etaValue, { color: colors.text }]}>{etaMinutesLabel}</Text>
          <Text style={[styles.etaMeta, { color: colors.textSecondary }]}>{etaDistanceLabel}</Text>
        </View>
      </View>
    </View>
  );
}
