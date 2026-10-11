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
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useLocation } from '../../hooks/shared/location/useLocation';
import ridesService from '../../services/ridesService';
import DynamicMap from '../../components/map/DynamicMap';
import { getDatabase, onValue, ref } from 'firebase/database';
import { RIDES_RADIUS_KM } from '../../constants/rideRadius';
import { getActiveRidesByAreaPath } from '../../utils/serviceArea';
import { RideRequestCard, type RideRequest as RideRequestType } from '../../components/driver/RideRequests/RideRequestCard';
import { RideRequestOfferModal } from '../../components/driver/RideRequests/RideRequestOfferModal';

interface RideRequest {
  id: string;
  client: {
    name: string;
    rating: number;
    phone: string | null;
    photoUrl?: string | null;
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
  createdAt: string | number;
  clientVehiclePhoto?: string | null;
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
  const connected = true;
  const newRidesCount = 0;
  
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
    const activeRef = ref(db, getActiveRidesByAreaPath());
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

  const getTimeAgo = (dateString: string | number): string => {
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
    const hasSuggestedPrice = !!(item.clientSuggestedPrice && item.clientSuggestedPrice !== item.estimatedPrice);

    return (
      <RideRequestCard
        item={item}
        distanceKm={distanceKm}
        durationMin={durationMin}
        timeAgo={timeAgo}
        hasSuggestedPrice={hasSuggestedPrice}
        accepting={accepting}
        colors={colors}
        onSelect={handleSelectRide}
        onAccept={handleAcceptWithOriginalPrice}
        onOffer={handleOfferCustomPrice}
        styles={styles}
      />
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
      <RideRequestOfferModal
        visible={showOfferModal}
        selectedRide={selectedRide}
        customOffer={customOffer}
        accepting={accepting}
        colors={colors}
        onSetCustomOffer={setCustomOffer}
        onClose={() => setShowOfferModal(false)}
        onSubmit={submitCustomOffer}
        styles={styles}
      />
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
    overflow: 'hidden',
  },
  clientAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
