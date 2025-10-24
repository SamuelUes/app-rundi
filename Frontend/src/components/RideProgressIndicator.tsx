import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface RideProgressIndicatorProps {
  progress: number; // 0-100
  role: 'client' | 'driver';
  rideStatus: string;
  estimatedFare?: number; // Opcional, para mostrar monto exacto al cliente
  paymentMethod?: 'cash' | 'card'; // Método de pago: cash (efectivo) o card (bancos nacionales)
}

export const RideProgressIndicator: React.FC<RideProgressIndicatorProps> = ({
  progress,
  role,
  rideStatus,
  estimatedFare,
  paymentMethod = 'card',
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Solo mostrar si el viaje está en progreso
  if (rideStatus !== 'in_progress') {
    return null;
  }

  // Determinar color según progreso
  const getProgressColor = () => {
    if (progress < 25) return '#4CAF50'; // Verde
    if (progress < 60) return '#FF9800'; // Naranja
    return '#F44336'; // Rojo
  };

  // Mensaje según rol, progreso y método de pago
  const getMessage = () => {
    const isCash = paymentMethod === 'cash';
    
    if (role === 'client') {
      if (progress < 60) {
        return '✅ Si cancelas ahora, no se te cobrará';
      } else {
        const chargeAmount = ((estimatedFare || 0) * progress / 100).toFixed(2);
        if (isCash) {
          return `⚠️ Si cancelas, deberás pagar C$${chargeAmount} en efectivo al conductor (${Math.round(progress)}% del viaje)`;
        } else {
          return `⚠️ Si cancelas, se cobrará el ${Math.round(progress)}% del viaje (C$${chargeAmount})`;
        }
      }
    } else {
      // Conductor
      if (progress < 25) {
        return '✅ Puedes cancelar sin penalización';
      } else {
        if (isCash) {
          return '⚠️ Si cancelas, se aplicará una penalización (se descontará de tus ganancias)';
        } else {
          return '⚠️ Si cancelas, se aplicará una penalización (comisión del viaje)';
        }
      }
    }
  };

  const progressColor = getProgressColor();
  const message = getMessage();

  return (
    <View style={styles.container}>
      {/* Barra de progreso */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(progress, 100)}%`,
                backgroundColor: progressColor,
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>{Math.round(progress)}%</Text>
      </View>

      {/* Mensaje de cancelación */}
      <View style={[styles.messageContainer, { backgroundColor: `${progressColor}15` }]}>
        <Text style={[styles.messageText, { color: progressColor }]}>
          {message}
        </Text>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginVertical: 12,
    },
    progressBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    progressBarBackground: {
      flex: 1,
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      minWidth: 45,
      textAlign: 'right',
    },
    messageContainer: {
      padding: 12,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    messageText: {
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
  });
