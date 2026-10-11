import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import StorageImage from '../../shared/StorageImage';
import type { TFunction } from 'i18next';

interface ActiveRideSheetHeaderProps {
  clientPhotoUrl: string | null | undefined;
  clientInitial: string;
  clientName: string;
  fareLabel: string;
  statusLabel: string;
  statusColor: string;
  paymentMethod: 'cash' | 'card' | null | undefined;
  paymentLabel: string | null;
  canCall: boolean;
  voicePaused: boolean;
  colors: any;
  onOpenChat: () => void;
  onCallClient: () => void;
  onToggleVoice: () => void;
  styles: any;
  t: TFunction;
}

export function ActiveRideSheetHeader({
  clientPhotoUrl,
  clientInitial,
  clientName,
  fareLabel,
  statusLabel,
  statusColor,
  paymentMethod,
  paymentLabel,
  canCall,
  voicePaused,
  colors,
  onOpenChat,
  onCallClient,
  onToggleVoice,
  styles,
  t,
}: ActiveRideSheetHeaderProps) {
  const paymentIcon =
    paymentMethod === 'cash'
      ? 'payments'
      : paymentMethod === 'card'
        ? 'credit-card'
        : null;

  return (
    <View style={styles.sheetHeader}>
      <View style={styles.headerTopRow}>
        <View style={styles.headerLeft}>
          {clientPhotoUrl ? (
            <StorageImage uri={clientPhotoUrl} style={styles.clientPhoto} />
          ) : (
            <View style={[styles.clientPhoto, { backgroundColor: `${colors.primary}1F` }]}>
              <Text style={[styles.clientInitial, { color: colors.primary }]}>
                {clientInitial}
              </Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={[styles.clientName, { color: colors.text }]}>
              {clientName}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={onOpenChat}
            style={styles.headerAction}
            hitSlop={4}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('driver.activeRide.accessibility.openChat')}
          >
            <MaterialIcons name="chat-bubble-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          {canCall && (
            <TouchableOpacity
              onPress={onCallClient}
              style={styles.headerAction}
              hitSlop={4}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('driver.activeRide.accessibility.callClient')}
            >
              <MaterialIcons name="call" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onToggleVoice}
            style={[styles.headerAction, !voicePaused && styles.headerActionActive]}
            hitSlop={4}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: !voicePaused }}
            accessibilityLabel={
              voicePaused
                ? t('driver.activeRide.accessibility.resumeVoice')
                : t('driver.activeRide.accessibility.muteVoice')
            }
          >
            <MaterialIcons
              name={voicePaused ? 'volume-off' : 'volume-up'}
              size={20}
              color={voicePaused ? colors.textSecondary : colors.primary}
            />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.headerMetaRow}>
        <View
          style={[
            styles.statusChip,
            { backgroundColor: `${statusColor}1F`, borderColor: `${statusColor}40` },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text numberOfLines={1} style={[styles.statusChipText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.fareText, { color: colors.text }]}>
          {fareLabel}
        </Text>
        {paymentLabel && paymentIcon && (
          <View style={styles.paymentChip}>
            <MaterialIcons name={paymentIcon} size={12} color={colors.textSecondary} />
            <Text numberOfLines={1} style={[styles.paymentChipText, { color: colors.textSecondary }]}>
              {paymentLabel}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
