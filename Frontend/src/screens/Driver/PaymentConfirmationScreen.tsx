/**
 * PaymentConfirmationScreen - Pantalla Unificada de Confirmación de Pago
 * 
 * Maneja ambos métodos de pago (cash y card) en una sola pantalla
 * Permite al conductor cambiar el método de pago si es necesario
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedButton } from '../../components/AnimatedButton';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { initializeFirebase } from '../../config/firebase';

interface PaymentConfirmationScreenProps {
  route: {
    params: {
      rideId: string;
      amount: number;
      tip?: number;
      clientName: string;
      paymentMethod: 'cash' | 'card';
    };
  };
  navigation: any;
}

export default function PaymentConfirmationScreen({ 
  route, 
  navigation 
}: PaymentConfirmationScreenProps) {
  const { rideId, amount, tip = 0, clientName, paymentMethod: initialMethod } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  // Estados
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>(initialMethod);
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [clientConfirmed, setClientConfirmed] = useState(false);

  // Convertir a números
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  const numericTip = typeof tip === 'string' ? parseFloat(tip) : (tip || 0);
  const totalAmount = numericAmount + numericTip;

  console.log('💳 [PaymentConfirmation] Params:', { 
    rideId, 
    amount: numericAmount, 
    tip: numericTip, 
    paymentMethod,
    clientName 
  });

  // Escuchar cambios en el estado del pago
  useEffect(() => {
    const setupListener = async () => {
      try {
        const { app } = await initializeFirebase();
        if (!app) {
          console.error('❌ Firebase no inicializado');
          setLoading(false);
          return;
        }

        const db = getDatabase(app);
        const paymentRef = ref(db, `paymentStatus/${rideId}`);
        const rideRef = ref(db, `activeRides/${rideId}`);

        // Listener para paymentStatus
        const unsubscribePayment = onValue(paymentRef, (snapshot) => {
          const data = snapshot.val();
          console.log('📦 [PaymentConfirmation] paymentStatus:', data);

          if (data) {
            setPaymentStatus(data);
            
            // Actualizar método de pago si cambió
            if (data.method && data.method !== paymentMethod) {
              console.log(`🔄 Método actualizado: ${paymentMethod} → ${data.method}`);
              setPaymentMethod(data.method);
            }

            // Verificar confirmación del cliente
            setClientConfirmed(data.confirmedByClient === true || data.clientConfirmed === true);

            // Si el pago fue completado
            if (data.status === 'completed' || data.status === 'confirmed') {
              console.log('✅ Pago completado');
              Alert.alert(
                '¡Pago Completado!',
                'El pago ha sido confirmado exitosamente',
                [
                  {
                    text: 'Continuar',
                    onPress: () => navigation.replace('AvailableRides'),
                  },
                ]
              );
            }
          }
          
          setLoading(false);
        });

        // Listener para activeRides (detectar cambios de método)
        const unsubscribeRide = onValue(rideRef, (snapshot) => {
          const data = snapshot.val();
          if (data?.paymentMethod && data.paymentMethod !== paymentMethod) {
            console.log(`🔄 Método de pago cambiado en ride: ${data.paymentMethod}`);
            setPaymentMethod(data.paymentMethod);
          }
        });

        return () => {
          off(paymentRef);
          off(rideRef);
        };
      } catch (error) {
        console.error('❌ Error configurando listeners:', error);
        setLoading(false);
      }
    };

    setupListener();
  }, [rideId]);

  // Confirmar pago en efectivo
  const handleConfirmCashPayment = async () => {
    if (!clientConfirmed) {
      Alert.alert(
        'Espera',
        'El cliente debe confirmar primero que realizó el pago en efectivo'
      );
      return;
    }

    try {
      setConfirming(true);
      console.log('💵 Conductor confirmando pago en efectivo...');

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');

      const functions = getFunctions(app);
      const confirmCashPaymentFn = httpsCallable(functions, 'confirmCashPayment');
      
      const result = await confirmCashPaymentFn({ 
        rideId,
        amount: numericAmount,
        tip: numericTip,
        confirmedBy: 'driver'
      });
      
      const data = result.data as any;
      console.log('✅ Pago confirmado:', data);

      if (data.bothConfirmed) {
        Alert.alert(
          '¡Pago Confirmado!',
          'El pago en efectivo ha sido confirmado por ambas partes',
          [
            {
              text: 'Volver a Búsqueda',
              onPress: () => navigation.replace('AvailableRides'),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('❌ Error confirmando pago:', error);
      Alert.alert('Error', error.message || 'No se pudo confirmar el pago');
    } finally {
      setConfirming(false);
    }
  };

  // Cambiar método de pago
  const handleSwitchPaymentMethod = () => {
    const newMethod = paymentMethod === 'cash' ? 'card' : 'cash';
    const methodName = newMethod === 'cash' ? 'Efectivo' : 'Tarjeta';
    
    Alert.alert(
      `Cambiar a ${methodName}`,
      `¿Deseas cambiar el método de pago a ${methodName.toLowerCase()}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: `Cambiar a ${methodName}`,
          onPress: async () => {
            try {
              setSwitching(true);

              const { app } = await initializeFirebase();
              if (!app) throw new Error('Firebase no inicializado');

              const functions = getFunctions(app);
              const switchPaymentMethodFn = httpsCallable(functions, 'switchPaymentMethod');
              
              console.log(`🔄 Cambiando método de pago a ${newMethod}...`);
              const result = await switchPaymentMethodFn({
                rideId,
                newPaymentMethod: newMethod,
                reason: `Cliente ${paymentMethod === 'cash' ? 'no tiene efectivo' : 'prefiere pagar en efectivo'}`,
              });

              const data = result.data as any;
              console.log('✅ Método de pago cambiado:', data);

              // Actualizar estado local
              setPaymentMethod(newMethod);
              setClientConfirmed(false); // Reset confirmación

              Alert.alert(
                '✅ Método Cambiado',
                `El método de pago se cambió a ${methodName.toLowerCase()}. El cliente recibirá una notificación.`
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

  // Reportar problema
  const handleReportIssue = () => {
    Alert.alert(
      'Reportar Problema',
      '¿Qué sucedió con el pago?',
      [
        {
          text: 'Cliente no pagó',
          onPress: () => handleCancelPayment('Cliente no pagó el monto acordado'),
        },
        {
          text: 'Monto incorrecto',
          onPress: () => handleCancelPayment('Cliente pagó un monto diferente'),
        },
        {
          text: 'Problema con tarjeta',
          onPress: () => handleCancelPayment('Problema procesando pago con tarjeta'),
        },
        {
          text: 'Otro problema',
          onPress: () => handleCancelPayment('Otro problema con el pago'),
        },
        {
          text: 'Cancelar',
          style: 'cancel',
        },
      ]
    );
  };

  const handleCancelPayment = async (reason: string) => {
    try {
      setConfirming(true);

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');

      const functions = getFunctions(app);
      const cancelCashPayment = httpsCallable(functions, 'cancelCashPayment');
      
      console.log('🔄 Cancelando pago con razón:', reason);
      await cancelCashPayment({ rideId, reason });

      Alert.alert(
        'Pago Cancelado',
        'El problema ha sido reportado. El equipo de soporte revisará el caso.',
        [
          {
            text: 'Entendido',
            onPress: () => navigation.replace('AvailableRides'),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error cancelando pago:', error);
      Alert.alert('Error', error.message || 'No se pudo reportar el problema');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando información de pago...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.icon}>
          {paymentMethod === 'cash' ? '💵' : '💳'}
        </Text>
        <Text style={styles.title}>
          {paymentMethod === 'cash' ? 'Pago en Efectivo' : 'Pago con Tarjeta'}
        </Text>
        <Text style={styles.subtitle}>
          {clientName} debe pagar {paymentMethod === 'cash' ? 'en efectivo' : 'con tarjeta'}
        </Text>
      </View>

      {/* Amount Breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Desglose del Pago</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Tarifa del viaje</Text>
          <Text style={styles.value}>C${numericAmount.toFixed(2)}</Text>
        </View>

        {numericTip > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Propina</Text>
            <Text style={styles.valueGreen}>+C${numericTip.toFixed(2)}</Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.totalLabel}>Total a Recibir</Text>
          <Text style={styles.totalValue}>C${totalAmount.toFixed(2)}</Text>
        </View>
      </View>

      {/* Payment Method Badge */}
      <View style={styles.methodBadge}>
        <Text style={styles.methodBadgeText}>
          Método: {paymentMethod === 'cash' ? 'Efectivo 💵' : 'Tarjeta 💳'}
        </Text>
      </View>

      {/* CASH PAYMENT FLOW */}
      {paymentMethod === 'cash' && (
        <>
          {/* Estado de confirmación del cliente */}
          {clientConfirmed ? (
            <View style={[styles.statusCard, styles.statusCardSuccess]}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusTextSuccess}>Cliente confirmó el pago</Text>
              <Text style={styles.statusSubtext}>Puedes confirmar que recibiste el dinero</Text>
            </View>
          ) : (
            <View style={[styles.statusCard, styles.statusCardWarning]}>
              <Text style={styles.statusIcon}>⏳</Text>
              <Text style={styles.statusTextWarning}>Esperando confirmación del cliente</Text>
              <Text style={styles.statusSubtext}>El cliente debe confirmar primero que realizó el pago</Text>
            </View>
          )}

          {/* Instructions */}
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>📋 Instrucciones</Text>
            <Text style={styles.instructionsText}>
              1. Espera a que el cliente confirme el pago{'\n'}
              2. Verifica que te entregue el monto exacto{'\n'}
              3. Cuenta el dinero cuidadosamente{'\n'}
              4. Confirma el pago solo si recibiste el monto completo
            </Text>
          </View>

          {/* Confirm Button */}
          <AnimatedButton
            title="✓ Confirmar - Recibí el Pago"
            onPress={handleConfirmCashPayment}
            loading={confirming}
            disabled={confirming || switching}
            style={styles.confirmButton}
          />
        </>
      )}

      {/* CARD PAYMENT FLOW */}
      {paymentMethod === 'card' && (
        <>
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

          {/* Info */}
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <Text style={styles.infoText}>
              No cierres esta pantalla. Te notificaremos cuando el pago sea confirmado.
            </Text>
          </View>
        </>
      )}

      {/* Switch Payment Method Button */}
      {!clientConfirmed ? (
        <AnimatedButton
          title={paymentMethod === 'cash' ? '💳 Cambiar a Tarjeta' : '💵 Cambiar a Efectivo'}
          onPress={handleSwitchPaymentMethod}
          variant="secondary"
          loading={switching}
          disabled={confirming || switching}
          style={styles.switchButton}
        />
      ) : (
        <View style={styles.disabledSwitchCard}>
          <Text style={styles.disabledSwitchIcon}>🔒</Text>
          <Text style={styles.disabledSwitchText}>
            No se puede cambiar el método de pago
          </Text>
          <Text style={styles.disabledSwitchSubtext}>
            El cliente ya confirmó su pago
          </Text>
        </View>
      )}

      {/* Report Problem Button */}
      <AnimatedButton
        title="⚠️ Reportar Problema"
        onPress={handleReportIssue}
        variant="outline"
        disabled={confirming || switching}
        style={styles.reportButton}
      />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...colors.shadow,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  valueGreen: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  methodBadge: {
    backgroundColor: colors.primary + '20',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  methodBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  statusCardSuccess: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  statusCardWarning: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  statusIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: 8,
  },
  statusTextSuccess: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2E7D32',
    textAlign: 'center',
  },
  statusTextWarning: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F57C00',
    textAlign: 'center',
  },
  statusSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
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
    backgroundColor: colors.primary,
    marginRight: 12,
  },
  statusDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  instructionsCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
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
  confirmButton: {
    marginBottom: 12,
  },
  switchButton: {
    marginBottom: 12,
  },
  disabledSwitchCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  disabledSwitchIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  disabledSwitchText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
    textAlign: 'center',
    marginBottom: 4,
  },
  disabledSwitchSubtext: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  reportButton: {
    marginBottom: 20,
  },
});
