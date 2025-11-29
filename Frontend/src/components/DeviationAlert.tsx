/**
 * DeviationAlert Component - Alerta cuando el conductor se desvía de la ruta
 * Calcula la distancia entre la ubicación actual y la ruta esperada
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { haversineKm } from '../utils/distance';

interface DeviationAlertProps {
  currentLat: number;
  currentLng: number;
  expectedRoute: Array<{ latitude: number; longitude: number }>;
  threshold?: number; // Metros de desviación permitidos (default: 500m)
  onDeviation?: (distance: number) => void;
}

const DeviationAlert: React.FC<DeviationAlertProps> = ({
  currentLat,
  currentLng,
  expectedRoute,
  threshold = 500,
  onDeviation,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [isDeviated, setIsDeviated] = useState(false);
  const [deviationDistance, setDeviationDistance] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    checkDeviation();
  }, [currentLat, currentLng, expectedRoute]);

  useEffect(() => {
    if (isDeviated) {
      // Animar entrada
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Animar salida
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isDeviated]);

  const checkDeviation = () => {
    if (!expectedRoute || expectedRoute.length === 0) {
      setIsDeviated(false);
      return;
    }

    // Encontrar el punto más cercano en la ruta esperada
    let minDistance = Infinity;

    for (const point of expectedRoute) {
      const distance = calculateDistance(
        currentLat,
        currentLng,
        point.latitude,
        point.longitude
      );

      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    // Convertir a metros
    const distanceMeters = minDistance * 1000;
    setDeviationDistance(Math.round(distanceMeters));

    // Verificar si está desviado
    if (distanceMeters > threshold) {
      setIsDeviated(true);
      onDeviation?.(distanceMeters);
    } else {
      setIsDeviated(false);
    }
  };

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    return haversineKm(lat1, lon1, lat2, lon2);
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${meters}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const getSeverityLevel = (): 'warning' | 'danger' => {
    if (deviationDistance > threshold * 2) return 'danger';
    return 'warning';
  };

  if (!isDeviated) {
    return null;
  }

  const severity = getSeverityLevel();

  return (
    <Animated.View
      style={[
        styles.container,
        severity === 'danger' ? styles.containerDanger : styles.containerWarning,
        { opacity: fadeAnim },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{severity === 'danger' ? '🚨' : '⚠️'}</Text>
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {severity === 'danger' ? 'Desvío Importante' : 'Posible Desvío'}
          </Text>
          <Text style={styles.message}>
            El conductor está a {formatDistance(deviationDistance)} de la ruta esperada
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.dismissButton}
        onPress={() => setIsDeviated(false)}
      >
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      borderRadius: 12,
      padding: 16,
      marginVertical: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    containerWarning: {
      backgroundColor: '#FFF3E0',
      borderLeftWidth: 4,
      borderLeftColor: '#FF9800',
    },
    containerDanger: {
      backgroundColor: '#FFEBEE',
      borderLeftWidth: 4,
      borderLeftColor: '#F44336',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    iconContainer: {
      marginRight: 12,
    },
    icon: {
      fontSize: 32,
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 4,
    },
    message: {
      fontSize: 14,
      color: '#666',
      lineHeight: 20,
    },
    dismissButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 12,
    },
    dismissText: {
      fontSize: 18,
      color: '#666',
      fontWeight: '600',
    },
  });

export default DeviationAlert;
