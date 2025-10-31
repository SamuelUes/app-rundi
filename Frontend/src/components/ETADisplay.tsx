import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import backendConfig from '../config/backendConfig';
import firebaseTrackingService from '../services/firebaseTrackingService';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

interface ETADisplayProps {
  rideId: string;
  currentLat: number;
  currentLng: number;
  updateInterval?: number; // ms (default: 30000 = 30s)
  useRealtime?: boolean; // Usar tracking en tiempo real de Firebase
}

interface ETAData {
  etaMinutes: number;
  etaTimestamp: string;
  distanceRemaining: number;
}

interface RideTracking {
  rideId: string;
  driverId: string;
  clientId: string;
  status: string;
  lastUpdate: number;
  destination?: {
    lat: number;
    lng: number;
    address: string;
  };
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
  useRealtime = true,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [eta, setEta] = useState<ETAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // Formatear hora según el dispositivo
  const formatETA = (timestamp: string): string => {
    try {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: undefined
      });
    } catch (error) {
      console.error('Error formateando hora:', error);
      return '';
    }
  };

  // Formatear tiempo de última actualización
  const formatUpdateTime = (date: Date): string => {
    try {
      if (!date || isNaN(date.getTime())) return '';
      
      const now = new Date();
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (seconds < 10) return 'ahora mismo';
      if (seconds < 60) return `hace ${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `hace ${minutes}min`;
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.error('Error formateando tiempo de actualización:', error);
      return '';
    }
  };

  const calculateETA = async () => {
    try {
      const functions = await getFirebaseFunctions();
      const getETAFunction = httpsCallable(functions, 'getIntelligentETA');
      const response = await getETAFunction({
        rideId,
        currentLat,
        currentLng,
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

  // Listener en tiempo real de Firebase (opcional)
  useEffect(() => {
    if (!useRealtime) return;

    const setupRealtimeListener = async () => {
      try {
        const unsubscribe = await firebaseTrackingService.subscribeToRideTracking(
          rideId,
          (tracking) => {
            if (tracking && tracking.lastUpdate) {
              try {
                const updateDate = new Date(tracking.lastUpdate);
                if (!isNaN(updateDate.getTime())) {
                  setLastUpdateTime(updateDate);
                  // Recalcular ETA cuando hay actualización
                  calculateETA();
                }
              } catch (error) {
                console.error('Error procesando lastUpdate:', error);
              }
            }
          }
        );

        return unsubscribe;
      } catch (error) {
        console.error('Error configurando listener en tiempo real:', error);
        return () => {};
      }
    };

    const cleanupPromise = setupRealtimeListener();

    return () => {
      cleanupPromise.then(unsubscribe => unsubscribe());
    };
  }, [rideId, useRealtime]);

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
              {eta.etaMinutes} min ({formatETA(eta.etaTimestamp)})
            </Text>
          </View>
        </View>

        {typeof eta.distanceRemaining === 'number' && !Number.isNaN(eta.distanceRemaining) && (
          <View style={styles.distanceRow}>
            <Text style={styles.distanceIcon}>🚗</Text>
            <Text style={styles.distanceText}>
              {(eta.distanceRemaining / 1000).toFixed(1)} km restantes
            </Text>
          </View>
        )}

        {/* Indicador de actualización en tiempo real */}
        {useRealtime && (
          <View style={styles.realtimeIndicator}>
            <View style={styles.realtimeDot} />
            <Text style={styles.realtimeText}>
              Actualización en tiempo real • Última actualización: {formatUpdateTime(lastUpdateTime)}
            </Text>
          </View>
        )}
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
    realtimeIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    realtimeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#4CAF50',
      marginRight: 8,
    },
    realtimeText: {
      fontSize: 11,
      color: colors.textSecondary,
      flex: 1,
    },
  });

export default ETADisplay;
