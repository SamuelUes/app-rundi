import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedButton } from '../../components/AnimatedButton';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase, ref, update, onValue, off } from 'firebase/database';
import { initializeFirebase } from '../../config/firebase';
import BiometricService from '../../services/biometricService';
import { supabase } from '../../config/supabase';
import sessionService from '../../services/sessionService';

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
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSmsInput, setShowSmsInput] = useState(false);
  const [smsCode, setSmsCode] = useState('');
  const [smsAttempts, setSmsAttempts] = useState(0);
  const [smsExpiresAt, setSmsExpiresAt] = useState<Date | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  console.log('💵 [ConfirmCashPaymentScreen] Params:', { rideId, amount, tip, clientName });

  // Convertir a números si vienen como strings
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  const numericTip = typeof tip === 'string' ? parseFloat(tip) : (tip || 0);
  const totalAmount = numericAmount + numericTip;

  // Escuchar si el cliente confirmó el pago
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

        console.log('👂 [ConfirmCashPaymentScreen] Escuchando confirmación del cliente...');

        const unsubscribe = onValue(paymentRef, (snapshot) => {
          const paymentData = snapshot.val();
          console.log('📦 [ConfirmCashPaymentScreen] paymentStatus:', paymentData);

          if (paymentData) {
            const confirmed = paymentData.confirmedByClient === true;
            setClientConfirmed(confirmed);
            console.log(`${confirmed ? '✅' : '⏳'} Cliente ${confirmed ? 'confirmó' : 'no ha confirmado'} el pago`);
          }
          setLoading(false);
        });

        return () => {
          off(paymentRef);
        };
      } catch (error) {
        console.error('❌ Error configurando listener:', error);
        setLoading(false);
      }
    };

    setupListener();
  }, [rideId]);

  const handleConfirmWithFingerprint = async () => {
    try {
      setIsAuthenticating(true);

      const result = await BiometricService.authenticate(
        `Confirma tu huella para completar el pago de C$${totalAmount.toFixed(2)}`
      );

      if (!result.success) {
        Alert.alert('Error', result.error || 'Autenticación fallida');
        return;
      }

      // Guardar en Supabase
      await supabase.from('biometric_authentications').insert({
        ride_id: rideId,
        user_id: 'driver_id', // TODO: obtener del contexto
        user_type: 'driver',
        biometric_type: 'fingerprint',
        context: 'payment_confirmation',
        success: true,
        attempt_number: 1,
      });

      // Actualizar Firebase
      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');
      const db = getDatabase(app);
      const paymentRef = ref(db, `paymentStatus/${rideId}`);
      
      await update(paymentRef, {
        status: 'payment_in_progress',
        confirmedAt: Date.now(),
        confirmedBy: 'driver',
        finalAmount: totalAmount,
        biometric_authenticated: true,
        biometric_type: 'fingerprint',
        authentication_method: 'biometric',
      });

      // Llamar Cloud Function
      const functions = getFunctions(app);
      const completeCashPayment = httpsCallable(functions, 'completeCashPayment');
      const deviceId = await sessionService.getDeviceId();
      await completeCashPayment({ rideId, deviceId });

      Alert.alert('Éxito', 'Pago confirmado correctamente');
      navigation.replace('AvailableRides');

    } catch (error: any) {
      console.error('❌ Error:', error);
      Alert.alert('Error', error.message || 'Error procesando pago');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleUseSms = async () => {
    try {
      setIsAuthenticating(true);

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');
      
      const functions = getFunctions(app);
      const sendSmsCode = httpsCallable(functions, 'sendSmsCode');
      
      const deviceId = await sessionService.getDeviceId();
      await sendSmsCode({
        rideId,
        userId: 'driver_id', // TODO: obtener del contexto
        phoneNumber: '+50512345678', // TODO: obtener del contexto
        context: 'payment_confirmation',
        deviceId,
      });

      setSmsExpiresAt(new Date(Date.now() + 10 * 60 * 1000));
      setSmsAttempts(0);
      setShowSmsInput(true);
      
      Alert.alert('SMS Enviado', 'Revisa tu teléfono para el código');

    } catch (error: any) {
      console.error('❌ Error:', error);
      Alert.alert('Error', 'Error enviando SMS');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleVerifySmsCode = async () => {
    try {
      setIsAuthenticating(true);

      if (smsCode.length !== 6) {
        Alert.alert('Error', 'Ingresa 6 dígitos');
        return;
      }

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');
      
      const functions = getFunctions(app);
      const verifySmsCode = httpsCallable(functions, 'verifySmsCode');
      
      const deviceId2 = await sessionService.getDeviceId();
      const result = await verifySmsCode({
        rideId,
        userId: 'driver_id', // TODO: obtener del contexto
        code: smsCode,
        context: 'payment_confirmation',
        deviceId: deviceId2,
      });

      if (!(result.data as any).verified) {
        setSmsAttempts(smsAttempts + 1);
        
        if (smsAttempts >= 2) {
          Alert.alert('Error', 'Demasiados intentos. Intenta de nuevo en 5 minutos');
          setShowSmsInput(false);
        } else {
          Alert.alert('Error', `Código incorrecto. Intentos restantes: ${3 - smsAttempts - 1}`);
        }
        return;
      }

      // Actualizar Firebase
      const db = getDatabase(app);
      const paymentRef = ref(db, `paymentStatus/${rideId}`);
      
      await update(paymentRef, {
        status: 'payment_in_progress',
        confirmedAt: Date.now(),
        confirmedBy: 'driver',
        finalAmount: totalAmount,
        sms_code_verified: true,
        authentication_method: 'sms',
      });

      // Llamar Cloud Function
      const completeCashPayment = httpsCallable(functions, 'completeCashPayment');
      await completeCashPayment({ rideId });

      Alert.alert('Éxito', 'Pago confirmado correctamente');
      navigation.replace('AvailableRides');

    } catch (error: any) {
      console.error('❌ Error:', error);
      Alert.alert('Error', error.message || 'Error verificando código');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleConfirmPayment = async () => {
    // Verificar si el cliente ya confirmó
    if (!clientConfirmed) {
      Alert.alert(
        'Espera',
        'El cliente debe confirmar primero que realizó el pago',
        [{ text: 'OK' }]
      );
      return;
    }

    // Usar biometría como método principal
    await handleConfirmWithFingerprint();
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

      // Llamar función del backend para cancelar pago
      // El backend se encargará de actualizar paymentStatus y activeRides
      const functions = getFunctions(app);
      const cancelCashPayment = httpsCallable(functions, 'cancelCashPayment');
      
      console.log('🔄 Cancelando pago con razón:', reason);
      const deviceId4 = await sessionService.getDeviceId();
      await cancelCashPayment({ rideId, reason, deviceId: deviceId4 });

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

  const handleSwitchToCard = () => {
    Alert.alert(
      'Cambiar a Pago con Tarjeta',
      '¿El cliente no tiene efectivo? Puedes cambiar el método de pago a tarjeta.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Cambiar a Tarjeta',
          onPress: async () => {
            try {
              setConfirming(true);

              const { app } = await initializeFirebase();
              if (!app) throw new Error('Firebase no inicializado');

              const functions = getFunctions(app);
              const switchPaymentMethodFn = httpsCallable(functions, 'switchPaymentMethod');
              
              console.log('🔄 Cambiando método de pago a tarjeta...');
              const devId = await sessionService.getDeviceId();
              const result = await switchPaymentMethodFn({
                rideId,
                newPaymentMethod: 'card',
                reason: 'Cliente no tiene efectivo',
                deviceId: devId,
              });

              const data = result.data as any;
              console.log('✅ Método de pago cambiado:', data);

              Alert.alert(
                '✅ Método Cambiado',
                'El método de pago se cambió a tarjeta. El cliente recibirá una notificación.',
                [
                  {
                    text: 'Entendido',
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            } catch (error: any) {
              console.error('❌ Error cambiando método de pago:', error);
              Alert.alert('Error', error.message || 'No se pudo cambiar el método de pago');
            } finally {
              setConfirming(false);
            }
          },
        },
      ]
    );
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

      {/* Estado de confirmación del cliente */}
      {loading ? (
        <View style={styles.statusCard}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.statusText}>Verificando estado del pago...</Text>
        </View>
      ) : clientConfirmed ? (
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
        title="💳 Cambiar a Pago con Tarjeta"
        onPress={handleSwitchToCard}
        variant="secondary"
        disabled={confirming}
        style={styles.switchButton}
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
    color: '#E65100',
    textAlign: 'center',
  },
  statusSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
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
  switchButton: {
    marginBottom: 12,
  },
  reportButton: {
    marginBottom: 20,
  },
});
