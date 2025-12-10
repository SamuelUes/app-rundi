import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import penaltiesService, { DriverPenaltySummary, PayAllPenaltiesResult } from '../../services/penaltiesService';
import cardsService, { Card } from '../../services/cardsService';
import { maskCardNumber } from '../../utils/cardUtils';
import BiometricService from '../../services/biometricService';
import { supabase } from '../../config/supabase';

const EMPTY_SUMMARY: DriverPenaltySummary = {
  success: false,
  driverId: '',
  pendingCount: 0,
  pendingAmount: 0,
  penalties: { count: 0, amount: 0 },
  payments: { count: 0, amount: 0 },
  paymentDetails: [],
};

export default function PayCommissionsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DriverPenaltySummary>(EMPTY_SUMMARY);
  const [submitting, setSubmitting] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<'bank_transfer' | 'card'>('bank_transfer');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [summaryResponse, savedCards] = await Promise.all([
          penaltiesService.getDriverPenaltySummary(),
          cardsService.getCards(),
        ]);

        setSummary(summaryResponse?.success ? summaryResponse : EMPTY_SUMMARY);

        const activeCards = (savedCards || []).filter((card: Card) => card && card.isActive);
        setCards(activeCards);
        if (activeCards.length > 0) {
          setSelectedMethod('card');
          const defaultCard = activeCards.find((c: Card) => c.isDefault) || activeCards[0];
          setSelectedCardId(defaultCard.id);
        } else {
          setSelectedMethod('bank_transfer');
          setSelectedCardId(null);
        }
      } catch (e) {
        setSummary(EMPTY_SUMMARY);
        setCards([]);
        setSelectedMethod('bank_transfer');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handlePay = async () => {
    if (!summary || summary.pendingAmount <= 0) {
      Alert.alert('Sin comisiones pendientes', 'No tienes comisiones por pagar');
      return;
    }
    if (selectedMethod === 'card' && !selectedCardId) {
      Alert.alert('Selecciona una tarjeta', 'Debes elegir una tarjeta para pagar con tarjeta.');
      return;
    }
    try {
      const totalToPay = summary.pendingAmount || 0;

      const biometricResult = await BiometricService.authenticate(
        `Confirma tu identidad para pagar tus comisiones por C$${totalToPay.toFixed(2)}`
      );

      if (!biometricResult.success) {
        if (
          biometricResult.error === 'Dispositivo no soporta biometría' ||
          biometricResult.error === 'No hay biometría registrada'
        ) {
          console.log('Biometría no disponible o no registrada. Continuando sin autenticación biométrica.');
        } else {
          Alert.alert('Error', biometricResult.error || 'No se pudo confirmar tu identidad. Intenta de nuevo.');
          return;
        }
      } else {
        try {
          if (user?.id) {
            await supabase.from('biometric_authentications').insert({
              ride_id: null,
              user_id: user.id,
              user_type: 'driver',
              biometric_type: biometricResult.biometryType || 'biometric',
              context: 'commission_payment',
              success: true,
              attempt_number: 1,
            });
          }
        } catch (logError) {
          console.error('❌ Error registrando autenticación biométrica en Supabase (commissions):', logError);
        }
      }

      setSubmitting(true);
      const res: PayAllPenaltiesResult = await penaltiesService.payAllPenalties({
        reference: reference || undefined,
        method: selectedMethod,
        cardId: selectedMethod === 'card' ? selectedCardId || undefined : undefined,
      });
      if (res?.success) {
        const penaltiesPaid = res.breakdown?.penaltiesPaid ?? 0;
        const paymentsPaid = res.breakdown?.paymentCommissionsPaid ?? 0;
        const detailMessage = `Penalizaciones: ${penaltiesPaid} · C$${(res.breakdown?.penaltiesAmount ?? 0).toFixed(2)}\nComisiones Supabase: ${paymentsPaid} · C$${(res.breakdown?.paymentCommissionsAmount ?? 0).toFixed(2)}`;
        Alert.alert('Pago registrado', `Se registró el pago de C$${res.totalPaid.toFixed(2)} (${res.changed} conceptos)\n\n${detailMessage}`, [
          {
            text: 'OK',
            onPress: () => navigation.replace('Earnings'),
          },
        ]);
      } else {
        Alert.alert('Error', 'No se pudo registrar el pago');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo registrar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (navigation?.canGoBack?.() && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Earnings');
    }
  };

  const formatCurrency = (n: number) => `C$${Number(n || 0).toFixed(2)}`;

  const renderPaymentMethods = () => {
    const hasCards = cards.length > 0;

    return (
      <View style={styles.methodsContainer}>
        <Text style={styles.methodsTitle}>Elige cómo quieres pagar</Text>

        {/* Método principal: Tarjeta guardada */}
        <TouchableOpacity
          style={[
            styles.methodOption,
            selectedMethod === 'card' && styles.methodOptionSelected,
          ]}
          onPress={() => setSelectedMethod('card')}
          activeOpacity={0.8}
        >
          <View style={styles.methodOptionHeader}>
            <Text style={styles.methodOptionLabel}>Tarjeta guardada</Text>
            {selectedMethod === 'card' && <Text style={styles.methodOptionCheck}>✓</Text>}
          </View>
          <Text style={styles.methodOptionDescription}>
            Usa una de tus tarjetas guardadas para registrar el pago.
          </Text>

          {hasCards && selectedMethod === 'card' && (
            <View style={styles.cardsList}>
              {cards.map((card) => {
                const isSelected = selectedCardId === card.id;
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.cardItem, isSelected && styles.cardItemSelected]}
                    onPress={() => setSelectedCardId(card.id)}
                  >
                    <Text style={styles.cardItemLabel}>
                      {`${card.brand.toUpperCase()} ${maskCardNumber(card.last4)} · Exp ${card.expMonth}/${card.expYear}`}
                      {card.isDefault ? ' (Predeterminada)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {!hasCards && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.methodOptionDescription}>
                Aún no tienes tarjetas guardadas. Agrega una para poder pagar con tarjeta.
              </Text>
              <TouchableOpacity
                style={{ marginTop: 8 }}
                onPress={() => navigation.navigate('PaymentMethods')}
                activeOpacity={0.8}
              >
                <Text style={[styles.cardItemLabel, { color: colors.primary }]}>Ir a Métodos de pago →</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>

        {/* Método secundario: Transferencia bancaria */}
        <TouchableOpacity
          style={[
            styles.methodOption,
            selectedMethod === 'bank_transfer' && styles.methodOptionSelected,
          ]}
          onPress={() => setSelectedMethod('bank_transfer')}
          activeOpacity={0.8}
        >
          <View style={styles.methodOptionHeader}>
            <Text style={styles.methodOptionLabel}>Transferencia bancaria</Text>
            {selectedMethod === 'bank_transfer' && <Text style={styles.methodOptionCheck}>✓</Text>}
          </View>
          <Text style={styles.methodOptionDescription}>
            Transfiere desde tu cuenta hacia la cuenta de la empresa. Los datos estarán en el panel administrativo.
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pagar comisiones pendientes</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Cargando resumen...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ padding: 16 }}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumen de comisiones</Text>

            <View style={styles.summaryHighlight}>
              <Text style={styles.summaryHighlightAmount}>{formatCurrency(summary?.pendingAmount ?? 0)}</Text>
              <Text style={styles.summaryHighlightLabel}>
                {summary?.pendingCount ?? 0} {summary?.pendingCount === 1 ? 'concepto pendiente' : 'conceptos pendientes'}
              </Text>
            </View>

            <View style={styles.summaryBreakdown}>
              <View style={styles.summaryBreakdownItem}>
                <View style={styles.summaryBreakdownText}>
                  <Text style={styles.summaryBreakdownLabel}>Viajes cobrados</Text>
                  <Text style={styles.summaryBreakdownCaption}>Comisiones retenidas por viajes completados en efectivo.</Text>
                </View>
                <Text style={styles.summaryBreakdownValue}>
                  {`${summary?.payments.count ?? 0} · ${formatCurrency(summary?.payments.amount ?? 0)}`}
                </Text>
              </View>

              <View style={styles.summaryBreakdownItem}>
                <View style={styles.summaryBreakdownText}>
                  <Text style={styles.summaryBreakdownLabel}>Ajustes por cancelación</Text>
                  <Text style={styles.summaryBreakdownCaption}>Cargos cuando un viaje se cancela después de haber iniciado.</Text>
                </View>
                <Text style={styles.summaryBreakdownValue}>
                  {`${summary?.penalties.count ?? 0} · ${formatCurrency(summary?.penalties.amount ?? 0)}`}
                </Text>
              </View>
            </View>

            <Text style={styles.summaryHint}>Liquida el monto total para mantener tu cuenta activa y evitar restricciones.</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Método de pago</Text>
            {renderPaymentMethods()}
          </View>

          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Referencia de transferencia (opcional)</Text>
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder="Ej. #FT-12345678"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoCapitalize="characters"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.payButton,
              (submitting || (summary?.pendingAmount ?? 0) <= 0 || (selectedMethod === 'card' && !selectedCardId)) &&
                styles.payButtonDisabled,
            ]}
            disabled={submitting || (summary?.pendingAmount ?? 0) <= 0 || (selectedMethod === 'card' && !selectedCardId)}
            onPress={handlePay}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payButtonText}>Pagar {formatCurrency(summary?.pendingAmount ?? 0)}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surface,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    backButtonText: { fontSize: 24, color: colors.text },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    loadingText: { marginTop: 8, color: colors.textSecondary },

    content: { flex: 1 },

    summaryCard: {
      backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 16,
    },
    summaryTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
    summaryHighlight: {
      marginTop: 8,
      marginBottom: 12,
      padding: 16,
      borderRadius: 12,
      backgroundColor: '#FFF5F5',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#FFCDD2',
    },
    summaryHighlightAmount: {
      fontSize: 24,
      fontWeight: '800',
      color: '#D84315',
    },
    summaryHighlightLabel: {
      marginTop: 4,
      fontSize: 13,
      color: '#BF360C',
    },
    summaryBreakdown: {
      gap: 12,
    },
    summaryBreakdownItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 4,
    },
    summaryBreakdownText: {
      flex: 1,
      paddingRight: 12,
      gap: 4,
    },
    summaryBreakdownLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    summaryBreakdownCaption: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    summaryBreakdownValue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    summaryHint: {
      marginTop: 16,
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },

    infoCard: {
      backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 16,
    },
    infoTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
    methodsContainer: { gap: 12 },
    methodsTitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
    methodOption: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      backgroundColor: colors.background,
    },
    methodOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.background,
    },
    methodOptionDisabled: {
      opacity: 0.45,
    },
    methodOptionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    methodOptionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    methodOptionCheck: { fontSize: 18, color: colors.primary },
    methodOptionDescription: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    cardsList: { marginTop: 8, gap: 8 },
    cardItem: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.surface,
    },
    cardItemSelected: {
      borderColor: colors.primary,
    },
    cardItemLabel: { fontSize: 13, color: colors.text, fontWeight: '500' },

    inputCard: {
      backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 24,
    },
    inputLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
    input: {
      backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 10, color: colors.text,
    },

    payButton: {
      backgroundColor: '#2E7D32', paddingVertical: 14, alignItems: 'center', borderRadius: 12,
    },
    payButtonDisabled: {
      backgroundColor: '#9E9E9E',
    },
    payButtonText: { fontSize: 15, color: '#fff', fontWeight: '800' },
  });
