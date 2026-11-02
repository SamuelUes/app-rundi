import React from 'react';
import { View, Text, Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TFunction } from 'i18next';

interface PendingAction {
  title: string;
  icon?: string;
  onPress: () => void;
}

interface RegionStatus {
  checked: boolean;
  allowed: boolean;
  areaName?: string | null;
  message?: string | null;
}

interface HomeScreenBottomActionsProps {
  pendingAction: PendingAction | null;
  isOutsideSupportedArea: boolean;
  regionStatus: RegionStatus;
  scheduledRideNotice?: string | null;
  onRequestRide: () => void;
  recurringChips?: React.ReactNode;
  styles: any;
  t: TFunction;
}

export function HomeScreenBottomActions({
  pendingAction,
  isOutsideSupportedArea,
  regionStatus,
  scheduledRideNotice,
  onRequestRide,
  recurringChips,
  styles,
  t,
}: HomeScreenBottomActionsProps) {
  if (pendingAction) {
    return (
      <View style={styles.bottomStack} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [
            styles.requestButton,
            pressed && styles.requestButtonPressed,
          ]}
          onPress={pendingAction.onPress}
          accessibilityRole="button"
        >
          <Text style={styles.requestButtonLabel} numberOfLines={1}>
            {pendingAction.title}
          </Text>
          <View style={styles.requestArrowDisc}>
            <MaterialIcons
              name={(pendingAction.icon as any) || 'priority-high'}
              size={18}
              color="#241A09"
            />
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.bottomStack} pointerEvents="box-none">
      {scheduledRideNotice ? (
        <View style={styles.scheduledRideChip}>
          <MaterialIcons name="event" size={14} color="#B38737" />
          <Text style={styles.scheduledRideChipText} numberOfLines={2}>
            {scheduledRideNotice}
          </Text>
        </View>
      ) : null}

      <View style={styles.regionHintChip}>
        <MaterialIcons name="place" size={14} color="#B38737" />
        <Text style={styles.regionHintText}>
          {!regionStatus.checked
            ? t('client.home.region.checking')
            : regionStatus.allowed
              ? regionStatus.areaName
                ? t('client.home.region.availableNamed', { area: regionStatus.areaName })
                : t('client.home.region.availableGeneric')
              : regionStatus.message || t('client.home.region.unavailableFallback')}
        </Text>
      </View>

      {recurringChips}

      <Pressable
        style={({ pressed }) => [
          styles.requestButton,
          isOutsideSupportedArea && styles.requestButtonDisabled,
          pressed && styles.requestButtonPressed,
        ]}
        onPress={onRequestRide}
        disabled={isOutsideSupportedArea}
        accessibilityRole="button"
      >
        <Text style={styles.requestButtonLabel}>{t('client.home.requestRide')}</Text>
        <View style={styles.requestArrowDisc}>
          <MaterialIcons name="arrow-forward" size={18} color="#241A09" />
        </View>
      </Pressable>
    </View>
  );
}
