import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { getDatabase, ref, onValue } from 'firebase/database';
import priceNegotiationService from '../../services/priceNegotiationService';
import ridesService from '../../services/ridesService';
import mapsService from '../../services/mapsService';
import DynamicMap from '../../components/DynamicMap';
import { RideListSkeleton } from '../../components/SkeletonLoader';
import { NoRidesEmptyState } from '../../components/EmptyState';
import { RatingDisplay } from '../../components/RatingDisplay';
import alertService from '../../services/alertService';
import { hasSavedCard } from '../../utils/cardUtils';

interface Ride {
  id: string;
  clientId: string;
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  status: string;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  driverOfferStatus?: string | null;
  passengers?: number;
  rideType?: string;
  paymentMethod?: 'cash' | 'card';
  requestedAt: number;
  clientRating?: number;
  clientTotalRatings?: number;
  // ✅ NUEVO: Soporte para múltiples destinos
  extraDestinations?: Array<{ lat: number; lng: number; address: string }>;
  waypointsCount?: number;
  hasMultipleDestinations?: boolean;
}

export default function AvailableRidesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { coords } = useLocation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [showNegotiateModal, setShowNegotiateModal] = useState(false);
  const [counterOffer, setCounterOffer] = useState('');
  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [clientRatings, setClientRatings] = useState<Map<string, { rating: number; totalRatings: number }>>(new Map());

  useEffect(() => {
    console.log('🔥 Montando AvailableRidesScreen...');
    const unsubscribe = loadRides();
    
    // Limpiar listener al desmontar
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Cargar ratings de clientes cuando cambian los viajes
  useEffect(() => {
    const loadClientRatings = async () => {
      for (const ride of rides) {
        if (ride.clientId && !clientRatings.has(ride.clientId)) {
          try {
            const ratingData = await ridesService.getUserRating(ride.clientId);
            setClientRatings(prev => new Map(prev).set(ride.clientId, {
              rating: ratingData.averageRating || 0,
              totalRatings: ratingData.totalRatings || 0,
            }));
          } catch (error) {
            console.error(`Error cargando rating del cliente ${ride.clientId}:`, error);
          }
        }
      }
    };

    if (rides.length > 0) {
      loadClientRatings();
    }
  }, [rides]);

  const loadRides = () => {
    console.log('📡 Conectando a Firebase Realtime DB...');
    const db = getDatabase();
    const ridesRef = ref(db, 'activeRides');

    const unsubscribe = onValue(ridesRef, (snapshot) => {
      console.log('📦 Snapshot recibido');
      const data = snapshot.val();
      
      if (!data) {
        console.log('📭 No hay viajes en activeRides');
        setRides([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      console.log('📦 Datos:', data);

      const availableRides: Ride[] = [];
      Object.entries(data).forEach(([rideId, rideData]: [string, any]) => {
        console.log(`🔍 Viaje ${rideId}:`, {
          status: rideData.status,
          driverId: rideData.driverId,
          clientSuggestedPrice: rideData.clientSuggestedPrice,
          estimatedPrice: rideData.estimatedPrice,
          negotiationStatus: rideData.negotiationStatus,
        });

        // Detectar si este conductor fue aceptado
        if (rideData.status === 'accepted' && rideData.driverId === user?.id) {
          console.log('🎉 ¡Tu oferta fue aceptada! Navegando a ActiveRideScreen...');
          
          // Navegar a ActiveRideScreen
          navigation.replace('ActiveRide', {
            rideId: rideId,
            clientId: rideData.clientId,
            origin: rideData.origin,
            destination: rideData.destination,
            estimatedFare: rideData.finalFare || rideData.estimatedPrice,
          });
          return;
        }

        // Filtrar solo viajes en estado 'requested' (disponibles)
        if (rideData.status === 'requested') {
          const offers = rideData.offers || {};
          const myOffer = user?.id ? offers[user.id] : null;
          const myOfferedPrice = myOffer?.offeredPrice ?? null;
          const myOfferStatus = myOffer?.status ?? null;

          availableRides.push({
            id: rideId,
            clientId: rideData.clientId || '',
            status: rideData.status,
            origin: rideData.origin || {},
            destination: rideData.destination || {},
            estimatedDistance: rideData.estimatedDistance || 0,
            estimatedDuration: rideData.estimatedDuration || 0,
            estimatedPrice: rideData.estimatedPrice || 0,
            clientSuggestedPrice: rideData.clientSuggestedPrice,
            driverOfferedPrice: myOfferedPrice,
            driverOfferStatus: myOfferStatus,
            passengers: rideData.passengers || 1,
            rideType: rideData.rideType || 'normal',
            requestedAt: rideData.requestedAt || Date.now(),
            // ✅ NUEVO: Soporte para múltiples destinos
            extraDestinations: rideData.extraDestinations || [],
            waypointsCount: rideData.waypointsCount || 0,
            hasMultipleDestinations: rideData.hasMultipleDestinations || false,
          });
        }
      });

      console.log(`✅ ${availableRides.length} viajes disponibles para mostrar`);
      setRides(availableRides);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      console.error('❌ Error en listener:', error);
      setLoading(false);
      setRefreshing(false);
    });

    // Retornar directamente la función de unsubscribe
    return unsubscribe;
  };

  const handleRefresh = () => {
    setRefreshing(true);
    // No llamar loadRides() aquí porque ya hay un listener activo
    // El listener se actualiza automáticamente
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const ensureCardForCardPayments = async (ride: Ride): Promise<boolean> => {
    const ridePaymentMethod = ride?.paymentMethod || ride?.rideType; // fallback if stored differently
    if ((ridePaymentMethod || '').toLowerCase() !== 'card') {
      return true;
    }

    if (await hasSavedCard()) {
      return true;
    }

    alertService.showConfirmAlert(
      'Tarjeta requerida',
      'Para aceptar viajes con pago por tarjeta necesitas registrar al menos una tarjeta bancaria. Agrega una tarjeta antes de continuar.',
      () => navigation.navigate('PaymentMethods'),
      undefined,
      'Ir a métodos',
      'Cancelar',
    );

    return false;
  };

  const handleAcceptRide = async (ride: Ride) => {
    try {
      if (!(await ensureCardForCardPayments(ride))) {
        return;
      }
      // Si el cliente sugirió un precio, aceptar ese precio directamente
      if (ride.clientSuggestedPrice && ride.clientSuggestedPrice > 0) {
        try {
          console.log(`📤 Enviando aceptación de precio para viaje: ${ride.id}`);
          console.log(`💰 Precio del cliente: C$${ride.clientSuggestedPrice}`);

          await priceNegotiationService.acceptClientPrice(ride.id);

          alertService.showSuccessAlert(
            'Oferta enviada',
            `Aceptaste el viaje por C$${ride.clientSuggestedPrice}. Esperando confirmación del cliente...`
          );

          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: ride.origin,
            destination: ride.destination,
            estimatedFare: ride.clientSuggestedPrice,
            extraDestinations: (ride.extraDestinations || []).map((stop) => ({
              lat: stop.lat,
              lng: stop.lng,
              address: stop.address,
            })),
          });
        } catch (error: any) {
          console.error('❌ Error completo:', error);
          alertService.showErrorAlert(error.message || 'No se pudo enviar la oferta');
        }
      } else {
        try {
          const acceptData = {
            driverId: user?.id || '',
            vehicleId: 'temp-vehicle-id',
            currentLocation: { lat: 0, lng: 0 },
          };
          await ridesService.acceptRide(ride.id, acceptData);

          alertService.showSuccessAlert(
            'Oferta enviada',
            'Hemos notificado al cliente. Esperando confirmación...'
          );

          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: ride.origin,
            destination: ride.destination,
            estimatedFare: ride.estimatedPrice,
            extraDestinations: (ride.extraDestinations || []).map((stop) => ({
              lat: stop.lat,
              lng: stop.lng,
              address: stop.address,
            })),
          });
        } catch (error: any) {
          alertService.showErrorAlert(error.message || 'No se pudo aceptar el viaje');
        }
      }
    } catch (error: any) {
      alertService.showErrorAlert(error.message || 'No se pudo aceptar el viaje');
    }
  };

  const handleShowMap = async (ride: Ride) => {
    setSelectedRide(ride);
    setShowMapModal(true);
    setLoadingRoute(true);
    setRouteCoordinates([]);
    
    // ✅ MEJORADO: Calcular ruta completa con múltiples destinos
    if (coords) {
      try {
        console.log('🗺️ Calculando ruta para modal...');
        console.log('📍 Paradas extras:', ride.extraDestinations?.length || 0);
        console.log('📦 Ride completo:', JSON.stringify(ride, null, 2));
        if (ride.extraDestinations && ride.extraDestinations.length > 0) {
          console.log('📍 Paradas encontradas:', JSON.stringify(ride.extraDestinations, null, 2));
        }
        
        const routeSegments: any[] = [];
        
        // Ruta 1: Conductor → Origen
        const route1 = await mapsService.getDirections(
          { latitude: coords.latitude, longitude: coords.longitude },
          { latitude: ride.origin.lat, longitude: ride.origin.lng }
        );
        routeSegments.push(route1?.polyline || []);
        
        // Ruta 2: Origen → Paradas extras (si existen)
        let currentPoint = { latitude: ride.origin.lat, longitude: ride.origin.lng };
        
        if (ride.extraDestinations && ride.extraDestinations.length > 0) {
          for (const waypoint of ride.extraDestinations) {
            const waypointRoute = await mapsService.getDirections(
              currentPoint,
              { latitude: waypoint.lat, longitude: waypoint.lng }
            );
            routeSegments.push(waypointRoute?.polyline || []);
            currentPoint = { latitude: waypoint.lat, longitude: waypoint.lng };
          }
        }
        
        // Ruta final: Última parada → Destino final
        const finalRoute = await mapsService.getDirections(
          currentPoint,
          { latitude: ride.destination.lat, longitude: ride.destination.lng }
        );
        routeSegments.push(finalRoute?.polyline || []);
        
        // Combinar todas las rutas
        const combinedRoute = routeSegments.flat();
        setRouteCoordinates(combinedRoute);
        console.log('✅ Ruta calculada:', combinedRoute.length, 'puntos con', ride.extraDestinations?.length || 0, 'paradas');
      } catch (error) {
        console.error('❌ Error calculando ruta:', error);
        // Fallback: línea recta con todas las paradas
        const fallbackRoute = [
          { latitude: coords.latitude, longitude: coords.longitude },
          { latitude: ride.origin.lat, longitude: ride.origin.lng },
        ];
        
        if (ride.extraDestinations) {
          ride.extraDestinations.forEach(stop => {
            fallbackRoute.push({ latitude: stop.lat, longitude: stop.lng });
          });
        }
        
        fallbackRoute.push({ latitude: ride.destination.lat, longitude: ride.destination.lng });
        setRouteCoordinates(fallbackRoute);
      } finally {
        setLoadingRoute(false);
      }
    }
  };

  const handleNegotiate = (ride: Ride) => {
    setSelectedRide(ride);
    const startingPrice = ride.driverOfferedPrice || ride.clientSuggestedPrice || ride.estimatedPrice || 0;
    setCounterOffer(startingPrice ? startingPrice.toString() : '');
    setShowNegotiateModal(true);
  };

  const handleSendCounterOffer = async () => {
    if (!selectedRide || !user?.id) {
      Alert.alert('Error', 'No se pudo obtener tu información');
      return;
    }
    
    const price = parseFloat(counterOffer);
    if (isNaN(price) || price < 50) {
      Alert.alert('Error', 'El precio debe ser mínimo C$50');
      return;
    }

    try {
      console.log(`💰 [handleSendCounterOffer] Enviando contraoferta: C$${price} para viaje ${selectedRide.id} como conductor ${user.id}`);
      
      // ✅ NUEVO: Pasar driverId junto con la contraoferta
      await priceNegotiationService.negotiatePrice(selectedRide.id, price, 'driver', selectedRide.estimatedPrice, user.id);
      
      Alert.alert('Éxito', 'Contraoferta enviada al cliente');
      setShowNegotiateModal(false);
      setSelectedRide(null);
      setCounterOffer('');
    } catch (error: any) {
      console.error('❌ Error enviando contraoferta:', error);
      Alert.alert('Error', error.message || 'No se pudo enviar la contraoferta');
    }
  };

  const handleNavigateToRide = () => {
    if (!selectedRide || !coords) {
      Alert.alert('Error', 'No se puede determinar tu ubicación actual');
      return;
    }

    const currentLat = coords.latitude;
    const currentLng = coords.longitude;
    const originLat = selectedRide.origin.lat;
    const originLng = selectedRide.origin.lng;
    const destLat = selectedRide.destination.lat;
    const destLng = selectedRide.destination.lng;

    // ✅ MEJORADO: Waypoints incluyen origen + paradas extras
    let waypoints = `${originLat},${originLng}`;
    
    if (selectedRide.extraDestinations && selectedRide.extraDestinations.length > 0) {
      const extraWaypoints = selectedRide.extraDestinations
        .map(stop => `${stop.lat},${stop.lng}`)
        .join('|');
      waypoints = `${waypoints}|${extraWaypoints}`;
    }

    const stopsText = selectedRide.extraDestinations && selectedRide.extraDestinations.length > 0
      ? `\n\n📍 Paradas: ${selectedRide.extraDestinations.length}`
      : '';

    Alert.alert(
      'Navegar con GPS',
      `Ruta completa: Tu ubicación → Punto de recogida → ${selectedRide.extraDestinations?.length || 0 > 0 ? 'Paradas → ' : ''}Destino final${stopsText}`,
      [
        {
          text: '🗺️ Google Maps',
          onPress: () => {
            const url = Platform.select({
              ios: `comgooglemaps://?saddr=${currentLat},${currentLng}&daddr=${destLat},${destLng}&waypoints=${waypoints}&directionsmode=driving`,
              android: `google.navigation:q=${destLat},${destLng}&waypoints=${waypoints}&mode=d`,
            });

            const fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentLat},${currentLng}&destination=${destLat},${destLng}&waypoints=${waypoints}&travelmode=driving`;

            Linking.canOpenURL(url || fallbackUrl).then((supported) => {
              Linking.openURL(supported && url ? url : fallbackUrl);
            });
          },
        },
        {
          text: '🚗 Waze',
          onPress: () => {
            // Waze no soporta waypoints, solo destino final
            const url = `waze://?ll=${destLat},${destLng}&navigate=yes`;
            Linking.canOpenURL(url).then((supported) => {
              if (supported) {
                Linking.openURL(url);
              } else {
                Linking.openURL(`https://www.waze.com/ul?ll=${destLat},${destLng}&navigate=yes`);
              }
            });
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const renderRideItem = ({ item }: { item: Ride }) => {
    const hasSuggestedPrice = !!(item.clientSuggestedPrice && item.clientSuggestedPrice > 0);
    const hasDriverOffer = item.driverOfferedPrice && item.driverOfferedPrice > 0;
    const savings = hasSuggestedPrice 
      ? item.estimatedPrice - (item.clientSuggestedPrice || 0)
      : 0;

    return (
      <View style={[styles.rideCard, { backgroundColor: colors.surface }]}>
        {/* Botón Ver Mapa */}
        <TouchableOpacity
          style={styles.mapButton}
          onPress={() => handleShowMap(item)}
        >
          <Text style={styles.mapButtonText}>🗺️ Ver Ruta en Mapa</Text>
        </TouchableOpacity>

        {/* Ubicaciones */}
        <View style={styles.locations}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔵</Text>
            <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={2}>
              {item.origin?.address || 'Origen'}
            </Text>
          </View>
          <View style={styles.divider} />
          
          {/* ✅ NUEVO: Mostrar paradas extras si existen */}
          {item.extraDestinations && item.extraDestinations.length > 0 && (
            <>
              {item.extraDestinations.map((stop, index) => (
                <View key={`waypoint-${index}`}>
                  <View style={styles.locationRow}>
                    <Text style={styles.locationIcon}>🟡</Text>
                    <Text style={[styles.locationText, { color: colors.textSecondary, fontSize: 12 }]} numberOfLines={2}>
                      Parada {index + 1}: {stop.address}
                    </Text>
                  </View>
                  <View style={styles.divider} />
                </View>
              ))}
            </>
          )}
          
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔴</Text>
            <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={2}>
              {item.destination?.address || 'Destino'}
            </Text>
          </View>
        </View>
        
        {/* ✅ NUEVO: Badge de múltiples destinos */}
        {item.extraDestinations && item.extraDestinations.length > 0 && (
          <View style={[styles.multipleStopsBadge, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.multipleStopsBadgeText, { color: colors.primary }]}>
              📍 {item.extraDestinations.length} parada{item.extraDestinations.length > 1 ? 's' : ''} adicional{item.extraDestinations.length > 1 ? 'es' : ''}
            </Text>
          </View>
        )}

        {/* Rating del Cliente */}
        {clientRatings.has(item.clientId) && (
          <View style={styles.clientRatingContainer}>
            <Text style={[styles.clientRatingLabel, { color: colors.textSecondary }]}>
              👤 Cliente:
            </Text>
            <RatingDisplay 
              rating={clientRatings.get(item.clientId)?.rating || 0}
              totalRatings={clientRatings.get(item.clientId)?.totalRatings}
              size="small"
              showCount={true}
            />
          </View>
        )}

        {/* Detalles */}
        <View style={styles.details}>
          <View style={styles.detailItem}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Distancia
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {((item.estimatedDistance || 0) / 1000).toFixed(1)} km
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Duración
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {Math.round((item.estimatedDuration || 0) / 60)} min
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Precio
            </Text>
            <Text style={[styles.priceValue, { color: colors.primary }]}>
              C${item.estimatedPrice}
            </Text>
          </View>
        </View>

        {/* Precio Sugerido / Estimado y Negociación */}
        <View style={styles.priceSection}>
          <View style={styles.suggestedPriceContainer}>
            {hasSuggestedPrice ? (
              <>
                <Text style={styles.suggestedLabel}>💡 Cliente sugiere:</Text>
                <Text style={styles.suggestedPrice}>C${item.clientSuggestedPrice}</Text>
                {savings > 0 && (
                  <Text style={styles.savingsText}>(diferencia: C${savings.toFixed(2)})</Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.suggestedLabel}>💡 Precio estimado del sistema:</Text>
                <Text style={styles.suggestedPrice}>C${item.estimatedPrice}</Text>
              </>
            )}
          </View>
          <TouchableOpacity
            style={styles.negotiateButton}
            onPress={() => handleNegotiate(item)}
          >
            <Text style={styles.negotiateButtonText}>
              {hasSuggestedPrice ? '💬 Contraofertar' : '💬 Ofrecer precio'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Contraoferta del Conductor */}
        {hasDriverOffer && (
          <View style={[styles.priceSection, { backgroundColor: '#E3F2FD', borderLeftColor: '#2196F3' }]}>
            <View style={styles.suggestedPriceContainer}>
              <Text style={[styles.suggestedLabel, { color: '#1565C0' }]}>💬 Tu contraoferta:</Text>
              <Text style={[styles.suggestedPrice, { color: '#1565C0' }]}>C${item.driverOfferedPrice}</Text>
              <Text style={[styles.savingsText, { color: '#1565C0' }]}>(esperando respuesta)</Text>
            </View>
          </View>
        )}

        {/* Botón Aceptar */}
        <TouchableOpacity
          style={[styles.acceptButton, { backgroundColor: colors.primary }]}
          onPress={() => handleAcceptRide(item)}
        >
          <Text style={styles.acceptButtonText}>
            {hasSuggestedPrice 
              ? `✅ Aceptar por C$${item.clientSuggestedPrice}` 
              : 'Aceptar Viaje'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <RideListSkeleton count={4} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={rides}
        renderItem={renderRideItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <NoRidesEmptyState onAction={handleRefresh} />
        }
      />

      {/* Modal de Mapa */}
      <Modal
        visible={showMapModal}
        animationType="slide"
        onRequestClose={() => setShowMapModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ruta del Viaje</Text>
            <TouchableOpacity onPress={() => setShowMapModal(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          {selectedRide && coords && (
            <>
              <DynamicMap
                latitude={coords.latitude}
                longitude={coords.longitude}
                showMarker={true}
                markerPosition={{
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                }}
                markerType="car"
                originMarker={{
                  latitude: selectedRide.origin.lat,
                  longitude: selectedRide.origin.lng,
                }}
                destinationMarker={{
                  latitude: selectedRide.destination.lat,
                  longitude: selectedRide.destination.lng,
                }}
                // ✅ NUEVO: Pasar marcadores de paradas extras
                extraStopMarkers={
                  selectedRide.extraDestinations && selectedRide.extraDestinations.length > 0
                    ? selectedRide.extraDestinations.map((stop, index) => ({
                        latitude: stop.lat,
                        longitude: stop.lng,
                        index: index + 1,
                        color: '#FFA500', // Naranja para paradas
                      }))
                    : undefined
                }
                routeCoordinates={routeCoordinates.length > 0 ? routeCoordinates : undefined}
                style={{ flex: 1 }}
              />
              {loadingRoute && (
                <View style={styles.loadingRouteContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.loadingRouteText, { color: colors.text }]}>
                    Calculando ruta...
                  </Text>
                </View>
              )}
              
              {/* ✅ NUEVO: Información de paradas extras */}
              {selectedRide.extraDestinations && selectedRide.extraDestinations.length > 0 && (
                <View style={[styles.stopsInfoContainer, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.stopsInfoTitle, { color: colors.text }]}>
                    📍 Paradas ({selectedRide.extraDestinations.length})
                  </Text>
                  {selectedRide.extraDestinations.map((stop, index) => (
                    <View key={`stop-${index}`} style={styles.stopItem}>
                      <Text style={[styles.stopNumber, { color: colors.primary }]}>
                        {index + 1}
                      </Text>
                      <Text style={[styles.stopAddress, { color: colors.text }]} numberOfLines={2}>
                        {stop.address}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              
              <View style={styles.mapActionsContainer}>
                <TouchableOpacity
                  style={[styles.navigateButton, { backgroundColor: colors.primary }]}
                  onPress={handleNavigateToRide}
                >
                  <Text style={styles.navigateButtonText}>
                    🧭 Navegar con GPS
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Modal de Negociación */}
      <Modal
        visible={showNegotiateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNegotiateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.negotiateModal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>💬 Hacer Contraoferta</Text>
            
            {selectedRide && (
              <View style={styles.priceInfo}>
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                  Precio estimado: C${selectedRide.estimatedPrice}
                </Text>
                {selectedRide.clientSuggestedPrice ? (
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                    Cliente sugiere: C${selectedRide.clientSuggestedPrice}
                  </Text>
                ) : (
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                    No hay precio sugerido. Propón tu tarifa.
                  </Text>
                )}
              </View>
            )}

            <Text style={[styles.inputLabel, { color: colors.text }]}>Tu contraoferta:</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text }]}
              value={counterOffer}
              onChangeText={setCounterOffer}
              keyboardType="numeric"
              placeholder="Ingresa tu precio"
              placeholderTextColor={colors.textSecondary}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowNegotiateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.sendButton, { backgroundColor: colors.primary }]}
                onPress={handleSendCounterOffer}
              >
                <Text style={styles.sendButtonText}>Enviar Oferta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  rideCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  suggestedBadge: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA500',
  },
  suggestedBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
  },
  savingsText: {
    fontSize: 12,
    color: '#856404',
    marginTop: 4,
  },
  locations: {
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  locationIcon: {
    fontSize: 16,
    marginTop: 2,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  divider: {
    width: 2,
    height: 20,
    backgroundColor: '#E0E0E0',
    marginLeft: 7,
    marginVertical: 4,
  },
  clientRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 12,
  },
  clientRatingLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  mapButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  mapButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA500',
  },
  suggestedPriceContainer: {
    flex: 1,
  },
  suggestedLabel: {
    fontSize: 12,
    color: '#856404',
    marginBottom: 4,
  },
  suggestedPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#856404',
  },
  negotiateButton: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  negotiateButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptButton: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  negotiateModal: {
    width: '85%',
    borderRadius: 12,
    padding: 20,
  },
  priceInfo: {
    marginVertical: 16,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  sendButton: {
    // backgroundColor viene de colors.primary
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  mapActionsContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  navigateButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  navigateButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // ✅ NUEVO: Estilos para información de paradas
  stopsInfoContainer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    maxHeight: 150,
  },
  stopsInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  stopNumber: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  stopAddress: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  loadingRouteContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  loadingRouteText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  // ✅ NUEVO: Estilos para múltiples destinos
  multipleStopsBadge: {
    borderRadius: 8,
    padding: 10,
    marginVertical: 12,
    alignItems: 'center',
  },
  multipleStopsBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
