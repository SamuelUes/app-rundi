import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../ui/LoadingIcon';
import { DriverHomeNavChips } from './DriverHomeNavChips';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
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
  availableRequestsCount: number;
  onToggleAvailability: () => void;
  onToggleDesignated: () => void;
  onNavigateAvailableRides: () => void;
  onNavigateEarnings: () => void;
  onNavigate: (route: any) => void;
  onLogout: () => void;
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
  availableRequestsCount,
  onToggleAvailability,
  onToggleDesignated,
  onNavigateAvailableRides,
  onNavigateEarnings,
  onNavigate,
  onLogout,
  styles,
  t,
}: DriverHomeBottomBarProps) {
  const { isDark } = useTheme();
  const compact = hasPendingAction || hasInsufficientFunds;
  const iconMuted = isDark ? 'rgba(28,25,23,0.55)' : 'rgba(255,255,255,0.72)';

  return (
    <View style={styles.bottomBar} pointerEvents="box-none">
      {userRole === 'designated_driver' && (
        <Pressable
          style={({ pressed }) => [
            styles.designatedChip,
            isDesignatedDriverMode && styles.designatedChipActive,
            !isAvailable && styles.designatedChipDisabled,
            pressed && { opacity: 0.85 },
          ]}
          disabled={!isAvailable}
          onPress={onToggleDesignated}
          accessibilityRole="button"
          accessibilityLabel={t('driver.home.designated.activeLabel')}
          accessibilityState={{ checked: isDesignatedDriverMode, disabled: !isAvailable }}
        >
          <Ionicons
            name="car-sport"
            size={16}
            color={isDesignatedDriverMode ? '#efc069' : iconMuted}
          />
          <Text
            style={[
              styles.designatedChipLabel,
              isDesignatedDriverMode && styles.designatedChipLabelActive,
            ]}
          >
            {t('driver.home.designated.activeLabel')}
          </Text>
          <View
            style={[
              styles.designatedSwitchTrack,
              isDesignatedDriverMode && styles.designatedSwitchTrackOn,
            ]}
          >
            <View
              style={[
                styles.designatedSwitchThumb,
                isDesignatedDriverMode && styles.designatedSwitchThumbOn,
              ]}
            />
          </View>
        </Pressable>
      )}

      <DriverHomeNavChips
        userRole={userRole}
        onNavigate={onNavigate}
        onLogout={onLogout}
        styles={styles}
        t={t}
      />

      <View style={[styles.dock, compact && styles.dockCompact]}>
        <Pressable
          style={({ pressed }) => [
            styles.availabilityButton,
            isAvailable ? styles.availabilityButtonOn : styles.availabilityButtonOff,
            pressed && styles.availabilityPressed,
          ]}
          onPress={onToggleAvailability}
          disabled={updatingStatus}
          accessibilityRole="button"
          accessibilityLabel={t(
            isAvailable ? 'driver.home.status.online' : 'driver.home.status.offline',
          )}
        >
          <MaterialIcons
            name={isAvailable ? 'check' : 'power-settings-new'}
            size={26}
            color={isAvailable ? '#241A09' : iconMuted}
          />
          {updatingStatus && (
            <View style={styles.availabilityLoadingOverlay}>
              <LoadingIcon icon="refresh" size={20} color="#FFFFFF" animation="spin" />
            </View>
          )}
        </Pressable>

        {!compact && (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.earningsArea,
                pressed && styles.earningsAreaPressed,
              ]}
              onPress={onNavigateEarnings}
              accessibilityRole="button"
            >
              <Text style={styles.earningsLabel}>
                {t('driver.home.stats.totalToday')}
              </Text>
              <Text style={styles.earningsValue}>{formatCurrency(todayEarnings)}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.requestsButton,
                pressed && styles.requestsButtonPressed,
              ]}
              onPress={onNavigateAvailableRides}
              accessibilityRole="button"
            >
              <Text style={styles.requestsLabel}>
                {t('driver.home.cta.viewRequests')}
              </Text>
              {availableRequestsCount > 0 && (
                <View style={styles.requestsBadge}>
                  <Text style={styles.requestsBadgeText}>
                    {availableRequestsCount > 99 ? '99+' : availableRequestsCount}
                  </Text>
                </View>
              )}
              <MaterialIcons name="arrow-forward" size={17} color="#241A09" />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
