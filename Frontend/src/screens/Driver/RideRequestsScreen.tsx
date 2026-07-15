import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/LoadingIcon';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useRideNotifications } from '../../hooks/useRideNotifications';
import ridesService from '../../services/ridesService';
import DynamicMap from '../../components/DynamicMap';
import { getDatabase, onValue, ref } from 'firebase/database';
import { RIDES_RADIUS_KM } from '../../constants/rideRadius';

interface RideRequest {
  id: string;
  client: {
    name: string;
    rating: number;
    phone: string;
  };
  origin: {
    lat: number;
    lng: number;
    address: string;
  };
  destination: {
    lat: number;
    lng: number;
    address: string;
  };
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  clientSuggestedPrice?: number;
  passengers?: number;
  rideType: string;
  createdAt: string;
  clientVehicle?: {
    make?: string;
    model?: string;
    color?: string;
    plate?: string;
    photos?: string[];
  };
  // ✅ NUEVO: Soporte para múltiples destinos
  extraDestinations?: Array<{
    lat: number;
    lng: number;
    address: string;
  }>;
  waypointsCount?: number;
  hasMultipleDestinations?: boolean;
}

export default function RideRequestsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { coords } = useLocation();
  const { connected, newRidesCount } = useRideNotifications(user?.id);
  
  const [rides, setRides] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRide, setSelectedRide] = useState<RideRequest | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [customOffer, setCustomOffer] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [activeRideGuard, setActiveRideGuard] = useState<string | null>(null);

  // 🔒 Guard: Si ya tengo un viaje activo (accepted/driver_on_route/driver_arrived/in_progress), redirigir y bloquear esta pantalla
  useEffect(() => {
    if (!user?.id) return;

    const db = getDatabase();
    const activeRef = ref(db, 'activeRides');
    const unsubscribe = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setActiveRideGuard(null);
        return;
      }

      let found: string | null = null;
      for (const [id, r] of Object.entries<any>(data)) {
        const status = String(r?.status || '').toLowerCase();
        if (r?.driverId === user.id && ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)) {
          found = id;
          break;
        }
      }

      if (found) {
        setActiveRideGuard(found);
        navigation.replace('ActiveRide', { rideId: found });
      } else {
        setActiveRideGuard(null);
      }
    });

    return () => unsubscribe();
  }, [user?.id, navigation]);

  useEffect(() => {
    loadRideRequests();
    const interval = setInterval(loadRideRequests, 15000); // Actualizar cada 15s
    return () => clearInterval(interval);
  }, [coords]);

  const loadRideRequests = async () => {
    if (!coords) return;
    
    try {
      const availableRides = await ridesService.getAvailableRides(
        coords.latitude,
        coords.longitude,
        RIDES_RADIUS_KM // 15 km de radio (mayor cobertura en Nicaragua)
      );
      setRides(availableRides || []);
    } catch (error: any) {
      if (error.response?.status !== 404) {
        console.error('Error loading rides:', error);
      }
      setRides([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRide = (ride: RideRequest) => {
    setSelectedRide(ride);
  };

  const handleAcceptWithOriginalPrice = async (ride: RideRequest) => {
    await acceptRide(ride, ride.estimatedPrice);
  };

  const handleOfferCustomPrice = (ride: RideRequest) => {
    setSelectedRide(ride);
    setCustomOffer(ride.estimatedPrice.toString());
    setShowOfferModal(true);
  };

  const submitCustomOffer = async () => {
    if (!selectedRide) return;
    
    const offerPrice = parseFloat(customOffer);
    if (isNaN(offerPrice) || offerPrice < 50) {
      Alert.alert('Error', 'El precio debe ser mínimo C$50');
      return;
    }

    await acceptRide(selectedRide, offerPrice);
    setShowOfferModal(false);
  };

  const acceptRide = async (ride: RideRequest, offeredPrice: number) => {
    if (!coords || !user) return;

    try {
      setAccepting(true);

      // 🔒 Bloquear aceptar si ya tengo un viaje activo
      if (activeRideGuard) {
        Alert.alert(
          'Tienes un viaje activo',
          'Debes completar tu viaje actual antes de aceptar uno nuevo.',
          [
            {
              text: 'Ir al viaje',
              onPress: () => navigation.replace('ActiveRide', { rideId: activeRideGuard }),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }
      
      await ridesService.acceptRide(ride.id, {
        driverId: user.id,
        vehicleId: 'temp-vehicle-id', // TODO: Obtener del perfil
        currentLocation: {
          lat: coords.latitude,
          lng: coords.longitude,
        },
        offeredPrice: offeredPrice !== ride.estimatedPrice ? offeredPrice : undefined,
      });

      Alert.alert(
        '¡Viaje Aceptado!',
        offeredPrice !== ride.estimatedPrice 
          ? `Has ofrecido C$${offeredPrice} por este viaje. El cliente recibirá tu oferta.`
          : 'El viaje ha sido aceptado con el precio sugerido.',
        [
          {
            text: 'Ver Viaje',
            onPress: () => navigation.replace('ActiveRide', { rideId: ride.id }),
          },
        ]
      );

      // Recargar lista
      loadRideRequests();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'No se pudo aceptar el viaje');
    } finally {
      setAccepting(false);
    }
  };

  const getTimeAgo = (dateString: string): string => {
    if (!dateString) return 'Hace un momento';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Hace un momento';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
    return `Hace ${Math.floor(seconds / 86400)} días`;
  };

  const renderRideRequest = ({ item }: { item: RideRequest }) => {
    const distanceKm = (item.estimatedDistance / 1000).toFixed(1);
    const durationMin = Math.round(item.estimatedDuration / 60);
    const timeAgo = getTimeAgo(item.createdAt);
    const hasSuggestedPrice = item.clientSuggestedPrice && item.clientSuggestedPrice !== item.estimatedPrice;

    return (
      <TouchableOpacity
        style={styles.rideCard}
        onPress={() => handleSelectRide(item)}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.clientSection}>
            <View style={styles.clientAvatar}>
              <Text style={styles.clientAvatarText}>
                {item.client.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{item.client.name}</Text>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingStar}>⭐</Text>
                <Text style={styles.ratingText}>{item.client.rating.toFixed(1)}</Text>
                <Text style={styles.timeText}> • {timeAgo}</Text>
              </View>
            </View>
          </View>
          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>Tarifa</Text>
            <Text style={styles.priceValue}>C${item.estimatedPrice}</Text>
            {hasSuggestedPrice && (
              <Text style={styles.suggestedPrice}>
                Cliente ofrece: C${item.clientSuggestedPrice}
              </Text>
            )}
          </View>
        </View>

        {/* Distancia desde conductor */}
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceBadgeText}><MaterialIcons name="place" size={14} color={colors.textSecondary} /> ~{distanceKm} km de ti</Text>
        </View>

        {/* Ruta */}
        <View style={styles.routeContainer}>
          <View style={styles.routePoint}>
            <MaterialIcons name="circle" size={16} color="#2196F3" />
            <View style={styles.routeDetails}>
              <Text style={styles.routeLabel}>RECOGER EN</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>
                {item.origin.address}
              </Text>
            </View>
          </View>

          <View style={styles.routeLine} />

          {/* ✅ NUEVO: Mostrar paradas extras si existen */}
          {item.extraDestinations && item.extraDestinations.length > 0 && (
            <>
              {item.extraDestinations.map((stop: any, index: number) => (
                <View key={`waypoint-${index}`}>
                  <View style={styles.routePoint}>
                    <MaterialIcons name="adjust" size={16} color="#FFC107" />
                    <View style={styles.routeDetails}>
                      <Text style={styles.routeLabel}>PARADA {index + 1}</Text>
                      <Text style={styles.routeAddress} numberOfLines={2}>
                        {stop.address}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.routeLine} />
                </View>
              ))}
            </>
          )}

          <View style={styles.routePoint}>
            <MaterialIcons name="place" size={16} color="#F44336" />
            <View style={styles.routeDetails}>
              <Text style={styles.routeLabel}>DEJAR EN</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>
                {item.destination.address}
              </Text>
            </View>
          </View>
        </View>

        {/* Info del viaje */}
        <View style={styles.tripInfo}>
          <View style={styles.tripInfoItem}>
            <MaterialIcons name="straighten" size={20} color={colors.textSecondary} />
            <Text style={styles.tripInfoText}>{distanceKm} km</Text>
          </View>
          <View style={styles.tripInfoDivider} />
          <View style={styles.tripInfoItem}>
            <MaterialIcons name="schedule" size={20} color={colors.textSecondary} />
            <Text style={styles.tripInfoText}>{durationMin} min</Text>
          </View>
          <View style={styles.tripInfoDivider} />
          <View style={styles.tripInfoItem}>
            <MaterialIcons name="people" size={20} color={colors.textSecondary} />
            <Text style={styles.tripInfoText}>{item.passengers || 1} pax</Text>
          </View>
          <View style={styles.tripInfoDivider} />
          <View style={styles.tripInfoItem}>
            <MaterialIcons name={item.rideType === 'designated_driver' ? 'directions-car' : 'local-taxi'} size={20} color={colors.textSecondary} />
            <Text style={styles.tripInfoText}>
              {item.rideType === 'designated_driver' ? 'C.D.' : 'Normal'}
            </Text>
          </View>
        </View>

        {/* Foto del vehículo del cliente - Solo para conductor designado */}
        {item.rideType === 'designated_driver' && item.clientVehicle?.photos && item.clientVehicle.photos.length > 0 && (
          <View style={styles.clientVehicleContainer}>
            <Text style={styles.clientVehicleTitle}><MaterialIcons name="directions-car" size={18} color={colors.text} /> Vehículo del Cliente</Text>
            <View style={styles.clientVehicleContent}>
              <Image
                source={{ uri: item.clientVehicle.photos[0] }}
                style={styles.clientVehicleImage}
                resizeMode="cover"
              />
              <View style={styles.clientVehicleInfo}>
                <Text style={styles.clientVehicleText}>
                  {item.clientVehicle.make || 'N/A'} {item.clientVehicle.model || 'N/A'}
                </Text>
                <Text style={styles.clientVehicleText}>
                  {item.clientVehicle.color || 'N/A'}
                </Text>
                {item.clientVehicle.plate && (
                  <Text style={styles.clientVehiclePlate}>
                    <MaterialIcons name="assignment" size={14} color={colors.textSecondary} /> {item.clientVehicle.plate}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Botones de acción */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAcceptWithOriginalPrice(item)}
            disabled={accepting}
          >
            <Text style={styles.acceptButtonText}>
              <MaterialIcons name="check" size={18} color="#fff" /> Aceptar C${item.estimatedPrice}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.offerButton}
            onPress={() => handleOfferCustomPrice(item)}
            disabled={accepting}
          >
            <Text style={styles.offerButtonText}><MaterialIcons name="payments" size={18} color={colors.primary} /> Ofrecer Tarifa</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={styles.loadingText}>Buscando solicitudes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Solicitudes de Viaje</Text>
          <Text style={styles.subtitle}>
            {rides.length} {rides.length === 1 ? 'solicitud' : 'solicitudes'} disponibles
          </Text>
        </View>
        <View style={styles.connectionStatus}>
          <View style={[styles.statusDot, connected ? styles.statusConnected : styles.statusDisconnected]} />
          <Text style={styles.statusText}>{connected ? 'En línea' : 'Desconectado'}</Text>
        </View>
      </View>

      {/* Lista de solicitudes */}
      {rides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="directions-car" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No hay solicitudes</Text>
          <Text style={styles.emptyText}>
            Las nuevas solicitudes aparecerán aquí automáticamente
          </Text>
        </View>
      ) : (
        <FlatList
          data={rides}
          renderItem={renderRideRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal de oferta personalizada */}
      <Modal
        visible={showOfferModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOfferModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ofrecer Tarifa Personalizada</Text>
            
            {selectedRide && (
              <View style={styles.modalInfo}>
                <Text style={styles.modalInfoText}>
                  Tarifa sugerida: <Text style={styles.modalInfoBold}>C${selectedRide.estimatedPrice}</Text>
                </Text>
                {selectedRide.clientSuggestedPrice && (
                  <Text style={styles.modalInfoText}>
                    Cliente ofrece: <Text style={styles.modalInfoBold}>C${selectedRide.clientSuggestedPrice}</Text>
                  </Text>
                )}
                
                {/* Rango de negociación dinámico */}
                {(() => {
                  const minPrice = Math.max(50, Math.round(selectedRide.estimatedPrice * 0.6667 * 100) / 100);
                  const maxPrice = Math.min(500, Math.round(selectedRide.estimatedPrice * 1.3333 * 100) / 100);
                  return (
                    <View style={[styles.priceRangeContainer, { backgroundColor: colors.background, borderColor: colors.primary }]}>
                      <Text style={[styles.priceRangeTitle, { color: colors.text }]}>
                        <MaterialIcons name="bar-chart" size={18} color={colors.primary} /> Rango de negociación:
                      </Text>
                      <View style={styles.priceRangeValues}>
                        <View style={styles.priceRangeItem}>
                          <Text style={[styles.priceRangeLabel, { color: colors.textSecondary }]}>
                            Mínimo
                          </Text>
                          <Text style={[styles.priceRangeValue, { color: '#4CAF50' }]}>
                            C${minPrice}
                          </Text>
                        </View>
                        <Text style={[styles.priceRangeDash, { color: colors.textSecondary }]}>
                          —
                        </Text>
                        <View style={styles.priceRangeItem}>
                          <Text style={[styles.priceRangeLabel, { color: colors.textSecondary }]}>
                            Máximo
                          </Text>
                          <Text style={[styles.priceRangeValue, { color: '#FF9800' }]}>
                            C${maxPrice}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}

            <Text style={styles.inputLabel}>Tu oferta:</Text>
            <TextInput
              style={styles.priceInput}
              value={customOffer}
              onChangeText={setCustomOffer}
              keyboardType="numeric"
              placeholder="Ej: 150"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowOfferModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={submitCustomOffer}
                disabled={accepting}
              >
                <Text style={styles.modalSubmitText}>
                  {accepting ? 'Enviando...' : 'Enviar Oferta'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#ff4444',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  listContent: {
    padding: 16,
  },
  rideCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  clientSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clientAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 14,
    marginRight: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  priceSection: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#4CAF50',
  },
  suggestedPrice: {
    fontSize: 11,
    color: '#FF9800',
    fontWeight: '600',
    marginTop: 2,
  },
  distanceBadge: {
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  distanceBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  routeContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeIcon: {
    fontSize: 16,
    marginRight: 12,
    marginTop: 2,
  },
  routeDetails: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  routeAddress: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    lineHeight: 20,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 7,
    marginVertical: 4,
  },
  tripInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
  },
  tripInfoItem: {
    alignItems: 'center',
    gap: 4,
  },
  tripInfoIcon: {
    fontSize: 18,
  },
  tripInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  tripInfoDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  clientVehicleContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clientVehicleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  clientVehicleContent: {
    flexDirection: 'row',
    gap: 12,
  },
  clientVehicleImage: {
    width: 100,
    height: 75,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
  },
  clientVehicleInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  clientVehicleText: {
    fontSize: 13,
    color: colors.text,
    marginBottom: 2,
  },
  clientVehiclePlate: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  offerButton: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  offerButtonText: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInfo: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalInfoText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  modalInfoBold: {
    fontWeight: '700',
    color: colors.text,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  priceInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: '#FF9800',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  priceRangeContainer: {
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 2,
  },
  priceRangeTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  priceRangeValues: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  priceRangeItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceRangeLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  priceRangeValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  priceRangeDash: {
    fontSize: 20,
    marginHorizontal: 8,
  },
});
