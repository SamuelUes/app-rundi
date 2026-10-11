import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface AvailableRidesOfflineProps {
  isDark: boolean;
  colors: any;
  activating: boolean;
  onActivate: () => void;
  styles: any;
  t: TFunction;
}

export function AvailableRidesOffline({
  isDark,
  colors,
  activating,
  onActivate,
  styles,
  t,
}: AvailableRidesOfflineProps) {
  return (
    <View
      style={[
        styles.emptyStateCard,
        {
          backgroundColor: isDark ? '#1D1D1D' : '#FFFFFF',
          borderColor: isDark ? '#333333' : '#E9E9E9',
        },
      ]}
    >
      <View
        style={[
          styles.emptyStateGlow,
          { backgroundColor: isDark ? 'rgba(212,175,55,0.18)' : '#F9EDCC' },
        ]}
      />

      <View style={styles.radarWrap}>
        <View
          style={[
            styles.radarCoreOuter,
            { backgroundColor: isDark ? 'rgba(212,175,55,0.14)' : 'rgba(179,135,55,0.10)' },
          ]}
        >
          <View
            style={[
              styles.radarCoreInner,
              { backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : 'rgba(179,135,55,0.16)' },
            ]}
          >
            <MaterialIcons name="visibility-off" size={30} color={colors.primary} />
          </View>
        </View>
      </View>

      <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
        {t('driver.available.offline.title')}
      </Text>
      <Text style={[styles.emptyStateMessage, { color: colors.text + '99' }]}>
        {t('driver.available.offline.message')}
      </Text>

      <TouchableOpacity
        onPress={onActivate}
        disabled={activating}
        style={[
          styles.emptyStateButton,
          { backgroundColor: colors.primary },
          activating && { opacity: 0.7 },
        ]}
        activeOpacity={0.86}
        accessibilityRole="button"
      >
        {activating ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <MaterialIcons name="visibility" size={16} color="#FFFFFF" />
        )}
        <Text style={styles.emptyStateButtonText}>
          {activating
            ? t('driver.available.offline.activating')
            : t('driver.available.offline.action')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
