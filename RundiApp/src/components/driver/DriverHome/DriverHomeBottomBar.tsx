import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../ui/LoadingIcon';
import { DriverHomeNavChips } from './DriverHomeNavChips';
import { BannerRow, InsufficientFundsBanner } from './DriverHomeBanners';
import type { RechargeFundsSummary } from './DriverHomeBanners';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import type { TFunction } from 'i18next';

interface DriverHomeBottomBarProps {
  userRole: string | undefined;
  isAvailable: boolean;
  isDesignatedDriverMode: boolean;
  updatingStatus: boolean;
  hasPendingAction: boolean;
  hasInsufficientFunds: boolean;
  rechargeFundsSummary: RechargeFundsSummary | null;
  onRechargePress: () => void;
  banners?: React.ReactNode;
  todayEarnings: number;
  formatCurrency: (value?: number) => string;
  availableRequestsCount: number;
  onToggleAvailability: () => void;
  onToggleDesignated: () => void;
  onNavigateAvailableRides: () => void;
  onNavigateEarnings: () => void;
  onNavigate: (route: any) => void;
  crewChip?: React.ReactNode;
  pendingAction?: { title: string; subtitle: string; onPress: () => void } | null;
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
  rechargeFundsSummary,
  onRechargePress,
  banners,
  todayEarnings,
  formatCurrency,
  availableRequestsCount,
  onToggleAvailability,
  onToggleDesignated,
  onNavigateAvailableRides,
  onNavigateEarnings,
  onNavigate,
  crewChip,
  pendingAction,
  styles,
  t,
}: DriverHomeBottomBarProps) {
  const { isDark } = useTheme();
  const iconMuted = isDark ? 'rgba(28,25,23,0.55)' : 'rgba(255,255,255,0.72)';

  return (
    <View style={styles.bottomBar} pointerEvents="box-none">
      {userRole === 'designated_driver' && (
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-start', flexWrap: 'wrap' }}>
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
          {crewChip}
        </View>
      )}

      <DriverHomeNavChips
        userRole={userRole}
        onNavigate={onNavigate}
        styles={styles}
        t={t}
      />

      {banners}

      {pendingAction && (
        <BannerRow
          variant="gold"
          icon="pending-actions"
          title={pendingAction.title}
          subtitle={pendingAction.subtitle}
          onPress={pendingAction.onPress}
          styles={styles}
        />
      )}

      {/* Banner de fondos pegado al botón de disponibilidad (contexto del gate) */}
      {hasInsufficientFunds && (
        <InsufficientFundsBanner
          summary={rechargeFundsSummary}
          onPress={onRechargePress}
          styles={styles}
          t={t}
        />
      )}

      {/* Sin fondos el conductor no puede ir online: se oculta el dock y el
          banner de recarga queda abajo como la acción principal. */}
      {!hasPendingAction && !hasInsufficientFunds && (
      <View style={styles.dock}>
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
      </View>
      )}
    </View>
  );
}
