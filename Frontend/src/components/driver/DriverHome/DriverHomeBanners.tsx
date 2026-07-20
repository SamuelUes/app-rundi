import React from 'react';
import { View, Text, TouchableOpacity, ImageBackground } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface PendingPayment {
  rideId: string;
  finalAmount?: number;
  method?: string;
}

interface PendingAction {
  title: string;
  subtitle: string;
  onPress: () => void;
}

interface ActiveRide {
  id: string;
  clientId: string;
  origin: any;
  destination: any;
  finalFare?: number;
  estimatedPrice?: number;
  client?: { name?: string };
  clientName?: string;
  destinationAddress?: string;
}

interface RechargeFundsSummary {
  availableBalance: number;
  blocked: boolean;
}

interface DriverHomeBannersProps {
  activeRide: ActiveRide | null;
  hasPendingAction: boolean;
  hasInsufficientFunds: boolean;
  rechargeFundsSummary: RechargeFundsSummary | null;
  pendingPayments: PendingPayment[];
  pendingAction: PendingAction | null;
  colors: any;
  onActiveRidePress: () => void;
  onRechargePress: () => void;
  onPendingPaymentPress: () => void;
  styles: any;
  t: TFunction;
}

export function DriverHomeBanners({
  activeRide,
  hasPendingAction,
  hasInsufficientFunds,
  rechargeFundsSummary,
  pendingPayments,
  pendingAction,
  colors,
  onActiveRidePress,
  onRechargePress,
  onPendingPaymentPress,
  styles,
  t,
}: DriverHomeBannersProps) {
  return (
    <>
      {activeRide && !hasPendingAction && (
        <TouchableOpacity style={styles.activeRideCard} onPress={onActiveRidePress}>
          <View style={styles.activeRideIconWrapper}>
            <MaterialIcons name="directions-car" size={28} color={colors.primary} />
          </View>
          <View style={styles.activeRideContent}>
            <Text style={styles.activeRideTitle}>
              {t('driver.home.banners.activeRideTitle')}
            </Text>
            <Text style={styles.activeRideSubtitle} numberOfLines={1}>
              {activeRide?.client?.name || activeRide?.clientName || t('driver.home.ride.clientFallback')} ·{' '}
              {activeRide?.destinationAddress || t('driver.home.ride.destinationFallback')}
            </Text>
          </View>
          <Text style={styles.activeRideArrow}>→</Text>
        </TouchableOpacity>
      )}

      {rechargeFundsSummary && hasInsufficientFunds && (
        <TouchableOpacity
          style={[styles.pendingBanner, { backgroundColor: '#E53935' }]}
          onPress={onRechargePress}
        >
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerTitle}>
              {t('driver.home.banners.rechargeTitle')}
            </Text>
            <Text style={styles.pendingBannerSubtitle}>
              {t('driver.home.banners.rechargeSubtitle', {
                amount: Number(rechargeFundsSummary.availableBalance).toFixed(2),
              })}
            </Text>
          </View>
          <Text style={styles.pendingBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingPayments.length > 0 && !hasPendingAction && !hasInsufficientFunds && (
        <TouchableOpacity style={styles.pendingBanner} onPress={onPendingPaymentPress}>
          <View style={styles.pendingBannerIcon}>
            <Text style={styles.pendingBannerEmoji}>💳</Text>
          </View>
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerTitle}>
              {t('driver.home.banners.paymentsTitle')}
            </Text>
            <Text style={styles.pendingBannerSubtitle}>
              {pendingPayments.length === 1
                ? t('driver.home.banners.paymentsSubtitleSingle')
                : t('driver.home.banners.paymentsSubtitleOther', { count: pendingPayments.length })}
            </Text>
          </View>
          <Text style={styles.pendingBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingAction && !hasInsufficientFunds && (
        <TouchableOpacity
          style={styles.pendingActionButton}
          activeOpacity={0.85}
          onPress={pendingAction.onPress}
        >
          <ImageBackground
            source={require('../../../assets/icons/pending_acction/pending_acction2x.png')}
            style={styles.pendingActionImage}
            imageStyle={styles.pendingActionImageInner}
            resizeMode="stretch"
          >
            <View style={styles.pendingActionContent}>
              <View style={styles.pendingActionTextBlock}>
                <Text style={styles.pendingActionTitle}>{pendingAction.title}</Text>
                <Text style={styles.pendingActionSubtitle} numberOfLines={1}>
                  {pendingAction.subtitle}
                </Text>
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      )}
    </>
  );
}
