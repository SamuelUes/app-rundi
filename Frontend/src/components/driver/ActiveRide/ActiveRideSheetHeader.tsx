import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface ActiveRideSheetHeaderProps {
  clientPhotoUrl: string | null | undefined;
  clientInitial: string;
  clientName: string;
  fareLabel: string;
  statusLabel: string;
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
  voicePaused,
  colors,
  onOpenChat,
  onCallClient,
  onToggleVoice,
  styles,
  t,
}: ActiveRideSheetHeaderProps) {
  return (
    <View style={styles.sheetHeader}>
      <View style={styles.headerLeft}>
        {clientPhotoUrl ? (
          <Image source={{ uri: clientPhotoUrl }} style={styles.clientPhoto} />
        ) : (
          <View style={[styles.clientPhoto, { backgroundColor: colors.card }]}>
            <Text style={styles.clientInitial}>{clientInitial}</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={[styles.clientName, { color: colors.text }]}>{clientName}</Text>
          <Text style={[styles.priceRow, { color: colors.textSecondary }]}>{fareLabel}</Text>
          <Text style={[styles.statusPill, { color: colors.textSecondary }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={styles.headerRight}>
        <TouchableOpacity onPress={onOpenChat} style={styles.headerAction}>
          <Text style={styles.headerActionText}>💬</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCallClient} style={styles.headerAction}>
          <Text style={styles.headerActionText}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleVoice}
          style={[styles.headerAction, styles.headerActionSmall, voicePaused && styles.headerActionActive]}
          accessibilityLabel={
            voicePaused
              ? t('driver.activeRide.accessibility.resumeVoice')
              : t('driver.activeRide.accessibility.muteVoice')
          }
          accessibilityRole="button"
        >
          <MaterialIcons name={voicePaused ? 'volume-up' : 'volume-off'} size={24} color={colors.textSecondary || '#666'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
