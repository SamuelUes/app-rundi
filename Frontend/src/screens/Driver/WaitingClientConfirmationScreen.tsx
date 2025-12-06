import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import ridesService from '../../services/ridesService';

interface WaitingClientConfirmationScreenProps {
  route: {
    params: {
      rideId: string;
      clientId: string;
      origin: { lat: number; lng: number; address: string };
      destination: { lat: number; lng: number; address: string };
      estimatedFare: number;
      extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
    };
  };
  navigation: any;
}

export default function WaitingClientConfirmationScreen({ route, navigation }: WaitingClientConfirmationScreenProps) {
  const {
    rideId,
    clientId,
    origin,
    destination,
    estimatedFare,
    extraDestinations = [],
  } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [timeWaiting, setTimeWaiting] = useState(0);
  const [offerStatus, setOfferStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending');

  // Listener para el estado de la oferta
  useEffect(() => {
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);
    
    console.log('🕐 Esperando confirmación del cliente para viaje:', rideId);
    
    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        console.log('⚠️ Viaje no encontrado, regresando...');
        Alert.alert(
          'Viaje Cancelado',
          'El cliente canceló la solicitud del viaje.',
          [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
        );
        return;
      }

      console.log('📊 Estado del viaje:', data.status);

      // Si el cliente aceptó la oferta (o el viaje avanzó) y este conductor fue el seleccionado
      if (
        (data.status === 'accepted' || data.status === 'driver_on_route' || data.status === 'driver_arrived' || data.status === 'in_progress') &&
        data.driverId === user?.id
      ) {
        console.log('✅ ¡Cliente aceptó tu oferta!');
        setOfferStatus('accepted');
        
        // Navegar a ActiveRideScreen
        setTimeout(() => {
          navigation.replace('ActiveRide', {
            rideId: rideId,
            clientId: clientId,
            origin: origin,
            destination: destination,
            estimatedFare: data.finalFare || estimatedFare,
          });
        }, 1500);
        return;
      }

      // Si el cliente aceptó OTRO conductor
      if (data.status === 'accepted' && data.driverId !== user?.id) {
        console.log('❌ Cliente eligió otro conductor');
        setOfferStatus('rejected');
        
        Alert.alert(
          'Oferta Rechazada',
          'El cliente eligió otro conductor. Puedes buscar otros viajes disponibles.',
          [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
        );
        return;
      }

      // Verificar si nuestra oferta fue rechazada específicamente
      if (data.offers && user?.id) {
        const myOffer = data.offers[user.id];
        if (myOffer && myOffer.status === 'rejected') {
          console.log('❌ Cliente rechazó tu oferta específicamente');
          setOfferStatus('rejected');
          
          Alert.alert(
            'Oferta Rechazada',
            'El cliente rechazó tu oferta. Puedes buscar otros viajes disponibles.',
            [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
          );
          return;
        }
      }

      // Si el viaje fue cancelado
      if (data.status === 'canceled') {
        console.log('⚠️ Viaje cancelado');
        Alert.alert(
          'Viaje Cancelado',
          'El cliente canceló el viaje.',
          [{ text: 'OK', onPress: () => navigation.replace('AvailableRides') }]
        );
        return;
      }
    });

    // Timer para contar tiempo de espera
    const timer = setInterval(() => {
      setTimeWaiting(prev => prev + 1);
    }, 1000);

    return () => {
      off(rideRef);
      clearInterval(timer);
    };
  }, [rideId]);

  const handleCancelOffer = async () => {
    Alert.alert(
      'Cancelar Oferta',
      '¿Estás seguro de que quieres cancelar tu oferta? El viaje quedará disponible para otros conductores.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              // Aquí puedes implementar la lógica para cancelar la oferta
              // Por ahora, simplemente regresamos a AvailableRides
              navigation.replace('AvailableRides');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'No se pudo cancelar la oferta');
            }
          },
        },
      ]
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {offerStatus === 'pending' && (
          <>
            {/* Animación de espera */}
            <View style={styles.animationContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.waitingIcon}>⏳</Text>
            </View>

            {/* Título */}
            <Text style={styles.title}>Esperando Confirmación</Text>
            <Text style={styles.subtitle}>
              El cliente está revisando tu oferta
            </Text>

            {/* Tiempo de espera */}
            <View style={styles.timerContainer}>
              <Text style={styles.timerLabel}>Tiempo de espera:</Text>
              <Text style={styles.timerValue}>{formatTime(timeWaiting)}</Text>
            </View>

            {/* Detalles del viaje */}
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>Detalles del Viaje</Text>
              
              <View style={styles.locationRow}>
                <Text style={styles.locationIcon}>🔵</Text>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>Origen</Text>
                  <Text style={styles.locationAddress}>{origin.address}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              {extraDestinations.map((stop: { lat: number; lng: number; address?: string }, index: number) => (
                <View key={`extra-stop-${index}`} style={styles.locationRow}>
                  <Text style={styles.locationIcon}>🟠</Text>
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationLabel}>{`Parada ${index + 1}`}</Text>
                    <Text style={styles.locationAddress}>{stop.address || 'Parada adicional'}</Text>
                  </View>
                </View>
              ))}

              {extraDestinations.length > 0 && <View style={styles.divider} />}

              <View style={styles.locationRow}>
                <Text style={styles.locationIcon}>🔴</Text>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationLabel}>Destino Final</Text>
                  <Text style={styles.locationAddress}>{destination.address}</Text>
                </View>
              </View>

              <View style={styles.fareContainer}>
                <Text style={styles.fareLabel}>Tarifa Acordada:</Text>
                <Text style={styles.fareValue}>C${estimatedFare}</Text>
              </View>
            </View>

            {/* Consejos */}
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>💡 Mientras esperas:</Text>
              <Text style={styles.tipText}>• Mantén tu vehículo listo</Text>
              <Text style={styles.tipText}>• Verifica tu ubicación GPS</Text>
              <Text style={styles.tipText}>• El cliente puede elegir otro conductor</Text>
            </View>

            {/* Botón cancelar */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelOffer}
            >
              <Text style={styles.cancelButtonText}>Cancelar Oferta</Text>
            </TouchableOpacity>
          </>
        )}

        {offerStatus === 'accepted' && (
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>¡Cliente Te Eligió!</Text>
            <Text style={styles.successSubtitle}>Preparando viaje...</Text>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  animationContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  waitingIcon: {
    fontSize: 80,
    marginTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 30,
  },
  timerContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  timerValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.primary,
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  divider: {
    height: 20,
    width: 2,
    backgroundColor: colors.border,
    marginLeft: 10,
    marginVertical: 8,
  },
  fareContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fareLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  fareValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  tipsContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 20,
    marginBottom: 40,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#1565C0',
    marginBottom: 6,
  },
  cancelButton: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4444',
  },
  successContainer: {
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 100,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
