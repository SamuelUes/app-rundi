import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const normalizedStatus = (rideStatus ?? '').toString().trim().toLowerCase();
  const isActiveRide =
    normalizedStatus === 'accepted' ||
    normalizedStatus === 'driver_on_route' ||
    normalizedStatus === 'in_progress';

  // Solo mostrar mientras el viaje está activo (aceptado, en camino o en curso)
  if (!isActiveRide) {
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
    const percentValue = Math.round(progress);
    const chargeAmount = ((estimatedFare || 0) * progress) / 100;

    if (role === 'client') {
      if (progress < 60) {
        return t('common.components.rideProgressIndicator.client.freeCancel');
      } else {
        return isCash
          ? t('common.components.rideProgressIndicator.client.cashPenalty', {
              amount: chargeAmount.toFixed(2),
              percent: percentValue,
            })
          : t('common.components.rideProgressIndicator.client.cardPenalty', {
              amount: chargeAmount.toFixed(2),
              percent: percentValue,
            });
      }
    } else {
      // Conductor
      if (progress < 25) {
        return t('common.components.rideProgressIndicator.driver.freeCancel');
      } else {
        return isCash
          ? t('common.components.rideProgressIndicator.driver.cashPenalty')
          : t('common.components.rideProgressIndicator.driver.cardPenalty');
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
        <Text style={styles.progressText}>
          {t('common.components.rideProgressIndicator.stats', { value: Math.round(progress) })}
        </Text>
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
