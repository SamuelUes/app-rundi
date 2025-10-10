import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import axios from 'axios';
import { useStripe } from '@stripe/stripe-react-native';
import { API_BASE_URL } from '../../config/environment';

interface PaymentScreenProps {
  route: {
    params: {
      rideId: string;
      amount: number;
      driverId?: string;
      driverName?: string;
      vehiclePlate?: string;
    };
  };
  navigation: any;
}

export default function PaymentScreen({ route, navigation }: PaymentScreenProps) {
  const { rideId, amount, driverId, driverName, vehiclePlate } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [tip, setTip] = useState(0);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [processing, setProcessing] = useState(false);
  const [rideDetails, setRideDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const tipOptions = [10, 15, 20]; // Porcentajes de propina

  useEffect(() => {
    loadRideDetails();
  }, []);

  const loadRideDetails = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/rides/${rideId}`);
      setRideDetails(response.data);
    } catch (error) {
      console.error('Error loading ride details:', error);
      Alert.alert('Error', 'No se pudieron cargar los detalles del viaje');
    } finally {
      setLoading(false);
    }
  };

  const handleTipSelection = (percent: number) => {
    setSelectedTipPercent(percent);
    setCustomTip('');
    setTip(Math.round(amount * (percent / 100)));
  };

  const handleCustomTip = (value: string) => {
    setCustomTip(value);
    setSelectedTipPercent(null);
    const tipAmount = parseFloat(value) || 0;
    setTip(tipAmount);
  };

  const handlePayment = async () => {
    if (paymentMethod === 'card') {
      await processCardPayment();
    } else {
      await processCashPayment();
    }
  };

  const processCardPayment = async () => {
    try {
      setProcessing(true);

      // Paso 1: Crear Payment Intent en el backend
      const response = await axios.post(`${API_BASE_URL}/payments/create-intent`, {
        rideId,
        tip,
      });

      const { clientSecret, paymentId, amount: totalAmount } = response.data;

      // Paso 2: Inicializar Payment Sheet de Stripe
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'DriveAngel.ni',
        paymentIntentClientSecret: clientSecret,
        defaultBillingDetails: {
          name: 'Cliente DriveAngel',
        },
        returnURL: 'driveangel://payment-complete',
      });

      if (initError) {
        Alert.alert('Error', 'No se pudo inicializar el pago: ' + initError.message);
        setProcessing(false);
        return;
      }

      // Paso 3: Presentar Payment Sheet al usuario
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          Alert.alert('Cancelado', 'Pago cancelado por el usuario');
        } else {
          Alert.alert('Error', 'Error al procesar el pago: ' + presentError.message);
        }
        setProcessing(false);
        return;
      }

      // Paso 4: Pago autorizado exitosamente - Navegar a tracking
      Alert.alert(
        '¡Pago Autorizado!',
        'Tu método de pago ha sido autorizado. El cargo se realizará al finalizar el viaje.',
        [
          {
            text: 'Continuar',
            onPress: () => {
              navigation.replace('RideTracking', {
                rideId,
                driverId: driverId || '',
                driverName: driverName || 'Conductor',
                vehiclePlate: vehiclePlate || 'N/A',
                estimatedFare: amount,
              });
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Error al procesar el pago');
    } finally {
      setProcessing(false);
    }
  };

  const processCashPayment = async () => {
    try {
      setProcessing(true);

      await axios.post(`${API_BASE_URL}/payments/cash`, {
        rideId,
        tip,
      });

      Alert.alert(
        '¡Pago Registrado!',
        `Por favor paga C$${(amount + tip).toFixed(2)} en efectivo al conductor`,
        [
          {
            text: 'Entendido',
            onPress: () => navigation.navigate('ClientHome'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Error al registrar el pago');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  const totalAmount = amount + tip;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Pago del Viaje</Text>
          <Text style={styles.subtitle}>Completa tu pago de forma segura</Text>
        </View>

        {/* Resumen del viaje */}
        {rideDetails && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumen del Viaje</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Origen:</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {rideDetails.originAddress}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Destino:</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {rideDetails.destinationAddress}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Distancia:</Text>
              <Text style={styles.summaryValue}>
                {(rideDetails.estimatedDistance / 1000).toFixed(1)} km
              </Text>
            </View>
          </View>
        )}

        {/* Desglose de costos */}
        <View style={styles.costCard}>
          <Text style={styles.costTitle}>Desglose de Costos</Text>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Tarifa del viaje</Text>
            <Text style={styles.costValue}>C${amount.toFixed(2)}</Text>
          </View>
          {tip > 0 && (
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Propina</Text>
              <Text style={styles.costValue}>C${tip.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total a Pagar</Text>
            <Text style={styles.totalValue}>C${totalAmount.toFixed(2)}</Text>
          </View>
        </View>

        {/* Propina */}
        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>¿Deseas agregar propina?</Text>
          <View style={styles.tipOptions}>
            {tipOptions.map((percent) => (
              <TouchableOpacity
                key={percent}
                style={[
                  styles.tipButton,
                  selectedTipPercent === percent && styles.tipButtonActive,
                ]}
                onPress={() => handleTipSelection(percent)}
              >
                <Text
                  style={[
                    styles.tipButtonText,
                    selectedTipPercent === percent && styles.tipButtonTextActive,
                  ]}
                >
                  {percent}%
                </Text>
                <Text
                  style={[
                    styles.tipButtonAmount,
                    selectedTipPercent === percent && styles.tipButtonAmountActive,
                  ]}
                >
                  C${Math.round(amount * (percent / 100))}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.customTipLabel}>O ingresa un monto personalizado:</Text>
          <TextInput
            style={styles.customTipInput}
            placeholder="C$ 0.00"
            keyboardType="numeric"
            value={customTip}
            onChangeText={handleCustomTip}
          />
        </View>

        {/* Método de pago */}
        <View style={styles.paymentMethodCard}>
          <Text style={styles.paymentMethodTitle}>Método de Pago</Text>
          <TouchableOpacity
            style={[
              styles.methodButton,
              paymentMethod === 'card' && styles.methodButtonActive,
            ]}
            onPress={() => setPaymentMethod('card')}
          >
            <Text style={styles.methodIcon}>💳</Text>
            <View style={styles.methodInfo}>
              <Text style={styles.methodName}>Tarjeta de Crédito/Débito</Text>
              <Text style={styles.methodDescription}>Pago seguro con Stripe</Text>
            </View>
            {paymentMethod === 'card' && (
              <Text style={styles.methodCheck}>✓</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.methodButton,
              paymentMethod === 'cash' && styles.methodButtonActive,
            ]}
            onPress={() => setPaymentMethod('cash')}
          >
            <Text style={styles.methodIcon}>💵</Text>
            <View style={styles.methodInfo}>
              <Text style={styles.methodName}>Efectivo</Text>
              <Text style={styles.methodDescription}>Paga al conductor</Text>
            </View>
            {paymentMethod === 'cash' && (
              <Text style={styles.methodCheck}>✓</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Botón de pago */}
        <TouchableOpacity
          style={[styles.payButton, processing && styles.payButtonDisabled]}
          onPress={handlePayment}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payButtonText}>
              {paymentMethod === 'card' ? 'Pagar con Tarjeta' : 'Confirmar Pago en Efectivo'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Info de seguridad */}
        <View style={styles.securityInfo}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>
            Tu información está protegida con encriptación de nivel bancario
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    width: 80,
  },
  summaryValue: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  costCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  costTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  costLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  costValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  tipCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  tipOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  tipButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tipButtonActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  tipButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  tipButtonTextActive: {
    color: '#4CAF50',
  },
  tipButtonAmount: {
    fontSize: 12,
    color: '#999',
  },
  tipButtonAmountActive: {
    color: '#4CAF50',
  },
  customTipLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  customTipInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentMethodCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentMethodTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  methodIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  methodDescription: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  methodCheck: {
    fontSize: 24,
    color: '#2196F3',
    fontWeight: '700',
  },
  payButton: {
    backgroundColor: '#000',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  payButtonDisabled: {
    opacity: 0.5,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
  },
  securityIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: '#2E7D32',
    lineHeight: 18,
  },
});
