import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import type { ClientProfile } from '../../../services/clientProfilesService';

interface RidePreviewClientInfoProps {
  resolvedClientName: string;
  estimatedPrice: number;
  clientComment: string | null | undefined;
  clientProfile: ClientProfile | null;
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
  colors,
  isDark,
  formatCurrency,
  onMessageClient,
  onCallClient,
  styles,
  t,
}: RidePreviewClientInfoProps) {
  return (
    <View style={styles.clientRow}>
      <View
        style={[
          styles.avatarPlaceholder,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#ECECEC',
          },
        ]}
      >
        {clientProfile?.photoUrl ? (
          <Image
            source={{ uri: clientProfile.photoUrl }}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.avatarInitials}>
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
        {typeof clientComment === 'string' && clientComment.trim().length > 0 ? (
          <Text style={[styles.clientMetaText, { color: colors.textSecondary }]} numberOfLines={2}>
            {`Nota: ${clientComment.trim()}`}
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
        >
          <MaterialIcons name="chat" size={24} color={colors.textSecondary || '#666'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.iconButton,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#F2F2F2',
            },
          ]}
          onPress={onCallClient}
        >
          <MaterialIcons name="call" size={24} color={colors.textSecondary || '#666'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
