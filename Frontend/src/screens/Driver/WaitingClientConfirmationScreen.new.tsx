/**
 * WaitingClientConfirmationScreen - Versión mejorada
 * 
 * Esta pantalla muestra al conductor cuando está esperando que un cliente
 * confirme su oferta para un viaje.
 * 
 * Mejoras:
 * - Implementación de LoadingOverlay para estados de carga
 * - Alertas consistentes con alertService
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getDatabase, ref, onValue, off, update } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { formatCurrency } from '../../utils/formatters';
import { formatNicaraguaTime } from '../../utils/dateUtils';

// Servicios optimizados
import alertService from '../../services/alertService';
import LoadingOverlay from '../../components/LoadingOverlay';

export default function WaitingClientConfirmationScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = getAuth();
  
  // Parámetros de la ruta
  const { rideId, price } = route.params;
  
  // Estado
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [pendingClientAction, setPendingClientAction] = useState(false);
  
  // Efecto para escuchar cambios en el viaje
  useEffect(() => {
    if (!auth.currentUser) {
      alertService.showErrorAlert('Debes iniciar sesión para usar esta funcionalidad');
      navigation.goBack();
      return;
    }
    
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);
    
    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();
      setLoading(false);
      
      if (!data) {
        setCanceled(true);
        return;
      }
      
      setRide(data);
      
      // Si el cliente eligió a este conductor
      if (data.driverId === auth.currentUser!.uid && data.status === 'accepted') {
        setSuccess(true);
        
        // Navegar a pantalla de viaje activo después de un breve retraso
        setTimeout(() => {
          navigation.replace('ActiveRide', { rideId });
        }, 2000);
      }
      
      // Si el cliente eligió a otro conductor
      else if (data.driverId && data.driverId !== auth.currentUser!.uid) {
        setCanceled(true);
        
        alertService.showInfoAlert(
          'Cliente eligió otro conductor',
          'El cliente ha elegido a otro conductor para este viaje.',
          () => navigation.goBack()
        );
      }
      
      // Si el viaje fue cancelado
      else if (data.status === 'canceled') {
        setCanceled(true);
        
        alertService.showInfoAlert(
          'Viaje Cancelado',
          'El cliente ha cancelado este viaje.',
          () => navigation.goBack()
        );
      }
    });
    
    return () => {
      off(rideRef);
    };
  }, [rideId, navigation, auth.currentUser]);
  
  // Función para cancelar la oferta
  const handleCancelOffer = () => {
    alertService.showConfirmAlert(
      'Cancelar Oferta',
      '¿Estás seguro que deseas retirar tu oferta para este viaje?',
      async () => {
        try {
          setPendingClientAction(true);
          
          if (!auth.currentUser || !ride) {
            throw new Error('No se pudo verificar tu información');
          }
          
          // ✅ NUEVO: Usar Cloud Function en lugar de actualizar directamente
          // Esto evita problemas de permisos en Firebase Realtime DB
          const { getFirebaseFunctions } = await import('../../config/firebase');
          const { httpsCallable } = await import('firebase/functions');
          
          const functions = await getFirebaseFunctions();
          const rejectDriverFn = httpsCallable(functions, 'rejectDriver');
          
          await rejectDriverFn({
            rideId,
            driverId: auth.currentUser.uid,
          });
          
          alertService.showSuccessAlert(
            'Oferta Cancelada',
            'Has cancelado tu oferta para este viaje.',
            () => navigation.goBack()
          );
        } catch (error: any) {
          console.error('Error cancelando oferta:', error);
          alertService.showErrorAlert(error.message || 'No se pudo cancelar la oferta');
          setPendingClientAction(false);
        }
      }
    );
  };
  
  // Mostrar pantalla de carga si corresponde
  if (loading) {
    return <LoadingOverlay visible={true} message="Cargando información del viaje..." />;
  }
  
  return (
    <View style={styles.container}>
      {canceled ? (
        <View style={styles.canceledContainer}>
          <Text style={styles.canceledIcon}>❌</Text>
          <Text style={styles.canceledText}>Viaje no disponible</Text>
          <Text style={styles.canceledSubtext}>
            Este viaje ya no está disponible o ha sido cancelado
          </Text>
          
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      ) : success ? (
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>¡Cliente Te Eligió!</Text>
          <Text style={styles.successSubtitle}>Preparando viaje...</Text>
          
        </View>
      ) : (
        <>
          {/* Animación de espera con LoadingOverlay */}
          <View style={styles.animationContainer}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.waitingIcon}>⏳</Text>
          </View>
          
          <Text style={styles.title}>Esperando Confirmación</Text>
          <Text style={styles.subtitle}>
          </Text>
          
          {ride && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Origen</Text>
              <Text style={styles.infoValue}>{ride.originAddress}</Text>
              
              <Text style={styles.infoLabel}>Destino</Text>
              <Text style={styles.infoValue}>{ride.destinationAddress}</Text>
              
              <View style={styles.priceContainer}>
                <Text style={styles.priceLabel}>Tu oferta:</Text>
                <Text style={styles.priceValue}>{formatCurrency(price)}</Text>
              </View>
              
              <Text style={styles.offerTime}>
                {ride.driverOffers && auth.currentUser?.uid && ride.driverOffers[auth.currentUser.uid] && 
                 ride.driverOffers[auth.currentUser.uid].timestamp ? (
                  `Oferta enviada ${formatNicaraguaTime(new Date(ride.driverOffers[auth.currentUser.uid].timestamp))}`
                ) : 'Oferta enviada recientemente'}
              </Text>
            </View>
          )}
          
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelOffer}
            disabled={pendingClientAction}
          >
            <Text style={styles.cancelButtonText}>
              {pendingClientAction ? 'Cancelando...' : 'Cancelar Oferta'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// Estilos
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: 16,
  },
  animationContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  waitingIcon: {
    fontSize: 40,
    position: 'absolute',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  infoCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  offerTime: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#F44336',
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#F44336',
    fontWeight: '600',
  },
  successContainer: {
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  canceledContainer: {
    alignItems: 'center',
  },
  canceledIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  canceledText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  canceledSubtext: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
