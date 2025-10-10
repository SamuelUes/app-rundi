import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import backendConfig from '../config/backendConfig';

interface ETADisplayProps {
  rideId: string;
  currentLat: number;
  currentLng: number;
  updateInterval?: number; // ms (default: 30000 = 30s)
}

interface ETAData {
  etaMinutes: number;
  etaTime: string;
  distanceRemaining: number;
}

/**
 * Componente para mostrar ETA (Estimated Time of Arrival) dinámico
 * Se actualiza automáticamente cada 30 segundos
 */
const ETADisplay: React.FC<ETADisplayProps> = ({
  rideId,
  currentLat,
  currentLng,
  updateInterval = 30000,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [eta, setEta] = useState<ETAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calcular ETA
  const calculateETA = async () => {
    try {
      // Usar Firebase Callable Function
      const { functions } = await import('../config/firebase');
      const { httpsCallable } = await import('firebase/functions');
      
      const getETAFunction = httpsCallable(functions, 'getETA');
      const response = await getETAFunction({
        rideId,
        lat: currentLat,
        lng: currentLng,
      });

      const result = response.data as { success: boolean; data: ETAData };

      if (result.success) {
        setEta(result.data);
        setError(null);
      } else {
        setError('Error calculando ETA');
      }
    } catch (err: any) {
      console.error('Error calculando ETA:', err);
      setError('Calculando...');
    } finally {
      setLoading(false);
    }
  };

  // Actualizar ETA cada X segundos
  useEffect(() => {
    calculateETA();

    const interval = setInterval(() => {
      calculateETA();
    }, updateInterval);

    return () => clearInterval(interval);
  }, [rideId, currentLat, currentLng, updateInterval]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (error || !eta) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>⏱️ Calculando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.etaCard}>
        <View style={styles.etaRow}>
          <Text style={styles.etaIcon}>⏱️</Text>
          <View style={styles.etaInfo}>
            <Text style={styles.etaLabel}>Llegada estimada</Text>
            <Text style={styles.etaValue}>
              {eta.etaMinutes} min ({eta.etaTime})
            </Text>
          </View>
        </View>

        <View style={styles.distanceRow}>
          <Text style={styles.distanceIcon}>🚗</Text>
          <Text style={styles.distanceText}>
            {eta.distanceRemaining.toFixed(1)} km restantes
          </Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginVertical: 8,
    },
    etaCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    etaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    etaIcon: {
      fontSize: 32,
      marginRight: 12,
    },
    etaInfo: {
      flex: 1,
    },
    etaLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    etaValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    distanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    distanceIcon: {
      fontSize: 20,
      marginRight: 8,
    },
    distanceText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    errorText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });

export default ETADisplay;
