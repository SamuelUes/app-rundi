import React from 'react';
import { View, Text, TouchableOpacity, Image, ImageBackground, Animated } from 'react-native';
import type { TFunction } from 'i18next';

interface PendingAction {
  title: string;
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
  pendingActionImage: any;
  onRequestRide: () => void;
  styles: any;
  t: TFunction;
}

export function HomeScreenBottomActions({
  pendingAction,
  isOutsideSupportedArea,
  regionStatus,
  pendingActionImage,
  onRequestRide,
  styles,
  t,
}: HomeScreenBottomActionsProps) {
  if (pendingAction) {
    return (
      <TouchableOpacity
        style={styles.pendingActionButton}
        activeOpacity={0.9}
        onPress={pendingAction.onPress}
      >
        <ImageBackground
          source={pendingActionImage}
          style={styles.pendingActionBackground}
          imageStyle={styles.pendingActionBackgroundInner}
          resizeMode="stretch"
        >
          <View style={styles.requestButtonContent}>
            <Text style={styles.requestButtonLabel}>{pendingAction.title}</Text>
          </View>
        </ImageBackground>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[
          styles.requestButtonWrapper,
          isOutsideSupportedArea && styles.requestButtonDisabled,
        ]}
        activeOpacity={0.9}
        onPress={onRequestRide}
        disabled={isOutsideSupportedArea}
      >
        <ImageBackground
          source={pendingActionImage}
          style={styles.requestButtonBackground}
          imageStyle={styles.requestButtonBackgroundInner}
          resizeMode="stretch"
        >
          <View style={styles.requestButtonContent}>
            <Text style={styles.requestButtonLabel}>{t('client.home.requestRide')}</Text>
          </View>
        </ImageBackground>
      </TouchableOpacity>
      <View style={styles.regionHintContainer}>
        <Text style={styles.regionHintText} numberOfLines={2}>
          {!regionStatus.checked
            ? t('client.home.region.checking')
            : regionStatus.allowed
            ? regionStatus.areaName
              ? t('client.home.region.availableNamed', { area: regionStatus.areaName })
              : t('client.home.region.availableGeneric')
            : regionStatus.message || t('client.home.region.unavailableFallback')}
        </Text>
      </View>
    </>
  );
}
