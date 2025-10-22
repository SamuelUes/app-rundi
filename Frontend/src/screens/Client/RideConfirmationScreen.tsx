import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Image,
  BackHandler,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import ridesService from '../../services/ridesService';
import { getDatabase, ref, onValue, off, get } from 'firebase/database';
import DriverOfferCard from '../../components/DriverOfferCard';
import PriceNegotiationModal from '../../components/PriceNegotiationModal';
import priceNegotiationService from '../../services/priceNegotiationService';
import { RideCardSkeleton } from '../../components/SkeletonLoader';
import { NoDriversEmptyState } from '../../components/EmptyState';
import { RatingDisplay } from '../../components/RatingDisplay';

interface RideConfirmationScreenProps {
  route: {
    params: {
      rideId: string;
    };
  };
  navigation: any;
}

export default function RideConfirmationScreen({ route, navigation }: RideConfirmationScreenProps) {
  const { rideId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [driverOffers, setDriverOffers] = useState<any[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [showNegotiationModal, setShowNegotiationModal] = useState(false);
  const [pendingCounterOffers, setPendingCounterOffers] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [driverPhotoURL, setDriverPhotoURL] = useState<string | null>(null);

  // Función para manejar la cancelación
  const handleBackPress = useCallback(() => {
    Alert.alert(
      '⚠️ Cancelar Viaje',
      'Si regresas, tu viaje será cancelado automáticamente. ¿Estás seguro?',
      [
        {
          text: 'Quedarme',
          style: 'cancel',
          onPress: () => console.log('Usuario decidió quedarse en RideConfirmation'),
        },
        {
          text: 'Cancelar Viaje',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🚫 Usuario confirmó cancelación desde botón atrás');
              setCanceling(true);
              await ridesService.cancelRide(rideId, 'Cancelado por el cliente al regresar');
              navigation.navigate('ClientHome');
            } catch (error: any) {
              console.error('❌ Error cancelando viaje:', error);
              Alert.alert('Error', 'No se pudo cancelar el viaje. Intenta de nuevo.');
              setCanceling(false);
            }
          },
        },
      ],
      { cancelable: false }
    );
  }, [rideId, navigation]);

  // Interceptar botón físico de regresar (Android)
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleBackPress();
        return true; // Prevenir el comportamiento por defecto
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [handleBackPress])
  );

  // Interceptar botón de navegación del header
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      // Solo interceptar si el usuario está intentando salir manualmente
      // No interceptar si es una navegación programática (replace)
      if (e.data.action.type === 'GO_BACK' || e.data.action.type === 'POP') {
        e.preventDefault();
        handleBackPress();
      }
    });

    return unsubscribe;
  }, [navigation, handleBackPress]);

  // Listener en tiempo real para ofertas de conductores y estado del viaje
  useEffect(() => {
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);
    
    const unsubscribe = onValue(rideRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log('🔥 Datos del viaje actualizados desde Firebase:', data);
        
        // Actualizar datos completos del viaje
        setRide(data);
        setLoading(false);
        
        // Si hay un conductor asignado, obtener su foto de perfil desde driversInfo
        if (data.driverId && !data.driver?.photoURL) {
          console.log('📸 Obteniendo foto de perfil del conductor:', data.driverId);
          try {
            const driverInfoRef = ref(db, `driversInfo/${data.driverId}`);
            const driverInfoSnapshot = await get(driverInfoRef);
            const driverInfo = driverInfoSnapshot.val();
            
            if (driverInfo?.photoURL) {
              console.log('✅ Foto de perfil encontrada en driversInfo:', driverInfo.photoURL);
              setDriverPhotoURL(driverInfo.photoURL);
            } else {
              console.log('⚠️ No se encontró foto en driversInfo');
            }
          } catch (error) {
            console.error('❌ Error obteniendo foto de perfil:', error);
          }
        }

        // Procesar ofertas de conductores (buscar en offers O driverOffers)
        const offersData = data.offers || data.driverOffers;
        if (offersData) {
          console.log('🔍 Ofertas RAW de Firebase:', JSON.stringify(offersData, null, 2));
          
          // Obtener fotos de perfil de los conductores desde driversInfo
          const offersArray = await Promise.all(
            Object.entries(offersData).map(async ([driverId, offer]: [string, any]) => {
              let photoURL = offer.driver?.photoURL;
              
              // Si no tiene foto en la oferta, buscar en driversInfo
              if (!photoURL) {
                try {
                  console.log(`📸 Obteniendo foto de perfil del conductor ${driverId} desde driversInfo`);
                  const driverInfoRef = ref(db, `driversInfo/${driverId}`);
                  const driverInfoSnapshot = await get(driverInfoRef);
                  const driverInfo = driverInfoSnapshot.val();
                  
                  if (driverInfo?.photoURL) {
                    photoURL = driverInfo.photoURL;
                    console.log(`✅ Foto encontrada para ${driverId}:`, photoURL);
                  } else {
                    console.log(`⚠️ No se encontró foto para ${driverId}`);
                  }
                } catch (error) {
                  console.error(`❌ Error obteniendo foto de ${driverId}:`, error);
                }
              }
              
              return {
                ...offer,
                driverId,
                driver: {
                  ...offer.driver,
                  photoURL, // Agregar foto de perfil
                  vehicle: data.vehicle || null,
                },
              };
            })
          );
          
          console.log('🔍 Ofertas procesadas con driverId:', offersArray.map(o => ({ driverId: o.driverId, status: o.status })));
          
          console.log(`📊 Total ofertas en Firebase: ${offersArray.length}`);
          console.log(`📋 Ofertas:`, offersArray);
          console.log(`🚗 Vehículo agregado a ofertas:`, data.vehicle);
          
          // Filtrar solo ofertas pendientes
          const pendingOffers = offersArray.filter((offer: any) => offer.status === 'pending');
          
          setDriverOffers(pendingOffers);
          
          // Limpiar contraofertas pendientes si el conductor ya respondió
          setPendingCounterOffers(prev => {
            const updated = new Set(prev);
            offersArray.forEach((offer: any) => {
              // Si el conductor aceptó el precio del cliente o hizo una nueva contraoferta
              if (offer.acceptedClientPrice || offer.status === 'accepted') {
                updated.delete(offer.driverId);
              }
            });
            return updated;
          });
          
          console.log(`📬 ${pendingOffers.length} ofertas pendientes disponibles`);
          console.log(`🎯 Estado del viaje: ${data.status}`);
          console.log(`📝 Ofertas procesadas:`, JSON.stringify(pendingOffers, null, 2));
        } else {
          console.log('❌ No hay offers ni driverOffers en Firebase');
          setDriverOffers([]);
        }

        // Solo navegar automáticamente si el viaje ya está en progreso
        if (data.status === 'in_progress' && data.driverId) {
          console.log('✅ Viaje en progreso, navegando a tracking...');
          console.log('🚗 Datos del vehículo:', data.vehicle);
          navigation.replace('RideTracking', {
            rideId: data.id,
            driverId: data.driverId,
            driverName: data.driver?.name || 'Conductor',
            vehiclePlate: data.vehicle?.plate || 'N/A',
            vehicleBrand: data.vehicle?.make || data.vehicle?.brand || 'N/A',
            vehicleModel: data.vehicle?.model || 'N/A',
            vehicleColor: data.vehicle?.color || 'N/A',
            estimatedFare: data.finalFare || data.estimatedPrice || 0,
          });
        }
      } else {
        console.log('❌ No hay datos del viaje en Firebase');
        setLoading(false);
      }
    });
    
    return () => {
      off(rideRef);
    };
  }, [rideId]);

  const handleCancelRide = () => {
    Alert.alert(
      'Cancelar Viaje',
      '¿Estás seguro que deseas cancelar este viaje?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              setCanceling(true);
              await ridesService.cancelRide(rideId, 'Cancelado por el cliente');
              Alert.alert('Viaje Cancelado', 'Tu viaje ha sido cancelado exitosamente', [
                { text: 'OK', onPress: () => navigation.navigate('ClientHome') },
              ]);
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'No se pudo cancelar el viaje');
            } finally {
              setCanceling(false);
            }
          },
        },
      ]
    );
  };

  const handleCallSupport = () => {
    Linking.openURL('tel:+50512345678'); // TODO: Número real de soporte
  };

  const handleViewOffer = (offer: any) => {
    console.log('Ver oferta:', offer);
    setSelectedOffer(offer);
    setShowNegotiationModal(true);
  };

  const handleAcceptDriverOffer = async (offer: any) => {
    // Prevenir múltiples confirmaciones
    if (confirming) {
      console.log('⏳ Ya hay una confirmación en progreso...');
      return;
    }

    try {
      setConfirming(true);
      console.log('🎯 Aceptar oferta completa:', JSON.stringify(offer, null, 2));
      console.log('🆔 RideId:', rideId);
      console.log('🚗 DriverId de la oferta:', offer.driverId);
      
      // En el nuevo sistema de ofertas, aceptar la oferta = confirmar al conductor
      console.log('✅ Confirmando conductor seleccionado...');
      await ridesService.confirmDriver(rideId, offer.driverId);
      
      Alert.alert(
        '✅ Conductor Confirmado', 
        `Has confirmado el viaje con ${offer.driver?.name || 'el conductor'}. El conductor está en camino.`,
        [{
          text: 'Ver en Mapa',
          onPress: () => {
            // El listener de Firebase navegará automáticamente cuando el estado cambie
          }
        }]
      );
      
      setShowNegotiationModal(false);
      // Firebase listener actualizará automáticamente y navegará a RideTracking
    } catch (error: any) {
      console.error('❌ Error confirmando conductor:', error);
      Alert.alert('Error', error.message || 'No se pudo confirmar al conductor');
    } finally {
      setConfirming(false);
    }
  };

  if (loading || !ride) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <RideCardSkeleton />
        <RideCardSkeleton />
        <RideCardSkeleton />
      </View>
    );
  }

  console.log('🎨 RENDER - ride.status:', ride.status, 'driverOffers.length:', driverOffers.length);
  console.log('🔍 ride.driverId:', ride.driverId, 'ride.driver:', ride.driver);
  console.log('🔍 ride.vehicle:', ride.vehicle);
  console.log('🔍 Condición card:', (ride.status === 'pending_confirm' || ride.status === 'accepted'), '&&', ride.driverId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.statusContainer}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            {ride.status === 'requested' ? 'Buscando conductor...' : 'Viaje confirmado'}
          </Text>
        </View>
      </View>

      {/* Lista de Ofertas de Conductores */}
      {ride.status === 'requested' && driverOffers.length > 0 && (
        <View style={styles.offersContainer}>
          <Text style={styles.offersTitle}>
            🎉 {driverOffers.length} {driverOffers.length === 1 ? 'conductor interesado' : 'conductores interesados'}
          </Text>
          <Text style={styles.offersSubtitle}>
            Revisa las ofertas y elige la que más te convenga
          </Text>
          
          {driverOffers.map((offer: any) => (
            <DriverOfferCard
              key={offer.driverId}
              offer={offer}
              estimatedPrice={ride.estimatedPrice}
              clientSuggestedPrice={ride.clientSuggestedPrice}
              onViewOffer={() => handleViewOffer(offer)}
              onAcceptOffer={() => handleAcceptDriverOffer(offer)}
              hasPendingCounterOffer={pendingCounterOffers.has(offer.driverId)}
            />
          ))}
        </View>
      )}

      {/* Animación de búsqueda (solo si no hay ofertas) */}
      {ride.status === 'requested' && driverOffers.length === 0 && (
        <NoDriversEmptyState />
      )}
      {/* Información del conductor (cuando está pending_confirm, driver_assigned o accepted) */}
      {(() => {
        console.log('🔍 Evaluando condición card:', ride.status, ride.driverId);
        return (ride.status === 'pending_confirm' || ride.status === 'driver_assigned' || ride.status === 'accepted') && ride.driverId;
      })() ? (
        <View style={styles.driverContainer}>
          <Text style={styles.driverTitle}>🎉 ¡Conductor encontrado!</Text>
          
          <View style={styles.driverCard}>
            {(ride.driver?.photoURL || driverPhotoURL) ? (
              <Image
                source={{ uri: ride.driver?.photoURL || driverPhotoURL }}
                style={styles.driverAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>
                  {(ride.driver?.name || 'C').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{ride.driver?.name || 'Conductor'}</Text>
              <RatingDisplay 
                rating={ride.driver?.rating ? parseFloat(ride.driver.rating) : 0}
                size="small"
                showCount={false}
              />
              {(ride as any)?.vehicle && (
                <>
                  <Text style={styles.driverVehicle}>
                    🚗 {(ride as any).vehicle.make || (ride as any).vehicle.brand || 'N/A'} {(ride as any).vehicle.model || 'N/A'} • {(ride as any).vehicle.color || 'N/A'}
                  </Text>
                  <Text style={styles.driverPlate}>📋 Placa: {(ride as any).vehicle.plate || 'N/A'}</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.etaContainer}>
            <Text style={styles.etaLabel}>Tiempo estimado de llegada</Text>
            <Text style={styles.etaValue}>5-10 minutos</Text>
          </View>

          {/* Botones de Aceptar/Rechazar Conductor (solo si no está accepted) */}
          {(ride.status === 'driver_assigned' || ride.status === 'pending_confirm') && (
            <View style={styles.actionButtonsContainer}>
              {/* Botón Aceptar */}
              <TouchableOpacity
                style={[styles.acceptButton, { backgroundColor: '#4CAF50' }]}
                onPress={async () => {
                try {
                  // Verificar autenticación
                  const { getFirebaseAuth } = await import('../../config/firebase');
                  const auth = await getFirebaseAuth();
                  const currentUser = auth.currentUser;
                  
                  if (!currentUser) {
                    Alert.alert('Error', 'Debes iniciar sesión para confirmar al conductor');
                    return;
                  }

                  // Obtener token actualizado
                  await currentUser.getIdToken(true);
                  
                  // Llamar a la función para confirmar el conductor
                  const functions = await import('../../config/firebase').then(m => m.getFirebaseFunctions());
                  const { httpsCallable } = await import('firebase/functions');
                  const confirmDriverFunction = httpsCallable(functions, 'confirmDriver');
                  
                  console.log('🔑 Confirmando conductor:', ride.driverId);
                  await confirmDriverFunction({ 
                    rideId: ride.id,
                    selectedDriverId: ride.driverId 
                  });
                  
                  Alert.alert(
                    '✅ Conductor Confirmado',
                    `Has confirmado el viaje con ${ride.driver?.name || 'el conductor'}. Ahora podrás ver su ubicación en tiempo real.`,
                    [
                      {
                        text: 'Ver en Mapa',
                        onPress: () => navigation.replace('RideTracking', {
                          rideId: ride.id,
                          driverId: ride.driverId,
                          driverName: ride.driver?.name || 'Conductor',
                          vehiclePlate: (ride as any)?.vehicle?.plate || 'N/A',
                          vehicleBrand: (ride as any)?.vehicle?.make || (ride as any)?.vehicle?.brand || 'N/A',
                          vehicleModel: (ride as any)?.vehicle?.model || 'N/A',
                          vehicleColor: (ride as any)?.vehicle?.color || 'N/A',
                          estimatedFare: (ride as any)?.finalFare || ride.estimatedPrice,
                        })
                      }
                    ]
                  );
                } catch (error: any) {
                  console.error('❌ Error confirmando conductor:', error);
                  Alert.alert('Error', error.message || 'No se pudo confirmar el conductor');
                }
              }}
            >
              <Text style={styles.acceptButtonText}>✅ Aceptar Conductor</Text>
            </TouchableOpacity>

            {/* Botón Rechazar */}
            <TouchableOpacity
              style={[styles.rejectButton, { backgroundColor: '#FF5252' }]}
              onPress={() => {
                Alert.alert(
                  '❌ Rechazar Conductor',
                  `¿Estás seguro de que quieres rechazar a ${ride.driver?.name || 'este conductor'}? El viaje volverá a estar disponible para otros conductores.`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Rechazar',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          // Verificar autenticación
                          const { getFirebaseAuth } = await import('../../config/firebase');
                          const auth = await getFirebaseAuth();
                          const currentUser = auth.currentUser;
                          
                          console.log('👤 Usuario actual:', currentUser ? currentUser.uid : 'NO AUTENTICADO');
                          
                          if (!currentUser) {
                            Alert.alert('Error', 'Debes iniciar sesión para rechazar al conductor');
                            return;
                          }

                          // Obtener token actualizado y verificar
                          const token = await currentUser.getIdToken(true);
                          console.log('🔑 Token obtenido:', token ? `OK (${token.substring(0, 20)}...)` : 'ERROR');
                          console.log('📧 Email:', currentUser.email);
                          console.log('🆔 UID:', currentUser.uid);
                          
                          // Inicializar Firebase si no está inicializado
                          await import('../../config/firebase').then(m => m.initializeFirebase());
                          
                          const functions = await import('../../config/firebase').then(m => m.getFirebaseFunctions());
                          const { httpsCallable } = await import('firebase/functions');
                          
                          console.log('📞 Llamando a rejectDriver con rideId:', ride.id);
                          console.log('🔧 Functions configurado:', functions ? 'OK' : 'ERROR');
                          
                          const rejectDriverFunction = httpsCallable(functions, 'rejectDriver');
                          const result = await rejectDriverFunction({ rideId: ride.id });
                          
                          console.log('✅ Resultado:', result);
                          
                          Alert.alert(
                            'Conductor Rechazado',
                            'El viaje está nuevamente disponible para otros conductores.',
                            [{ text: 'OK' }]
                          );
                        } catch (error: any) {
                          console.error('❌ Error rechazando conductor:', error);
                          console.error('❌ Error completo:', JSON.stringify(error, null, 2));
                          Alert.alert('Error', error.message || 'No se pudo rechazar el conductor');
                        }
                      }
                    }
                  ]
                );
              }}
            >
              <Text style={styles.rejectButtonText}>❌ Rechazar</Text>
            </TouchableOpacity>
            </View>
          )}

          {/* Botón secundario: Ver en Mapa (sin confirmación) - Usa navigate en lugar de replace */}
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('RideTracking', {
              rideId: ride.id,
              driverId: ride.driverId,
              driverName: ride.driver?.name || 'Conductor',
              vehiclePlate: (ride as any)?.vehicle?.plate || 'N/A',
              vehicleBrand: (ride as any)?.vehicle?.make || (ride as any)?.vehicle?.brand || 'N/A',
              vehicleModel: (ride as any)?.vehicle?.model || 'N/A',
              vehicleColor: (ride as any)?.vehicle?.color || 'N/A',
              estimatedFare: (ride as any)?.finalFare || ride.estimatedPrice,
              isPreview: true, // Indicar que es solo preview
            })}
          >
            <Text style={styles.secondaryButtonText}>🗺️ Solo Ver en Mapa</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Detalles del viaje */}
      <View style={styles.detailsContainer}>
        <Text style={styles.sectionTitle}>Detalles del Viaje</Text>

        <View style={styles.locationContainer}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔵</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Origen</Text>
              <Text style={styles.locationAddress}>{ride.origin?.address || ride.originAddress || 'No especificado'}</Text>
            </View>
          </View>

          <View style={styles.locationDivider} />

          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔴</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Destino</Text>
              <Text style={styles.locationAddress}>{ride.destination?.address || ride.destinationAddress || 'No especificado'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Distancia</Text>
            <Text style={styles.infoValue}>{ride.estimatedDistance ? (ride.estimatedDistance / 1000).toFixed(1) : '0.0'} km</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Duración</Text>
            <Text style={styles.infoValue}>{ride.estimatedDuration ? Math.round(ride.estimatedDuration / 60) : '0'} min</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Precio</Text>
            <Text style={styles.infoValue}>C${ride.estimatedFare || ride.estimatedPrice || 0}</Text>
          </View>
        </View>

        {ride.notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>Notas:</Text>
            <Text style={styles.notesText}>{ride.notes}</Text>
          </View>
        )}
      </View>

      {/* Botones de acción */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.supportButton}
          onPress={handleCallSupport}
        >
          <Text style={styles.supportButtonText}>📞 Llamar a Soporte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cancelButton, canceling && styles.cancelButtonDisabled]}
          onPress={handleCancelRide}
          disabled={canceling}
        >
          <Text style={styles.cancelButtonText}>
            {canceling ? 'Cancelando...' : 'Cancelar Viaje'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Información adicional */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 Recibirás una notificación cuando un conductor acepte tu viaje
        </Text>
        <Text style={[styles.footerText, { marginTop: 8 }]}>
          💬 Podrás chatear con el conductor una vez que acepte el viaje
        </Text>
      </View>

      {/* Modal de Negociación de Precio */}
      <PriceNegotiationModal
        visible={showNegotiationModal}
        onClose={() => setShowNegotiationModal(false)}
        driver={selectedOffer?.driver || null}
        estimatedPrice={ride?.estimatedPrice || 0}
        clientSuggestedPrice={ride?.clientSuggestedPrice}
        driverOfferedPrice={selectedOffer?.offeredPrice}
        negotiationStatus={ride?.negotiationStatus}
        acceptedClientPrice={selectedOffer?.acceptedClientPrice || false}
        onAcceptDriverOffer={async () => {
          if (selectedOffer) {
            await handleAcceptDriverOffer(selectedOffer);
          }
        }}
        onSendCounterOffer={async (price: number) => {
          try {
            await priceNegotiationService.negotiatePrice(rideId, price, 'client');
            // Agregar el conductor a la lista de ofertas pendientes
            if (selectedOffer?.driverId) {
              setPendingCounterOffers(prev => new Set(prev).add(selectedOffer.driverId));
            }
            Alert.alert('✅ Contraoferta Enviada', `Tu contraoferta de C$${price} ha sido enviada al conductor.`);
            setShowNegotiationModal(false);
            // Firebase listener actualizará automáticamente
          } catch (error: any) {
            Alert.alert('Error', error.message || 'No se pudo enviar la contraoferta');
          }
        }}
        onAcceptAndStartRide={async () => {
          // Este callback es para cuando el conductor ya aceptó el precio del cliente
          setShowNegotiationModal(false);
          // El viaje ya debería estar en estado 'accepted'
        }}
      />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  header: {
    backgroundColor: colors.card,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
    marginRight: 12,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  offersContainer: {
    padding: 16,
    backgroundColor: colors.background,
  },
  offersTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  offersSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  searchingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  searchingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  searchingText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  detailsContainer: {
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  locationContainer: {
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
  locationDivider: {
    height: 20,
    width: 2,
    backgroundColor: '#e0e0e0',
    marginLeft: 10,
    marginVertical: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  notesContainer: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: colors.text,
  },
  actionsContainer: {
    padding: 16,
  },
  supportButton: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  supportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cancelButton: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4444',
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  driverContainer: {
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  driverTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2196F3',
    textAlign: 'center',
    marginBottom: 20,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  driverAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  driverAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  driverRatingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  driverVehicle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  driverPlate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  rejectButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#FF5252',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  etaContainer: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  etaLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  etaValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2196F3',
  },
  proceedButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  proceedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#2196F3',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
