import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import GoogleMap from '../../components/GoogleMap';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { fetchClientProfile, ClientProfile } from '../../services/clientProfilesService';
import alertService from '../../services/alertService';
import mapsService from '../../services/mapsService';
import priceNegotiationService from '../../services/priceNegotiationService';
import ridesService from '../../services/ridesService';
import { hasSavedCard } from '../../utils/cardUtils';
import { DriverStackParamList } from '../../navigation/DriverStack';
import { useAcceptedRideListener } from '../../hooks/useAcceptedRideListener';
import { getDatabase, onValue, ref } from 'firebase/database';
import proximityService from '../../services/proximityService';

const BACK_ICON = require('../../assets/icons/back_button/back_button2x.png');

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface RideLocation {
  lat: number;
  lng: number;
  address?: string;
}

interface RidePreviewData {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  origin: RideLocation;
  destination: RideLocation;
  extraDestinations?: RideLocation[];
  estimatedPrice: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  driverOfferStatus?: string | null;
  paymentMethod?: 'cash' | 'card';
  negotiationStatus?: string | null;
  rideType?: string | null;
  clientVehiclePhoto?: string | null;
}

interface RidePreviewParams {
  ride: RidePreviewData;
  nearbyRides?: Array<Partial<RidePreviewData> & { distanceMeters?: number }>;
}

type RidePreviewRouteProp = RouteProp<DriverStackParamList, 'RidePreview'>;
type RidePreviewNavigationProp = NativeStackNavigationProp<DriverStackParamList, 'RidePreview'>;

export default function RidePreviewScreen() {
  const route = useRoute<RidePreviewRouteProp>();
  const navigation = useNavigation<RidePreviewNavigationProp>();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopVoiceCategory } = useVoiceAssistant();

  const { ride } = route.params as RidePreviewParams;
  const initialNearby = (route.params as RidePreviewParams)?.nearbyRides || [];
  const [rideData, setRideData] = useState<RidePreviewData>(ride);
  const [activeRideGuard, setActiveRideGuard] = useState<string | null>(null);
  const [nearbyQueue, setNearbyQueue] = useState<Array<Partial<RidePreviewData> & { distanceMeters?: number }>>(initialNearby);
  const proximityParam = (route.params as any)?.proximity === true;
  const proximityMode = proximityParam || initialNearby.length > 0;
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastVoiceSummaryRef = useRef<string | null>(null);
  const lastClientOfferSpokenRef = useRef<number | null>(null);

  const [acceptingRide, setAcceptingRide] = useState(false);
  const [isRejectingRide, setIsRejectingRide] = useState(false);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(ride.clientVehiclePhoto || null);
  const currentRide = rideData;
  const markDismissed = useCallback(async () => {
    try {
      await proximityService.markRideDismissed(currentRide.id);
      await proximityService.dismissProximityNotification(currentRide.id);
    } catch (err) {
      console.warn('[RidePreviewScreen] No se pudo marcar ride como descartado:', err);
    }
  }, [currentRide.id]);
  const cancellationHandledRef = useRef(false);
  const acceptButtonScale = useRef(new Animated.Value(1)).current;
  const rejectButtonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      stopVoiceCategory('navigation');
      stopVoiceCategory('status');
    };
  }, [stopVoiceCategory]);

  useAcceptedRideListener(navigation, ride.id);

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
      Object.entries<any>(data).some(([id, r]) => {
        const status = String(r?.status || '').toLowerCase();
        if (r?.driverId === user.id && ['accepted', 'driver_on_route', 'in_progress'].includes(status)) {
          found = id;
          return true;
        }
        return false;
      });

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
    const db = getDatabase();
    const rideRef = ref(db, `rides/${ride.id}`);

    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        if (!cancellationHandledRef.current) {
          cancellationHandledRef.current = true;
          alertService.showInfoAlert('Viaje cancelado', 'El cliente canceló la solicitud.');
          markDismissed()
            .catch((error) => console.warn('[RidePreviewScreen] Error al descartar viaje cancelado:', error))
            .finally(() => navigation.goBack());
        }
        return;
      }

      const status = String(data.status || '').toLowerCase();
      if (status === 'assigned' && data.driverId !== user?.id) {
        alertService.showInfoAlert('Viaje asignado a otro conductor', 'El cliente asignó el viaje a otro conductor.');
        markDismissed()
          .catch((error) => console.warn('[RidePreviewScreen] Error al descartar viaje asignado:', error))
          .finally(() => navigation.goBack());
      }
    });

    return () => unsubscribe();
  }, [ride.id, user?.id, navigation]);

  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(true);
  const [counterOffer, setCounterOffer] = useState(
    ride.driverOfferedPrice ? Math.round(ride.driverOfferedPrice).toString() : ''
  );
  const [counterOfferTouched, setCounterOfferTouched] = useState(false);
  const [lastSuggestedPrice, setLastSuggestedPrice] = useState<number | null>(
    typeof ride.driverOfferedPrice === 'number' ? Math.round(ride.driverOfferedPrice) : null,
  );
  const priceContentAnim = useRef(new Animated.Value(1)).current;
  const [priceContentHeight, setPriceContentHeight] = useState(0);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [customOfferVisible, setCustomOfferVisible] = useState(false);
  const customOfferInputRef = useRef<TextInput | null>(null);

  const animatePriceContent = useCallback(
    (expand: boolean, duration: number = 240) => {
      Animated.timing(priceContentAnim, {
        toValue: expand ? 1 : 0,
        duration,
        easing: expand ? Easing.out(Easing.cubic) : Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start();
    },
    [priceContentAnim],
  );

  const resolvedClientName = useMemo(
    () => clientProfile?.fullName || currentRide.clientName || 'Cliente',
    [clientProfile?.fullName, currentRide.clientName]
  );

  const resolvedClientPhone = useMemo(
    () => clientProfile?.phone || currentRide.clientPhone || null,
    [clientProfile?.phone, currentRide.clientPhone]
  );

  const isDesignatedRide = useMemo(
    () => (currentRide.rideType || '').toLowerCase() === 'designated_driver',
    [currentRide.rideType]
  );

  const totalDistanceKm = useMemo(() => {
    const d = currentRide.estimatedDistance;
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
      return d > 50 ? d / 1000 : d;
    }
    const points: Array<{ lat: number; lng: number }> = [];
    if (currentRide.origin) points.push({ lat: currentRide.origin.lat, lng: currentRide.origin.lng });
    if (Array.isArray(currentRide.extraDestinations)) {
      currentRide.extraDestinations.forEach((s) => points.push({ lat: s.lat, lng: s.lng }));
    }
    if (currentRide.destination) points.push({ lat: currentRide.destination.lat, lng: currentRide.destination.lng });
    if (points.length < 2) return null;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    let sum = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dLat = toRad(b.lat - a.lat);
      const dLon = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      sum += R * c;
    }
    return sum;
  }, [currentRide.estimatedDistance, currentRide.origin, currentRide.destination, currentRide.extraDestinations]);

  useEffect(() => {
    if (!voiceSettings.enabled) {
      lastVoiceSummaryRef.current = null;
      lastClientOfferSpokenRef.current = null;
      return;
    }

    const netPrice = Math.round(
      typeof currentRide.clientSuggestedPrice === 'number' && Number.isFinite(currentRide.clientSuggestedPrice)
        ? currentRide.clientSuggestedPrice
        : currentRide.estimatedPrice || 0,
    );
    const distanceFix = typeof totalDistanceKm === 'number' && Number.isFinite(totalDistanceKm)
      ? totalDistanceKm.toFixed(1)
      : null;

    const signature = [currentRide.id, netPrice, distanceFix || 'na'].join('|');
    if (lastVoiceSummaryRef.current === signature) return;
    lastVoiceSummaryRef.current = signature;

    const parts: string[] = [];
    parts.push(`Precio neto ${netPrice} Cordobas`);
    if (distanceFix) parts.push(`Distancia total ${distanceFix} kilómetros`);
    speakVoice(`${parts.join('. ')}.`, 'navigation', undefined, true);
  }, [voiceSettings.enabled, currentRide.id, currentRide.clientSuggestedPrice, currentRide.estimatedPrice, totalDistanceKm, speakVoice]);

  useEffect(() => {
    if (!voiceSettings.enabled) {
      return;
    }

    const status = (currentRide.negotiationStatus || '').toLowerCase();
    if (status !== 'client_suggested') {
      lastClientOfferSpokenRef.current = null;
      return;
    }

    const value = typeof currentRide.clientSuggestedPrice === 'number' ? currentRide.clientSuggestedPrice : null;
    if (value === null || !Number.isFinite(value) || value <= 0) {
      return;
    }

    const rounded = Math.round(value);
    if (lastClientOfferSpokenRef.current === rounded) {
      return;
    }

    lastClientOfferSpokenRef.current = rounded;
    speakVoice(`Oferta del cliente ${rounded} Cordobas.`, 'status', undefined, true);
  }, [voiceSettings.enabled, currentRide.negotiationStatus, currentRide.clientSuggestedPrice, speakVoice]);

  const toggleSheet = () => {
    const next = !isSheetExpanded;
    setIsSheetExpanded(next);
    animatePriceContent(next);
  };

  const switchToNearby = useCallback(() => {
    if (!nearbyQueue || nearbyQueue.length === 0) return;
    const [next, ...rest] = nearbyQueue;
    const nextRide: RidePreviewData = {
      id: String(next.id || currentRide.id),
      clientId: String(next.clientId || currentRide.clientId),
      clientName: next.clientName || currentRide.clientName,
      clientPhone: next.clientPhone || currentRide.clientPhone,
      origin: (next.origin as any) || currentRide.origin,
      destination: (next.destination as any) || currentRide.destination,
      extraDestinations: (next.extraDestinations as any) || currentRide.extraDestinations,
      estimatedPrice: typeof next.estimatedPrice === 'number' ? next.estimatedPrice : currentRide.estimatedPrice,
      estimatedDistance: typeof next.estimatedDistance === 'number' ? next.estimatedDistance : currentRide.estimatedDistance,
      estimatedDuration: typeof next.estimatedDuration === 'number' ? next.estimatedDuration : currentRide.estimatedDuration,
      clientSuggestedPrice: typeof next.clientSuggestedPrice === 'number' ? next.clientSuggestedPrice : currentRide.clientSuggestedPrice,
      driverOfferedPrice: typeof next.driverOfferedPrice === 'number' ? next.driverOfferedPrice : currentRide.driverOfferedPrice,
      driverOfferStatus: currentRide.driverOfferStatus || null,
      paymentMethod: (next.paymentMethod as any) || currentRide.paymentMethod,
      negotiationStatus: (next as any).negotiationStatus || currentRide.negotiationStatus || null,
    };
    setRideData(nextRide);
    setNearbyQueue(rest);
  }, [nearbyQueue, currentRide]);

  const handleMeasuredContentLayout = useCallback(
    (event: any) => {
      const { height } = event.nativeEvent.layout;
      if (height !== priceContentHeight) {
        setPriceContentHeight(height);
        if (height > 0 && isSheetExpanded) {
          animatePriceContent(true, 260);
        }
      }
    },
    [priceContentHeight, isSheetExpanded, animatePriceContent],
  );

  const ensureCardForCardPayments = async (): Promise<boolean> => {
    const method = currentRide.paymentMethod;
    if ((method || '').toLowerCase() !== 'card') {
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

  useEffect(() => {
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${ride.id}`);

    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        if (!cancellationHandledRef.current) {
          cancellationHandledRef.current = true;
          alertService.showInfoAlert('Viaje cancelado', 'El cliente canceló la solicitud.');
          markDismissed()
            .catch((error) => console.warn('[RidePreviewScreen] Error al descartar viaje cancelado:', error))
            .finally(() => navigation.goBack());
        }
        return;
      }

      const normalizedStatus = String(data.status || '').toLowerCase();
      if (normalizedStatus === 'canceled' && !cancellationHandledRef.current) {
        cancellationHandledRef.current = true;
        const reason = data.cancelReason || 'El cliente canceló la solicitud.';
        alertService.showInfoAlert('Viaje cancelado', reason);
        markDismissed()
          .catch((error) => console.warn('[RidePreviewScreen] Error al descartar viaje cancelado:', error))
          .finally(() => navigation.goBack());
        return;
      }

      const assignedDriverId = data.driverId;
      if (
        assignedDriverId &&
        user?.id &&
        assignedDriverId !== user.id &&
        !cancellationHandledRef.current
      ) {
        const nonRequestedStatuses = [
          'pending_confirm',
          'driver_assigned',
          'accepted',
          'driver_on_route',
          'driver_arrived',
          'in_progress',
          'completed',
        ];

        if (nonRequestedStatuses.includes(normalizedStatus)) {
          cancellationHandledRef.current = true;
          alertService.showInfoAlert(
            'Viaje no disponible',
            'El cliente ya confirmó a otro conductor para este viaje.',
          );
          markDismissed()
            .catch((error) =>
              console.warn('[RidePreviewScreen] Error al descartar viaje no disponible:', error),
            )
            .finally(() => navigation.goBack());
          return;
        }
      }

      const offers = data.offers || {};
      const myOffer = user?.id ? offers[user.id] : null;
      const updatedDriverOfferedPrice =
        myOffer?.offeredPrice ?? data.driverOfferedPrice ?? rideData.driverOfferedPrice ?? null;
      const updatedDriverOfferStatus = myOffer?.status ?? rideData.driverOfferStatus ?? null;

      setRideData((prev) => ({
        ...prev,
        clientId: data.clientId || prev.clientId,
        origin: data.origin || prev.origin,
        destination: data.destination || prev.destination,
        extraDestinations: data.extraDestinations || prev.extraDestinations,
        estimatedPrice:
          typeof data.estimatedPrice === 'number' ? data.estimatedPrice : prev.estimatedPrice,
        estimatedDistance:
          typeof data.estimatedDistance === 'number' ? data.estimatedDistance : prev.estimatedDistance,
        estimatedDuration:
          typeof data.estimatedDuration === 'number' ? data.estimatedDuration : prev.estimatedDuration,
        clientSuggestedPrice:
          typeof data.clientSuggestedPrice === 'number'
            ? data.clientSuggestedPrice
            : prev.clientSuggestedPrice,
        driverOfferedPrice: updatedDriverOfferedPrice,
        driverOfferStatus: updatedDriverOfferStatus,
        negotiationStatus: data.negotiationStatus || prev.negotiationStatus || null,
        paymentMethod: data.paymentMethod || prev.paymentMethod,
        clientName: data.clientName || prev.clientName,
        clientPhone: data.clientPhone || prev.clientPhone,
        clientVehiclePhoto: data.clientVehiclePhoto ?? prev.clientVehiclePhoto ?? null,
        rideType: data.rideType || prev.rideType || null,
      }));

      if (!counterOfferTouched && typeof updatedDriverOfferedPrice === 'number') {
        setCounterOffer(Math.round(updatedDriverOfferedPrice).toString());
      }
    });

    return () => unsubscribe();
  }, [ride.id, user?.id, counterOfferTouched, rideData.driverOfferedPrice, rideData.driverOfferStatus]);

  useEffect(() => {
    if (typeof rideData.driverOfferedPrice === 'number' && !Number.isNaN(rideData.driverOfferedPrice)) {
      setLastSuggestedPrice(Math.round(rideData.driverOfferedPrice));
    } else {
      setLastSuggestedPrice(null);
    }
  }, [rideData.driverOfferedPrice]);

  useEffect(() => {
    const loadRoute = async () => {
      setLoadingRoute(true);
      try {
        const segments: Array<{ latitude: number; longitude: number }> = [];
        let currentPoint = {
          latitude: currentRide.origin.lat,
          longitude: currentRide.origin.lng,
        };

        const targets: RideLocation[] = [];
        if (currentRide.extraDestinations && currentRide.extraDestinations.length > 0) {
          targets.push(...currentRide.extraDestinations);
        }
        targets.push(currentRide.destination);

        for (const target of targets) {
          const segment = await mapsService.getDirections(currentPoint, {
            latitude: target.lat,
            longitude: target.lng,
          });

          if (segment?.polyline?.length) {
            segments.push(...segment.polyline);
          } else {
            segments.push(currentPoint, { latitude: target.lat, longitude: target.lng });
          }

          currentPoint = { latitude: target.lat, longitude: target.lng };
        }

        setRouteCoordinates(segments);
      } catch (error) {
        console.error('[RidePreviewScreen] Error calculando ruta:', error);
        alertService.showInfoAlert(
          'Ruta incompleta',
          'No pudimos calcular la ruta completa. Mostraremos un recorrido aproximado.'
        );
        setRouteCoordinates([
          { latitude: currentRide.destination.lat, longitude: currentRide.destination.lng },
        ]);
      } finally {
        setLoadingRoute(false);
      }
    };

    loadRoute();
  }, [currentRide.destination, currentRide.extraDestinations, currentRide.origin]);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const profile = await fetchClientProfile(currentRide.clientId);
        if (active) {
          setClientProfile(profile);
        }
      } catch (error) {
        console.warn('[RidePreviewScreen] Error cargando perfil cliente:', error);
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [currentRide.clientId]);

  const quickSuggestions = useMemo(() => {
    const base = currentRide.estimatedPrice || 0;
    if (!base) {
      return [];
    }
    const low = Math.max(50, Math.round(base * 0.9));
    const mid = Math.round(base);
    const high = Math.round(base * 1.1);
    return Array.from(new Set([low, mid, high]));
  }, [currentRide.estimatedPrice]);

  const formatCurrency = (value?: number | null) => {
    if (value === undefined || value === null) {
      return 'N/D';
    }
    return `C$${Math.round(value)}`;
  };

  const handleCallClient = () => {
    if (!resolvedClientPhone) {
      alertService.showInfoAlert('Información', 'Número de teléfono del cliente no disponible');
      return;
    }

    const url = `tel:${resolvedClientPhone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (!supported) {
        alertService.showErrorAlert('No se pudo iniciar la llamada');
        return;
      }
      Linking.openURL(url).catch(() =>
        alertService.showErrorAlert('No se pudo iniciar la llamada')
      );
    });
  };

  const handleMessageClient = () => {
    navigation.navigate('Chat', {
      rideId: ride.id,
      otherUserName: resolvedClientName,
    });
  };

  const handleApplySuggestion = async (value: number) => {
    const rounded = Math.round(value);
    setCounterOfferTouched(true);
    setCounterOffer(rounded.toString());
    await submitCounterOffer(rounded);
  };

  const submitCounterOffer = async (value: number): Promise<boolean> => {
    if (!user?.id) {
      alertService.showErrorAlert('No se pudo obtener tu información.');
      return false;
    }

    let success = false;
    try {
      setSendingOffer(true);
      await priceNegotiationService.negotiatePrice(
        currentRide.id,
        value,
        'driver',
        currentRide.estimatedPrice,
        user.id,
      );
      setCounterOffer(value.toString());
      setLastSuggestedPrice(value);
      success = true;
    } catch (error: any) {
      console.error('[RidePreviewScreen] Contraoferta fallida:', error);
      alertService.showErrorAlert(error?.message || 'No se pudo enviar la contraoferta');
    } finally {
      setSendingOffer(false);
    }
    return success;
  };

  const handleCustomOfferPress = useCallback(() => {
    setCustomOfferVisible((prev) => {
      const next = !prev;
      if (next) {
        setCounterOfferTouched(true);
        if (!counterOffer) {
          const baseSource =
            typeof currentRide.clientSuggestedPrice === 'number' && currentRide.clientSuggestedPrice > 0
              ? Math.round(currentRide.clientSuggestedPrice)
              : Math.round(currentRide.estimatedPrice || 0);
          if (baseSource > 0) {
            setCounterOffer(baseSource.toString());
          }
        }
        setTimeout(() => customOfferInputRef.current?.focus(), 80);
      } else {
        customOfferInputRef.current?.blur();
      }
      return next;
    });
  }, [counterOffer, currentRide.clientSuggestedPrice, currentRide.estimatedPrice]);

  const handleCustomOfferChange = useCallback((text: string) => {
    const sanitized = text.replace(/[^0-9]/g, '');
    setCounterOfferTouched(true);
    setCounterOffer(sanitized);
  }, []);

  const handleSendCustomOffer = useCallback(async () => {
    if (sendingOffer) {
      return;
    }

    const numericValue = Number(counterOffer.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      alertService.showInfoAlert('Precio inválido', 'Ingresa un monto válido mayor a cero.');
      return;
    }

    const roundedValue = Math.round(numericValue);
    setCounterOffer(roundedValue.toString());
    const wasSuccessful = await submitCounterOffer(roundedValue);
    if (wasSuccessful) {
      setCustomOfferVisible(false);
      customOfferInputRef.current?.blur();
    }
  }, [counterOffer, sendingOffer, submitCounterOffer]);

  const handleAcceptRide = async () => {
    if (acceptingRide) {
      return;
    }

    if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
    try {
      if (activeRideGuard) {
        alertService.showInfoAlert(
          'Tienes un viaje activo',
          'Debes completar tu viaje actual antes de aceptar uno nuevo.',
          () => navigation.replace('ActiveRide', { rideId: activeRideGuard })
        );
        return;
      }

      if (!(await ensureCardForCardPayments())) {
        return;
      }

      setAcceptingRide(true);
      Animated.timing(acceptButtonScale, {
        toValue: 0.95,
        duration: 130,
        useNativeDriver: true,
      }).start();

      const hasClientSuggested =
        typeof currentRide.clientSuggestedPrice === 'number' &&
        Number.isFinite(currentRide.clientSuggestedPrice) &&
        currentRide.clientSuggestedPrice > 0;
      const hasEstimatedPrice =
        typeof currentRide.estimatedPrice === 'number' &&
        Number.isFinite(currentRide.estimatedPrice) &&
        currentRide.estimatedPrice > 0;

      if (hasClientSuggested || hasEstimatedPrice) {
        const priceToShow = hasClientSuggested
          ? currentRide.clientSuggestedPrice
          : currentRide.estimatedPrice;

        await priceNegotiationService.acceptClientPrice(currentRide.id);
        alertService.showSuccessAlert(
          'Oferta enviada',
          `Aceptaste el viaje por ${formatCurrency(priceToShow || 0)}. Esperando confirmación del cliente...`
        );
      } else {
        const acceptData = {
          driverId: user?.id || '',
          vehicleId: 'temp-vehicle-id',
          currentLocation: { lat: 0, lng: 0 },
        };
        await ridesService.acceptRide(currentRide.id, acceptData);
        alertService.showSuccessAlert(
          'Oferta enviada',
          'Hemos notificado al cliente. Esperando confirmación...'
        );
      }

      navigation.replace('WaitingClientConfirmation', {
        rideId: currentRide.id,
        clientId: currentRide.clientId,
        origin: {
          lat: currentRide.origin.lat,
          lng: currentRide.origin.lng,
          address: currentRide.origin.address || 'Origen',
        },
        destination: {
          lat: currentRide.destination.lat,
          lng: currentRide.destination.lng,
          address: currentRide.destination.address || 'Destino',
        },
        estimatedFare: currentRide.clientSuggestedPrice || currentRide.estimatedPrice,
        extraDestinations: (currentRide.extraDestinations || []).map((stop) => ({
          lat: stop.lat,
          lng: stop.lng,
          address: stop.address,
        })),
      });
    } catch (error: any) {
      console.error('[RidePreviewScreen] Error al aceptar viaje:', error);
      alertService.showErrorAlert(error?.message || 'No se pudo aceptar el viaje');
    } finally {
      Animated.timing(acceptButtonScale, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }).start();
      setAcceptingRide(false);
    }
  };

  const handleRejectRide = () => {
    if (isRejectingRide) {
      return;
    }

    if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
    setIsRejectingRide(true);
    Animated.timing(rejectButtonScale, {
      toValue: 0.95,
      duration: 130,
      useNativeDriver: true,
    }).start();

    const finishReject = () => {
      Animated.timing(rejectButtonScale, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }).start();
      setIsRejectingRide(false);
    };

    markDismissed()
      .catch((error) => {
        console.warn('[RidePreviewScreen] No se pudo descartar ride:', error);
      })
      .finally(() => {
        finishReject();
        navigation.goBack();
      });
  };

  const finalPricePreview = useMemo(() => {
    if (counterOffer) {
      const parsed = parseFloat(counterOffer);
      if (!Number.isNaN(parsed)) {
        return formatCurrency(parsed);
      }
    }
    const candidates: number[] = [];

    if (
      typeof currentRide.driverOfferedPrice === 'number' &&
      Number.isFinite(currentRide.driverOfferedPrice) &&
      currentRide.driverOfferedPrice > 0
    ) {
      candidates.push(currentRide.driverOfferedPrice);
    }

    if (
      typeof currentRide.clientSuggestedPrice === 'number' &&
      Number.isFinite(currentRide.clientSuggestedPrice) &&
      currentRide.clientSuggestedPrice > 0
    ) {
      candidates.push(currentRide.clientSuggestedPrice);
    }

    if (
      typeof currentRide.estimatedPrice === 'number' &&
      Number.isFinite(currentRide.estimatedPrice) &&
      currentRide.estimatedPrice > 0
    ) {
      candidates.push(currentRide.estimatedPrice);
    }

    const value = candidates.find((v) => v > 0) ?? currentRide.estimatedPrice;
    return formatCurrency(value || 0);
  }, [
    counterOffer,
    currentRide.driverOfferedPrice,
    currentRide.clientSuggestedPrice,
    currentRide.estimatedPrice,
  ]);

  const renderNegotiationBanner = () => {
    const status = currentRide.negotiationStatus || '';
    const statusLabels: Record<string, string> = {
      client_suggested: 'Esperando tu respuesta',
      driver_offered: 'Esperando respuesta del cliente',
      driver_accepted: 'Aceptaste el precio del cliente',
      client_accepted: 'El cliente aceptó tu oferta',
    };

    const driverSuggested =
      typeof currentRide.driverOfferedPrice === 'number' && !Number.isNaN(currentRide.driverOfferedPrice);
    const clientSuggested =
      typeof currentRide.clientSuggestedPrice === 'number' && !Number.isNaN(currentRide.clientSuggestedPrice);

    if (status === 'driver_offered' && driverSuggested) {
      return (
        <View
          style={[
            styles.clientOfferBanner,
            {
              backgroundColor: isDark ? 'rgba(33, 150, 243, 0.18)' : 'rgba(33, 150, 243, 0.12)',
              borderColor: isDark ? 'rgba(144, 202, 249, 0.6)' : 'rgba(33, 150, 243, 0.35)',
            },
          ]}
        >
          <Text style={[styles.clientOfferTitle, { color: isDark ? '#90CAF9' : '#1565C0' }]}>
            Acabas de proponer {formatCurrency(currentRide.driverOfferedPrice)}
          </Text>
          <Text style={[styles.clientOfferSubtitle, { color: colors.textSecondary }]}>
            {statusLabels[status] || 'Esperando respuesta del cliente'}
          </Text>
        </View>
      );
    }

    if (clientSuggested) {
      return (
        <View
          style={[
            styles.clientOfferBanner,
            {
              backgroundColor: isDark ? 'rgba(76, 175, 80, 0.18)' : 'rgba(76, 175, 80, 0.12)',
              borderColor: isDark ? 'rgba(129, 199, 132, 0.6)' : 'rgba(76, 175, 80, 0.35)',
            },
          ]}
        >
          <Text style={[styles.clientOfferTitle, { color: isDark ? '#A5D6A7' : '#2E7D32' }]}>
            El cliente propuso {formatCurrency(currentRide.clientSuggestedPrice)}
          </Text>
          <Text style={[styles.clientOfferSubtitle, { color: colors.textSecondary }]}>
            {statusLabels[status] || 'Esperando tu respuesta'}
          </Text>
        </View>
      );
    }

    return null;
  };

  const renderNearbyCard = () => {
    if (!nearbyQueue || nearbyQueue.length === 0) return null;
    const next = nearbyQueue[0] as any;
    const labelDistance = typeof next?.distanceMeters === 'number'
      ? `${Math.max(1, Math.round(next.distanceMeters))} m`
      : (typeof next?.estimatedDistance === 'number' ? `${Math.round((next.estimatedDistance || 0) / 100) / 10} km` : 'Cerca');
    const priceText = typeof next?.estimatedPrice === 'number' ? `C$${Math.round(next.estimatedPrice)}` : '';

    return (
      <View
        style={[
          styles.nearbyCard,
          {
            backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.95)',
            borderColor: colors.border,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.nearbyTitle, { color: colors.text }]}>Solicitud cercana</Text>
          <Text style={[styles.nearbySubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {labelDistance} • {priceText} • {next?.origin?.address || 'Origen cercano'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.nearbyButton, { backgroundColor: colors.primary }]} onPress={switchToNearby}>
          <Text style={styles.nearbyButtonText}>Ver</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNegotiationContent = () => {
    const customOfferButtonLabel = lastSuggestedPrice
      ? formatCurrency(lastSuggestedPrice)
      : 'Ofrece';

    return (
      <View style={styles.negotiationWrapper}>
        {renderNegotiationBanner()}

        <View
          style={[
            styles.priceCard,
            {
              backgroundColor: isDark ? 'rgba(33,33,33,0.9)' : '#FFF6E6',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E3C592',
            },
          ]}
        >
          <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Precio estimado / sugerido por cliente</Text>
          <Text style={[styles.priceValue, { color: colors.text }]}>
            {formatCurrency(currentRide.clientSuggestedPrice || currentRide.estimatedPrice)}
          </Text>

                  <TouchableOpacity
                    style={[
                      styles.suggestButton,
                      styles.inlineSuggestButton,
                      { backgroundColor: colors.primary, opacity: sendingOffer ? 0.7 : 1 },
                    ]}
                    onPress={handleCustomOfferPress}
                    disabled={sendingOffer}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.suggestButtonText}>{customOfferButtonLabel}</Text>
                  </TouchableOpacity>

          <View style={styles.suggestionsSection}>
            {quickSuggestions.length > 0 && (
              <>
                <Text style={[styles.suggestionsLabel, { color: colors.textSecondary }]}>Precios sugeridos:</Text>
                <View style={styles.suggestionsRow}>
                  <View style={styles.chipsRow}>
                    {quickSuggestions.map((value) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.chip, { backgroundColor: isDark ? 'rgba(125,230,173,0.18)' : 'rgba(125,230,173,0.25)' }]}
                        onPress={() => handleApplySuggestion(value)}
                      >
                        <Text style={[styles.chipLabel, { color: isDark ? '#7DE6AD' : '#268C5C' }]}>
                          {formatCurrency(value)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
            {isDesignatedRide && currentRide.clientVehiclePhoto ? (
              <TouchableOpacity
                style={[styles.iconButton, styles.vehiclePhotoButton, { backgroundColor: 'rgba(115,230,173,0.25)' }]}
                onPress={() => setPhotoModalUrl(currentRide.clientVehiclePhoto || null)}
              >
                <Text style={[styles.iconText, { color: '#FFFFFF' }]}>🚗</Text>
              </TouchableOpacity>
            ) : null}
                </View>
              </>
            )}

            {quickSuggestions.length === 0 && (
              <TouchableOpacity
                style={[styles.suggestButton, { backgroundColor: colors.primary, opacity: sendingOffer ? 0.7 : 1 }]}
                onPress={handleCustomOfferPress}
                disabled={sendingOffer}
                activeOpacity={0.9}
              >
                <Text style={styles.suggestButtonText}>{customOfferButtonLabel}</Text>
              </TouchableOpacity>
            )}

            {customOfferVisible && (
              <View
                style={[
                  styles.customOfferCard,
                  {
                    backgroundColor: isDark ? 'rgba(23,30,38,0.92)' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(21, 37, 58, 0.12)',
                  },
                ]}
              >
                <Text style={[styles.customOfferLabel, { color: colors.textSecondary }]}>Ingresa tu oferta personalizada</Text>
                <TextInput
                  ref={customOfferInputRef}
                  style={[
                    styles.offerInput,
                    {
                      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F7F7F7',
                      color: colors.text,
                    },
                  ]}
                  value={counterOffer}
                  onChangeText={handleCustomOfferChange}
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="Ej. 95"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'}
                  returnKeyType="done"
                  onSubmitEditing={handleSendCustomOffer}
                  editable={!sendingOffer}
                />
                <TouchableOpacity
                  style={[styles.customOfferSendButton, { backgroundColor: colors.primary, opacity: sendingOffer ? 0.7 : 1 }]}
                  onPress={handleSendCustomOffer}
                  activeOpacity={0.9}
                  disabled={sendingOffer}
                >
                  {sendingOffer ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.customOfferSendButtonText}>Enviar</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View
            style={[
              styles.finalRow,
              {
                borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5D5B8',
              },
            ]}
          >
            <Text style={[styles.finalLabel, { color: colors.textSecondary }]}>Precio final estimado</Text>
            <Text style={[styles.finalValue, { color: colors.text }]}>{finalPricePreview}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.mapContainer}>
        <GoogleMap
          latitude={currentRide.origin.lat}
          longitude={currentRide.origin.lng}
          originMarker={{ latitude: currentRide.origin.lat, longitude: currentRide.origin.lng }}
          destinationMarker={{ latitude: currentRide.destination.lat, longitude: currentRide.destination.lng }}
          extraStopMarkers={(currentRide.extraDestinations || []).map((stop, index) => ({
            latitude: stop.lat,
            longitude: stop.lng,
            index: index + 1,
          }))}
          routeCoordinates={routeCoordinates}
          showMarker={false}
        />

        {loadingRoute && (
          <View style={styles.routeLoader}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>Calculando ruta...</Text>
          </View>
        )}
        <View style={styles.nearbyWrapper} pointerEvents="box-none">
          {renderNearbyCard()}
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.fabBackButton,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.92)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.08)',
          },
        ]}
        onPress={() => {
          markDismissed().finally(() => navigation.goBack());
        }}
        activeOpacity={0.9}
      >
        <Image
          source={BACK_ICON}
          style={[styles.backIconImage, { tintColor: isDark ? '#FFFFFF' : '#1F1F1F' }]}
          resizeMode="contain"
        />
      </TouchableOpacity>

      <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
        <TouchableOpacity style={styles.handleArea} onPress={toggleSheet} activeOpacity={0.8}>
          <View style={styles.handleBar} />
        </TouchableOpacity>

        <View style={styles.measurementContainer} onLayout={handleMeasuredContentLayout}>
          {renderNegotiationContent()}
        </View>

        <View style={styles.clientRow}>
          <View
            style={[
              styles.avatarPlaceholder,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#ECECEC',
              },
            ]}
          >
            {clientProfile?.photoUrl ? (
              <Image
                source={{ uri: clientProfile.photoUrl }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarInitials}>
                {resolvedClientName
                  .split(' ')
                  .map((part) => part.charAt(0).toUpperCase())
                  .slice(0, 2)
                  .join('')}
              </Text>
            )}
          </View>
          <View style={styles.clientInfo}>
            <Text style={[styles.clientNameText, { color: colors.text }]} numberOfLines={1}>
              {resolvedClientName}
            </Text>
            <Text style={[styles.clientMetaText, { color: colors.textSecondary }]}
            >
              Precio estimado: {formatCurrency(currentRide.estimatedPrice)}
            </Text>
          </View>
          <View style={styles.contactActions}>
            <TouchableOpacity
              style={[
                styles.iconButton,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#F2F2F2',
                },
              ]}
              onPress={handleMessageClient}
            >
              <Text style={styles.iconText}>💬</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.iconButton,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#F2F2F2',
                },
              ]}
              onPress={handleCallClient}
            >
              <Text style={styles.iconText}>📞</Text>
            </TouchableOpacity>

          </View>
        </View>

        <Animated.View
          style={[
            styles.collapsibleContainer,
            {
              height: priceContentAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, priceContentHeight || 1],
              }),
              opacity: priceContentAnim,
            },
          ]}
        >
          <View pointerEvents={isSheetExpanded ? 'auto' : 'none'}>
            {renderNegotiationContent()}
          </View>
        </Animated.View>

        <View style={styles.actionsRow}>
          <AnimatedTouchableOpacity
            style={[
              styles.acceptButton,
              {
                backgroundColor: colors.warning,
                transform: [{ scale: acceptButtonScale }],
                opacity: acceptingRide ? 0.7 : 1,
              },
            ]}
            onPress={handleAcceptRide}
            activeOpacity={0.85}
            disabled={acceptingRide}
          >
            {acceptingRide ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.actionButtonText}>Aceptar</Text>
            )}
          </AnimatedTouchableOpacity>

          <AnimatedTouchableOpacity
            style={[
              styles.rejectButton,
              {
                backgroundColor: colors.error,
                transform: [{ scale: rejectButtonScale }],
                opacity: isRejectingRide ? 0.7 : 1,
              },
            ]}
            onPress={handleRejectRide}
            activeOpacity={0.85}
            disabled={isRejectingRide}
          >
            {isRejectingRide ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.actionButtonText}>Rechazar</Text>
            )}
          </AnimatedTouchableOpacity>
        </View>
      </View>

      <Modal
        visible={!!photoModalUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoModalUrl(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#1F1F1F' : '#FFFFFF' }]}
          >
            <Image
              source={{ uri: photoModalUrl || undefined }}
              style={styles.modalImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={[styles.closeModalButton, { backgroundColor: colors.primary }]}
              onPress={() => setPhotoModalUrl(null)}
            >
              <Text style={styles.closeModalText}>Cerrar</Text>
            </TouchableOpacity>
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
  mapContainer: {
    flex: 1,
  },
  nearbyWrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 140,
  },
  nearbyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  nearbyTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  nearbySubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  nearbyButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  nearbyButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  routeLoader: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loaderText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    paddingTop: 8,
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handleBar: {
    width: 56,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  backIconImage: {
    width: 18,
    height: 18,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    flex: 1,
  },
  fabBackButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  clientInfo: {
    flex: 1,
  },
  clientNameText: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  clientMetaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  contactActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  vehiclePhotoButton: {
    width: 48,
    height: 40,
  },
  iconText: {
    fontSize: 18,
  },
  collapsibleContainer: {
    overflow: 'hidden',
  },
  measurementContainer: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
    pointerEvents: 'none',
  },
  negotiationWrapper: {
    gap: 16,
  },
  priceCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 16,
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  priceValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  manualInputRow: {
    marginTop: 12,
  },
  offerInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
  },
  customOfferCard: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  customOfferLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  customOfferSendButton: {
    borderRadius: 18,
    paddingVertical: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customOfferSendButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  suggestButton: {
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineSuggestButton: {
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  suggestButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 20,
    letterSpacing: 0.4,
  },
  suggestionsSection: {
    gap: 8,
    marginTop: 4,
  },
  suggestionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  suggestionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  chipLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
  finalRow: {
    paddingTop: 16,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  finalLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  finalValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  clientOfferBanner: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  clientOfferTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  clientOfferSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 24,
  },
  acceptButton: {
    flex: 1,
    borderRadius: 26,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    flex: 1,
    borderRadius: 26,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D0D0D',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: 340,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#000',
  },
  closeModalButton: {
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  closeModalText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});