import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  AccessibilityInfo,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface AvailableRidesEmptyProps {
  isDark: boolean;
  colors: any;
  refreshing: boolean;
  onRefresh: () => void;
  styles: any;
  t: TFunction;
}

const PULSE_DURATION_MS = 2600;

export function AvailableRidesEmpty({
  isDark,
  colors,
  refreshing,
  onRefresh,
  styles,
  t,
}: AvailableRidesEmptyProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(Boolean(enabled));
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const ringProgress = [pulse, Animated.modulo(Animated.add(pulse, 0.5), 1)];

  const ringColor = isDark ? 'rgba(212,175,55,0.55)' : 'rgba(179,135,55,0.4)';

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
        {!reduceMotion
          ? ringProgress.map((progress, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.radarRing,
                  {
                    borderColor: ringColor,
                    opacity: progress.interpolate({
                      inputRange: [0, 0.15, 1],
                      outputRange: [0, 0.5, 0],
                    }),
                    transform: [
                      {
                        scale: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.55, 1.8],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))
          : null}
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
            <MaterialIcons name="directions-car" size={30} color={colors.primary} />
          </View>
        </View>
      </View>

      <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
        {t('common.components.emptyState.noRides.title')}
      </Text>
      <Text style={[styles.emptyStateMessage, { color: colors.text + '99' }]}>
        {t('common.components.emptyState.noRides.message')}
      </Text>

      <TouchableOpacity
        onPress={onRefresh}
        style={[styles.emptyStateButton, { backgroundColor: colors.primary }]}
        activeOpacity={0.86}
        accessibilityRole="button"
      >
        {refreshing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <MaterialIcons name="refresh" size={16} color="#FFFFFF" />
        )}
        <Text style={styles.emptyStateButtonText}>
          {t('common.components.emptyState.noRides.action')}
        </Text>
      </TouchableOpacity>

      <View style={styles.emptyHintRow}>
        <MaterialIcons name="arrow-downward" size={12} color={colors.text + '66'} />
        <Text style={[styles.emptyHintText, { color: colors.text + '66' }]}>
          {t('driver.available.empty.hint')}
        </Text>
      </View>
    </View>
  );
}
