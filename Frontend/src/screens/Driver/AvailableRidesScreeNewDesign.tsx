import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Image,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getDatabase, ref, onValue } from 'firebase/database';
import priceNegotiationService from '../../services/priceNegotiationService';
import ridesService from '../../services/ridesService';
import { RideListSkeleton } from '../../components/SkeletonLoader';
import { NoRidesEmptyState } from '../../components/EmptyState';
import alertService from '../../services/alertService';
import { fetchClientProfile, ClientProfile } from '../../services/clientProfilesService';
import { hasSavedCard } from '../../utils/cardUtils';
import { useLocation } from '../../hooks/useLocation';
import { useAcceptedRideListener } from '../../hooks/useAcceptedRideListener';

const DEFAULT_COORDINATE: { lat: number; lng: number } = { lat: 0, lng: 0 };
const BACK_ICON = require('../../assets/icons/back_button/back_button2x.png');

interface Ride {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
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
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  waypointsCount?: number;
  hasMultipleDestinations?: boolean;
}

export default function AvailableRidesScreeNewDesign({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { coords } = useLocation();

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile | null>>({});

  // Monitorear rides aceptados globalmente
  useAcceptedRideListener(navigation);

  useEffect(() => {
    const db = getDatabase();
    const ridesRef = ref(db, 'activeRides');

    const unsubscribe = onValue(
      ridesRef,
      (snapshot) => {
        const data = snapshot.val();

        if (!data) {
          setRides([]);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const availableRides: Ride[] = [];

        Object.entries(data).forEach(([rideId, rideData]: [string, any]) => {
          // El hook useAcceptedRideListener maneja la navegación cuando se acepta
          // Aquí solo procesamos rides en estado 'requested'
          if (rideData.status !== 'requested') {
            return;
          }

          const offers = rideData.offers || {};
          const myOffer = user?.id ? offers[user.id] : null;

          availableRides.push({
            id: rideId,
            clientId: rideData.clientId || '',
            clientName: rideData.clientName || rideData.client?.name || rideData.clientInfo?.name,
            clientPhone: rideData.clientPhone || rideData.client?.phone || rideData.clientInfo?.phone,
            origin: rideData.origin || DEFAULT_COORDINATE,
            destination: rideData.destination || DEFAULT_COORDINATE,
            estimatedDistance: rideData.estimatedDistance || 0,
            estimatedDuration: rideData.estimatedDuration || 0,
            estimatedPrice: rideData.estimatedPrice || 0,
            status: rideData.status || 'requested',
            clientSuggestedPrice: rideData.clientSuggestedPrice,
            driverOfferedPrice: myOffer?.offeredPrice ?? null,
            driverOfferStatus: myOffer?.status ?? null,
            passengers: rideData.passengers || 1,
            rideType: rideData.rideType || 'normal',
            paymentMethod: rideData.paymentMethod,
            requestedAt: rideData.requestedAt || Date.now(),
            extraDestinations: rideData.extraDestinations || [],
            waypointsCount: rideData.waypointsCount || 0,
            hasMultipleDestinations: rideData.hasMultipleDestinations || false,
          });
        });

        setRides(availableRides);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error('❌ Error en listener:', error);
        setLoading(false);
        setRefreshing(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [navigation, user?.id]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const ensureCardForCardPayments = async (ride: Ride): Promise<boolean> => {
    const ridePaymentMethod = ride?.paymentMethod || ride?.rideType;
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

      if (ride.clientSuggestedPrice && ride.clientSuggestedPrice > 0) {
        try {
          await priceNegotiationService.acceptClientPrice(ride.id);

          alertService.showSuccessAlert(
            'Oferta enviada',
            `Aceptaste el viaje por C$${ride.clientSuggestedPrice}. Esperando confirmación del cliente...`,
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
            'Hemos notificado al cliente. Esperando confirmación...',
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

  const groupedRides = useMemo(() => {
    const designated: Ride[] = [];
    const standard: Ride[] = [];

    rides.forEach((ride) => {
      if ((ride.rideType || '').toLowerCase() === 'designated_driver') {
        designated.push(ride);
      } else {
        standard.push(ride);
      }
    });

    return { designated, standard };
  }, [rides]);

  type SectionItem = { id: string; type: 'section' };
  type RideListItem = Ride | SectionItem;

  const listData = useMemo<RideListItem[]>(() => {
    const items: RideListItem[] = [...groupedRides.standard];
    if (groupedRides.designated.length > 0) {
      items.push({ id: 'section-designated', type: 'section' });
      items.push(...groupedRides.designated);
    }
    return items;
  }, [groupedRides]);

  useEffect(() => {
    const missingClientIds = rides
      .map((ride) => ride.clientId)
      .filter((id): id is string => Boolean(id) && !(id in clientProfiles));

    if (missingClientIds.length === 0) {
      return;
    }

    let cancelled = false;

    const loadProfiles = async () => {
      const entries: Array<[string, ClientProfile | null]> = await Promise.all(
        missingClientIds.map(async (clientId) => {
          try {
            const profile = await fetchClientProfile(clientId);
            return [clientId, profile ?? null];
          } catch (error) {
            console.warn('[AvailableRides] Error cargando perfil de cliente', clientId, error);
            return [clientId, null];
          }
        })
      );

      if (!cancelled && entries.length) {
        setClientProfiles((prev) => {
          const next = { ...prev };
          entries.forEach(([id, profile]) => {
            next[id] = profile;
          });
          return next;
        });
      }
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [rides, clientProfiles]);

  const handleSelectRide = (rideId: string) => {
    setSelectedRideId((current) => (current === rideId ? null : rideId));
  };

  const handleViewRideDetails = (ride: Ride) => {
    if (typeof navigation?.navigate !== 'function') {
      return;
    }

    const originLat = ride.origin?.lat ?? 0;
    const originLng = ride.origin?.lng ?? 0;
    const destinationLat = ride.destination?.lat ?? 0;
    const destinationLng = ride.destination?.lng ?? 0;

    const payload = {
      id: ride.id,
      clientId: ride.clientId,
      clientName: ride.clientName,
      clientPhone: ride.clientPhone,
      origin: {
        lat: originLat,
        lng: originLng,
        address: ride.origin?.address || 'Origen',
      },
      destination: {
        lat: destinationLat,
        lng: destinationLng,
        address: ride.destination?.address || 'Destino',
      },
      extraDestinations: (ride.extraDestinations || []).map((stop) => ({
        lat: stop.lat,
        lng: stop.lng,
        address: stop.address,
      })),
      estimatedPrice: ride.estimatedPrice || 0,
      estimatedDistance: ride.estimatedDistance,
      estimatedDuration: ride.estimatedDuration,
      clientSuggestedPrice: ride.clientSuggestedPrice,
      driverOfferedPrice: ride.driverOfferedPrice,
      paymentMethod: ride.paymentMethod,
    };

    navigation.navigate('RidePreview', { ride: payload });
  };

  const getInitials = (name?: string) => {
    if (!name) return 'CL';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const haversineKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371; // km
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const renderRideItem = ({ item }: { item: RideListItem }) => {
    if ((item as any).type === 'section') {
      return (
        <Text style={styles.sectionLabel}>Viajes de Conductor Designado</Text>
      );
    }

    const ride = item as Ride;
    const profile = ride.clientId ? clientProfiles[ride.clientId] : undefined;
    const name = profile?.fullName || ride.clientName || 'Cliente';
    const photoUrl = profile?.photoUrl || null;

    const originLat = ride?.origin?.lat ?? 0;
    const originLng = ride?.origin?.lng ?? 0;
    const destLat = ride?.destination?.lat ?? 0;
    const destLng = ride?.destination?.lng ?? 0;

    const originAddress = ride?.origin?.address || `${originLat.toFixed(4)}, ${originLng.toFixed(4)}`;
    const destinationAddress = ride?.destination?.address || `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`;

    const price = ride.clientSuggestedPrice ?? ride.estimatedPrice ?? 0;
    const stopsCount = (ride.extraDestinations || []).length;

    // Distancia y ETA del conductor al origen del viaje
    const driverLat = coords?.latitude ?? null;
    const driverLng = coords?.longitude ?? null;
    const distanceToOriginKm =
      driverLat !== null && driverLng !== null
        ? haversineKm(driverLat, driverLng, originLat, originLng)
        : 0;
    const AVERAGE_SPEED_KMH = 28; // velocidad urbana estimada
    const etaToOriginMin = distanceToOriginKm > 0 ? Math.max(1, Math.round((distanceToOriginKm / AVERAGE_SPEED_KMH) * 60)) : 0;

    const isSelected = selectedRideId === ride.id;

    return (
      <Pressable
        style={[
          styles.rideCard,
          isDark ? styles.rideCardDark : styles.rideCardLight,
          isSelected && { borderColor: '#D4AF37', borderWidth: 1.5, shadowColor: '#D4AF37', shadowOpacity: 0.25, elevation: 2 },
        ]}
        onPress={() => handleSelectRide(ride.id)}
      >
        <View style={styles.cardRow}>
          <View
            style={[
              styles.avatarPlaceholder,
              isDark ? styles.avatarPlaceholderDark : styles.avatarPlaceholderLight,
            ]}
          >
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitials, { color: colors.text }]}>
                {getInitials(name)}
              </Text>
            )}
          </View>

          <View style={styles.detailsColumn}>
            <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              Origen: {originAddress}
            </Text>
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              Destino: {destinationAddress}
            </Text>
            {stopsCount > 0 ? (
              <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
                Paradas: {stopsCount}
              </Text>
            ) : null}
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              Precio: C${price}
            </Text>
          </View>

          <View style={styles.metaColumn}>
            <Text style={[styles.distanceLabel, { color: colors.text }]}>
              {distanceToOriginKm > 0 ? `${distanceToOriginKm.toFixed(1)} km al origen` : 'Calculando distancia...'}
            </Text>
            <Text style={[styles.distanceLabel, { color: colors.text + '99' }]}>
              {distanceToOriginKm > 0 ? `~${etaToOriginMin} min para llegar` : ''}
            </Text>
            {isSelected && (
              <TouchableOpacity
                onPress={() => handleViewRideDetails(ride)}
                style={[styles.viewButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={styles.viewButtonText}>Ver</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <TouchableOpacity
          style={[styles.backButton, isDark ? styles.backButtonDark : styles.backButtonLight]}
          onPress={() => navigation.goBack?.()}
          activeOpacity={0.8}
        > 
          <Image source={BACK_ICON} style={[styles.backIconImage, { tintColor: isDark ? '#FFFFFF' : colors.text }]} resizeMode="contain" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Viajes Disponibles</Text>
      </View>

      <FlatList
        data={listData}
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
        ListEmptyComponent={loading ? (
          <RideListSkeleton />
        ) : (
          <NoRidesEmptyState onAction={handleRefresh} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  backButtonLight: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  backButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backIconImage: {
    width: 18,
    height: 18,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 40,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D18A1B',
    marginVertical: 12,
  },
  rideCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rideCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
  },
  rideCardDark: {
    backgroundColor: '#1F1F1F',
    borderColor: '#303030',
    shadowOpacity: 0.2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  avatarPlaceholderLight: {
    backgroundColor: '#F2F2F2',
  },
  avatarPlaceholderDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
  },
  detailsColumn: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  detailLine: {
    fontSize: 13,
  },
  metaColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    paddingLeft: 12,
  },
  distanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  viewButton: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderWidth: 1,
  },
  viewButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
