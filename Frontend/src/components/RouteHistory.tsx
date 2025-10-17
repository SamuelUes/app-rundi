/**
 * RouteHistory Component - Muestra el historial de ubicaciones de un viaje
 * Visualiza la ruta completa recorrida con marcadores y líneas
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import DynamicMap from './DynamicMap';
import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

interface RoutePoint {
  id: string;
  ride_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  timestamp: string;
}

interface RouteHistoryProps {
  rideId: string;
  showStats?: boolean;
}

const RouteHistory: React.FC<RouteHistoryProps> = ({ rideId, showStats = true }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [stats, setStats] = useState({
    totalDistance: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    duration: 0,
  });

  useEffect(() => {
    loadRouteHistory();
  }, [rideId]);

  const loadRouteHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const functions = await getFirebaseFunctions();
      const getRouteHistoryFunction = httpsCallable(functions, 'getRouteHistory');
      const response = await getRouteHistoryFunction({ rideId });
      const result = response.data as { success: boolean; data: { route: RoutePoint[]; totalPoints: number } };

      if (result.success && result.data.route) {
        const points = result.data.route;
        setRoutePoints(points);

        // Calcular estadísticas
        if (points.length > 1) {
          const speeds = points.filter(p => p.speed && p.speed > 0).map(p => p.speed!);
          const totalDistance = calculateTotalDistance(points);
          const duration = calculateDuration(points);

          setStats({
            totalDistance,
            avgSpeed: speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
            maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
            duration,
          });
        }
      }
    } catch (err: any) {
      console.error('Error cargando historial:', err);
      setError('No se pudo cargar el historial de la ruta');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalDistance = (points: RoutePoint[]): number => {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      total += calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }
    return total;
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRad = (degrees: number): number => {
    return degrees * (Math.PI / 180);
  };

  const calculateDuration = (points: RoutePoint[]): number => {
    if (points.length < 2) return 0;
    const start = new Date(points[0].timestamp).getTime();
    const end = new Date(points[points.length - 1].timestamp).getTime();
    return Math.round((end - start) / 1000 / 60); // minutos
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando historial...</Text>
      </View>
    );
  }

  if (error || routePoints.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          {error || 'No hay datos de ruta disponibles'}
        </Text>
      </View>
    );
  }

  // Preparar coordenadas para el mapa
  const routeCoordinates = routePoints.map(p => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));

  const centerPoint = routePoints[Math.floor(routePoints.length / 2)];

  return (
    <View style={styles.container}>
      {/* Mapa con ruta */}
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={centerPoint.latitude}
          longitude={centerPoint.longitude}
          style={styles.map}
          showMarker={false}
          routeCoordinates={routeCoordinates}
          originMarker={routeCoordinates[0]}
          destinationMarker={routeCoordinates[routeCoordinates.length - 1]}
        />
      </View>

      {/* Estadísticas */}
      {showStats && (
        <ScrollView style={styles.statsContainer}>
          <Text style={styles.statsTitle}>📊 Estadísticas del Viaje</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>📍</Text>
              <Text style={styles.statLabel}>Puntos Registrados</Text>
              <Text style={styles.statValue}>{routePoints.length}</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statIcon}>📏</Text>
              <Text style={styles.statLabel}>Distancia Total</Text>
              <Text style={styles.statValue}>{stats.totalDistance.toFixed(2)} km</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statIcon}>⏱️</Text>
              <Text style={styles.statLabel}>Duración</Text>
              <Text style={styles.statValue}>{formatTime(stats.duration)}</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🚗</Text>
              <Text style={styles.statLabel}>Velocidad Promedio</Text>
              <Text style={styles.statValue}>{stats.avgSpeed.toFixed(1)} km/h</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statIcon}>⚡</Text>
              <Text style={styles.statLabel}>Velocidad Máxima</Text>
              <Text style={styles.statValue}>{stats.maxSpeed.toFixed(1)} km/h</Text>
            </View>
          </View>

          {/* Timeline de puntos */}
          <View style={styles.timelineContainer}>
            <Text style={styles.timelineTitle}>🕐 Línea de Tiempo</Text>
            {routePoints.slice(0, 10).map((point, index) => (
              <View key={point.id} style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTime}>
                    {new Date(point.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text style={styles.timelineSpeed}>
                    {point.speed ? `${point.speed.toFixed(1)} km/h` : 'Sin velocidad'}
                  </Text>
                </View>
              </View>
            ))}
            {routePoints.length > 10 && (
              <Text style={styles.timelineMore}>
                ... y {routePoints.length - 10} puntos más
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    mapContainer: {
      height: 300,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 16,
    },
    map: {
      flex: 1,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    errorText: {
      fontSize: 16,
      color: '#ff4444',
      textAlign: 'center',
      padding: 24,
    },
    statsContainer: {
      flex: 1,
    },
    statsTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 16,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statIcon: {
      fontSize: 32,
      marginBottom: 8,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 4,
    },
    statValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    timelineContainer: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    timelineTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 16,
    },
    timelineItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#4CAF50',
      marginRight: 12,
    },
    timelineContent: {
      flex: 1,
    },
    timelineTime: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    timelineSpeed: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    timelineMore: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      fontStyle: 'italic',
    },
  });

export default RouteHistory;
