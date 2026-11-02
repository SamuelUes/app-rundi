import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { LoadingIcon } from '../ui/LoadingIcon';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { getRideLocations } from '../../api/rides';
import { useTranslation } from 'react-i18next';

interface RoutePoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

interface RouteHistoryMapProps {
  rideId: string;
  showStartEnd?: boolean; // Mostrar marcadores de inicio y fin
}

/**
 * Componente para mostrar el historial completo de ruta de un viaje
 * Muestra polyline con todos los puntos GPS guardados
 */
const RouteHistoryMap: React.FC<RouteHistoryMapProps> = ({
  rideId,
  showStartEnd = true,
}) => {
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const isFocused = useIsFocused();

  // Obtener historial de ruta
  useEffect(() => {
    const fetchRouteHistory = async () => {
      try {
        const locations = await getRideLocations(rideId);
        // type='tracking' = muestras GPS grabadas durante el viaje
        const points = locations
          .filter((l: any) => l.type === 'tracking' || l.type === 'gps')
          .map((l: any) => ({
            latitude: l.lat ?? l.latitude,
            longitude: l.lng ?? l.longitude,
            speed: l.speed ?? null,
            heading: l.heading ?? null,
            timestamp: l.createdAt ?? l.at ?? '',
          }));
        if (points.length > 0) {
          setRoute(points);
          console.log(`✅ Ruta cargada: ${points.length} puntos`);
        } else {
          setError(t('common.components.routeHistoryMap.errors.load'));
        }
      } catch (err: any) {
        console.error('Error cargando ruta:', err);
        setError(t('common.components.routeHistoryMap.errors.load'));
      } finally {
        setLoading(false);
      }
    };

    fetchRouteHistory();
  }, [rideId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color="#4CAF50" />
        <Text style={styles.loadingText}>{t('common.components.routeHistoryMap.loading')}</Text>
      </View>
    );
  }

  if (error || route.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {error || t('common.components.routeHistoryMap.empty')}
        </Text>
      </View>
    );
  }

  // Calcular región inicial del mapa
  const getInitialRegion = () => {
    if (route.length === 0) return null;

    const latitudes = route.map((point) => point.latitude);
    const longitudes = route.map((point) => point.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    const deltaLat = (maxLat - minLat) * 1.5; // Padding 50%
    const deltaLng = (maxLng - minLng) * 1.5;

    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: Math.max(deltaLat, 0.01),
      longitudeDelta: Math.max(deltaLng, 0.01),
    };
  };

  const initialRegion = getInitialRegion();
  const startPoint = route[0];
  const endPoint = route[route.length - 1];

  return (
    <View style={styles.container}>
      {isFocused ? (
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion || undefined}
      >
        {/* Polyline de la ruta */}
        <Polyline
          coordinates={route.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          }))}
          strokeColor="#4CAF50"
          strokeWidth={4}
        />

        {/* Marcador de inicio */}
        {showStartEnd && startPoint && (
          <Marker
            coordinate={{
              latitude: startPoint.latitude,
              longitude: startPoint.longitude,
            }}
            title={t('common.components.routeHistoryMap.markers.startTitle')}
            description={t('common.components.routeHistoryMap.markers.startDescription')}
            pinColor="green"
          />
        )}

        {/* Marcador de fin */}
        {showStartEnd && endPoint && (
          <Marker
            coordinate={{
              latitude: endPoint.latitude,
              longitude: endPoint.longitude,
            }}
            title={t('common.components.routeHistoryMap.markers.endTitle')}
            description={t('common.components.routeHistoryMap.markers.endDescription')}
            pinColor="red"
          />
        )}
      </MapView>
      ) : (
        <View style={styles.map} collapsable={false} />
      )}

      {/* Info de la ruta */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          {t('common.components.routeHistoryMap.info', { count: route.length })}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});

export default RouteHistoryMap;
