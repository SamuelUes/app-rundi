/**
 * RideTrackingScreenNewDesign - Diseño mejorado basado en wireframe
 *
 * Características:
 * - Panel inferior retráctil (expandir/comprimir)
 * - Botón de regresar en esquina superior izquierda
 * - Botón de mensaje junto a info del conductor
 * - Botón Status flotante
 * - Mapa grande con ruta morada
 * - UI minimalista y limpia
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Image,
  Share,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// Servicios y componentes
import LoadingIcon from '../../components/ui/LoadingIcon';
import alertService from '../../services/alertService';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import { clearClientActiveRideState } from '../../utils/clientRideState';
import DynamicMap from '../../components/map/DynamicMap';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { useFirebaseItem } from '../../hooks/shared/firebase/useFirebaseData';
import firebaseTrackingService from '../../services/firebaseTrackingService';
import { useTranslation } from 'react-i18next';

// Navegación
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ClientStackParamList } from '../../navigation/ClientStack';

// Utils y hooks compartidos
import { ensureVehicleIconSource, extractVehicleTypeFromInfo } from '../../utils/vehicleIcons';
import {
  type LatLngPoint,
  formatDistanceLabel,
  formatDurationLabel,
  formatEtaLabel,
  deriveVehicleType,
} from '../../utils/rideTrackingHelpers';
import { useRideRoute, useDynamicRoute } from '../../hooks/shared/ride/useRideRoute';
import { useCollapsiblePanel } from '../../hooks/shared/ride/useCollapsiblePanel';
import { useRideCancellation } from '../../hooks/shared/ride/useRideCancellation';
import { RideTrackingDriverInfo } from '../../components/client/RideTracking/RideTrackingDriverInfo';
import { RideTrackingLocations } from '../../components/client/RideTracking/RideTrackingLocations';
import { RideTrackingActionButtons } from '../../components/client/RideTracking/RideTrackingActionButtons';

// Iconos
const BACK_BUTTON = require('../../assets/icons/back_button/back_button2x.png');

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_MIN_HEIGHT = 240;
const PANEL_MAX_HEIGHT = SCREEN_HEIGHT * 0.65;

interface DriverLocation {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

type RideTrackingScreenNewDesignProps = NativeStackScreenProps<ClientStackParamList, 'RideTracking'>;

// Hook para ubicación del conductor
const useDriverLocation = (driverId: string) => {
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!driverId) return;

    let unsubscribe: (() => void) | null = null;

    const subscribeToDriverLocation = async () => {
      try {
        unsubscribe = await firebaseTrackingService.subscribeToDriverLocation(
          driverId,
          (location) => {
            if (location) {
              setDriverLocation({
                latitude: location.latitude,
                longitude: location.longitude,
                speed: location.speed ?? null,
                heading: location.heading ?? null,
                timestamp: new Date().toISOString(),
              });
              setIsConnected(true);
            } else {
              setIsConnected(false);
            }
          }
        );
      } catch (error) {
        console.error('❌ Error al suscribirse:', error);
        setIsConnected(false);
      }
    };

    subscribeToDriverLocation();

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [driverId]);

  return { driverLocation, isConnected };
};

// Hook para estado del viaje
const useRideStatus = (rideId: string) => {
  const { data: rideData, loading: rideLoading } = useFirebaseItem<any>(`activeRides`, rideId);

  const [rideStatus, setRideStatus] = useState('in_progress');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [finalFare, setFinalFare] = useState<number>(0);

  useEffect(() => {
    if (rideData) {
      setRideStatus(rideData.status || 'in_progress');

      if (rideData.payment?.method) {
        setPaymentMethod(rideData.payment.method);
      } else if (rideData.paymentMethod) {
        setPaymentMethod(rideData.paymentMethod);
      }

      setFinalFare(rideData.finalFare || rideData.estimatedPrice || 0);
    }
  }, [rideData]);

  return { rideStatus, paymentMethod, finalFare, rideData, loading: rideLoading };
};

// Hook para datos del conductor y vehículo
const useDriverAndVehicleData = (
  driverId: string,
  initialData: any,
  rideData?: any,
) => {
  const [driverData, setDriverData] = useState({
    name: initialData.driverName || '',
    phone: initialData.driverPhone ?? null,
    photo: null as string | null,
  });

  const [vehicleData, setVehicleData] = useState({
    plate: initialData.vehiclePlate || '',
    brand: initialData.vehicleBrand || '',
    model: initialData.vehicleModel || '',
    color: initialData.vehicleColor || '',
    type: null as string | null,
  });

  const { data: driverDbData } = useFirebaseItem<any>('driversInfo', driverId, { once: false });

  useEffect(() => {
    if (!driverDbData) return;

    setDriverData(prev => ({
      ...prev,
      name: driverDbData.fullName || driverDbData.name || prev.name,
      phone: driverDbData.phone || driverDbData.phoneNumber || prev.phone,
      photo: driverDbData.photoURL || driverDbData.profilePhoto || prev.photo,
    }));

    const dbVehicle = driverDbData.vehicle || driverDbData.vehicleInfo;
    if (dbVehicle) {
      setVehicleData(prev => ({
        ...prev,
        plate: dbVehicle.plate || prev.plate,
        brand: dbVehicle.brand || dbVehicle.make || prev.brand,
        model: dbVehicle.model || prev.model,
        color: dbVehicle.color || prev.color,
        type: dbVehicle.type || prev.type,
      }));
    }
  }, [driverDbData]);

  useEffect(() => {
    if (!rideData) return;

    const rideDriver = rideData.driver || rideData.driverInfo;
    if (rideDriver) {
      setDriverData(prev => ({
        ...prev,
        name: rideDriver.name || prev.name,
        phone: rideDriver.phone || rideDriver.phoneNumber || prev.phone,
        photo: rideDriver.photoURL || rideDriver.profilePhoto || prev.photo,
      }));
    }

    if (
      rideData.vehicle ||
      rideData.vehicleInfo ||
      rideData.driver?.vehicle ||
      rideData.vehiclePlate ||
      rideData.vehicleBrand ||
      rideData.vehicleModel ||
      rideData.vehicleColor ||
      rideData.vehicleType
    ) {
      setVehicleData(prev => {
        const rideVehicle = rideData.vehicle || rideData.vehicleInfo || rideData.driver?.vehicle || {};
        const resolvedType = deriveVehicleType(
          rideVehicle?.type || rideData.vehicleType || prev.type,
          rideData,
        );

        return {
          ...prev,
          plate: rideVehicle?.plate || rideData.vehiclePlate || prev.plate,
          brand: rideVehicle?.brand || rideData.vehicleBrand || prev.brand,
          model: rideVehicle?.model || rideData.vehicleModel || prev.model,
          color: rideVehicle?.color || rideData.vehicleColor || prev.color,
          type: resolvedType,
        };
      });
    }
  }, [rideData]);

  return { driverData, vehicleData };
};

export default function RideTrackingScreenNewDesign({ route, navigation }: RideTrackingScreenNewDesignProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords: clientCoords } = useLocation();
  const { t } = useTranslation();
  const tr = useCallback(
    (path: string, options?: Record<string, any>) => t(`shared.rideTracking.${path}`, options),
    [t],
  );

  const { 
    rideId, 
    driverId, 
    driverName = '',
    vehiclePlate = '',
    vehicleBrand = '',
    vehicleModel = '', 
    vehicleColor = '',
    estimatedFare = 0
  } = route.params;

  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(tr('loading.connectingDriver'));
  
  const { driverLocation, isConnected } = useDriverLocation(driverId);
  const { rideStatus, paymentMethod, finalFare, rideData, loading: rideLoading } = useRideStatus(rideId);
  const { driverData, vehicleData } = useDriverAndVehicleData(driverId, { driverName, vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, rideData });
  const vehicleIconSource = useMemo(() => ensureVehicleIconSource(vehicleData.type), [vehicleData.type]);
  const { destinationCoords, originCoords, waypointCoords, routeCoordinates, routeDistanceMeters, routeDurationSeconds } = useRideRoute(rideData);

  // Panel retráctil (tap para expandir/contraer)
  const { isPanelExpanded, togglePanel } = useCollapsiblePanel({
    initialExpanded: true,
    minHeight: PANEL_MIN_HEIGHT,
    maxHeight: PANEL_MAX_HEIGHT,
  });
  const hasNavigatedToPaymentRef = useRef(false);

  const handleGoBack = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'ClientHome' }],
    });
  }, [navigation]);

  const handleGoToPayment = useCallback(() => {
    if (!rideData) return;

    const paymentMethodFromRide =
      rideData.paymentMethod || rideData.payment?.method || paymentMethod || 'cash';
    const amount =
      rideData.finalFare ||
      rideData.estimatedPrice ||
      finalFare ||
      estimatedFare ||
      0;
    const driverDisplayName = rideData.driver?.name || driverData.name || tr('labels.driverUnknown');
    const driverPhoto = rideData.driver?.photoURL || undefined;
    const plateFromRide =
      rideData.vehicle?.plate ||
      rideData.driver?.vehicle?.plate ||
      vehicleData.plate ||
      tr('labels.vehiclePlateFallback');

    if (paymentMethodFromRide === 'card') {
      navigation.navigate('Payment', {
        rideId,
        amount,
        driverId: rideData.driverId || driverId,
        driverName: driverDisplayName,
        vehiclePlate: plateFromRide,
        driverPhoto,
        isPendingPayment: true,
      });
    } else {
      navigation.navigate('CashPayment', {
        rideId,
        amount,
        driverName: driverDisplayName,
        driverPhoto,
      });
    }
  }, [rideData, paymentMethod, finalFare, estimatedFare, driverData.name, vehicleData.plate, navigation, rideId, driverId]);

  const handleOpenChat = useCallback(() => {
    navigation.navigate('Chat', {
      rideId,
      otherUserName: driverData.name,
      otherUserPhone: driverData.phone || undefined,
    });
  }, [navigation, rideId, driverData.name, driverData.phone]);

  const { isCancellingRide, cancelButtonScale, handleCancelRide } = useRideCancellation({
    rideId,
    cancelReason: tr('alerts.cancelRideReason'),
    canCancel: rideStatus !== 'completed' && rideStatus !== 'canceled',
    cannotCancelTitle: tr('alerts.cannotCancelTitle'),
    cannotCancelMessage: tr('alerts.cannotCancelMessage'),
    confirmTitle: tr('alerts.cancelRideTitle'),
    confirmMessage: tr('alerts.cancelRideMessage'),
    confirmLabel: tr('buttons.confirmCancel'),
    continueLabel: tr('buttons.continue'),
    cancelErrorLabel: tr('alerts.cancelRideError'),
    onSuccess: async () => {
      await clearClientActiveRideState();
      alertService.showSuccessAlert(tr('alerts.cancelRideSuccessTitle'), tr('alerts.cancelRideSuccessMessage'), () => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'ClientHome' }],
        });
      });
    },
  });

  const getStatusColor = () => {
    switch (rideStatus) {
      case 'accepted':
      case 'driver_on_route':
        return '#FF9800';
      case 'in_progress':
        return '#2196F3';
      case 'pending_payment':
        return '#9C27B0';
      case 'completed':
        return '#4CAF50';
      case 'canceled':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const getStatusText = () => {
    switch (rideStatus) {
      case 'accepted':
      case 'driver_on_route':
        return tr('status.accepted');
      case 'in_progress':
        return tr('status.in_progress');
      case 'pending_payment':
        return tr('status.pending_payment');
      case 'completed':
        return tr('status.completed');
      case 'canceled':
        return tr('status.canceled');
      default:
        return tr('status.default');
    }
  };

  const isAccepted = rideStatus === 'accepted' || rideStatus === 'driver_on_route';
  const isInProgress = rideStatus === 'in_progress';

  // Navegar automáticamente a pantalla de pago cuando el viaje queda en pending_payment
  useEffect(() => {
    if (hasNavigatedToPaymentRef.current) return;
    if (rideStatus !== 'pending_payment' || !rideData) return;

    hasNavigatedToPaymentRef.current = true;

    const paymentMethodFromRide =
      rideData.paymentMethod || rideData.payment?.method || paymentMethod || 'cash';
    const amount =
      rideData.finalFare ||
      rideData.estimatedPrice ||
      finalFare ||
      estimatedFare ||
      0;
    const driverDisplayName = rideData.driver?.name || driverData.name || 'Conductor';
    const driverPhoto = rideData.driver?.photoURL || undefined;
    const plateFromRide =
      rideData.vehicle?.plate ||
      rideData.driver?.vehicle?.plate ||
      vehicleData.plate ||
      'N/A';

    if (paymentMethodFromRide === 'card') {
      navigation.replace('Payment', {
        rideId,
        amount,
        driverId: rideData.driverId || driverId,
        driverName: driverDisplayName,
        vehiclePlate: plateFromRide,
        driverPhoto,
        isPendingPayment: true,
      });
    } else {
      navigation.replace('CashPayment', {
        rideId,
        amount,
        driverName: driverDisplayName,
        driverPhoto,
      });
    }
  }, [rideStatus, rideData, paymentMethod, finalFare, estimatedFare, driverData.name, vehicleData.plate, navigation, rideId, driverId]);

  // Rutas dinámicas (conductor→origen antes de recoger, ruta dinámica durante el viaje)
  const { secondaryRouteCoordinates, activeRouteCoordinates } = useDynamicRoute(
    isAccepted,
    isInProgress,
    driverLocation ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude } : null,
    originCoords,
    destinationCoords,
    waypointCoords,
    routeCoordinates,
  );

  // Etiquetas dinámicas para ETA, distancia y duración
  const distanceMeters = useMemo(() => {
    if (routeDistanceMeters && routeDistanceMeters > 0) return routeDistanceMeters;
    if (typeof rideData?.distance === 'number') return rideData.distance;
    if (typeof rideData?.estimatedDistance === 'number') return rideData.estimatedDistance;
    return null;
  }, [routeDistanceMeters, rideData?.distance, rideData?.estimatedDistance]);

  const durationSeconds = useMemo(() => {
    if (routeDurationSeconds && routeDurationSeconds > 0) return routeDurationSeconds;
    if (typeof rideData?.duration === 'number') return rideData.duration;
    if (typeof rideData?.estimatedDuration === 'number') return rideData.estimatedDuration;
    if (typeof rideData?.driverEta?.duration === 'number') return rideData.driverEta.duration;
    if (typeof rideData?.driverEta?.durationSeconds === 'number') return rideData.driverEta.durationSeconds;
    return null;
  }, [routeDurationSeconds, rideData?.duration, rideData?.estimatedDuration, rideData?.driverEta?.duration, rideData?.driverEta?.durationSeconds]);

  const etaLabel = useMemo(() => formatEtaLabel(rideData, durationSeconds, tr), [rideData, durationSeconds, tr]);
  const distanceLabel = useMemo(
    () => formatDistanceLabel(distanceMeters, tr),
    [distanceMeters, tr],
  );
  const durationLabel = useMemo(
    () => formatDurationLabel(durationSeconds, tr),
    [durationSeconds, tr],
  );
  const tripSummaryLabel = useMemo(
    () => tr('labels.tripSummary', { duration: durationLabel, distance: distanceLabel }),
    [durationLabel, distanceLabel, tr],
  );

  const handleShareTrip = useCallback(async () => {
    try {
      const pickupAddress = rideData?.origin?.address || tr('labels.pickupFallback');
      const trackingUrl = `https://rundiapp.com/tracking?rideId=${rideId}`;
      const message = tr('labels.shareMessage', {
        driver: driverData.name || tr('labels.driverUnknown'),
        vehicleBrand: vehicleData.brand,
        vehicleModel: vehicleData.model,
        vehicleColor: vehicleData.color,
        plate: vehicleData.plate || tr('labels.vehiclePlateFallback'),
        pickup: pickupAddress,
        url: trackingUrl,
      });
      await Share.share({ message, title: tr('labels.shareTitle') });
    } catch (error) {
      console.error('Error al compartir ubicación del viaje:', error);
      alertService.showErrorAlert(tr('labels.shareError'));
    }
  }, [driverData, vehicleData, rideData, rideId]);

  return (
    <View style={styles.container}>
      {/* Mapa */}
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={driverLocation?.latitude || clientCoords?.latitude || 12.1364}
          longitude={driverLocation?.longitude || clientCoords?.longitude || -86.2514}
          style={styles.map}
          showMarker={!!driverLocation}
          showUserLocation={false}
          markerPosition={driverLocation ? {
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude
          } : undefined}
          markerType="car"
          markerVehicleType={vehicleData.type || undefined}
          markerVehicleIconSource={vehicleIconSource}
          markerVehicleHeading={
            typeof driverLocation?.heading === 'number' && Number.isFinite(driverLocation.heading)
              ? driverLocation.heading
              : undefined
          }
          destinationMarker={destinationCoords ? destinationCoords : undefined}
          originMarker={isAccepted && originCoords ? originCoords : undefined}
          extraStopMarkers={
            waypointCoords && waypointCoords.length > 0
              ? waypointCoords.map((waypoint: LatLngPoint, index: number) => {
                  const extraDest = rideData?.extraDestinations?.[index];
                  return {
                    latitude: waypoint.latitude,
                    longitude: waypoint.longitude,
                    index: index + 1,
                    color: '#ffa600b2',
                    label: extraDest?.address || tr('labels.stopLabel', { index: index + 1 }),
                  };
                })
              : undefined
          }
          routeCoordinates={activeRouteCoordinates && activeRouteCoordinates.length > 0 ? activeRouteCoordinates : undefined}
          secondaryRouteCoordinates={secondaryRouteCoordinates && secondaryRouteCoordinates.length > 0 ? secondaryRouteCoordinates : undefined}
          secondaryRouteColor="#d3850fc0"
          originLabel={rideData?.origin?.address || tr('labels.routeOriginFallback')}
          destinationLabel={rideData?.destination?.address || tr('labels.routeDestinationFallback')}
          showPinBubbles
        />
      </View>

    {/* Botón de regresar */}
    <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
      <Image source={BACK_BUTTON} style={styles.backButtonImage} />
    </TouchableOpacity>

    {/* Panel inferior retráctil */}
    <Animated.View 
      style={[
        styles.bottomPanel,
        {
          height: isPanelExpanded ? PANEL_MAX_HEIGHT : PANEL_MIN_HEIGHT,
        },
      ]}
    >
      {/* Handle para expandir/contraer */}
      <TouchableOpacity onPress={togglePanel} activeOpacity={0.8} style={styles.handleContainer}>
        <View style={styles.handle} />
      </TouchableOpacity>

      {/* ETA siempre visible */}
      <View style={styles.etaSection}>
        <View style={styles.etaHeader}>
          <Text style={[isPanelExpanded ? styles.etaText : styles.etaTextLarge, { color: colors.text }]}>
            {etaLabel}
          </Text>
          <TouchableOpacity
            style={[styles.statusPill, { backgroundColor: getStatusColor() }]}
            onPress={togglePanel}
          >
            <Text style={styles.statusButtonText}>{getStatusText()}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.tripData, { color: colors.textSecondary }]}>
          {tr('eta.tripData', { summary: tripSummaryLabel })}
        </Text>
      </View>

      {/* Contenido expandido */}
      {isPanelExpanded && (
        <ScrollView 
          style={styles.expandedContent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >

          <RideTrackingDriverInfo
            driverName={driverData.name}
            driverPhoto={driverData.photo}
            vehiclePlate={vehicleData.plate}
            vehicleBrand={vehicleData.brand}
            vehicleModel={vehicleData.model}
            vehicleColor={vehicleData.color}
            colors={colors}
            onOpenChat={handleOpenChat}
            styles={styles}
          />

          <RideTrackingLocations
            originCoords={originCoords}
            destinationCoords={destinationCoords}
            waypointCoords={waypointCoords}
            originAddress={rideData?.origin?.address}
            destinationAddress={rideData?.destination?.address}
            extraDestinations={rideData?.extraDestinations}
            colors={colors}
            tr={tr}
            styles={styles}
          />

          <SupportChatShortcut
            style={{ marginTop: 12 }}
            rideId={rideId}
            initialCategory="service"
            initialTitle={tr('support.initialTitle', { defaultValue: 'Ayuda con mi viaje en curso' })}
            label={tr('support.label', { defaultValue: '¿Necesitas ayuda con este viaje?' })}
            description={tr('support.description', {
              defaultValue: 'Contáctanos por chat para reportar un incidente, retraso o problema con el conductor.',
            })}
          />

        </ScrollView>
      )}

      <RideTrackingActionButtons
        rideStatus={rideStatus}
        isCancellingRide={isCancellingRide}
        cancelButtonScale={cancelButtonScale}
        onGoToPayment={handleGoToPayment}
        onShareTrip={handleShareTrip}
        onCancelRide={handleCancelRide}
        tr={tr}
        styles={styles}
      />
    </Animated.View>
  </View>
);
}
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  
  // Botón de regresar
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 64 : 58,
    left: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.button,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 0,
    elevation: 60,
    zIndex: 10,
  },
  backButtonImage: {
    width: 34,
    height: 34,
    resizeMode: 'contain',
  },
  
  // Botón Status flotante
  statusButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    right: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 10,
  },
  statusButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  
  // Panel inferior retráctil
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PANEL_MAX_HEIGHT,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    overflow: 'hidden',
  },
  
  // Handle para arrastrar
  handleContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: colors.textSecondary || '#999',
    borderRadius: 3,
    opacity: 0.5,
  },
  
  etaTextLarge: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  
  // Contenido expandido
  expandedContent: {
    flex: 1,
    maxHeight: PANEL_MAX_HEIGHT - 160,
  },
  
  // ETA
  etaSection: {
    marginBottom: 16,
  },
  etaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  etaText: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  tripData: {
    fontSize: 13,
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  
  // Conductor
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '40',
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  vehicleInfo: {
    fontSize: 13,
  },
  messageButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border + '60',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageIcon: {
    fontSize: 22,
  },
  
  // Ubicaciones
  locationsContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '40',
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  locationContent: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  
  // Botones de acción
  actionButtons: {
    gap: 12,
    marginTop: 8,
  },
  paymentButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#9C27B0',
  },
  paymentButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  shareButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  
  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
  