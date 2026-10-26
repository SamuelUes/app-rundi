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
  Share,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

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
import ridesService from '../../services/ridesService';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { RideTrackingDesignatedDriverNotice } from '../../components/client/RideTracking/RideTrackingDesignatedDriverNotice';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_MIN_HEIGHT = 252;
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

const TERMINAL_RIDE_STATUSES = ['completed', 'canceled'];

// Hook para estado del viaje
const useRideStatus = (rideId: string) => {
  const [rideStatus, setRideStatus] = useState('in_progress');

  // En estados terminales el backend archiva el viaje y elimina el nodo de
  // activeRides (onPaymentCanceled → cleanupRideFromRealtime). Si seguimos
  // escuchando, el servidor revoca el listener → permission_denied.
  const isTerminal = TERMINAL_RIDE_STATUSES.includes(rideStatus);
  const {
    data: rideData,
    loading: rideLoading,
    error: rideError,
  } = useFirebaseItem<any>(`activeRides`, rideId, { enabled: !isTerminal });
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

  return { rideStatus, paymentMethod, finalFare, rideData, rideError, loading: rideLoading };
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
  const insets = useSafeAreaInsets();
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
    estimatedFare = 0,
    showDesignatedDriverEvidenceNotice = false,
  } = route.params;

  const [showDesignatedEvidenceNotice, setShowDesignatedEvidenceNotice] = useState(
    showDesignatedDriverEvidenceNotice,
  );
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(tr('loading.connectingDriver'));
  
  const { driverLocation, isConnected } = useDriverLocation(driverId);
  const {
    rideStatus,
    paymentMethod,
    finalFare,
    rideData,
    rideError,
    loading: rideLoading,
  } = useRideStatus(rideId);

  useEffect(() => {
    if (!showDesignatedDriverEvidenceNotice) return;
    setShowDesignatedEvidenceNotice(true);
    navigation.setParams({ showDesignatedDriverEvidenceNotice: false });
  }, [navigation, showDesignatedDriverEvidenceNotice]);

  const { driverData, vehicleData } = useDriverAndVehicleData(driverId, { driverName, vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, rideData });
  const vehicleIconSource = useMemo(() => ensureVehicleIconSource(vehicleData.type), [vehicleData.type]);
  const { destinationCoords, originCoords, waypointCoords, routeCoordinates, routeDistanceMeters, routeDurationSeconds } = useRideRoute(rideData);

  // Panel retráctil (tap para expandir/contraer)
  const { isPanelExpanded, panelHeight, togglePanel } = useCollapsiblePanel({
    initialExpanded: true,
    minHeight: PANEL_MIN_HEIGHT,
    maxHeight: PANEL_MAX_HEIGHT,
    useAnimatedHeight: true,
  });
  const hasNavigatedToPaymentRef = useRef(false);
  const handledRideEndRef = useRef(false);

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
      otherUserId: driverId,
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
      handledRideEndRef.current = true;
      await clearClientActiveRideState();
      alertService.showSuccessAlert(tr('alerts.cancelRideSuccessTitle'), tr('alerts.cancelRideSuccessMessage'), () => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'ClientHome' }],
        });
      });
    },
  });

  // Viaje finalizado por el sistema: el conductor canceló o el nodo fue
  // eliminado (permission_denied). Avisar al usuario y sacarlo de la pantalla.
  useEffect(() => {
    if (handledRideEndRef.current || isCancellingRide) return;

    const rideGone =
      !!rideError &&
      ((rideError as any)?.code === 'PERMISSION_DENIED' ||
        String((rideError as any)?.message || '').includes('permission_denied'));
    if (rideStatus !== 'canceled' && !rideGone) return;

    handledRideEndRef.current = true;
    clearClientActiveRideState().catch(() => {});
    alertService.showInfoAlert(
      tr('alerts.rideCanceledTitle'),
      tr(rideStatus === 'canceled' ? 'alerts.rideCanceledByDriver' : 'alerts.rideUnavailable'),
      () => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'ClientHome' }],
        });
      },
    );
  }, [rideStatus, rideError, isCancellingRide, navigation, tr]);

  const getStatusColor = () => {
    switch (rideStatus) {
      case 'accepted':
      case 'driver_on_route':
      case 'driver_arrived':
        return colors.warning;
      case 'in_progress':
        return colors.secondary;
      case 'pending_payment':
        return colors.primary;
      case 'completed':
        return colors.success;
      case 'canceled':
        return colors.error;
      default:
        return colors.textTertiary;
    }
  };

  const getStatusText = () => {
    switch (rideStatus) {
      case 'accepted':
      case 'driver_on_route':
        return tr('status.accepted');
      case 'driver_arrived':
        return tr('status.driver_arrived');
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

  const isAccepted = ['accepted', 'driver_on_route', 'driver_arrived'].includes(rideStatus);
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
      // Código de compartición (expira solo, no expone el rideId real)
      const { code } = await ridesService.createRideShareToken(rideId);
      const trackingUrl = `https://rundiapp.com/tracking?code=${code}`;
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
                    title: t('common.mapPins.extraStop', { index: index + 1 }),
                    label: extraDest?.address || undefined,
                  };
                })
              : undefined
          }
          routeCoordinates={activeRouteCoordinates && activeRouteCoordinates.length > 0 ? activeRouteCoordinates : undefined}
          secondaryRouteCoordinates={secondaryRouteCoordinates && secondaryRouteCoordinates.length > 0 ? secondaryRouteCoordinates : undefined}
          secondaryRouteColor="#d3850fc0"
          originTitle={t('common.mapPins.origin')}
          destinationTitle={t('common.mapPins.destination')}
          originLabel={rideData?.origin?.address || undefined}
          destinationLabel={rideData?.destination?.address || undefined}
          showPinBubbles
        />
      </View>

      <RideTrackingDesignatedDriverNotice
        visible={showDesignatedEvidenceNotice}
        top={Math.max(insets.top + 58, 110)}
        onDismiss={() => setShowDesignatedEvidenceNotice(false)}
      />

    {/* Botón de regresar */}
    <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
      <Ionicons name="chevron-back" size={24} color={colors.text} />
    </TouchableOpacity>

    {/* Panel inferior retráctil */}
    <Animated.View
      style={[
        styles.bottomPanel,
        { height: panelHeight },
      ]}
    >
      {/* Handle para expandir/contraer */}
      <TouchableOpacity
        onPress={togglePanel}
        activeOpacity={0.8}
        style={styles.grabber}
        accessibilityRole="button"
        accessibilityLabel={tr(isPanelExpanded ? 'accessibility.collapsePanel' : 'accessibility.expandPanel')}
      >
        <View style={styles.grabberBar} />
      </TouchableOpacity>

      {/* ETA siempre visible */}
      <View style={styles.etaSection}>
        <View style={styles.etaHeader}>
          <Text
            numberOfLines={1}
            style={[isPanelExpanded ? styles.etaText : styles.etaTextLarge, { color: colors.text }]}
          >
            {etaLabel}
          </Text>
          <TouchableOpacity
            style={[
              styles.statusChip,
              {
                backgroundColor: `${getStatusColor()}1F`,
                borderColor: `${getStatusColor()}40`,
              },
            ]}
            onPress={togglePanel}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={tr(isPanelExpanded ? 'accessibility.collapsePanel' : 'accessibility.expandPanel')}
          >
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text numberOfLines={1} style={[styles.statusChipText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
            <MaterialIcons
              name={isPanelExpanded ? 'expand-less' : 'expand-more'}
              size={16}
              color={getStatusColor()}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.tripMetaRow}>
          <Text numberOfLines={1} style={[styles.tripData, { color: colors.textSecondary }]}>
            {tr('eta.tripData', { summary: tripSummaryLabel })}
          </Text>
          {!!rideData && !!paymentMethod && (
            <View style={styles.paymentChip}>
              <MaterialIcons
                name={paymentMethod === 'card' ? 'credit-card' : 'payments'}
                size={12}
                color={colors.textSecondary}
              />
              <Text numberOfLines={1} style={[styles.paymentChipText, { color: colors.textSecondary }]}>
                {tr(paymentMethod === 'card' ? 'labels.paymentCard' : 'labels.paymentCash')}
              </Text>
            </View>
          )}
        </View>
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
            tr={tr}
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
        paymentMethod={paymentMethod}
        isCancellingRide={isCancellingRide}
        cancelButtonScale={cancelButtonScale}
        colors={colors}
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.button,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  // Panel inferior retráctil
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    overflow: 'hidden',
  },

  // Handle para expandir/contraer
  grabber: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  grabberBar: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },

  // ETA
  etaSection: {
    marginBottom: 12,
  },
  etaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  etaText: {
    fontSize: 20,
    fontWeight: '700',
    flexShrink: 1,
  },
  etaTextLarge: {
    fontSize: 24,
    fontWeight: '700',
    flexShrink: 1,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tripMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tripData: {
    fontSize: 13,
    flexShrink: 1,
  },
  paymentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 1,
  },
  paymentChipText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Contenido expandido
  expandedContent: {
    flex: 1,
  },

  // Conductor
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${colors.primary}33`,
  },
  driverInitial: {
    fontSize: 17,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
    marginRight: 10,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  driverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plateChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  plateChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  vehicleInfo: {
    fontSize: 13,
    flexShrink: 1,
  },
  messageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Ruta (timeline)
  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 44,
  },
  routeIconCol: {
    width: 24,
    alignItems: 'center',
  },
  routeLine: {
    width: 2,
    flex: 1,
    minHeight: 6,
    backgroundColor: colors.border,
  },
  routeLineHidden: {
    backgroundColor: 'transparent',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeTextCol: {
    flex: 1,
    paddingLeft: 14,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    color: colors.text,
  },

  // Botones de acción
  actionButtons: {
    gap: 8,
    marginTop: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.SecondBorder,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelGhost: {
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
  },
  cancelGhostText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
  