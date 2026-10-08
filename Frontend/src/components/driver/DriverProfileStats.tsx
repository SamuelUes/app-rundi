import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { formatCurrency } from '../../utils/driverProfileHelpers';
import type { TFunction } from 'i18next';

interface DriverProfileStatsProps {
  totalEarnings: number;
  todayEarnings: number;
  totalRides: number;
  todayRides: number;
  averageRating: number;
  styles: any;
  t: TFunction;
}

export function DriverProfileStats({
  totalEarnings,
  todayEarnings,
  totalRides,
  todayRides,
  averageRating,
  styles,
  t,
}: DriverProfileStatsProps) {
  return (
    <View style={styles.profileSection}>
      <View style={styles.profileSectionHeader}>
        <Text style={styles.profileSectionHeading}>{t('driver.profile.stats.walletTitle')}</Text>
        <TouchableOpacity style={styles.rechargeButton}>
          <Text style={styles.rechargeButtonText}>{t('driver.profile.stats.walletCta')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.earningsCardsContainer}>
        <View style={styles.earningsCardsRowTop}>
          <View style={[styles.profileEarningCard, styles.profileEarningCardTop]}>
            <View style={styles.profileEarningIcon}>
              <Text style={styles.earningCardIconText}>💵</Text>
            </View>
            <Text
              style={styles.earningCardValue}
              adjustsFontSizeToFit
              numberOfLines={1}
              minimumFontScale={0.6}
            >
              {formatCurrency(totalEarnings)}
            </Text>
            <Text
              style={styles.earningCardLabel}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t('driver.profile.stats.totalEarnings')}
            </Text>
          </View>
          <View style={[styles.profileEarningCard, styles.profileEarningCardTop]}>
            <View style={styles.profileEarningIcon}>
              <Text style={styles.earningCardIconText}>💰</Text>
            </View>
            <Text
              style={styles.earningCardValue}
              adjustsFontSizeToFit
              numberOfLines={1}
              minimumFontScale={0.6}
            >
              {formatCurrency(todayEarnings)}
            </Text>
            <Text
              style={styles.earningCardLabel}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t('driver.profile.stats.todaysEarnings')}
            </Text>
          </View>
        </View>

        <View style={styles.profileSecondaryStats}>
          <View style={styles.profileSecondaryStat}>
            <Text style={styles.profileSecondaryValue}>{totalRides}</Text>
            <Text style={styles.profileSecondaryLabel}>{t('driver.profile.stats.totalRides')}</Text>
          </View>
          <View style={styles.profileSecondaryStat}>
            <Text style={styles.profileSecondaryValue}>{todayRides}</Text>
            <Text style={styles.profileSecondaryLabel}>{t('driver.profile.stats.todaysRides')}</Text>
          </View>
          <View style={styles.profileSecondaryStat}>
            <Text style={styles.profileSecondaryValue}>
              {(typeof averageRating === 'number' ? averageRating : 5).toFixed(1)}
            </Text>
            <Text style={styles.profileSecondaryLabel}>{t('driver.profile.stats.rating')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
