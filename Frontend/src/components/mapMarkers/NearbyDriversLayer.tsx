import React, { useMemo } from 'react';
import { View, Text, Image } from 'react-native';
import { Marker } from 'react-native-maps';
import { MarkerBubble, markerStyles } from './MarkerContent';
import { toLatLng, isValidCoord } from '../../hooks/useMapCamera';
import { VEHICLE_ICON_BASE_SIZE } from '../../constants/mapIcons';
import type { DriverMarker } from '../../hooks/useMarkerHeading';
import { MAP_ICONS } from '../../constants/mapIcons';

interface NearbyDriversLayerProps {
  nearbyDrivers: DriverMarker[];
  onDriverPress?: (driverId: string) => void;
  currentZoom: number;
  resolveDriverHeading: (driver: DriverMarker) => number;
}

const CLUSTER_ZOOM_THRESHOLD = 13;

interface Cluster {
  latitude: number;
  longitude: number;
  count: number;
  drivers: DriverMarker[];
}

function clusterDrivers(drivers: DriverMarker[], zoom: number): Array<{ type: 'single'; driver: DriverMarker } | { type: 'cluster'; cluster: Cluster }> {
  const validDrivers = drivers.filter(isValidCoord);
  if (validDrivers.length === 0) return [];

  if (zoom >= CLUSTER_ZOOM_THRESHOLD) {
    return validDrivers.map((driver) => ({ type: 'single' as const, driver }));
  }

  const gridSize = 0.01;
  const grid: Record<string, DriverMarker[]> = {};

  for (const driver of validDrivers) {
    const latKey = Math.floor(driver.latitude / gridSize);
    const lngKey = Math.floor(driver.longitude / gridSize);
    const key = `${latKey}:${lngKey}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(driver);
  }

  const results: Array<{ type: 'single'; driver: DriverMarker } | { type: 'cluster'; cluster: Cluster }> = [];

  for (const driversInCell of Object.values(grid)) {
    if (driversInCell.length === 1) {
      results.push({ type: 'single', driver: driversInCell[0] });
    } else {
      const sumLat = driversInCell.reduce((acc, d) => acc + d.latitude, 0);
      const sumLng = driversInCell.reduce((acc, d) => acc + d.longitude, 0);
      results.push({
        type: 'cluster',
        cluster: {
          latitude: sumLat / driversInCell.length,
          longitude: sumLng / driversInCell.length,
          count: driversInCell.length,
          drivers: driversInCell,
        },
      });
    }
  }

  return results;
}

export default React.memo(function NearbyDriversLayer({
  nearbyDrivers,
  onDriverPress,
  currentZoom,
  resolveDriverHeading,
}: NearbyDriversLayerProps) {
  const clustered = useMemo(
    () => clusterDrivers(nearbyDrivers, currentZoom),
    [nearbyDrivers, currentZoom],
  );

  return (
    <>
      {clustered.map((item, index) => {
        if (item.type === 'cluster') {
          const { cluster } = item;
          return (
            <Marker
              key={`cluster-${index}`}
              coordinate={toLatLng(cluster)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => {
                if (cluster.drivers.length > 0 && onDriverPress) {
                  onDriverPress(cluster.drivers[0].id);
                }
              }}
            >
              <View style={markerStyles.clusterBubble}>
                <Text style={markerStyles.clusterText}>{cluster.count}</Text>
              </View>
            </Marker>
          );
        }

        const driver = item.driver;
        const heading = resolveDriverHeading(driver);
        const iconSize = VEHICLE_ICON_BASE_SIZE;

        return (
          <Marker
            key={`driver-${driver.id}`}
            coordinate={toLatLng(driver)}
            rotation={heading}
            tracksViewChanges={driver.isSelected}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => {
              if (typeof onDriverPress === 'function') {
                onDriverPress(driver.id);
              }
            }}
            flat
          >
            <View style={markerStyles.driverBubbleWrapper}>
              {driver.vehicleIconSource ? (
                <View style={{ width: iconSize, height: iconSize, justifyContent: 'center', alignItems: 'center' }}>
                  <Image source={driver.vehicleIconSource} style={{ width: iconSize, height: iconSize, resizeMode: 'contain' }} />
                </View>
              ) : (
                <MarkerBubble backgroundColor="#1565C0" size="medium">
                  <Text style={markerStyles.driverIcon}>🚗</Text>
                </MarkerBubble>
              )}

              {driver.isSelected && (
                <View style={markerStyles.driverSelectedOverlay}>
                  {typeof driver.rating === 'number' && Number.isFinite(driver.rating) && (
                    <View style={markerStyles.driverRatingBadge}>
                      <Text style={markerStyles.driverRatingText}>{`⭐ ${driver.rating.toFixed(1)}`}</Text>
                    </View>
                  )}
                  <Image source={MAP_ICONS.DRIVER_PROFILE_BUBBLE} style={markerStyles.driverBubbleImage} />
                  <View style={markerStyles.driverBubbleAvatar}>
                    {driver.photoURL ? (
                      <Image source={{ uri: driver.photoURL }} style={markerStyles.driverBubbleAvatarImage} />
                    ) : (
                      <View style={markerStyles.driverBubbleAvatarFallback}>
                        <Text style={markerStyles.driverBubbleAvatarFallbackText}>
                          {driver.id?.charAt(0)?.toUpperCase() ?? 'C'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          </Marker>
        );
      })}
    </>
  );
});
