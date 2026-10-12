import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { formatCoords } from '../../../utils/rideCoords';
import { MAP_ICONS } from '../../../constants/mapIcons';
type TrFunction = (path: string, options?: Record<string, any>) => string;
import type { Coords } from '../../../utils/rideCoords';

const { ORIGIN_PIN, DESTINATION_PIN, MULTI_STOP_PIN } = MAP_ICONS;

interface RouteRow {
  kind: 'origin' | 'destination' | 'extra';
  index?: number;
}

interface ExtraDestination {
  address: string;
  coords: Coords | null;
}

interface SearchRideRouteBubbleProps {
  top?: number;
  orderedRouteRows: RouteRow[];
  canAddExtraStop: boolean;
  manualOriginLoading: boolean;
  manualOriginAddress: string;
  manualOriginDraft: Coords | null;
  manualDestinationLoading: boolean;
  manualDestinationDraft: Coords | null;
  destination: string;
  destinationCoords: Coords | null;
  mapSelectionMode: any;
  extraDestinations: ExtraDestination[];
  onRouteRowPress: (row: RouteRow) => void;
  onAddExtraStop: () => void;
  onRemoveStop: (index: number) => void;
  styles: any;
  tr: TrFunction;
}

export function SearchRideRouteBubble({
  top = 0,
  orderedRouteRows,
  canAddExtraStop,
  manualOriginLoading,
  manualOriginAddress,
  manualOriginDraft,
  manualDestinationLoading,
  manualDestinationDraft,
  destination,
  destinationCoords,
  mapSelectionMode,
  extraDestinations,
  onRouteRowPress,
  onAddExtraStop,
  onRemoveStop,
  styles,
  tr,
}: SearchRideRouteBubbleProps) {
  return (
    <View style={[styles.routeBubble, { top }]}>
      <View style={styles.routeTimeline}>
        {orderedRouteRows.map((row, idx) => {
          const isLast = idx === orderedRouteRows.length - 1;
          const isExtra = row.kind === 'extra';
          const isDestinationRow = row.kind === 'destination';
          const showInlineAdd = isDestinationRow && canAddExtraStop;
          let label = '';
          let subtitle = '';
          if (row.kind === 'origin') {
            label = manualOriginLoading ? tr('labels.searching') : manualOriginAddress || tr('labels.originPlaceholder');
            if (manualOriginDraft) subtitle = formatCoords(manualOriginDraft);
          } else if (row.kind === 'destination') {
            label = manualDestinationLoading ? tr('labels.searching') : destination || tr('labels.destinationPlaceholder');
            if (manualDestinationDraft && mapSelectionMode === 'destination') subtitle = formatCoords(manualDestinationDraft);
            else if (destinationCoords) subtitle = formatCoords(destinationCoords);
          } else if (typeof row.index === 'number') {
            const stop = extraDestinations[row.index];
            label = stop?.address || tr('labels.stopLabel', { index: row.index + 1 });
            if (stop?.coords) subtitle = formatCoords(stop.coords);
          }

          if (subtitle && subtitle === label) subtitle = '';

          const iconSource =
            row.kind === 'origin'
              ? ORIGIN_PIN
              : row.kind === 'destination'
              ? DESTINATION_PIN
              : MULTI_STOP_PIN;

          return (
            <View key={`${row.kind}-${row.index ?? 'final'}`} style={styles.timelineRow}>
              <View style={styles.timelineLeft}>
                <Image source={iconSource} style={styles.timelineIcon} resizeMode="contain" />
                {!isLast && <View style={styles.timelineConnector} />}
              </View>

              <View style={styles.timelineCenter}>
                <TouchableOpacity style={[styles.timelineContent, showInlineAdd && styles.timelineContentCompact]} onPress={() => onRouteRowPress(row)}>
                  <Text style={styles.timelineLabel} numberOfLines={1}>
                    {label}
                  </Text>
                  {subtitle ? (
                    <Text style={styles.timelineSubtitle} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </TouchableOpacity>
                {showInlineAdd ? (
                  <TouchableOpacity
                    style={styles.inlineAddStop}
                    onPress={onAddExtraStop}
                    accessibilityLabel={tr('accessibility.addExtraStop')}
                  >
                    <Text style={styles.inlineAddStopIcon}>＋</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {isExtra && typeof row.index === 'number' ? (
                <TouchableOpacity style={styles.timelineRemove} onPress={() => onRemoveStop(row.index!)}>
                  <Text style={styles.timelineRemoveText}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
