import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Image,
  ImageBackground,
} from 'react-native';

// Contextos y hooks
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';

// Componentes
import LoadingOverlay from '../../components/LoadingOverlay';
import DynamicMap from '../../components/DynamicMap';
import EmergencyButton from '../../components/EmergencyButton';

// Servicios
import alertService from '../../services/alertService';
import mapsService from '../../services/mapsService';
import driversService from '../../services/driversService';
import driverAvailabilityService from '../../services/driverAvailabilityService';
import earningsService from '../../services/earningsService';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../utils/vehicleIcons';

type NearbyDriverMarker = {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  vehicleType?: string | null;
  vehicleIconSource?: ImageSourcePropType;
};

type PendingAction =
  | {
      type: 'pending_payment';
      title: string;
      subtitle: string;
      onPress: () => void;
    }
  | {
      type: 'active_ride';
      title: string;
      subtitle: string;
      onPress: () => void;
    };

const ACTIVE_RIDE_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];

const getActiveRidePendingCopy = (ride: any) => {
  const status: string = ride?.status || '';
  const clientName = ride?.client?.name || ride?.clientName || 'Cliente';

  switch (status) {
    case 'driver_on_route':
      return {
        title: 'En camino al cliente',
        subtitle: `Dirígete a ${clientName}`,
      };
    case 'driver_arrived':
      return {
        title: 'Cliente esperando',
        subtitle: `Confirma la recogida de ${clientName}`,
      };
    case 'in_progress':
      return {
        title: 'Viaje en curso',
        subtitle: ride?.destinationAddress || ride?.destination?.address || 'Continúa el viaje',
      };
    case 'accepted':
    default:
      return {
        title: 'Viaje aceptado',
        subtitle: `Abre el viaje con ${clientName}`,
      };
  }
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function DriverHomeScreenNewDesign({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { coords, loading: locationLoading, error, refreshLocation } = useLocation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [isAvailable, setIsAvailable] = useState(false);
  const [isDesignatedDriverMode, setIsDesignatedDriverMode] = useState(false);
  const [todayStats, setTodayStats] = useState({ trips: 0, earnings: 0 });
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [nearbyDriversMarkers, setNearbyDriversMarkers] = useState<NearbyDriverMarker[]>([]);
  const [availableRideRequests, setAvailableRideRequests] = useState<any[]>([]);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const notifiedRides = useRef<Set<string>>(new Set());
  const rideStatusCacheRef = useRef<Record<string, string>>({});
  const driverLocationsSignatureRef = useRef<string>('');
  const driverInfoCacheRef = useRef<Record<string, any>>({});

  const [currentVehicleType, setCurrentVehicleType] = useState<string | null>(null);
  const [currentVehicleIconSource, setCurrentVehicleIconSource] = useState<ImageSourcePropType | undefined>(undefined);

  const formatCurrency = (value: number = 0) => `C$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;

  const parseCoordinate = (value: any): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  useEffect(() => {
    mapsService.fetchProviderFromBackend();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const driversInfoRef = dbRef(db, 'driversInfo');

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;
          const data = snapshot.val() || {};
          driverInfoCacheRef.current = data;

          if (user?.id) {
            const myInfo = data[user.id];
            const vehicleType = extractVehicleTypeFromInfo(myInfo);
            setCurrentVehicleType(vehicleType);
            setCurrentVehicleIconSource(vehicleType ? ensureVehicleIconSource(vehicleType) : undefined);
          }
        };

        onValue(driversInfoRef, handleSnapshot, (err) => {
          console.error('❌ [DriverHomeScreenNewDesign] Error escuchando driversInfo:', err);
        });

        cleanup = () => off(driversInfoRef, 'value', handleSnapshot);
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error iniciando listener de driversInfo:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [user?.id]);

  useEffect(() => {
    if (pendingPayments.length > 0) {
      const firstPayment = pendingPayments[0];
      setPendingAction({
        type: 'pending_payment',
        title: 'Pago pendiente',
        subtitle: pendingPayments.length === 1 ? 'Confirma el pago pendiente' : `${pendingPayments.length} pagos pendientes`,
        onPress: () => {
          navigation.navigate('PaymentConfirmation', {
            rideId: firstPayment.rideId,
            amount: firstPayment.finalAmount,
            method: firstPayment.method,
          });
        },
      });
      return;
    }

    if (activeRide) {
      const copy = getActiveRidePendingCopy(activeRide);
      setPendingAction({
        type: 'active_ride',
        title: copy.title,
        subtitle: copy.subtitle,
        onPress: () => {
          navigation.navigate('ActiveRide', {
            rideId: activeRide.id,
            clientId: activeRide.clientId,
            origin: activeRide.origin,
            destination: activeRide.destination,
            estimatedFare: activeRide.finalFare || activeRide.estimatedPrice,
          });
        },
      });
      return;
    }

    setPendingAction(null);
  }, [pendingPayments, activeRide, navigation]);

  useEffect(() => {
    let isMounted = true;

    const loadTodayStats = async () => {
      try {
        const response = await earningsService.getDriverEarnings('today');
        if (isMounted && response?.summary) {
          setTodayStats({
            trips: response.summary.totalRides ?? 0,
            earnings:
              response.summary.netEarnings ??
              response.summary.totalEarnings ??
              0,
          });
        }
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error cargando ganancias:', err);
      }
    };

    loadTodayStats();
    const unsubscribe = navigation.addListener('focus', loadTodayStats);

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [navigation]);

  useEffect(() => {
    const restoreAvailabilityState = async () => {
      const savedState = await driverAvailabilityService.getAvailabilityState();
      if (!savedState) return;

      setIsAvailable(savedState.isAvailable);
      setIsDesignatedDriverMode(savedState.isDesignatedDriverMode);

      if (savedState.isAvailable && coords) {
        try {
          await driversService.updateStatus('available', coords);
        } catch (err) {
          console.error('❌ Error restaurando estado de disponibilidad:', err);
        }
      }
    };

    if (coords) {
      restoreAvailabilityState();
    }
  }, [coords]);

  useEffect(() => {
    if (!coords) return;

    driverAvailabilityService.initAppStateListener(coords, (restoredState) => {
      setIsAvailable(restoredState.isAvailable);
      setIsDesignatedDriverMode(restoredState.isDesignatedDriverMode);
    });

    if (isAvailable) {
      driverAvailabilityService.startHeartbeat(coords);
    }

    return () => {
      driverAvailabilityService.cleanup();
    };
  }, [coords, isAvailable]);

  useEffect(() => {
    if (!coords || !isAvailable) {
      driverLocationsSignatureRef.current = '';
      setNearbyDriversMarkers([]);
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const driverLocationsRef = dbRef(db, 'driverLocations');

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;

          const data = snapshot.val();
          if (!data || typeof data !== 'object') {
            if (driverLocationsSignatureRef.current !== '') {
              driverLocationsSignatureRef.current = '';
              setNearbyDriversMarkers([]);
            }
            return;
          }

          const markers: NearbyDriverMarker[] = [];

          Object.entries<any>(data).forEach(([driverId, payload]) => {
            if (!payload || driverId === user?.id) return;

            const lat = parseCoordinate(payload?.lat ?? payload?.latitude ?? payload?.coords?.latitude);
            const lng = parseCoordinate(payload?.lng ?? payload?.longitude ?? payload?.coords?.longitude);
            if (lat === null || lng === null) return;

            const distance = calculateDistance(coords.latitude, coords.longitude, lat, lng);
            if (!Number.isFinite(distance) || distance > 15) return;

            const status = payload?.status ?? payload?.driverStatus ?? payload?.availability;
            if (status && String(status).toLowerCase().includes('offline')) return;

            const heading = typeof payload?.heading === 'number' ? payload.heading : undefined;
            const driverInfo = driverInfoCacheRef.current?.[driverId];
            const vehicleType = extractVehicleTypeFromInfo(driverInfo);
            const vehicleIconSource = ensureVehicleIconSource(vehicleType);

            markers.push({ id: driverId, latitude: lat, longitude: lng, heading, vehicleType, vehicleIconSource });
          });

          markers.sort((a, b) => a.id.localeCompare(b.id));

          const signature = markers
            .map((marker) =>
              `${marker.id}:${marker.latitude.toFixed(5)}:${marker.longitude.toFixed(5)}:${(marker.heading ?? 0).toFixed(2)}:${marker.vehicleType ?? 'na'}`,
            )
            .join('|');

          if (signature !== driverLocationsSignatureRef.current) {
            driverLocationsSignatureRef.current = signature;
            setNearbyDriversMarkers(markers);
          }
        };

        onValue(driverLocationsRef, handleSnapshot, (err) => {
          console.error('❌ [DriverHomeScreenNewDesign] Error escuchando driverLocations:', err);
          setNearbyDriversMarkers([]);
        });

        cleanup = () => off(driverLocationsRef, 'value', handleSnapshot);
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error iniciando listener de driverLocations:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [coords?.latitude, coords?.longitude, isAvailable, user?.id]);

  useEffect(() => {
    if (!coords || !isAvailable) {
      setAvailableRideRequests([]);
      setActiveRide(null);
      return;
    }

    rideStatusCacheRef.current = {};

    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const activeRidesRef = ref(db, 'activeRides');
        const SEARCH_RADIUS_KM = 12;

        const unsubscribe = onValue(activeRidesRef, (snapshot) => {
          const data = snapshot.val();
          if (!data || typeof data !== 'object') {
            setAvailableRideRequests([]);
            setActiveRide(null);
            return;
          }

          const availableRides: any[] = [];
          let myActiveRide: any = null;

          Object.entries<any>(data).forEach(([rideId, ridePayload]) => {
            const originLat = parseCoordinate(
              ridePayload?.originLatitude ?? ridePayload?.origin?.latitude ?? ridePayload?.origin?.lat,
            );
            const originLng = parseCoordinate(
              ridePayload?.originLongitude ?? ridePayload?.origin?.longitude ?? ridePayload?.origin?.lng,
            );

            const statusSignature = [
              ridePayload?.status ?? 'unknown',
              originLat !== null ? originLat.toFixed(6) : 'na',
              originLng !== null ? originLng.toFixed(6) : 'na',
              ridePayload?.driverId ?? 'no-driver',
              ridePayload?.updatedAt ?? ridePayload?.updated_at ?? '',
            ].join('|');

            const isRepeated = rideStatusCacheRef.current[rideId] === statusSignature;
            rideStatusCacheRef.current[rideId] = statusSignature;

            const driverIdMatch = ridePayload?.driverId === user?.id;
            const rideStatus = ridePayload?.status || ridePayload?.driverStatus || ridePayload?.rideStatus;
            if (driverIdMatch && ACTIVE_RIDE_STATUSES.includes(rideStatus)) {
              myActiveRide = { id: rideId, ...ridePayload };
            }

            const isRequested = ridePayload?.status === 'requested' && !ridePayload?.driverId;
            const isNegotiatingWithMe = ridePayload?.driverId === user?.id &&
              (ridePayload?.status === 'pending_confirm' || ridePayload?.status === 'driver_assigned');

            if (!(isRequested || isNegotiatingWithMe)) {
              return;
            }

            if (originLat === null || originLng === null) {
              return;
            }

            const distance = calculateDistance(coords.latitude, coords.longitude, originLat, originLng);
            if (!Number.isFinite(distance) || distance > SEARCH_RADIUS_KM) {
              return;
            }

            availableRides.push({
              id: rideId,
              ...ridePayload,
              distance,
              originLatitude: originLat,
              originLongitude: originLng,
            });
          });

          availableRides.sort((a, b) => a.distance - b.distance);

          const formatted = availableRides
            .map((ride) => {
              const latitude = typeof ride.originLatitude === 'number' ? ride.originLatitude : null;
              const longitude = typeof ride.originLongitude === 'number' ? ride.originLongitude : null;

              if (latitude === null || longitude === null) {
                return null;
              }

              const price = Number.isFinite(ride.clientSuggestedPrice)
                ? Number(ride.clientSuggestedPrice)
                : Number.isFinite(ride.estimatedPrice)
                  ? Number(ride.estimatedPrice)
                  : 0;

              return {
                id: ride.id,
                latitude,
                longitude,
                clientName: ride.client?.name || ride.clientName || 'Cliente',
                originAddress: ride.originAddress || ride.origin?.address || 'Origen',
                finalDestination: ride.destinationAddress || ride.destination?.address || 'Destino',
                priceLabel: formatCurrency(price),
                passengers: ride.passengers ?? 1,
              };
            })
            .filter((item): item is {
              id: string;
              latitude: number;
              longitude: number;
              clientName: string;
              originAddress: string;
              finalDestination: string;
              priceLabel: string;
              passengers: number;
            } => Boolean(item));

          setAvailableRideRequests(formatted);
          setActiveRide(myActiveRide);
        });

        cleanup = () => {
          off(activeRidesRef);
          unsubscribe();
        };
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error escuchando activeRides:', err);
      }
    })();

    return () => {
      cleanup?.();
    };
  }, [coords, isAvailable, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setPendingPayments([]);
      return;
    }

    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const { initializeFirebase } = await import('../../config/firebase');
        const { getDatabase, ref: dbRef, onValue } = await import('firebase/database');
        const { app } = await initializeFirebase();
        if (!app) {
          console.error('❌ [DriverHomeScreenNewDesign] Firebase no inicializado');
          return;
        }

        const db = getDatabase(app);
        const paymentStatusRef = dbRef(db, 'paymentStatus');

        unsubscribe = onValue(paymentStatusRef, (snapshot) => {
          const data = snapshot.val();
          if (!data) {
            setPendingPayments([]);
            return;
          }

          const pending = Object.entries<any>(data)
            .filter(([, payment]) => payment.status === 'pending' && payment.driverId === user.id)
            .map(([rideId, payment]) => ({ rideId, ...payment }));

          setPendingPayments(pending);
        });
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error escuchando pagos pendientes:', err);
      }
    })();

    return () => {
      unsubscribe?.();
    };
  }, [user?.id]);

  const handleAvailabilityToggle = async (nextValue: boolean) => {
    if (!user || !coords) {
      alertService.showErrorAlert('No se pudo actualizar tu estado');
      return;
    }

    if (nextValue === isAvailable) {
      return;
    }

    setUpdatingStatus(true);
    try {
      const status = nextValue ? 'available' : 'offline';
      await driversService.updateStatus(status, coords);
      setIsAvailable(nextValue);

      if (!nextValue && isDesignatedDriverMode && user?.role === 'designated_driver') {
        setIsDesignatedDriverMode(false);
        await driversService.updateDesignatedDriverMode(user.id, false);
      }

      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await driverAvailabilityService.saveAvailabilityState({
        isAvailable: nextValue,
        isDesignatedDriverMode: nextValue ? isDesignatedDriverMode : false,
        lastUpdate: new Date().toISOString(),
        coords: { latitude: coords.latitude, longitude: coords.longitude },
      });

      if (nextValue) {
        driverAvailabilityService.startHeartbeat(coords);
      } else {
        driverAvailabilityService.stopHeartbeat();
        await driverAvailabilityService.clearAvailabilityState();
      }
    } catch (err: any) {
      alertService.showErrorAlert(err?.message || 'Error actualizando estado');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDesignatedToggle = async () => {
    if (user?.role !== 'designated_driver' || !isAvailable || !user?.id) {
      return;
    }

    try {
      const next = !isDesignatedDriverMode;
      setIsDesignatedDriverMode(next);
      await driversService.updateDesignatedDriverMode(user.id, next);
    } catch (err) {
      console.error('❌ Error actualizando modo designado:', err);
    }
  };

  const hasPendingAction = Boolean(pendingAction);

  if (locationLoading) {
    return <LoadingOverlay visible message="Obteniendo tu ubicación..." />;
  }

  if (error || !coords) {
    return (
      <View style={[styles.fallbackContainer, { backgroundColor: colors.background }]}> 
        <Text style={[styles.fallbackText, { color: colors.text }]}>{`❌ ${error || 'No se pudo obtener la ubicación'}`}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={refreshLocation}
        >
          <Text style={styles.retryButtonLabel}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={coords.latitude}
          longitude={coords.longitude}
          markerType="car"
          markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
          nearbyDrivers={nearbyDriversMarkers}
          rideRequests={availableRideRequests}
          markerVehicleType={currentVehicleType ?? undefined}
          markerVehicleIconSource={currentVehicleIconSource}
          onRideRequestPress={(ride: any) =>
            navigation.navigate('AvailableRides', {
              preselectedRideId: ride.id,
            })
          }
        />

        <View style={styles.overlayHeader}>
          <EmergencyButton
            rideId={activeRide?.id}
            style={styles.emergencyFloatingButton}
          />

          <View style={styles.rightHeaderGroup}>
            <View style={styles.headerNameBlock}>
              <Text style={styles.headerTitle}>{user?.name || 'Conductor'}</Text>
            </View>
            <TouchableOpacity
              style={styles.headerProfileButton}
              onPress={() => navigation.navigate('DriverProfile')}
            >
              <Image
                source={require('../../assets/icons/profile/profile-icon2.png')}
                style={styles.profileImage}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {activeRide && !hasPendingAction && (
        <TouchableOpacity
          style={styles.activeRideCard}
          onPress={() =>
            navigation.navigate('ActiveRide', {
              rideId: activeRide.id,
              clientId: activeRide.clientId,
              origin: activeRide.origin,
              destination: activeRide.destination,
              estimatedFare: activeRide.finalFare || activeRide.estimatedPrice,
            })
          }
        >
          <View style={styles.activeRideIconWrapper}>
            <Text style={styles.activeRideEmoji}>🚗</Text>
          </View>
          <View style={styles.activeRideContent}>
            <Text style={styles.activeRideTitle}>Viaje en curso</Text>
            <Text style={styles.activeRideSubtitle} numberOfLines={1}>
              {activeRide?.client?.name || activeRide?.clientName || 'Cliente'} ·{' '}
              {activeRide?.destinationAddress || 'Destino'}
            </Text>
          </View>
          <Text style={styles.activeRideArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingPayments.length > 0 && !hasPendingAction && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() => {
            const firstPayment = pendingPayments[0];
            navigation.navigate('PaymentConfirmation', {
              rideId: firstPayment.rideId,
              amount: firstPayment.finalAmount,
              method: firstPayment.method,
            });
          }}
        >
          <View style={styles.pendingBannerIcon}>
            <Text style={styles.pendingBannerEmoji}>💳</Text>
          </View>
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerTitle}>Pagos pendientes</Text>
            <Text style={styles.pendingBannerSubtitle}>
              {pendingPayments.length} {pendingPayments.length === 1 ? 'pago por confirmar' : 'pagos por confirmar'}
            </Text>
          </View>
          <Text style={styles.pendingBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {pendingAction && (
        <TouchableOpacity
          style={styles.pendingActionButton}
          activeOpacity={0.85}
          onPress={pendingAction.onPress}
        >
          <ImageBackground
            source={require('../../assets/icons/pending_acction/pending_acction2x.png')}
            style={styles.pendingActionImage}
            imageStyle={styles.pendingActionImageInner}
            resizeMode="stretch"
          >
            <View style={styles.pendingActionContent}>
              <View style={styles.pendingActionTextBlock}>
                <Text style={styles.pendingActionTitle}>{pendingAction.title}</Text>
                <Text style={styles.pendingActionSubtitle} numberOfLines={1}>
                  {pendingAction.subtitle}
                </Text>
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>
      )}

      <View style={styles.bottomBar} pointerEvents="box-none">
        {user?.role === 'designated_driver' && (
          <View style={styles.iconButtonWrapper}>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!isAvailable}
              onPress={handleDesignatedToggle}
            >
              <Image
                source={
                  isDesignatedDriverMode
                    ? require('../../assets/icons/status/active_designado.png')
                    : require('../../assets/icons/status/desactive_status_button.png')
                }
                style={[styles.statusImage, !isAvailable && styles.disabledImage]}
              />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.controlsRow} pointerEvents="box-none">
          <View style={styles.iconButtonWrapper}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleAvailabilityToggle(!isAvailable)}
              disabled={updatingStatus}
            >
              <Image
                source={
                  isAvailable
                    ? require('../../assets/icons/status/active_status_button2.png')
                    : require('../../assets/icons/status/desactive_status_button2.png')
                }
                style={styles.statusImage}
              />
            </TouchableOpacity>
          </View>

          {!hasPendingAction && (
            <TouchableOpacity
              style={styles.earningsButton}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('AvailableRides')}
            >
              <ImageBackground
                source={require('../../assets/icons/requests_button/solicitudes_button2.png')}
                style={styles.earningsImage}
                imageStyle={styles.earningsImageInner}
                resizeMode="stretch"
              >
                <View style={styles.earningsRow}>
                  <View style={styles.earningsLeft}>
                    <View style={styles.earningsBadge}>
                      <Text style={styles.earningsBadgeLabel}>Total hoy</Text>
                    </View>
                    <Text style={styles.earningsValue}>{formatCurrency(todayStats.earnings)}</Text>
                  </View>
                  <View style={styles.earningsRight}>
                  </View>
                </View>
              </ImageBackground>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    mapContainer: {
      flex: 1,
    },
    overlayHeader: {
      position: 'absolute',
      top: Platform.select({ ios: 16, android: 24 }),
      left: 20,
      right: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    emergencyFloatingButton: {
      width: 60,
      height: 60,
    },
    rightHeaderGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    headerNameBlock: {
      alignItems: 'flex-end',
    },
    headerGreeting: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.6,
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    headerProfileButton: {
      width: 25.6,
      height: 25.6,
      justifyContent: 'center',
      alignItems: 'center',
    },
    profileImage: {
      width: 28,
      height: 28,
      resizeMode: 'contain',
    },
    fallbackContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    fallbackText: {
      fontSize: 16,
      marginBottom: 16,
      textAlign: 'center',
    },
    retryButton: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 14,
    },
    retryButtonLabel: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
    mapWrapper: {
      // removed: map now full bleed
    },
    activeRideCard: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: 220,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#20263A',
      borderRadius: 18,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 12,
    },
    activeRideIconWrapper: {
      width: 48,
      height: 48,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      marginRight: 12,
    },
    activeRideEmoji: {
      fontSize: 24,
    },
    activeRideContent: {
      flex: 1,
    },
    activeRideTitle: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 16,
    },
    activeRideSubtitle: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 13,
      marginTop: 4,
    },
    activeRideArrow: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      marginLeft: 12,
    },
    pendingBanner: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 160,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FF6B6B',
      borderRadius: 18,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 10,
    },
    pendingBannerIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
      marginRight: 14,
    },
    pendingBannerEmoji: {
      fontSize: 24,
    },
    pendingBannerContent: {
      flex: 1,
    },
    pendingBannerTitle: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 16,
    },
    pendingBannerSubtitle: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 13,
      marginTop: 2,
    },
    pendingBannerArrow: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
      marginLeft: 16,
    },
    pendingActionButton: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 120,
      borderRadius: 20,
      overflow: 'hidden',
      shadowColor: 'rgba(15,23,42,0.38)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.32,
      shadowRadius: 14,
      elevation: 18,
    },
    pendingActionImage: {
      width: '100%',
      minHeight: 68,
      justifyContent: 'center',
    },
    pendingActionImageInner: {
      borderRadius: 20,
    },
    pendingActionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 14,
      gap: 16,
    },
    pendingActionTextBlock: {
      flex: 1,
    },
    pendingActionTitle: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 4,
    },
    pendingActionSubtitle: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: 13,
      fontWeight: '500',
    },
    pendingActionArrow: {
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: '700',
    },
    bottomBar: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: Platform.select({ ios: 24, android: 20 }),
      gap: 12,
      zIndex: 30,
      pointerEvents: 'box-none',
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      pointerEvents: 'box-none',
    },
    iconButtonWrapper: {
      shadowColor: 'rgba(15,23,42,0.4)',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 14,
      borderRadius: 20,
      overflow: 'hidden',
    },
    statusImage: {
      width: 60,
      height: 60,
      resizeMode: 'cover',
    },
    disabledImage: {
      opacity: 0.55,
    },
    earningsButton: {
      flex: 1,
      borderRadius: 18,
      overflow: 'hidden',
      shadowColor: 'rgba(15,23,42,0.38)',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 16,
      minHeight: 40,
    },
    earningsImage: {
      flex: 1,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
    },
    earningsImageInner: {
      borderRadius: 18,
    },
    earningsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: 12,
      paddingRight: 20,
      paddingVertical: 10,
      gap: 16,
    },
    earningsLeft: {
      alignItems: 'flex-start',
      gap: 2,
    },
    earningsBadge: {
      backgroundColor: 'transparent',
      borderRadius: 0,
      paddingHorizontal: 2,
      paddingVertical: 0,
    },
    earningsBadgeLabel: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '400',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    earningsValue: {
      color: '#FFFFFF',
      fontSize: 16.5,
      fontWeight: '500',
    },
    earningsRight: {
      alignItems: 'flex-end',
      gap: 2,
    },
    earningsCta: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    earningsArrow: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '700',
    },
    chipDisabled: {
      opacity: 0.4,
    },
  });

