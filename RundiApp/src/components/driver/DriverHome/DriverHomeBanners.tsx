import React from 'react';
import { View, Text, Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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

type BannerVariant = 'danger' | 'gold' | 'ink';

interface BannerRowProps {
  variant: BannerVariant;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  styles: any;
}

function BannerRow({ variant, icon, title, subtitle, onPress, styles }: BannerRowProps) {
  const onGold = variant === 'gold';
  const discStyle =
    variant === 'ink'
      ? styles.bannerIconDiscOnInk
      : onGold
        ? styles.bannerIconDiscOnGold
        : styles.bannerIconDiscOnColor;
  const contentColor = onGold ? '#241A09' : variant === 'ink' ? '#D8A15F' : '#FFFFFF';
  const textColor = onGold ? '#241A09' : '#FFFFFF';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.banner,
        variant === 'danger' && styles.bannerDanger,
        variant === 'gold' && styles.bannerGold,
        variant === 'ink' && styles.bannerInk,
        pressed && styles.bannerPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[styles.bannerIconDisc, discStyle]}>
        <MaterialIcons name={icon} size={22} color={contentColor} />
      </View>
      <View style={styles.bannerTextCol}>
        <Text
          style={[styles.bannerTitle, onGold ? styles.bannerTitleDark : styles.bannerTitleLight]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {Boolean(subtitle) && (
          <Text
            style={[
              styles.bannerSubtitle,
              onGold ? styles.bannerSubtitleDark : styles.bannerSubtitleLight,
            ]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <View style={[styles.bannerChevron, onGold ? styles.bannerChevronDark : styles.bannerChevronLight]}>
        <MaterialIcons name="chevron-right" size={18} color={textColor} />
      </View>
    </Pressable>
  );
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
  onActiveRidePress,
  onRechargePress,
  onPendingPaymentPress,
  styles,
  t,
}: DriverHomeBannersProps) {
  const showActiveRide = Boolean(activeRide) && !hasPendingAction;
  const showInsufficientFunds = Boolean(rechargeFundsSummary) && hasInsufficientFunds;
  const showPendingPayments =
    pendingPayments.length > 0 && !hasPendingAction && !hasInsufficientFunds;
  const showPendingAction = Boolean(pendingAction) && !hasInsufficientFunds;

  if (!showActiveRide && !showInsufficientFunds && !showPendingPayments && !showPendingAction) {
    return null;
  }

  return (
    <View style={styles.bannerStack} pointerEvents="box-none">
      {showInsufficientFunds && rechargeFundsSummary && (
        <BannerRow
          variant="danger"
          icon="account-balance-wallet"
          title={t('driver.home.banners.rechargeTitle')}
          subtitle={t('driver.home.banners.rechargeSubtitle', {
            amount: Number(rechargeFundsSummary.availableBalance).toFixed(2),
          })}
          onPress={onRechargePress}
          styles={styles}
        />
      )}

      {showPendingAction && pendingAction && (
        <BannerRow
          variant="gold"
          icon="pending-actions"
          title={pendingAction.title}
          subtitle={pendingAction.subtitle}
          onPress={pendingAction.onPress}
          styles={styles}
        />
      )}

      {showPendingPayments && (
        <BannerRow
          variant="gold"
          icon="payments"
          title={t('driver.home.banners.paymentsTitle')}
          subtitle={
            pendingPayments.length === 1
              ? t('driver.home.banners.paymentsSubtitleSingle')
              : t('driver.home.banners.paymentsSubtitleOther', { count: pendingPayments.length })
          }
          onPress={onPendingPaymentPress}
          styles={styles}
        />
      )}

      {showActiveRide && activeRide && (
        <BannerRow
          variant="ink"
          icon="directions-car"
          title={t('driver.home.banners.activeRideTitle')}
          subtitle={`${activeRide?.client?.name || activeRide?.clientName || t('driver.home.ride.clientFallback')} · ${activeRide?.destinationAddress || t('driver.home.ride.destinationFallback')}`}
          onPress={onActiveRidePress}
          styles={styles}
        />
      )}
    </View>
  );
}
