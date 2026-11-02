import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { RideIcon, type RideIconSet } from './SearchRideVehicleOptions';

type TrFunction = (path: string, options?: Record<string, any>) => string;

interface SearchRideConfirmPinButtonProps {
  colors: any;
  /** Distancia al borde inferior; el panel está oculto en modo pin. */
  bottom: number;
  loading?: boolean;
  onPress: () => void;
  tr: TrFunction;
  iconSet?: RideIconSet;
}

// Botón flotante de respaldo para confirmar el punto bajo el pin central:
// la selección automática por gesto/idle sigue funcionando; esto cubre el
// caso en que el mapa no reporta el fin del movimiento.
export function SearchRideConfirmPinButton({
  colors,
  bottom,
  loading = false,
  onPress,
  tr,
  iconSet,
}: SearchRideConfirmPinButtonProps) {
  const accent = colors?.primary || '#f7b32b';
  return (
    <View pointerEvents="box-none" style={[componentStyles.wrap, { bottom }]}>
      <TouchableOpacity
        style={[componentStyles.button, { backgroundColor: accent }]}
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={tr(
          loading ? 'mapSelection.confirmingLocation' : 'mapSelection.confirmLocation',
        )}
        accessibilityState={{ busy: loading, disabled: loading }}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <RideIcon name="check" iconSet={iconSet} size={16} color="#fff" />
        )}
        <Text style={componentStyles.label} numberOfLines={1}>
          {tr(loading ? 'mapSelection.confirmingLocation' : 'mapSelection.confirmLocation')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const componentStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  label: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
