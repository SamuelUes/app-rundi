import React from 'react';
import { Text, Pressable, ScrollView } from 'react-native';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import { RRIcon } from '../recurringRides/RRIcon';
import type { TFunction } from 'i18next';
import type { RecurringRide } from '../../../types/recurringRide';

interface ClientRecurringRidesChipsProps {
  rides: RecurringRide[];
  onPressAdd: () => void;
  onPressRide: (ride: RecurringRide) => void;
  onPressManage: () => void;
  styles: any;
  t: TFunction;
}

export function ClientRecurringRidesChips({
  rides,
  onPressAdd,
  onPressRide,
  onPressManage,
  styles,
  t,
}: ClientRecurringRidesChipsProps) {
  const { isDark } = useTheme();
  const chipInk = isDark ? '#F5F1EA' : '#1C1917';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.navChipsScroll}
      contentContainerStyle={styles.navChipsRow}
      fadingEdgeLength={24}
    >
      <Pressable
        style={({ pressed }) => [
          styles.navChip,
          styles.navChipAdd,
          pressed && styles.navChipPressed,
        ]}
        onPress={onPressAdd}
        accessibilityRole="button"
        accessibilityLabel={t('client.recurringRides.addNew')}
        accessibilityHint={t('client.recurringRides.addHint')}
      >
        <RRIcon id="addTrip" size={16} color="#241A09" />
        <Text style={[styles.navChipLabel, styles.navChipAddLabel]}>
          {t('client.recurringRides.addNew')}
        </Text>
      </Pressable>

      {rides.map((ride) => (
        <Pressable
          key={ride.id}
          style={({ pressed }) => [
            styles.navChip,
            pressed && styles.navChipPressed,
          ]}
          onPress={() => onPressRide(ride)}
          accessibilityRole="button"
          accessibilityLabel={ride.title}
        >
          <RRIcon id={ride.vehicleType} size={16} color="#B38737" />
          <Text
            style={[styles.navChipLabel, { color: chipInk }]}
            numberOfLines={1}
          >
            {ride.title}
          </Text>
        </Pressable>
      ))}

      {rides.length > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.navChip,
            pressed && styles.navChipPressed,
          ]}
          onPress={onPressManage}
          accessibilityRole="button"
          accessibilityLabel={t('client.recurringRides.manage')}
        >
          <RRIcon id="manage" size={16} color="#B38737" />
          <Text style={[styles.navChipLabel, { color: chipInk }]}>
            {t('client.recurringRides.manage')}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
