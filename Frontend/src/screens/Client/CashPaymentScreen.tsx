/**
 * CashPaymentScreen - Versión mejorada
 * 
 * Esta pantalla permite al cliente ver y confirmar el pago en efectivo.
 * 
 * Mejoras:
 * - Implementación de LoadingOverlay para estados de carga
 * - Alertas consistentes con alertService
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedButton } from '../../components/AnimatedButton';
import { getAuth } from 'firebase/auth';
import { getDatabase, ref, onValue, off, update } from 'firebase/database';
import { formatNicaraguaTime } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatters';

// Servicios optimizados
import alertService from '../../services/alertService';
import LoadingOverlay from '../../components/LoadingOverlay';

// Crear estilos fuera del componente para mejor rendimiento
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginVertical: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  driverAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  driverAvatarText: {
    fontSize: 24,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  driverRating: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  detailValueAmount: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: 'bold',
  },
  waitingCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  waitingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  waitingText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  waitingDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  confirmButton: {
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
  },
});

export default function CashPaymentScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { rideId, amount: paramAmount, driverName: paramDriverName, driverPhoto } = route.params;
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [driverPhotoURL, setDriverPhotoURL] = useState<string | null>(null);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<string>('cash');
  const currentPaymentMethodRef = useRef<string>('cash');
  const isNavigatingRef = useRef(false);
  
  // Cargar detalles del viaje
  useEffect(() => {
    setLoading(true);
    
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);
    const paymentRef = ref(db, `paymentStatus/${rideId}`);
    
    console.log('💳 [CashPaymentScreen] Iniciando listeners para rideId:', rideId);
    
    // Listener para el viaje
    const unsubscribeRide = onValue(rideRef, async (snapshot) => {
      console.log('📦 Snapshot recibido de activeRides');
      const data = snapshot.val();
      console.log('📦 Datos:', data ? 'Viaje encontrado' : 'null');
      
      if (data) {
        setRide(data);
        setLoading(false);
        
        // ✅ MEJORADO: Detectar cambio de método de pago
        const ridePaymentMethod = data.paymentMethod || 'cash';
        if (ridePaymentMethod !== currentPaymentMethodRef.current) {
          currentPaymentMethodRef.current = ridePaymentMethod;
          setCurrentPaymentMethod(ridePaymentMethod);
        }
        
        // Obtener foto de perfil del conductor desde driversInfo
        if (data.driverId && !data.driver?.photoURL) {
          console.log('📸 Obteniendo foto de perfil del conductor:', data.driverId);
          try {
            const { get } = await import('firebase/database');
            const driverInfoRef = ref(db, `driversInfo/${data.driverId}`);
            const driverInfoSnapshot = await get(driverInfoRef);
            const driverInfo = driverInfoSnapshot.val();
            
            if (driverInfo?.photoURL) {
              console.log('✅ Foto de perfil encontrada:', driverInfo.photoURL);
              setDriverPhotoURL(driverInfo.photoURL);
            } else {
              console.log('⚠️ No se encontró foto en driversInfo');
            }
          } catch (error) {
            console.error('❌ Error obteniendo foto de perfil:', error);
          }
        } else if (data.driver?.photoURL) {
          setDriverPhotoURL(data.driver.photoURL);
        }
      } else {
        console.log('⚠️ Viaje no encontrado en activeRides, puede estar completado');
        // No mostrar error aquí, esperar a que paymentStatus confirme
      }
    });
    
    // Listener para el estado del pago
    const unsubscribePayment = onValue(paymentRef, (snapshot) => {
      const paymentData = snapshot.val();
      console.log('💰 Estado de pago actualizado:', paymentData);
      
      if (paymentData) {
        setPaymentStatus(paymentData.status);

        const methodFromStatus = paymentData.method || paymentData.paymentMethod;

        if (
          methodFromStatus &&
          methodFromStatus !== currentPaymentMethodRef.current
        ) {
          console.log(`🔄 [CashPaymentScreen] Método actualizado vía paymentStatus: ${currentPaymentMethodRef.current} → ${methodFromStatus}`);
          currentPaymentMethodRef.current = methodFromStatus;
          setCurrentPaymentMethod(methodFromStatus);

          if (methodFromStatus === 'card' && !isNavigatingRef.current) {
            isNavigatingRef.current = true;

            const finalAmount = (() => {
              if (typeof paymentData.amount === 'number') return paymentData.amount;
              if (typeof paymentData.amount === 'string') return parseFloat(paymentData.amount);
              if (typeof paymentData.finalAmount === 'number') return paymentData.finalAmount;
              if (typeof paymentData.finalAmount === 'string') return parseFloat(paymentData.finalAmount);
              if (ride?.finalFare) {
                return typeof ride.finalFare === 'string' ? parseFloat(ride.finalFare) : ride.finalFare;
              }
              return typeof paramAmount === 'string' ? parseFloat(paramAmount) : paramAmount || 0;
            })();

            Alert.alert(
              'Método de Pago Cambiado',
              'El método de pago cambió a tarjeta. Serás redirigido a la pantalla de pago con tarjeta.',
              [
                {
                  text: 'Entendido',
                  onPress: () => {
                    navigation.replace('Payment', {
                      rideId,
                      amount: finalAmount,
                      driverName: ride?.driver?.name || paramDriverName,
                      driverPhoto: ride?.driver?.photoURL || driverPhoto,
                    });
                  },
                },
              ],
              { cancelable: false }
            );
          }
        }
      } else {
        // Si no hay paymentStatus, reiniciar flag de navegación para futuros cambios
        isNavigatingRef.current = false;
      }

      if (paymentData) {
        // Si el pago fue confirmado por el conductor, ir a calificación
        if (paymentData.status === 'confirmed' || paymentData.status === 'completed') {
          console.log('✅ Pago confirmado, navegando a calificación');
          navigation.replace('Rating', { 
            rideId
          });
        }
      }
    });
    
    return () => {
      console.log('🔇 Limpiando listeners de CashPaymentScreen');
      off(rideRef);
      off(paymentRef);
    };
  }, [rideId, navigation]);
  
  // Confirmar pago en efectivo
  const handleConfirmPayment = async () => {
    try {
      setConfirming(true);
      console.log('💳 Cliente confirmando pago para rideId:', rideId);
      
      const auth = getAuth();
      
      if (!auth.currentUser) {
        alertService.showErrorAlert('Debes iniciar sesión para confirmar el pago');
        setConfirming(false);
        return;
      }
      
      // Llamar a la función del backend
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { initializeFirebase } = await import('../../config/firebase');
      
      const { app } = await initializeFirebase();
      if (!app) {
        throw new Error('Firebase no inicializado');
      }
      
      const functions = getFunctions(app);
      const confirmCashPaymentFn = httpsCallable(functions, 'confirmCashPayment');
      
      // Convertir amount a número
      const finalAmount = ride?.finalFare || ride?.estimatedPrice || paramAmount || 0;
      const numericAmount = typeof finalAmount === 'string' ? parseFloat(finalAmount) : finalAmount;
      
      const result = await confirmCashPaymentFn({
        rideId,
        amount: numericAmount,
        tip: 0,
        confirmedBy: 'client'
      });
      
      const data = result.data as any;
      console.log('✅ Respuesta del backend:', data);
      
      if (data.bothConfirmed) {
        // Ambos confirmaron → Ir a calificación
        alertService.showSuccessAlert(
          'Pago Confirmado',
          'El pago fue confirmado por ambas partes',
          () => {
            navigation.replace('Rating', { rideId });
          }
        );
      } else {
        // Solo cliente confirmó → Esperar conductor
        alertService.showSuccessAlert(
          'Confirmación Registrada',
          'Esperando que el conductor confirme que recibió el pago'
        );
        setPaymentStatus('pending_confirmation');
      }
      
      setConfirming(false);
      
    } catch (error: any) {
      console.error('❌ Error confirmando pago:', error);
      alertService.showErrorAlert(
        error.message || 'No se pudo confirmar el pago. Intenta de nuevo.'
      );
      setConfirming(false);
    }
  };
  
  // Mostrar pantalla de carga
  if (loading || !ride) {
    return <LoadingOverlay visible={true} message="Cargando información del pago..." />;
  }
  
  // Valores seguros
  const driverName = ride?.driver?.name ? String(ride.driver.name) : 'Conductor';
  const driverInitial = driverName.charAt(0).toUpperCase();
  const driverRating = ride?.driver?.rating ? parseFloat(ride.driver.rating) : 0;
  const amount = ride?.finalFare || ride?.estimatedPrice || paramAmount || 0;
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Pago en Efectivo</Text>
          <Text style={styles.subtitle}>Confirma que has pagado en efectivo al conductor</Text>
        </View>
        
        {/* Detalles del pago */}
        <View style={styles.card}>
          {/* Foto y nombre del conductor */}
          <View style={styles.driverSection}>
            {(driverPhotoURL || ride?.driver?.photoURL) ? (
              <Image
                source={{ uri: driverPhotoURL || ride.driver.photoURL }}
                style={styles.driverAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.driverAvatar, { backgroundColor: colors.primary + '30' }]}>
                <Text style={[styles.driverAvatarText, { color: colors.primary }]}>
                  {driverInitial}
                </Text>
              </View>
            )}
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>
                {driverName}
              </Text>
              {driverRating > 0 && !isNaN(driverRating) && (
                <Text style={styles.driverRating}>
                  ⭐ {driverRating.toFixed(1)}
                </Text>
              )}
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Monto:</Text>
            <Text style={styles.detailValueAmount}>
              {formatCurrency(numericAmount)}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Hora:</Text>
            <Text style={styles.detailValue}>
              {formatNicaraguaTime(new Date())}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Método:</Text>
            <Text style={styles.detailValue}>Efectivo</Text>
          </View>
        </View>
        
        {/* Estado del pago */}
        {paymentStatus === 'pending_confirmation' && (
          <View style={[styles.card, styles.waitingCard]}>
            <Text style={styles.waitingTitle}>⏳ Esperando confirmación</Text>
            <Text style={styles.waitingDescription}>
              El conductor debe confirmar que recibió tu pago
            </Text>
          </View>
        )}
      </ScrollView>
      
      <View style={styles.footer}>
        {paymentStatus === 'pending' || paymentStatus === 'pending_capture' || paymentStatus === 'pending_confirmation' ? (
          <TouchableOpacity 
            onPress={handleConfirmPayment} 
            style={[styles.confirmButton, { backgroundColor: colors.primary }]}
            disabled={confirming}
          >
            <Text style={styles.confirmButtonText}>
              {confirming ? 'Procesando...' : 'Confirmar Pago en Efectivo'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.secondaryButton, {borderColor: colors.border}]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.secondaryButtonText, {color: colors.text}]}>Volver</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
