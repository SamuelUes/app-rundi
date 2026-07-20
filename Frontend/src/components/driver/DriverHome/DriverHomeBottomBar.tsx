import React from 'react';
import { View, Text, TouchableOpacity, Image, ImageBackground } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface DriverHomeBottomBarProps {
  userRole: string | undefined;
  isAvailable: boolean;
  isDesignatedDriverMode: boolean;
  updatingStatus: boolean;
  hasPendingAction: boolean;
  hasInsufficientFunds: boolean;
  todayEarnings: number;
  formatCurrency: (value?: number) => string;
  onToggleAvailability: () => void;
  onToggleDesignated: () => void;
  onNavigateAvailableRides: () => void;
  styles: any;
  t: TFunction;
}

export function DriverHomeBottomBar({
  userRole,
  isAvailable,
  isDesignatedDriverMode,
  updatingStatus,
  hasPendingAction,
  hasInsufficientFunds,
  todayEarnings,
  formatCurrency,
  onToggleAvailability,
  onToggleDesignated,
  onNavigateAvailableRides,
  styles,
  t,
}: DriverHomeBottomBarProps) {
  return (
    <View style={styles.bottomBar} pointerEvents="box-none">
      {userRole === 'designated_driver' && (
        <View style={styles.designatedToggleContainer}>
          <View style={styles.iconButtonWrapper}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!isAvailable}
              onPress={onToggleDesignated}
            >
              <View style={styles.designatedButton}>
                <Image
                  source={
                    isDesignatedDriverMode
                      ? require('../../../assets/icons/ready_status/readydesignado3x.png')
                      : require('../../../assets/icons/ready_status/unready3x.png')
                  }
                  style={[styles.statusImage, !isAvailable && styles.disabledImage]}
                />
                {isDesignatedDriverMode && (
                  <Text style={styles.designatedStatusLabel}>{t('driver.home.designated.activeLabel')}</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.controlsRow} pointerEvents="box-none">
        <View style={styles.iconButtonWrapper}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onToggleAvailability}
            disabled={updatingStatus}
          >
            <View style={styles.statusButtonContainer}>
              <Image
                source={
                  isAvailable
                    ? require('../../../assets/icons/ready_status/ready3x.png')
                    : require('../../../assets/icons/ready_status/unready3x.png')
                }
                style={[styles.statusImage, updatingStatus && styles.statusImageDim]}
              />
              {updatingStatus && (
                <View style={styles.statusLoadingOverlay}>
                  <LoadingIcon icon="refresh" size={20} color="#FFFFFF" animation="spin" />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {!hasPendingAction && !hasInsufficientFunds && (
          <View style={styles.earningsSplitContainer}>
            <View style={[styles.earningsButton, styles.earningsStatsCard]}>
              <ImageBackground
                source={require('../../../assets/icons/driver_home_bar/driver_home_net2x.png')}
                style={styles.earningsImage}
                imageStyle={styles.earningsImageInner}
                resizeMode="stretch"
              >
                <View style={styles.earningsLeft}>
                  <View style={styles.earningsBadge}>
                    <Text style={styles.earningsBadgeLabel}>{t('driver.home.stats.totalToday')}</Text>
                  </View>
                  <Text style={styles.earningsValue}>{formatCurrency(todayEarnings)}</Text>
                </View>
              </ImageBackground>
            </View>

            <TouchableOpacity
              style={[styles.earningsButton, styles.requestsButton]}
              activeOpacity={0.85}
              onPress={onNavigateAvailableRides}
            >
              <ImageBackground
                source={require('../../../assets/icons/driver_home_bar/driver_requests2x.png')}
                style={styles.earningsImage}
                imageStyle={styles.earningsImageInner}
                resizeMode="stretch"
              >
                <View style={styles.earningsRequestsContent}>
                  <Text style={styles.earningsCta}>{t('driver.home.cta.viewRequests')}</Text>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
