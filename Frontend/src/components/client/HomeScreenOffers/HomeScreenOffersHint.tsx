import React from 'react';
import { Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TFunction } from 'i18next';

interface HomeScreenOffersHintProps {
  hasOffers: boolean;
  hasSelection: boolean;
  isDark: boolean;
  styles: any;
  t: TFunction;
}

export function HomeScreenOffersHint({
  hasOffers,
  hasSelection,
  isDark,
  styles,
  t,
}: HomeScreenOffersHintProps) {
  const insets = useSafeAreaInsets();

  if (!hasOffers) return null;

  const iconColor = isDark ? '#FFD666' : '#B38737';

  return (
    <View
      style={[
        styles.hintCard,
        {
          top: insets.top + 12,
          backgroundColor: isDark ? 'rgba(24,20,17,0.92)' : 'rgba(255,255,255,0.94)',
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
        },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.hintIconDisc,
          { backgroundColor: isDark ? 'rgba(212,175,55,0.2)' : 'rgba(179,135,55,0.16)' },
        ]}
      >
        <MaterialIcons
          name={hasSelection ? 'check-circle' : 'near-me'}
          size={19}
          color={iconColor}
        />
      </View>
      <Text
        style={[styles.hintText, { color: isDark ? '#F5F1EA' : '#1C1917' }]}
        numberOfLines={2}
      >
        {hasSelection
          ? t('client.homeOffers.hint.selected')
          : t('client.homeOffers.hint.selectNearest')}
      </Text>
    </View>
  );
}
