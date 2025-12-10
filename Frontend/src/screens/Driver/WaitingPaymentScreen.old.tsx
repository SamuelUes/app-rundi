import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedButton } from '../../components/AnimatedButton';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../../config/firebase';
import sessionService from '../../services/sessionService';

interface WaitingPaymentScreenProps {
  route: {
    params: {
      rideId: string;
      amount: number;
      clientName: string;
    };
  };
  navigation: any;
}

export default function WaitingPaymentScreen({ route, navigation }: WaitingPaymentScreenProps) {
  const { rideId, amount, clientName } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Convertir amount a número si viene como string
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupPaymentListener = async () => {
      try {
        const { app } = await initializeFirebase();
        if (!app) {
          Alert.alert('Error', 'No se pudo conectar con Firebase');
          return;
        }

        const db = getDatabase(app);
        const paymentRef = ref(db, `paymentStatus/${rideId}`);

        // Escuchar cambios en el status del pago
        const listener = onValue(paymentRef, (snapshot) => {
          const data = snapshot.val();
          console.log('💳 Payment status update:', data);

          if (data) {
            setPaymentStatus(data);
            setLoading(false);

            // Si el pago fue completado (tarjeta)
            if (data.status === 'completed') {
              Alert.alert(
                '¡Pago Recibido!',
                'El pago ha sido procesado exitosamente',
                [
                  {
                    text: 'Continuar',
                    onPress: () => navigation.replace('AvailableRides'),
                  },
                ]
              );
            }

            // Si es pago en efectivo pendiente de confirmación
            if (data.status === 'pending_cash_payment' || data.status === 'pending_confirmation') {
              navigation.replace('ConfirmCashPayment', {
                rideId,
                amount: data.amount || amount,
                tip: data.tip || 0,
                clientName,
              });
            }

            // Si el pago fue cancelado
            if (data.status === 'canceled') {
              Alert.alert(
                'Pago Cancelado',
                data.cancelReason || 'El cliente canceló el pago',
                [
                  {
                    text: 'Volver',
                    onPress: () => navigation.replace('AvailableRides'),
                  },
                ]
              );
            }
          }
        });

        unsubscribe = () => off(paymentRef, 'value', listener);
      } catch (error) {
        console.error('Error setting up payment listener:', error);
        Alert.alert('Error', 'No se pudo monitorear el pago');
        setLoading(false);
      }
    };

    setupPaymentListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [rideId]);

  const handleCancel = () => {
    Alert.alert(
      'Cancelar Espera',
      '¿Estás seguro de que quieres cancelar la espera del pago?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, Cancelar',
          style: 'destructive',
          onPress: () => navigation.replace('AvailableRides'),
        },
      ]
    );
  };

  const [switching, setSwitching] = useState(false);

  const handleSwitchToCash = () => {
    Alert.alert(
      'Cambiar a Pago en Efectivo',
      '¿El cliente prefiere pagar en efectivo? Puedes cambiar el método de pago.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Cambiar a Efectivo',
          onPress: async () => {
            try {
              setSwitching(true);

              const { app } = await initializeFirebase();
              if (!app) throw new Error('Firebase no inicializado');

              const functions = getFunctions(app);
              const switchPaymentMethodFn = httpsCallable(functions, 'changePaymentMethod');
              
              console.log('🔄 Cambiando método de pago a efectivo...');
              const deviceId = await sessionService.getDeviceId();
              const result = await switchPaymentMethodFn({
                rideId,
                newPaymentMethod: 'cash',
                reason: 'Cliente prefiere pagar en efectivo',
                deviceId,
              });

              const data = result.data as any;
              console.log('✅ Método de pago cambiado:', data);

              Alert.alert(
                '✅ Método Cambiado',
                'El método de pago se cambió a efectivo. Ahora debes confirmar que recibiste el pago.',
                [
                  {
                    text: 'Entendido',
                    onPress: () => {
                      // Navegar a pantalla de confirmación de efectivo
                      navigation.replace('ConfirmCashPayment', {
                        rideId,
                        amount: numericAmount,
                        tip: 0,
                        clientName,
                      });
                    },
                  },
                ]
              );
            } catch (error: any) {
              console.error('❌ Error cambiando método de pago:', error);
              Alert.alert('Error', error.message || 'No se pudo cambiar el método de pago');
            } finally {
              setSwitching(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Conectando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.icon}>💳</Text>
        <Text style={styles.title}>Esperando Pago</Text>
        <Text style={styles.subtitle}>
          {clientName} está procesando el pago
        </Text>
      </View>

      {/* Amount */}
      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>Monto Total</Text>
        <Text style={styles.amount}>C${numericAmount.toFixed(2)}</Text>
      </View>

      {/* Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            {paymentStatus?.status === 'processing'
              ? 'Procesando pago con tarjeta...'
              : paymentStatus?.status === 'pending'
              ? 'Esperando confirmación...'
              : 'Verificando pago...'}
          </Text>
        </View>
        <Text style={styles.statusDescription}>
          El pago se confirmará automáticamente cuando el cliente complete el proceso
        </Text>
      </View>

      {/* Payment Method */}
      {paymentStatus?.method && (
        <View style={styles.methodCard}>
          <Text style={styles.methodLabel}>Método de Pago</Text>
          <Text style={styles.methodText}>
            {paymentStatus.method === 'card' ? '💳 Tarjeta de Crédito/Débito' : '💵 Efectivo'}
          </Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          No cierres esta pantalla. Te notificaremos cuando el pago sea confirmado.
        </Text>
      </View>

      {/* Switch to Cash Button */}
      <AnimatedButton
        title="💵 Cambiar a Pago en Efectivo"
        onPress={handleSwitchToCash}
        variant="secondary"
        loading={switching}
        disabled={switching}
        style={styles.switchButton}
      />

      {/* Cancel Button */}
      <AnimatedButton
        title="Cancelar Espera"
        onPress={handleCancel}
        variant="outline"
        disabled={switching}
        style={styles.cancelButton}
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 30,
  },
  icon: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  amountCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  amount: {
    fontSize: 48,
    fontWeight: '800',
    color: '#4CAF50',
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF9800',
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  statusDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 24,
  },
  methodCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  methodText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  switchButton: {
    marginBottom: 12,
  },
  cancelButton: {
    marginTop: 'auto',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
});
