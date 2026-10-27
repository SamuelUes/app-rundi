import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import type { CrewMemberSnapshot, CrewMembership } from '../../../types/designatedCrew';

interface DesignatedCrewChipProps {
  membership: CrewMembership | null;
  partner: CrewMemberSnapshot | null;
  disabled: boolean;
  onAdd: () => void;
  onUnpair: () => void;
  styles: any;
  t: TFunction;
}

export function DesignatedCrewChip({ membership, partner, disabled, onAdd, onUnpair, styles, t }: DesignatedCrewChipProps) {
  if (!membership) {
    return (
      <Pressable
        style={({ pressed }) => [styles.designatedChip, disabled && styles.designatedChipDisabled, pressed && { opacity: 0.85 }]}
        disabled={disabled}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t('driver.crew.addColleague')}
      >
        <Ionicons name="person-add" size={16} color="#efc069" />
        <Text style={styles.designatedChipLabel}>{t('driver.crew.addColleague')}</Text>
      </Pressable>
    );
  }

  const isFollower = membership.role === 'follower';
  const label = isFollower
    ? t('driver.crew.following', { name: partner?.name ?? '' })
    : t('driver.crew.colleague', { name: partner?.name ?? '' });
  const inRide = !!membership.currentRideId;

  return (
    <View style={[styles.designatedChip, styles.designatedChipActive]}>
      <Ionicons name="people" size={16} color="#efc069" />
      <Text style={[styles.designatedChipLabel, styles.designatedChipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      <Pressable
        onPress={onUnpair}
        disabled={inRide}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(isFollower ? 'driver.crew.leave' : 'driver.crew.unpair')}
        style={inRide ? { opacity: 0.4 } : undefined}
      >
        <Ionicons name="close-circle" size={18} color="#efc069" />
      </Pressable>
    </View>
  );
}
