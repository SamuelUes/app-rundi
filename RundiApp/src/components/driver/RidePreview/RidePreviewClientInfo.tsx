import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import StorageImage from '../../shared/StorageImage';
import type { TFunction } from 'i18next';
import type { ClientProfile } from '../../../services/user/clientProfilesService';

interface RidePreviewClientInfoProps {
  resolvedClientName: string;
  estimatedPrice: number;
  clientComment: string | null | undefined;
  clientProfile: ClientProfile | null;
  distanceKm?: number | null;
  durationMin?: number | null;
  paymentMethod?: 'cash' | 'card' | null;
  colors: any;
  isDark: boolean;
  formatCurrency: (value?: number | null) => string;
  onMessageClient: () => void;
  onCallClient: () => void;
  styles: any;
  t: TFunction;
}

export function RidePreviewClientInfo({
  resolvedClientName,
  estimatedPrice,
  clientComment,
  clientProfile,
  distanceKm,
  durationMin,
  paymentMethod,
  colors,
  isDark,
  formatCurrency,
  onMessageClient,
  onCallClient,
  styles,
  t,
}: RidePreviewClientInfoProps) {
  const tripMetaParts: string[] = [];
  if (typeof distanceKm === 'number' && Number.isFinite(distanceKm) && distanceKm > 0) {
    tripMetaParts.push(
      t('driver.ridePreview.labels.tripDistance', { value: distanceKm.toFixed(1) }),
    );
  }
  if (typeof durationMin === 'number' && Number.isFinite(durationMin) && durationMin > 0) {
    tripMetaParts.push(t('driver.ridePreview.labels.tripDuration', { value: durationMin }));
  }
  if (paymentMethod === 'cash') {
    tripMetaParts.push(t('driver.ridePreview.labels.paymentCash'));
  } else if (paymentMethod === 'card') {
    tripMetaParts.push(t('driver.ridePreview.labels.paymentCard'));
  }
  const tripMeta = tripMetaParts.join(' • ');
  const designatedNoteKey = 'shared.searchRide.notes.designatedDriver';
  const normalizedClientComment =
    typeof clientComment === 'string'
      ? clientComment.split(designatedNoteKey).join(t(designatedNoteKey))
      : '';

  return (
    <View style={styles.clientRow}>
      <View
        style={[
          styles.avatarPlaceholder,
          {
            backgroundColor: isDark ? 'rgba(179,135,55,0.30)' : '#F1E4C8',
          },
        ]}
      >
        {clientProfile?.photoUrl ? (
          <StorageImage
            uri={clientProfile.photoUrl}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={[styles.avatarInitials, { color: colors.primary }]}>
            {resolvedClientName
              .split(' ')
              .map((part) => part.charAt(0).toUpperCase())
              .slice(0, 2)
              .join('')}
          </Text>
        )}
      </View>
      <View style={styles.clientInfo}>
        <Text style={[styles.clientNameText, { color: colors.text }]} numberOfLines={1}>
          {resolvedClientName}
        </Text>
        <Text style={[styles.clientMetaText, { color: colors.textSecondary }]}>
          {t('driver.ridePreview.labels.estimatedPrice', {
            amount: formatCurrency(estimatedPrice),
          })}
        </Text>
        {tripMeta.length > 0 ? (
          <Text style={[styles.clientTripMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {tripMeta}
          </Text>
        ) : null}
        {normalizedClientComment.trim().length > 0 ? (
          <Text style={[styles.clientNoteText, { color: colors.textSecondary }]} numberOfLines={2}>
            {t('driver.ridePreview.labels.clientNote', { note: normalizedClientComment.trim() })}
          </Text>
        ) : null}
      </View>
      <View style={styles.contactActions}>
        <TouchableOpacity
          style={[
            styles.iconButton,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#F2F2F2',
            },
          ]}
          onPress={onMessageClient}
          accessibilityRole="button"
          accessibilityLabel={t('driver.ridePreview.accessibility.messageClient')}
        >
          <MaterialIcons name="chat" size={22} color={colors.textSecondary || '#666'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconButton,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#F2F2F2',
            },
          ]}
          onPress={onCallClient}
          accessibilityRole="button"
          accessibilityLabel={t('driver.ridePreview.accessibility.callClient')}
        >
          <MaterialIcons name="call" size={22} color={colors.textSecondary || '#666'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
