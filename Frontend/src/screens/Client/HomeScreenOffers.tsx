import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, Animated } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLocation } from '../../hooks/useLocation';
import DynamicMap from '../../components/DynamicMap';
import alertService from '../../services/alertService';
import ridesService from '../../services/ridesService';
import PriceNegotiationModal from '../../components/PriceNegotiationModal';
import priceNegotiationService from '../../services/priceNegotiationService';
import { useFirebaseData } from '../../hooks/useFirebaseData';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/vehicleIcons';

const USER_LOCATION_LIGHT_ICON = require('../../assets/icons/actuall-position-white/actuallpositionwhite2x.png');
const USER_LOCATION_DARK_ICON = require('../../assets/icons/actuall-position-black/actuallpositionblack2x.png');

interface Props {
  navigation: any;
  route?: { params?: { rideId?: string } };
}

interface OfferItem {
  driverId: string;
  offeredPrice?: number;
  status?: 'pending' | 'accepted' | 'rejected';
  estimatedArrivalTime?: string;
  driver: {
    name: string;
    rating: number | null;
    photoURL: string | null;
    vehicle?: any;
  };
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const preferNonEmpty = (...candidates: Array<string | null | undefined>): string | null => {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
};

const extractNameFromSource = (source: any): string | null => {
  if (!source || typeof source !== 'object') return null;
  return preferNonEmpty(
    source.fullName,
    source.displayName,
    source.name,
    [source.firstName, source.lastName].filter(Boolean).join(' '),
    source.driverName,
    source.username
  );
};

const mergeName = (...sources: Array<any | null | undefined>): string => {
  for (const source of sources) {
    const candidate = extractNameFromSource(source);
    if (candidate) {
      return candidate;
    }
  }
  return 'Conductor';
};

const extractRatingValue = (value: any): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    return (
      extractRatingValue(value.value) ??
      extractRatingValue(value.average) ??
      extractRatingValue(value.avg) ??
      extractRatingValue(value.rating) ??
      extractRatingValue(value.score)
    );
  }
  return null;
};

const mergeRating = (...sources: Array<any | null | undefined>): number | null => {
  const ratingCandidates: any[] = [];

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    ratingCandidates.push(
      source.rating,
      source.averageRating,
      source.avgRating,
      source?.stats?.rating,
      source?.stats?.averageRating,
      source?.stats?.avgRating
    );
  }

  for (const candidate of ratingCandidates) {
    const parsed = extractRatingValue(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
};

export default function HomeScreenOffers({ navigation, route }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords } = useLocation();
  const [rideId, setRideId] = useState<string | null>(route?.params?.rideId || null);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rideSnapshot, setRideSnapshot] = useState<any | null>(null);
  const [driverLocations, setDriverLocations] = useState<Record<string, any> | null>(null);
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // driversInfo: datos públicos agregados (nombre, foto, rating, vehículo). Evita leer /drivers (permiso denegado para clientes)
  const { data: driversInfo } = useFirebaseData<any>('driversInfo', { maxCacheAge: 10000 });
  const { data: driversRaw } = useFirebaseData<any>('drivers', { maxCacheAge: 10000 });

  // Resolve current rideId if not provided (find requested or driver_offered for this user)
  useEffect(() => {
    if (rideId) return;
    if (!user?.id) return;

    let mounted = true;
    (async () => {
      const { getDatabase, ref, onValue, off } = await import('firebase/database');
      const db = getDatabase();
      const activeRidesRef = ref(db, 'activeRides');
      const unsub = onValue(activeRidesRef, (snap) => {
        if (!mounted) return;
        const all = snap.val() || {};
        const mine = Object.entries<any>(all).find(([, r]) => r?.clientId === user.id && (
          r?.status === 'requested' || r?.status === 'driver_offered' || r?.status === 'pending_confirm' || r?.status === 'driver_assigned'
        ));
        if (mine) {
          setRideId(mine[0]);
        }
        setTimeout(() => off(activeRidesRef), 0);
      });
      return () => { try { off(activeRidesRef); } catch {} };
    })();
  }, [rideId, user?.id]);

  // Listen to active ride and its offers
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;
    (async () => {
      if (!rideId) return;
      const { getDatabase, ref, onValue, off, get } = await import('firebase/database');
      const db = getDatabase();
      const rideRef = ref(db, `activeRides/${rideId}`);

      const onRide = async (snapshot: any) => {
        if (!mounted) return;
        const ride = snapshot.val();
        setRideSnapshot(ride);

        // read offers from data or nested path
        let offersData = ride?.offers || ride?.driverOffers;
        if (!offersData) {
          const offersRef = ref(db, `activeRides/${rideId}/offers`);
          const offersSnap = await get(offersRef);
          if (offersSnap.exists()) offersData = offersSnap.val();
        }

        // transform offers to array and enrich with driversInfo
        if (offersData && typeof offersData === 'object') {
          const arr: OfferItem[] = Object.entries<any>(offersData).map(([driverId, offer]) => {
            const info = driversInfo?.[driverId] || {};
            const raw = driversRaw?.[driverId] || {};
            const fullName = mergeName(info, raw, offer?.driver);
            const rating = mergeRating(info, raw, offer?.driver ?? offer);
            const photoURL = info?.profilePhoto || info?.photoURL || info?.photoUrl || raw?.profilePhoto || raw?.photoURL || raw?.photoUrl || offer?.driver?.photoURL || null;
            const vehicle = info?.vehicle || info?.activeVehicle || info?.currentVehicle || raw?.vehicle || raw?.activeVehicle || offer?.driver?.vehicle || undefined;
            return {
              driverId,
              offeredPrice: offer?.offeredPrice,
              status: offer?.status || 'pending',
              estimatedArrivalTime: offer?.estimatedArrivalTime,
              driver: {
                name: fullName,
                rating,
                photoURL,
                vehicle,
              },
            };
          });
          // order by accepted first, then ETA/price
          arr.sort((a, b) => {
            const sa = a.status === 'accepted' ? 0 : 1;
            const sb = b.status === 'accepted' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return (a.offeredPrice ?? 0) - (b.offeredPrice ?? 0);
          });
          setOffers(arr);
          setSelectedDriverId((prev) => {
            if (prev && arr.some((offer) => offer.driverId === prev)) {
              return prev;
            }

            const acceptedOffer = arr.find((offer) => offer.status === 'accepted');
            if (acceptedOffer) {
              return acceptedOffer.driverId;
            }

            return null;
          });
        } else {
          setOffers([]);
        }
        setLoading(false);
      };

      onValue(rideRef, onRide);
      cleanup = () => { try { off(rideRef); } catch {} };
    })();

    return () => { mounted = false; if (cleanup) cleanup(); };
  }, [rideId, driversInfo, driversRaw]);

  // Listen driverLocations for marker positions
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;
    (async () => {
      const { getDatabase, ref, onValue, off } = await import('firebase/database');
      const db = getDatabase();
      const locRef = ref(db, 'driverLocations');
      onValue(locRef, (snap) => {
        if (!mounted) return;
        const val = snap.val();
        setDriverLocations(val && typeof val === 'object' ? val : null);
      });
      cleanup = () => { try { off(locRef); } catch {} };
    })();
    return () => { mounted = false; if (cleanup) cleanup(); };
  }, []);

  const nearbyDrivers = useMemo(() => {
    if (!offers || offers.length === 0) return [] as any[];
    return offers.map((o) => {
      const loc = driverLocations?.[o.driverId] || {};
      const latitude = loc?.lat ?? loc?.latitude ?? loc?.coords?.latitude;
      const longitude = loc?.lng ?? loc?.longitude ?? loc?.coords?.longitude;
      const info = driversInfo?.[o.driverId] || {};
      const raw = driversRaw?.[o.driverId] || {};
      const type = extractVehicleTypeFromInfo(info) || extractVehicleTypeFromInfo(raw);
      const ratingParsed = mergeRating(info, raw, o.driver);
      return {
        id: o.driverId,
        latitude: typeof latitude === 'number' ? latitude : (latitude ? parseFloat(latitude) : 0),
        longitude: typeof longitude === 'number' ? longitude : (longitude ? parseFloat(longitude) : 0),
        heading: typeof loc?.heading === 'number' ? loc.heading : undefined,
        vehicleIconSource: ensureVehicleIconSource(type),
        isSelected: o.driverId === selectedDriverId,
        rating: (ratingParsed !== null && Number.isFinite(ratingParsed) ? ratingParsed : null) as number | null,
        photoURL: (info?.profilePhoto || info?.photoURL || info?.photoUrl || raw?.profilePhoto || raw?.photoURL || raw?.photoUrl || o.driver?.photoURL || null) as string | null,
      };
    }).filter(d => Number.isFinite(d.latitude) && Number.isFinite(d.longitude));
  }, [offers, driverLocations, selectedDriverId, driversInfo, driversRaw]);

  // Calcular ETA aproximada y hora de llegada (basado en distancia y velocidad promedio)
  const etasByDriver = useMemo(() => {
    const map: Record<string, { etaMins: number; arrivalLabel: string }> = {};
    const originLat = rideSnapshot?.origin?.lat ?? rideSnapshot?.origin?.latitude;
    const originLng = rideSnapshot?.origin?.lng ?? rideSnapshot?.origin?.longitude;
    if (!originLat || !originLng) return map;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    (offers || []).forEach((o) => {
      const loc = driverLocations?.[o.driverId];
      const lat = loc?.lat ?? loc?.latitude ?? loc?.coords?.latitude;
      const lng = loc?.lng ?? loc?.longitude ?? loc?.coords?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const distKm = haversineKm(originLat, originLng, lat, lng);
      const avgSpeedKmH = 24; // velocidad promedio urbana
      const mins = Math.max(1, Math.round((distKm / avgSpeedKmH) * 60));
      const arrival = new Date(Date.now() + mins * 60000);
      const hours = arrival.getHours();
      const minutes = arrival.getMinutes();
      const h12 = ((hours + 11) % 12) + 1;
      const ampm = hours >= 12 ? 'pm' : 'am';
      const arrivalLabel = `${h12}:${minutes.toString().padStart(2, '0')}${ampm}`;
      map[o.driverId] = { etaMins: mins, arrivalLabel };
    });
    return map;
  }, [offers, driverLocations, rideSnapshot?.origin?.lat, rideSnapshot?.origin?.lng]);

  const handleSelectFromList = (driverId: string) => {
    setSelectedDriverId((current) => (current === driverId ? null : driverId));
  };
  const handleDriverPressOnMap = (driverId: string) => {
    setSelectedDriverId((current) => (current === driverId ? null : driverId));
  };

  const selectedOffer: OfferItem | undefined = useMemo(
    () => offers.find(o => o.driverId === selectedDriverId),
    [offers, selectedDriverId]
  );

  const primaryActionLabel = selectedOffer?.status === 'accepted' ? 'Confirmar conductor' : 'Seleccionar';

  const acceptedAnim = useRef(new Animated.Value(0)).current;
  const confirmBtnAnim = useRef(new Animated.Value(1)).current;
  const cancelBtnAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!selectedOffer) {
      acceptedAnim.setValue(0);
      return;
    }

    if (selectedOffer.status === 'accepted') {
      Animated.spring(acceptedAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 80,
      }).start();
    } else {
      Animated.timing(acceptedAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedOffer?.status, acceptedAnim, selectedOffer]);

  const openNegotiation = useCallback(() => {
    if (!selectedOffer) return;
    setShowNegotiation(true);
  }, [selectedOffer]);

  const confirmSelectedDriver = useCallback(async () => {
    if (!rideId || !selectedDriverId || isConfirming) return;
    setIsConfirming(true);
    Animated.timing(confirmBtnAnim, {
      toValue: 0.95,
      duration: 120,
      useNativeDriver: true,
    }).start();
    try {
      await ridesService.confirmDriver(rideId, selectedDriverId);
      alertService.showSuccessAlert('Conductor confirmado', 'Ahora podrás ver su ubicación en tiempo real.');
      navigation.replace('RideTracking', {
        rideId,
        driverId: selectedDriverId,
        driverName: offers.find(o => o.driverId === selectedDriverId)?.driver?.name || 'Conductor',
      });
    } catch (e: any) {
      console.error('Error confirming driver', e);
      alertService.showErrorAlert('No se pudo confirmar al conductor. Intenta de nuevo.');
    } finally {
      Animated.timing(confirmBtnAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      setIsConfirming(false);
    }
  }, [rideId, selectedDriverId, navigation, offers, isConfirming, confirmBtnAnim]);

  const cancelSearch = useCallback(async () => {
    if (!rideId || isCancelling) return;
    setIsCancelling(true);
    Animated.timing(cancelBtnAnim, {
      toValue: 0.95,
      duration: 120,
      useNativeDriver: true,
    }).start();
    try {
      await ridesService.cancelRide(rideId, 'Cancelado por el cliente desde HomeScreenOffers');
      alertService.showSuccessAlert('Búsqueda cancelada', 'Regresamos a tu pantalla de inicio.');
      navigation.replace('ClientHome');
    } catch (e: any) {
      alertService.showErrorAlert('No se pudo cancelar la búsqueda.');
    } finally {
      Animated.timing(cancelBtnAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      setIsCancelling(false);
    }
  }, [rideId, navigation, isCancelling, cancelBtnAnim]);

  // Location to center map
  const centerLat = coords?.latitude ?? rideSnapshot?.origin?.lat ?? 12.1364;
  const centerLng = coords?.longitude ?? rideSnapshot?.origin?.lng ?? -86.2514;

  // Coordinates for map pins
  const originCoords = useMemo(() => {
    const origin = rideSnapshot?.origin || rideSnapshot?.originLocation;
    if (!origin) return null;
    const latitude = origin.lat ?? origin.latitude;
    const longitude = origin.lng ?? origin.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
    return null;
  }, [rideSnapshot?.origin, rideSnapshot?.originLocation]);

  const destinationCoords = useMemo(() => {
    const destination = rideSnapshot?.destination || rideSnapshot?.destinationLocation;
    if (!destination) return null;
    const latitude = destination.lat ?? destination.latitude;
    const longitude = destination.lng ?? destination.longitude;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
    return null;
  }, [rideSnapshot?.destination, rideSnapshot?.destinationLocation]);

  const extraStopMarkers = useMemo(() => {
    if (!Array.isArray(rideSnapshot?.extraDestinations)) return [];

    return rideSnapshot.extraDestinations
      .map((stop: any, index: number) => {
        const latitude = stop?.lat ?? stop?.latitude;
        const longitude = stop?.lng ?? stop?.longitude;
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
          return null;
        }
        return {
          latitude,
          longitude,
          index: index + 1,
          label: stop?.address || `Parada ${index + 1}`,
        };
      })
      .filter(Boolean) as Array<{ latitude: number; longitude: number; index: number; label?: string }>;
  }, [rideSnapshot?.extraDestinations]);

  const renderOffer = ({ item }: { item: OfferItem }) => {
    const selected = item.driverId === selectedDriverId;
    const eta = etasByDriver[item.driverId];
    const etaText = eta ? `${eta.etaMins} min` : 'tiempo estimado';
    const arrivalText = eta ? eta.arrivalLabel : 'Hora de llegada';
    const plate = item.driver?.vehicle?.plate || '—';
    const displayPrice = (typeof item.offeredPrice === 'number' && item.offeredPrice > 0)
      ? item.offeredPrice
      : (rideSnapshot?.estimatedPrice || rideSnapshot?.estimatedFare || 0);
    const info = driversInfo?.[item.driverId] || {};
    const raw = driversRaw?.[item.driverId] || {};
    const vehicleType = extractVehicleTypeFromInfo(info) || extractVehicleTypeFromInfo(raw);
    const ratingNumber = mergeRating(info, raw, item.driver);
    const ratingLabel = ratingNumber !== null && Number.isFinite(ratingNumber) ? ratingNumber.toFixed(1) : null;
    const displayName = mergeName(info, raw, item.driver);
    const vehicleIconSource = ensureVehicleIconSource(vehicleType);
    return (
      <TouchableOpacity
        onPress={() => handleSelectFromList(item.driverId)}
        style={[styles.offerRow, selected ? styles.offerRowSelected : styles.offerRowDefault]}
        activeOpacity={0.8}
      >
        <View style={styles.offerAvatarWrap}>
          <View style={styles.offerAvatarFrame}>
            {(() => {
              const photoUri = info?.profilePhoto || info?.photoURL || info?.photoUrl || raw?.profilePhoto || raw?.photoURL || raw?.photoUrl || item.driver?.photoURL || null;
              if (photoUri) {
                return (
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.offerAvatarPhoto}
                  />
                );
              }
              return (
                <View style={styles.offerAvatarFallback}> 
                  <Text style={styles.offerAvatarFallbackText}>{(displayName || 'C').charAt(0).toUpperCase()}</Text>
                </View>
              );
            })()}
          </View>
          <Image source={vehicleIconSource} style={styles.offerVehicleOverlay} />
        </View>
        <View style={styles.offerInfo}>
          <Text style={styles.offerTitle} numberOfLines={1}>
            {displayName} - {plate}
          </Text>
          <Text style={styles.offerSubtitle} numberOfLines={1}>
            {ratingLabel ? `⭐ ${ratingLabel} • ` : ''}Llega {arrivalText} - {etaText}
          </Text>
          {selected && (
            <View style={styles.priceRow}> 
              <Text style={styles.priceLabel}>Precio: </Text>
              <Text style={styles.priceValue}>C${Number(displayPrice).toFixed(2)}</Text>
            </View>
          )}
        </View>
        {selected ? (
          item.status === 'accepted' ? (
            <Animated.View
              style={[
                styles.acceptedStatusChip,
                {
                  transform: [
                    {
                      scale: acceptedAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1],
                      }),
                    },
                  ],
                  opacity: acceptedAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ]}
            >
              <Text style={styles.acceptedStatusText}>El conductor aceptó tu precio</Text>
            </Animated.View>
          ) : (
            <TouchableOpacity onPress={openNegotiation} style={styles.negotiatePill} activeOpacity={0.9}>
              <Text style={styles.negotiateText}>Negociar</Text>
            </TouchableOpacity>
          )
        ) : item.status === 'accepted' ? (
          <View style={styles.acceptedStatusChipSecondary}>
            <Text style={styles.acceptedStatusTextSecondary}>El conductor aceptó tu precio</Text>
          </View>
        ) : (
          <Text style={styles.offerEtaText}>{etaText}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={centerLat}
          longitude={centerLng}
          nearbyDrivers={nearbyDrivers}
          onDriverPress={handleDriverPressOnMap}
          showUserLocation
          userLocation={{ latitude: centerLat, longitude: centerLng }}
          userLocationLightIcon={USER_LOCATION_LIGHT_ICON}
          userLocationDarkIcon={USER_LOCATION_DARK_ICON}
          originMarker={originCoords || undefined}
          destinationMarker={destinationCoords || undefined}
          originLabel={rideSnapshot?.origin?.address || rideSnapshot?.originAddress || undefined}
          destinationLabel={rideSnapshot?.destination?.address || rideSnapshot?.destinationAddress || undefined}
          extraStopMarkers={extraStopMarkers}
          showPinBubbles
          autoFitEnabled
          provider="google"
        />
      </View>

      <View style={[styles.sheet, { backgroundColor: colors.card }] }>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Ofertas Cercanas</Text>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
          </View>
        ) : offers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Aún no hay conductores interesados…</Text>
          </View>
        ) : (
          <FlatList
            data={offers}
            keyExtractor={(it) => it.driverId}
            renderItem={renderOffer}
            contentContainerStyle={{ paddingBottom: 12 }}
          />
        )}

        <AnimatedTouchableOpacity
          style={[
            styles.primaryBtn,
            {
              backgroundColor: selectedDriverId ? '#CF9A24' : '#BDBDBD',
              transform: [{ scale: confirmBtnAnim }],
            },
          ]}
          onPress={confirmSelectedDriver}
          disabled={!selectedDriverId || isConfirming}
          activeOpacity={0.85}
        >
          {isConfirming ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>{primaryActionLabel}</Text>
          )}
        </AnimatedTouchableOpacity>

        <AnimatedTouchableOpacity
          style={[
            styles.cancelBtn,
            {
              backgroundColor: '#E53935',
              transform: [{ scale: cancelBtnAnim }],
              opacity: isCancelling ? 0.7 : 1,
            },
          ]}
          onPress={cancelSearch}
          disabled={isCancelling}
          activeOpacity={0.85}
        >
          {isCancelling ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.cancelBtnText}>Cancelar búsqueda</Text>
          )}
        </AnimatedTouchableOpacity>
      </View>

      {/* Modal de Negociación */}
      <PriceNegotiationModal
        visible={showNegotiation}
        onClose={() => setShowNegotiation(false)}
        driver={{
          id: selectedOffer?.driverId,
          name: selectedOffer?.driver?.name,
          rating: typeof selectedOffer?.driver?.rating === 'number' ? selectedOffer?.driver?.rating as number : undefined,
        }}
        estimatedPrice={rideSnapshot?.estimatedPrice || rideSnapshot?.estimatedFare || 0}
        clientSuggestedPrice={rideSnapshot?.clientSuggestedPrice}
        driverOfferedPrice={selectedOffer?.offeredPrice || 0}
        negotiationStatus={rideSnapshot?.negotiationStatus}
        acceptedClientPrice={rideSnapshot?.acceptedClientPrice}
        onAcceptDriverOffer={async () => {
          if (!rideId || !selectedOffer) return;
          try {
            await priceNegotiationService.acceptDriverOffer(
              rideId,
              selectedOffer.driverId,
              selectedOffer.offeredPrice || 0,
            );
            // Confirm driver after accepting price
            await ridesService.confirmDriver(rideId, selectedOffer.driverId);
            setShowNegotiation(false);
            navigation.replace('RideTracking', {
              rideId,
              driverId: selectedOffer.driverId,
              driverName: selectedOffer.driver?.name || 'Conductor',
            });
          } catch (e: any) {
            alertService.showErrorAlert(e?.message || 'No se pudo aceptar la oferta');
          }
        }}
        onSendCounterOffer={async (price: number) => {
          if (!rideId || !selectedOffer) return;
          try {
            await priceNegotiationService.negotiatePrice(
              rideId,
              price,
              'client',
              rideSnapshot?.estimatedPrice || rideSnapshot?.estimatedFare || 0,
            );
          } catch (e: any) {
            alertService.showErrorAlert(e?.message || 'No se pudo enviar la contraoferta');
          }
        }}
        onAcceptAndStartRide={async () => {
          if (!rideId || !selectedOffer) return;
          try {
            await ridesService.confirmDriver(rideId, selectedOffer.driverId);
            setShowNegotiation(false);
            navigation.replace('RideTracking', {
              rideId,
              driverId: selectedOffer.driverId,
              driverName: selectedOffer.driver?.name || 'Conductor',
            });
          } catch (e: any) {
            alertService.showErrorAlert(e?.message || 'No se pudo confirmar el conductor');
          }
        }}
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapContainer: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  loadingBox: { paddingVertical: 20, alignItems: 'center' },
  emptyBox: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { color: colors.textSecondary },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  offerRowDefault: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  offerRowSelected: {
    backgroundColor: '#CF9A24',
    borderColor: '#E8B451',
  },
  offerAvatarWrap: { width: 60, height: 64, marginRight: 10, position: 'relative', justifyContent: 'flex-end', alignItems: 'center' },
  offerAvatarFrame: { width: 60, height: 60, borderRadius: 16, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: '#D1D5DB', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  offerAvatarPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  offerAvatarFallback: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#E5E7EB' },
  offerAvatarFallbackText: { color: '#64748B', fontWeight: '700', fontSize: 18 },
  offerVehicleOverlay: { position: 'absolute', bottom: -6, left: '50%', transform: [{ translateX: -18 }, { rotate: '270deg' }], width: 38, height: 38, resizeMode: 'contain' },
  offerInfo: { flex: 1 },
  offerTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  offerSubtitle: { fontSize: 12, color: '#4B5563', marginTop: 2 },
  offerEtaText: { fontSize: 13, fontWeight: '700', color: '#1F2937', marginLeft: 8 },
  priceRow: { marginTop: 4 },
  priceLabel: { fontSize: 12, fontWeight: '700', color: '#F0F0F0' },
  priceHint: { fontSize: 11, color: '#F6F6F6' },
  priceValue: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  negotiatePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#6B21A8',
  },
  negotiateText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  acceptedStatusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(33, 150, 83, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 83, 0.45)',
  },
  acceptedStatusText: { color: '#166534', fontWeight: '700', fontSize: 13 },
  acceptedStatusChipSecondary: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(33, 150, 83, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 83, 0.35)',
  },
  acceptedStatusTextSecondary: { color: '#166534', fontWeight: '600', fontSize: 11 },
  primaryBtn: {
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 24,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 20 },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 24,
  },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
