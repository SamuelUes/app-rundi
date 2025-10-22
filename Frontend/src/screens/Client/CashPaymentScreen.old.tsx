import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedButton } from '../../components/AnimatedButton';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { initializeFirebase } from '../../config/firebase';

interface CashPaymentScreenProps {
  route: {
    params: {
      rideId: string;
      amount: number;
      tip: number;
      driverName: string;
    };
  };
  navigation: any;
}

export default function CashPaymentScreen({ route, navigation }: CashPaymentScreenProps) {
  const { rideId, amount, tip, driverName } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [loading, setLoading] = useState(true);

  const totalAmount = amount + tip;

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const { app } = await initializeFirebase();
        if (!app) throw new Error('Firebase no inicializado');

        const db = getDatabase(app);
        const paymentRef = ref(db, `paymentStatus/${rideId}`);

        unsubscribe = onValue(paymentRef, (snapshot) => {
          const data = snapshot.val();
          console.log('💵 Estado del pago:', data);

          if (data?.status) {
            setPaymentStatus(data.status);
            setLoading(false);

            // Si el conductor confirmó el pago, no mostrar alert
            // El botón "Calificar Viaje" aparecerá automáticamente en la UI
            if (data.status === 'completed') {
              console.log('✅ Pago confirmado por el conductor');
            }
          }
        });
      } catch (error) {
        console.error('Error configurando listener:', error);
        setLoading(false);
      }
    };

    setupListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [rideId]);

  const handleBackToHome = () => {
    navigation.replace('ClientHome');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando información del pago...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>💵</Text>
        <Text style={styles.headerTitle}>Pago en Efectivo</Text>
        <Text style={styles.headerSubtitle}>
          {paymentStatus === 'completed' 
            ? 'Pago confirmado por el conductor'
            : 'Esperando confirmación del conductor'}
        </Text>
      </View>

      {/* Información del pago */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Resumen del Pago</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Conductor:</Text>
          <Text style={styles.value}>{driverName}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Tarifa del viaje:</Text>
          <Text style={styles.value}>C${amount.toFixed(2)}</Text>
        </View>

        {tip > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Propina:</Text>
            <Text style={styles.value}>C${tip.toFixed(2)}</Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.totalLabel}>Total a pagar:</Text>
          <Text style={styles.totalValue}>C${totalAmount.toFixed(2)}</Text>
        </View>
      </View>

      {/* Instrucciones */}
      <View style={[styles.card, styles.instructionsCard]}>
        <Text style={styles.instructionsTitle}>📋 Instrucciones</Text>
        <Text style={styles.instructionsText}>
          1. Entrega el monto exacto en efectivo al conductor
        </Text>
        <Text style={styles.instructionsText}>
          2. Espera a que el conductor confirme el pago
        </Text>
        <Text style={styles.instructionsText}>
          3. Una vez confirmado, podrás calificar el viaje
        </Text>
      </View>

      {/* Estado del pago */}
      {paymentStatus === 'pending' || paymentStatus === 'pending_confirmation' ? (
        <View style={[styles.card, styles.waitingCard]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.waitingText}>
            Esperando confirmación del conductor...
          </Text>
          <Text style={styles.waitingSubtext}>
            El conductor debe confirmar que recibió el pago en efectivo
          </Text>
        </View>
      ) : paymentStatus === 'completed' ? (
        <View style={[styles.card, styles.successCard]}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successText}>¡Pago Confirmado!</Text>
          <Text style={styles.successSubtext}>
            El conductor ha confirmado que recibió el pago
          </Text>
        </View>
      ) : null}

      {/* Botones */}
      <View style={styles.buttonsContainer}>
        {paymentStatus === 'completed' ? (
          <AnimatedButton
            title="Calificar Viaje"
            onPress={() => navigation.replace('Rating', { rideId })}
            style={styles.primaryButton}
          />
        ) : (
          <AnimatedButton
            title="Volver al Inicio"
            onPress={handleBackToHome}
            style={styles.secondaryButton}
            variant="secondary"
          />
        )}
      </View>

      {/* Nota importante */}
      <View style={styles.noteCard}>
        <Text style={styles.noteIcon}>ℹ️</Text>
        <Text style={styles.noteText}>
          Si tienes algún problema con el pago, contacta a soporte desde el menú de ayuda
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.text,
    },
    header: {
      alignItems: 'center',
      marginBottom: 24,
    },
    headerIcon: {
      fontSize: 64,
      marginBottom: 12,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    headerSubtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: 'bold',
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
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    totalLabel: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
    },
    totalValue: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.primary,
    },
    instructionsCard: {
      backgroundColor: `${colors.primary}15`,
      borderColor: colors.primary,
    },
    instructionsTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 12,
    },
    instructionsText: {
      fontSize: 14,
      color: colors.text,
      marginBottom: 8,
      lineHeight: 20,
    },
    waitingCard: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    waitingText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      textAlign: 'center',
    },
    waitingSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 8,
      textAlign: 'center',
    },
    successCard: {
      alignItems: 'center',
      backgroundColor: `${colors.success || '#4CAF50'}15`,
      borderColor: colors.success || '#4CAF50',
    },
    successIcon: {
      fontSize: 64,
      marginBottom: 12,
    },
    successText: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.success || '#4CAF50',
      marginBottom: 8,
    },
    successSubtext: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    buttonsContainer: {
      marginTop: 8,
      marginBottom: 16,
    },
    primaryButton: {
      marginBottom: 12,
    },
    secondaryButton: {
      marginBottom: 12,
    },
    noteCard: {
      flexDirection: 'row',
      backgroundColor: `${colors.warning || '#FF9800'}15`,
      borderRadius: 8,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.warning || '#FF9800',
    },
    noteIcon: {
      fontSize: 20,
      marginRight: 12,
    },
    noteText: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
  });
