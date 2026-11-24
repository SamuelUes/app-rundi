// Barra inferior estilo Google Navigation: X (salir), ETA, velocidad,
// y fila de acciones del viaje (CTA de estado + cancelar).
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TFunction } from 'i18next';

type GlyphName = keyof typeof MaterialIcons.glyphMap;

interface NavigationStatusBarProps {
  remainingMin: number;
  distanceKm: number;
  /** Hora de llegada formateada, ej. "9:13 PM". */
  arrivalLabel: string;
  routeStatus?: 'idle' | 'loading' | 'navigating' | 'rerouting' | 'arrived' | 'unavailable';
  speedKmh?: number | null;
  /** X: volver a la normalidad (salir del modo navegación). */
  onExit: () => void;
  ctaLabel?: string;
  ctaIcon?: GlyphName;
  primaryColor: string;
  ctaLoading?: boolean;
  onCTAPress?: () => void;
  cancelLabel?: string;
  cancelLoading?: boolean;
  onCancelPress?: () => void;
  t?: TFunction;
  style?: any;
}

export function NavigationStatusBar({
  remainingMin,
  distanceKm,
  arrivalLabel,
  routeStatus = 'navigating',
  speedKmh,
  onExit,
  ctaLabel,
  ctaIcon = 'check',
  primaryColor,
  ctaLoading = false,
  onCTAPress,
  cancelLabel,
  cancelLoading = false,
  onCancelPress,
  t,
  style,
}: NavigationStatusBarProps) {
  const exitLabel =
    t?.('driver.activeRide.nav.exit', { defaultValue: 'Salir de navegación' }) ??
    'Salir de navegación';
  const cancelText =
    cancelLabel ??
    t?.('driver.activeRide.buttons.cancelRide', { defaultValue: 'Cancelar viaje' }) ??
    'Cancelar viaje';
  const hasActions = !!onCTAPress || !!onCancelPress;

  return (
    <View style={[styles.container, style]}>
      {typeof speedKmh === 'number' ? (
        <View style={styles.speedChip}>
          <Text style={styles.speedValue}>{Math.max(0, Math.round(speedKmh))}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.exitBtn}
        onPress={onExit}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={exitLabel}
      >
        {/* <MaterialIcons name="close" size={20} color="#FFFFFF" /> */}
        <Text style={styles.exitText} numberOfLines={1}>
          {exitLabel}
        </Text>
      </TouchableOpacity>

      <View style={styles.strip}>
        <View style={styles.etaBlock} pointerEvents="none">
          {routeStatus === 'idle' || routeStatus === 'loading' || routeStatus === 'unavailable' ? (
            <Text style={styles.etaSub}>
              {routeStatus === 'unavailable'
                ? t?.('driver.activeRide.nav.routeUnavailable', { defaultValue: 'Ruta no disponible' }) ?? 'Ruta no disponible'
                : t?.('driver.activeRide.nav.routeLoading', { defaultValue: 'Calculando ruta...' }) ?? 'Calculando ruta...'}
            </Text>
          ) : (
            <>
              <Text style={styles.etaMinutes}>{Math.max(0, Math.ceil(remainingMin))} min</Text>
              <Text style={styles.etaSub} numberOfLines={1}>
                {distanceKm.toFixed(1)} km · {arrivalLabel}
              </Text>
            </>
          )}
        </View>
      </View>

      {hasActions ? (
        <View style={styles.actions}>
          {onCTAPress ? (
            <TouchableOpacity
              style={[
                styles.ctaBtn,
                { backgroundColor: primaryColor },
                ctaLoading && styles.btnDisabled,
              ]}
              onPress={onCTAPress}
              disabled={ctaLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: ctaLoading }}
            >
              {ctaLoading ? (
                <ActivityIndicator size="small" color="#1C1917" />
              ) : (
                <MaterialIcons name={ctaIcon} size={20} color="#1C1917" />
              )}
              <Text style={styles.ctaText} numberOfLines={1}>
                {ctaLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          {onCancelPress ? (
            <TouchableOpacity
              style={[
                styles.cancelBtn,
                (cancelLoading || ctaLoading) && styles.btnDisabled,
              ]}
              onPress={onCancelPress}
              disabled={cancelLoading || ctaLoading}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ disabled: cancelLoading || ctaLoading }}
            >
              {cancelLoading ? (
                <ActivityIndicator size="small" color="#FF6B6B" />
              ) : (
                <>
                  <MaterialIcons name="close" size={17} color="#FF6B6B" />
                  <Text style={styles.cancelText} numberOfLines={1}>
                    {cancelText}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10, 10, 14, 0.96)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
  },
  speedChip: {
    position: 'absolute',
    top: -58,
    left: 8,
    backgroundColor: 'rgba(10, 10, 14, 0.92)',
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  speedValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  speedUnit: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    fontWeight: '600',
  },
  strip: {
    position: 'relative',
    minHeight: 48,
  },
  exitBtn: {
    position: 'absolute',
    top: -54,
    right: 8,
    minHeight: 42,
    maxWidth: 172,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderWidth: 0.1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 22,
    paddingHorizontal: 16,
    gap: 5,
  },
  exitText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  etaBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    top: 0,
    bottom: 0,
  },
  etaMinutes: {
    color: '#34D17B',
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  etaSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  actions: {
    flexDirection: 'column',
    marginTop: 10,
    gap: 7,
  },
  ctaBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    paddingHorizontal: 10,
    gap: 6,
  },
  ctaText: {
    color: '#1C1917',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    paddingHorizontal: 8,
    gap: 4,
    borderWidth: 0.1,
    borderColor: 'rgba(255,107,107,0.35)',
    backgroundColor: 'rgba(255,107,107,0.2)',
  },
  cancelText: {
    color: '#FF8585',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
