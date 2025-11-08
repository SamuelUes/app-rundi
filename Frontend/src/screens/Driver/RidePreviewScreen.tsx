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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import GoogleMap from '../../components/GoogleMap';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { fetchClientProfile, ClientProfile } from '../../services/clientProfilesService';
import alertService from '../../services/alertService';
import mapsService from '../../services/mapsService';
import priceNegotiationService from '../../services/priceNegotiationService';
import ridesService from '../../services/ridesService';
import { hasSavedCard } from '../../utils/cardUtils';
import { DriverStackParamList } from '../../navigation/DriverStack';
import { useAcceptedRideListener } from '../../hooks/useAcceptedRideListener';
import { getDatabase, onValue, ref } from 'firebase/database';

const BACK_ICON = require('../../assets/icons/back_button/back_button2x.png');

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
}

interface RidePreviewParams {
  ride: RidePreviewData;
}

type RidePreviewRouteProp = RouteProp<DriverStackParamList, 'RidePreview'>;
type RidePreviewNavigationProp = NativeStackNavigationProp<DriverStackParamList, 'RidePreview'>;

export default function RidePreviewScreen() {
  const route = useRoute<RidePreviewRouteProp>();
  const navigation = useNavigation<RidePreviewNavigationProp>();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const { ride } = route.params;
  const [rideData, setRideData] = useState<RidePreviewData>(ride);

  // Monitorear si el cliente acepta este ride específico
  useAcceptedRideListener(navigation, ride.id);

  const [routeCoordinates, setRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(true);
  const [counterOffer, setCounterOffer] = useState(
    ride.driverOfferedPrice ? Math.round(ride.driverOfferedPrice).toString() : ''
  );
  const [counterOfferTouched, setCounterOfferTouched] = useState(false);
  const priceContentAnim = useRef(new Animated.Value(1)).current;
  const [priceContentHeight, setPriceContentHeight] = useState(0);
  const [sendingOffer, setSendingOffer] = useState(false);
  const [acceptingRide, setAcceptingRide] = useState(false);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);

  const currentRide = rideData;

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

  const toggleSheet = () => {
    const next = !isSheetExpanded;
    setIsSheetExpanded(next);
    animatePriceContent(next);
  };

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
        return;
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
      }));

      if (!counterOfferTouched && typeof updatedDriverOfferedPrice === 'number') {
        setCounterOffer(Math.round(updatedDriverOfferedPrice).toString());
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride.id, user?.id, counterOfferTouched]);

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

  const handleApplySuggestion = (value: number) => {
    setCounterOfferTouched(true);
    setCounterOffer(Math.round(value).toString());
  };

  const handleSendCounterOffer = async () => {
    if (!counterOffer) {
      alertService.showInfoAlert('Dato requerido', 'Ingresa un precio para sugerir al cliente.');
      return;
    }

    const parsed = parseFloat(counterOffer);
    if (Number.isNaN(parsed) || parsed < 50) {
      alertService.showInfoAlert('Precio inválido', 'El precio sugerido debe ser un número mayor a C$50.');
      return;
    }

    if (!user?.id) {
      alertService.showErrorAlert('No se pudo obtener tu información.');
      return;
    }

    try {
      setSendingOffer(true);
      await priceNegotiationService.negotiatePrice(
        currentRide.id,
        parsed,
        'driver',
        currentRide.estimatedPrice,
        user.id
      );
      alertService.showSuccessAlert('Oferta enviada', 'Se envió tu propuesta al cliente.');
    } catch (error: any) {
      console.error('[RidePreviewScreen] Contraoferta fallida:', error);
      alertService.showErrorAlert(error?.message || 'No se pudo enviar la contraoferta');
    } finally {
      setSendingOffer(false);
    }
  };

  const handleAcceptRide = async () => {
    try {
      if (!(await ensureCardForCardPayments())) {
        return;
      }

      setAcceptingRide(true);

      if (currentRide.clientSuggestedPrice && currentRide.clientSuggestedPrice > 0) {
        await priceNegotiationService.acceptClientPrice(currentRide.id);
        alertService.showSuccessAlert(
          'Oferta enviada',
          `Aceptaste el viaje por ${formatCurrency(currentRide.clientSuggestedPrice)}. Esperando confirmación del cliente...`
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
      setAcceptingRide(false);
    }
  };

  const handleRejectRide = () => {
    navigation.goBack();
  };

  const finalPricePreview = useMemo(() => {
    if (counterOffer) {
      const parsed = parseFloat(counterOffer);
      if (!Number.isNaN(parsed)) {
        return formatCurrency(parsed);
      }
    }
    if (currentRide.clientSuggestedPrice) {
      return formatCurrency(currentRide.clientSuggestedPrice);
    }
    return formatCurrency(currentRide.estimatedPrice);
  }, [counterOffer, currentRide.clientSuggestedPrice, currentRide.estimatedPrice]);

  const handleCounterOfferChange = (value: string) => {
    setCounterOfferTouched(true);
    setCounterOffer(value);
  };

  const renderClientOfferBanner = () => {
    if (!currentRide.clientSuggestedPrice) {
      return null;
    }

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
          Estado:{' '}
          {currentRide.negotiationStatus === 'client_suggested'
            ? 'Esperando tu respuesta'
            : currentRide.negotiationStatus || 'En negociación'}
        </Text>
      </View>
    );
  };

  const renderNegotiationContent = () => (
    <View>
      {renderClientOfferBanner()}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Precio estimado / sugerido por cliente</Text>
        <Text style={[styles.highlightValue, { color: colors.text }]}> 
          {formatCurrency(currentRide.clientSuggestedPrice || currentRide.estimatedPrice)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Precio sugerido por conductor</Text>
        <View style={styles.suggestRow}>
          <TextInput
            value={counterOffer}
            onChangeText={handleCounterOfferChange}
            keyboardType="numeric"
            placeholder="C$"
            style={[styles.counterInput, { borderColor: colors.border, color: colors.text }]}
          />
          <TouchableOpacity
            style={[styles.primaryChip, { backgroundColor: colors.primary }]}
            onPress={handleSendCounterOffer}
            disabled={sendingOffer}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryChipText}>{sendingOffer ? 'Enviando...' : 'Sugerir'}</Text>
          </TouchableOpacity>
        </View>
        {quickSuggestions.length > 0 && (
          <View style={styles.chipsRow}>
            {quickSuggestions.map((value) => (
              <TouchableOpacity
                key={value}
                style={styles.secondaryChip}
                onPress={() => handleApplySuggestion(value)}
              >
                <Text style={styles.secondaryChipText}>{formatCurrency(value)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.finalPriceRow}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Precio Final:</Text>
        <Text style={styles.finalPriceValue}>{finalPricePreview}</Text>
      </View>
    </View>
  );

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
        onPress={() => navigation.goBack()}
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
            <Text style={[styles.clientMetaText, { color: colors.textSecondary }]}>Precio estimado: {formatCurrency(currentRide.estimatedPrice)}</Text>
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
          <TouchableOpacity
            style={[styles.acceptButton, { backgroundColor: colors.warning }]}
            onPress={handleAcceptRide}
            activeOpacity={0.9}
            disabled={acceptingRide}
          >
            <Text style={styles.actionButtonText}>{acceptingRide ? 'Procesando...' : 'Aceptar Viaje'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectButton, { backgroundColor: colors.error }]}
            onPress={handleRejectRide}
            activeOpacity={0.9}
          >
            <Text style={styles.actionButtonText}>Rechazar</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
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
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  highlightValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f1f1f',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  primaryChip: {
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  primaryChipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  secondaryChip: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(125, 230, 173, 0.18)',
  },
  secondaryChipText: {
    fontWeight: '700',
    color: '#7de6ad',
  },
  finalPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  finalPriceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
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
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
