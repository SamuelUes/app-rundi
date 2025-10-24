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
import { useAuth } from '../../context/AuthContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase, ref as dbRef, update as dbUpdate, get } from 'firebase/database';
import { initializeFirebase } from '../../config/firebase';

interface PaymentScreenProps {
  route: {
    params: {
      rideId: string;
      amount: number;
      driverId?: string;
      driverName?: string;
      vehiclePlate?: string;
      isPendingPayment?: boolean; // ✅ NUEVO: Flag para pagos pendientes
    };
  };
  navigation: any;
}

export default function PaymentScreen({ route, navigation }: PaymentScreenProps) {
  const { rideId, amount, driverId, driverName, isPendingPayment = false } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tip, setTip] = useState(0);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  // ✅ NUEVO: Si es pago pendiente, forzar 'card', si no, iniciar con 'card' por defecto
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>(isPendingPayment ? 'card' : 'card');
  const [selectedBank, setSelectedBank] = useState<'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz'>('bac');
  const [processing, setProcessing] = useState(false);
  const [rideDetails, setRideDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<string>('card');
  
  // Tarjetas guardadas
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  
  // Formulario de tarjeta nueva
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveCard, setSaveCard] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false); // ✅ Flag para evitar sobreposición

  const tipOptions = [10, 15, 20]; // Porcentajes de propina

  // Obtener el monto del viaje (de params o de rideDetails)
  const rideAmount = amount || rideDetails?.finalFare || rideDetails?.estimatedPrice || 0;

  useEffect(() => {
    loadRideDetails();
    loadSavedCards();
    
    // Setup listener y guardar unsubscribe
    let unsubscribe: (() => void) | undefined;
    setupPaymentMethodListener().then((unsub) => {
      unsubscribe = unsub;
    });
    
    // Cleanup al desmontar
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const loadRideDetails = async () => {
    try {
      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');
      
      // Obtener datos del viaje desde Realtime DB
      const { getDatabase, ref: dbRef, get } = await import('firebase/database');
      const db = getDatabase(app);
      const rideRef = dbRef(db, `activeRides/${rideId}`);
      const snapshot = await get(rideRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        setRideDetails({
          originAddress: data.origin?.address || 'N/A',
          destinationAddress: data.destination?.address || 'N/A',
          estimatedDistance: data.estimatedDistance || 0,
          estimatedDuration: data.estimatedDuration || 0,
          finalFare: data.finalFare || data.estimatedPrice || amount,
          driverId: data.driverId,
        });
      } else {
        console.log('Viaje no encontrado en activeRides, usando datos de params');
      }
    } catch (error: any) {
      console.error('Error loading ride details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedCards = async () => {
    try {
      const { app } = await initializeFirebase();
      if (!app) return;

      const functions = getFunctions(app);
      const getCardsFn = httpsCallable(functions, 'getCards');
      const result = await getCardsFn();
      const data = result.data as any;

      if (data.success && data.cards.length > 0) {
        setSavedCards(data.cards);
        // Seleccionar la tarjeta predeterminada automáticamente
        const defaultCard = data.cards.find((card: any) => card.isDefault);
        if (defaultCard) {
          setSelectedCard(defaultCard);
          setUseNewCard(false);
        }
      } else {
        setUseNewCard(true); // Si no hay tarjetas, usar nueva tarjeta
      }
    } catch (error: any) {
      console.error('Error cargando tarjetas:', error);
      setUseNewCard(true);
    }
  };

  // Listener para detectar cambios de método de pago (solo del conductor)
  const setupPaymentMethodListener = async () => {
    try {
      const { app } = await initializeFirebase();
      if (!app) return;

      const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
      const db = getDatabase(app);
      const rideRef = dbRef(db, `activeRides/${rideId}`);

      const unsubscribe = onValue(rideRef, (snapshot) => {
        const data = snapshot.val();
        
        // ✅ MEJORADO: Detectar cambio de método de pago ANTES de actualizar el estado
        const previousPaymentMethod = currentPaymentMethod;
        const newPaymentMethod = data?.paymentMethod || 'card';
        
        // Solo redirigir si:
        // 1. El método cambió
        // 2. NO estamos procesando un pago
        // 3. El cambio fue hecho por el conductor (paymentMethodChangedBy !== clientId)
        if (
          newPaymentMethod && 
          newPaymentMethod !== previousPaymentMethod &&
          !processing &&
          data?.paymentMethodChangedBy && 
          data.paymentMethodChangedBy !== user?.id
        ) {
          console.log(`🔄 [PaymentScreen] Método de pago cambiado por conductor de ${previousPaymentMethod} a ${newPaymentMethod}`);
          
          if (newPaymentMethod === 'cash' && !isNavigating) {
            // Convertir amount a número
            const finalAmount = typeof data.finalFare === 'string' 
              ? parseFloat(data.finalFare) 
              : (data.finalFare || (typeof amount === 'string' ? parseFloat(amount) : amount));
            
            // ✅ NUEVO: Actualizar estado ANTES de navegar
            setCurrentPaymentMethod(newPaymentMethod);
            setIsNavigating(true); // ✅ Marcar que estamos navegando
            
            Alert.alert(
              'Método de Pago Cambiado',
              'El conductor cambió el método de pago a efectivo. Serás redirigido a la pantalla de pago en efectivo.',
              [
                {
                  text: 'Entendido',
                  onPress: () => {
                    console.log(`🔄 [PaymentScreen] Navegando a CashPayment con método: cash`);
                    navigation.replace('CashPayment', {
                      rideId,
                      amount: finalAmount,
                      driverName: data.driver?.name || driverName,
                      driverPhoto: data.driver?.photoURL,
                    });
                  },
                },
              ]
            );
          }
        }
        
        // ✅ NUEVO: Actualizar currentPaymentMethod siempre para evitar bucles
        if (data?.paymentMethod) {
          setCurrentPaymentMethod(data.paymentMethod);
        }
      });

      // Cleanup al desmontar
      return () => {
        off(rideRef);
      };
    } catch (error) {
      console.error('Error configurando listener de método de pago:', error);
    }
  };

  const handleTipSelection = (percent: number) => {
    setSelectedTipPercent(percent);
    setCustomTip('');
    setTip(Math.round(rideAmount * (percent / 100)));
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

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');
      
      const functions = getFunctions(app);
      const db = getDatabase(app);
      
      // Verificar si el pago ya está pre-autorizado
      const paymentStatusRef = dbRef(db, `paymentStatus/${rideId}`);
      const snapshot = await get(paymentStatusRef);
      const paymentData = snapshot.val();
      
      // Si no hay paymentIntentId, crear uno ahora
      if (!paymentData?.paymentIntentId) {
        console.log(`💳 No hay paymentIntent, creando uno ahora...`);
        
        let paymentMethodId = null;
        let finalProvider = 'local'; // Bancos nacionales
        
        if (selectedCard && !useNewCard) {
          // Obtener paymentMethodId de la tarjeta guardada
          console.log(`💳 Usando tarjeta guardada: ${selectedCard.id}`);
          const getCardInfoFn = httpsCallable(functions, 'createPaymentIntentWithSavedCard');
          const cardInfoResult = await getCardInfoFn({
            rideId,
            cardId: selectedCard.id,
            tip: 0,
          });
          const cardInfo = cardInfoResult.data as any;
          paymentMethodId = cardInfo.paymentMethodId;
          finalProvider = cardInfo.provider || 'local';
          console.log(`✅ Tarjeta: ${cardInfo.cardInfo.brand} **** ${cardInfo.cardInfo.last4}`);
        }
        
        // Crear Payment Intent (con o sin tarjeta guardada)
        console.log(`💳 Creando Payment Intent con ${finalProvider}...`);
        const createPaymentIntentFn = httpsCallable(functions, 'createPaymentIntent');
        await createPaymentIntentFn({
          rideId,
          tip: 0,
          provider: finalProvider,
          bank: selectedBank,
          paymentMethodId, // null si es nueva tarjeta, o el ID si es guardada
        });
      }
      
      // NOTA: La actualización de propina se hace desde el backend (Cloud Functions)
      // El cliente NO tiene permisos para escribir en /paymentStatus en Firebase Realtime DB
      // Esto es por seguridad - solo el backend puede actualizar estados de pago

      // Capturar el pago (ya pre-autorizado)
      const capturePaymentFn = httpsCallable(functions, 'capturePayment');
      const result = await capturePaymentFn({
        rideId,
        tip, // Agregar propina al monto final
      });

      const data = result.data as any;
      if (!data.success) {
        throw new Error('Error capturando el pago');
      }

      // Pago capturado exitosamente

      Alert.alert(
        '✅ ¡Pago Completado!',
        `El pago de C$${(rideAmount + tip).toFixed(2)} ha sido procesado exitosamente.`,
        [
          {
            text: 'Calificar Viaje',
            onPress: () => {
              navigation.replace('Rating', {
                rideId,
                driverId: driverId || rideDetails?.driverId,
                role: 'client',
              });
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error capturando pago:', error);
      Alert.alert('Error', error.message || 'Error al procesar el pago');
    } finally {
      setProcessing(false);
    }
  };

  const processCashPayment = async () => {
    try {
      setProcessing(true);

      // NOTA: La actualización de paymentStatus se hace desde el backend (Cloud Functions)
      // El cliente NO tiene permisos para escribir en /paymentStatus en Firebase Realtime DB
      // Esto es por seguridad - solo el backend puede actualizar estados de pago

      Alert.alert(
        '💵 Pago en Efectivo',
        `Por favor paga C$${(rideAmount + tip).toFixed(2)} en efectivo al conductor. El conductor confirmará la recepción del pago.`,
        [
          {
            text: 'Entendido',
            onPress: () => {
              // Navegar a Rating después de confirmar efectivo
              navigation.replace('Rating', {
                rideId,
                driverId: driverId || rideDetails?.driverId,
                role: 'client',
              });
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error procesando pago en efectivo:', error);
      Alert.alert('Error', error.message || 'Error al procesar el pago');
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

  const totalAmount = rideAmount + tip;

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
            <Text style={styles.costValue}>C${rideAmount.toFixed(2)}</Text>
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
              <Text style={styles.methodDescription}>Selecciona tu banco abajo</Text>
            </View>
            {paymentMethod === 'card' && (
              <Text style={styles.methodCheck}>✓</Text>
            )}
          </TouchableOpacity>

          {/* ✅ NUEVO: Deshabilitar efectivo para pagos pendientes */}
          <TouchableOpacity
            style={[
              styles.methodButton,
              paymentMethod === 'cash' && styles.methodButtonActive,
              isPendingPayment && styles.methodButtonDisabled, // Deshabilitar si es pago pendiente
            ]}
            onPress={() => !isPendingPayment && setPaymentMethod('cash')}
            disabled={isPendingPayment}
          >
            <Text style={styles.methodIcon}>💵</Text>
            <View style={styles.methodInfo}>
              <Text style={styles.methodName}>Efectivo</Text>
              <Text style={[
                styles.methodDescription,
                isPendingPayment && styles.methodDescriptionDisabled
              ]}>
                {isPendingPayment ? 'No disponible para pagos pendientes' : 'Paga al conductor'}
              </Text>
            </View>
            {paymentMethod === 'cash' && (
              <Text style={styles.methodCheck}>✓</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Tarjetas Guardadas (solo si es tarjeta y hay tarjetas) */}
        {paymentMethod === 'card' && savedCards.length > 0 && (
          <View style={styles.savedCardsCard}>
            <View style={styles.savedCardsHeader}>
              <Text style={styles.savedCardsTitle}>Tus Tarjetas</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SavedCards')}>
                <Text style={styles.manageCardsLink}>Gestionar →</Text>
              </TouchableOpacity>
            </View>

            {/* Lista de tarjetas guardadas */}
            {savedCards.map((card) => (
              <TouchableOpacity
                key={card.id}
                style={[
                  styles.savedCardItem,
                  selectedCard?.id === card.id && !useNewCard && styles.savedCardItemActive,
                ]}
                onPress={() => {
                  setSelectedCard(card);
                  setUseNewCard(false);
                }}
              >
                <Text style={styles.providerIcon}>🏦</Text>
                <View style={styles.savedCardInfo}>
                  <Text style={styles.savedCardBrand}>{card.brand.toUpperCase()}</Text>
                  <Text style={styles.savedCardNumber}>•••• {card.last4}</Text>
                  {card.isDefault && (
                    <Text style={styles.savedCardDefault}>Predeterminada</Text>
                  )}
                </View>
                {selectedCard?.id === card.id && !useNewCard && (
                  <Text style={styles.savedCardCheck}>✓</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* Opción para usar nueva tarjeta */}
            <TouchableOpacity
              style={[
                styles.savedCardItem,
                useNewCard && styles.savedCardItemActive,
              ]}
              onPress={() => setUseNewCard(true)}
            >
              <Text style={styles.savedCardIcon}>➕</Text>
              <View style={styles.savedCardInfo}>
                <Text style={styles.savedCardBrand}>Nueva Tarjeta</Text>
                <Text style={styles.savedCardNumber}>Agregar método de pago</Text>
              </View>
              {useNewCard && (
                <Text style={styles.savedCardCheck}>✓</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Selector de Proveedor de Pago (solo si es tarjeta nueva) */}
        {paymentMethod === 'card' && (savedCards.length === 0 || useNewCard) && (
          <View style={styles.providerCard}>
            <Text style={styles.providerTitle}>Selecciona tu banco</Text>
            
            <View style={styles.bankSelectionContainer}>
              <Text style={[styles.bankLabel, { color: colors.text }]}>Selecciona tu banco:</Text>
              <View style={styles.bankButtonsRow}>
                {(['bac', 'banpro', 'lafise', 'ficohsa', 'avanz'] as const).map((bank) => (
                  <TouchableOpacity
                    key={bank}
                    style={[
                      styles.bankButton,
                      selectedBank === bank && styles.bankButtonActive,
                      { backgroundColor: selectedBank === bank ? colors.primary : colors.surface }
                    ]}
                    onPress={() => setSelectedBank(bank)}
                  >
                    <Text style={[
                      styles.bankButtonText,
                      { color: selectedBank === bank ? '#FFF' : colors.text }
                    ]}>
                      {bank.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

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
  methodButtonDisabled: {
    opacity: 0.5,
    backgroundColor: colors.surface,
  },
  methodDescriptionDisabled: {
    color: '#FF6B6B',
    fontWeight: '500',
  },
  methodCheck: {
    fontSize: 24,
    color: '#2196F3',
    fontWeight: '700',
  },
  providerCard: {
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
  providerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  providerButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  providerIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  providerDescription: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  providerCheck: {
    fontSize: 24,
    color: '#2196F3',
    fontWeight: '700',
  },
  savedCardsCard: {
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
  savedCardsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  savedCardsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  manageCardsLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  savedCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  savedCardItemActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  savedCardIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  savedCardInfo: {
    flex: 1,
  },
  savedCardBrand: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  savedCardNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  savedCardDefault: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  savedCardCheck: {
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
  bankSelectionContainer: {
    marginTop: 16,
  },
  bankLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  bankButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bankButton: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  bankButtonActive: {
    borderColor: colors.primary,
  },
  bankButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardFormContainer: {
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
  cardFormTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  cardFormInput: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  cardFormRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardFormRowItem: {
    flex: 1,
  },
  saveCardCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
  },
});
