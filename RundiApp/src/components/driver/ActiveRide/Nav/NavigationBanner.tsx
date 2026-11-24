// Banner superior estilo Google Navigation: maniobra + distancia + "Then ↩".
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TFunction } from 'i18next';
import type { TurnByTurnBanner } from '../../../../hooks/driver/ActiveRide/useTurnByTurnNavigation';

interface NavigationBannerProps {
  banner: TurnByTurnBanner;
  t?: TFunction;
  style?: any;
}

const formatDistance = (m: number): string =>
  m >= 1000
    ? `${(m / 1000).toFixed(1)} km`
    : `${Math.max(10, Math.round(m / 10) * 10)} m`;

type GlyphName = keyof typeof MaterialIcons.glyphMap;

export function NavigationBanner({ banner, t, style }: NavigationBannerProps) {
  const baseText = banner.streetName
    ? `${banner.fallback} — ${banner.streetName}`
    : banner.fallback;
  const instruction = t
    ? t(banner.textKey, { street: banner.streetName, defaultValue: baseText })
    : baseText;
  const thenLabel = t?.('driver.activeRide.nav.then', { defaultValue: 'Then' }) ?? 'Then';

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      <View style={styles.pill}>
        <MaterialIcons
          name={banner.icon as GlyphName}
          size={38}
          color="#FFFFFF"
          style={styles.arrow}
        />
        <View style={styles.textCol}>
          <Text style={styles.distance}>{formatDistance(banner.distanceM)}</Text>
          <Text style={styles.instruction} numberOfLines={2}>
            {instruction}
          </Text>
        </View>
      </View>
      {banner.thenIcon ? (
        <View style={styles.thenChip}>
          <Text style={styles.thenText}>{thenLabel}</Text>
          <MaterialIcons name={banner.thenIcon as GlyphName} size={18} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 61, 44, 0.96)',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  arrow: {
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  distance: {
    color: '#9BE7B4',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 1,
  },
  instruction: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  thenChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 61, 44, 0.92)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 6,
    marginLeft: 8,
    gap: 6,
  },
  thenText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
