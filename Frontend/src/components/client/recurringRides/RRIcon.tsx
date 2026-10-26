import React from 'react';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

/**
 * Mapa central de iconos de viajes recurrentes.
 * Cambia `family` para elegir la libreria por icono:
 *   'material' -> MaterialIcons, 'ionicons' -> Ionicons
 */
export type RRIconFamily = 'material' | 'ionicons';

export interface RRIconDef {
  family: RRIconFamily;
  name: string;
}

export const RR_ICONS = {
  addTrip: { family: 'material', name: 'bookmark-add' },
  saved: { family: 'material', name: 'bookmark-added' },
  manage: { family: 'material', name: 'tune' },
  repeat: { family: 'ionicons', name: 'repeat' },
  moto: { family: 'material', name: 'two-wheeler' },
  auto: { family: 'material', name: 'directions-car' },
  designated_driver: { family: 'material', name: 'person-pin' },
  request: { family: 'material', name: 'near-me' },
  edit: { family: 'ionicons', name: 'create-outline' },
  delete: { family: 'ionicons', name: 'trash-outline' },
  person: { family: 'ionicons', name: 'person' },
  cash: { family: 'material', name: 'payments' },
  card: { family: 'ionicons', name: 'card-outline' },
  back: { family: 'ionicons', name: 'chevron-back' },
  close: { family: 'ionicons', name: 'close' },
  add: { family: 'ionicons', name: 'add' },
  remove: { family: 'ionicons', name: 'remove' },
  addCircle: { family: 'ionicons', name: 'add-circle-outline' },
  search: { family: 'ionicons', name: 'search' },
  myLocation: { family: 'ionicons', name: 'locate' },
  pickOnMap: { family: 'ionicons', name: 'map-outline' },
  route: { family: 'ionicons', name: 'navigate' },
  touchApp: { family: 'material', name: 'touch-app' },
  stops: { family: 'material', name: 'add-location-alt' },
  place: { family: 'ionicons', name: 'location-outline' },
} satisfies Record<string, RRIconDef>;

export type RRIconId = keyof typeof RR_ICONS;

interface RRIconProps {
  id: RRIconId;
  size: number;
  color: string;
}

export function RRIcon({ id, size, color }: RRIconProps) {
  const def = RR_ICONS[id];
  if (def.family === 'ionicons') {
    return <Ionicons name={def.name as any} size={size} color={color} />;
  }
  return <MaterialIcons name={def.name as any} size={size} color={color} />;
}
