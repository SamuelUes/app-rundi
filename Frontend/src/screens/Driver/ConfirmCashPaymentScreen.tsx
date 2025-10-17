import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedButton } from '../../components/AnimatedButton';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase, ref, update } from 'firebase/database';
import { initializeFirebase } from '../../config/firebase';

interface ConfirmCashPaymentScreenProps {
  route: {
    params: {
      rideId: string;
      amount: number;
      tip: number;
      clientName: string;
    };
  };
  navigation: any;
}

export default function ConfirmCashPaymentScreen({ route, navigation }: ConfirmCashPaymentScreenProps) {
  const { rideId, amount, tip, clientName } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [confirming, setConfirming] = useState(false);

  // Convertir a números si vienen como strings
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  const numericTip = typeof tip === 'string' ? parseFloat(tip) : (tip || 0);
  const totalAmount = numericAmount + numericTip;

  const handleConfirmPayment = async () => {
    try {
      setConfirming(true);

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');

      // Actualizar status en Firebase Realtime DB
      const db = getDatabase(app);
      const paymentRef = ref(db, `paymentStatus/${rideId}`);
      
      await update(paymentRef, {
        status: 'completed',
        confirmedAt: Date.now(),
        confirmedBy: 'driver',
      });

      // Llamar función para completar pago en Supabase
      const functions = getFunctions(app);
      const completeCashPayment = httpsCallable(functions, 'completeCashPayment');
      
      await completeCashPayment({ rideId });

      Alert.alert(
        '¡Pago Confirmado!',
        'El pago en efectivo ha sido registrado exitosamente',
        [
          {
            text: 'Volver a Búsqueda',
            onPress: () => navigation.replace('AvailableRides'),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error confirmando pago:', error);
      Alert.alert('Error', error.message || 'No se pudo confirmar el pago');
    } finally {
      setConfirming(false);
    }
  };

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

      // Actualizar status en Firebase Realtime DB
      const db = getDatabase(app);
      const paymentRef = ref(db, `paymentStatus/${rideId}`);
      
      await update(paymentRef, {
        status: 'canceled',
        cancelReason: reason,
        canceledAt: Date.now(),
        canceledBy: 'driver',
      });

      // Llamar función para cancelar pago en Supabase
      const functions = getFunctions(app);
      const cancelCashPayment = httpsCallable(functions, 'cancelCashPayment');
      
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

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.icon}>💵</Text>
        <Text style={styles.title}>Confirmar Pago en Efectivo</Text>
        <Text style={styles.subtitle}>
          {clientName} debe pagarte en efectivo
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

      {/* Instructions */}
      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>📋 Instrucciones</Text>
        <Text style={styles.instructionsText}>
          1. Verifica que el cliente te entregue el monto exacto{'\n'}
          2. Cuenta el dinero cuidadosamente{'\n'}
          3. Confirma el pago solo si recibiste el monto completo
        </Text>
      </View>

      {/* Warning */}
      <View style={styles.warningCard}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={styles.warningText}>
          Si el cliente no te paga o hay algún problema, presiona "Reportar Problema" antes de confirmar.
        </Text>
      </View>

      {/* Buttons */}
      <AnimatedButton
        title="✓ Confirmar - Recibí el Pago"
        onPress={handleConfirmPayment}
        loading={confirming}
        disabled={confirming}
        style={styles.confirmButton}
      />

      <AnimatedButton
        title="⚠️ Reportar Problema"
        onPress={handleReportIssue}
        variant="outline"
        disabled={confirming}
        style={styles.reportButton}
      />
    </ScrollView>
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
    marginTop: 20,
    marginBottom: 30,
  },
  icon: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
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
    fontSize: 15,
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
    fontSize: 28,
    fontWeight: '800',
    color: '#4CAF50',
  },
  instructionsCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976D2',
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 22,
  },
  warningCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#F57C00',
    lineHeight: 20,
  },
  confirmButton: {
    marginBottom: 12,
  },
  reportButton: {
    marginBottom: 20,
  },
});
