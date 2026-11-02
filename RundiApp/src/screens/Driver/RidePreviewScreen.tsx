import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DynamicMap from '../../components/map/DynamicMap';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import alertService from '../../services/notification/alertService';
import { DriverStackParamList } from '../../navigation/DriverStack';
import { useAcceptedRideListener } from '../../hooks/driver/DriverHomeScreen/useAcceptedRideListener';
import { useRidePreviewData, type RidePreviewData } from '../../hooks/driver/RidePreviewScreen/useRidePreviewData';
import { useRidePreviewRoute } from '../../hooks/driver/RidePreviewScreen/useRidePreviewRoute';
import { useRidePreviewVoice } from '../../hooks/driver/RidePreviewScreen/useRidePreviewVoice';
import { useRideNegotiation } from '../../hooks/driver/RidePreviewScreen/useRideNegotiation';
import { useRideActions } from '../../hooks/shared/ride/useRideActions';
import { useClientProfile } from '../../hooks/driver/RidePreviewScreen/useClientProfile';
import { useTranslation } from 'react-i18next';
import proximityService from '../../services/ride/proximityService';
import { calculateTotalDistanceKm } from '../../utils/ride/ridePreviewHelpers';
import { RidePreviewNegotiation } from '../../components/driver/RidePreview/RidePreviewNegotiation';
import { RidePreviewClientInfo } from '../../components/driver/RidePreview/RidePreviewClientInfo';
import { RidePreviewActions } from '../../components/driver/RidePreview/RidePreviewActions';
import { RidePreviewPhotoModal } from '../../components/driver/RidePreview/RidePreviewPhotoModal';
import { RidePreviewNearbyCard } from '../../components/driver/RidePreview/RidePreviewNearbyCard';
import { ArrivalVehiclePhotoModal } from '../../components/driver/DesignatedCrew/ArrivalVehiclePhotoModal';
import { useArrivalPhotoGate } from '../../hooks/driver/shared/useArrivalPhotoGate';

const PROXIMITY_AUTO_DISMISS_MS = 6000; // auto-cierre si no hay cambios ni interacción
const PROXIMITY_DISMISS_POLL_MS = 500;

interface RidePreviewParams {
  ride: RidePreviewData;
  nearbyRides?: Array<Partial<RidePreviewData> & { distanceMeters?: number }>;
  proximity?: boolean;
  autoPresented?: boolean;
}

type RidePreviewRouteProp = RouteProp<DriverStackParamList, 'RidePreview'>;
type RidePreviewNavigationProp = NativeStackNavigationProp<DriverStackParamList, 'RidePreview'>;

export default function RidePreviewScreen() {
  const route = useRoute<RidePreviewRouteProp>();
  const navigation = useNavigation<RidePreviewNavigationProp>();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopVoiceCategory } = useVoiceAssistant();
  const { t } = useTranslation();

  const insets = useSafeAreaInsets();
  const { ride } = route.params as RidePreviewParams;
  const initialNearby = (route.params as RidePreviewParams)?.nearbyRides || [];
  const isAutoPresented = Boolean((route.params as RidePreviewParams)?.autoPresented);
  const {
    rideData,
    setRideData,
    activeRideGuard,
    setCounterOfferTouched,
    cancellationHandledRef,
    markDismissed,
  } = useRidePreviewData(ride, user?.id, t, navigation);
  const [nearbyQueue, setNearbyQueue] = useState<Array<Partial<RidePreviewData> & { distanceMeters?: number }>>(initialNearby);

  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(ride.clientVehiclePhoto || null);
  const currentRide = rideData;

  const { clientProfile } = useClientProfile(currentRide.clientId, currentRide.id);

  const resolvedClientName = useMemo(
    () => clientProfile?.fullName || currentRide.clientName || t('driver.ridePreview.labels.clientFallback'),
    [clientProfile?.fullName, currentRide.clientName, t]
  );

  const resolvedClientPhone = useMemo(
    () => clientProfile?.phone || currentRide.clientPhone || null,
    [clientProfile?.phone, currentRide.clientPhone]
  );

  const isDesignatedRide = useMemo(
    () => (currentRide.rideType || '').toLowerCase() === 'designated_driver',
    [currentRide.rideType]
  );

  const totalDistanceKm = useMemo(
    () => calculateTotalDistanceKm(currentRide),
    [currentRide],
  );

  const {
    counterOffer,
    lastSuggestedPrice,
    sendingOffer,
    customOfferVisible,
    customOfferInputRef,
    setManualOfferLock,
    navigationLocked,
    quickSuggestions,
    finalPricePreview,
    cacheCurrentOffer,
    handleApplySuggestion,
    handleCustomOfferPress,
    handleCustomOfferChange,
    handleSendCustomOffer,
    formatCurrencyFn,
  } = useRideNegotiation(ride, currentRide, user?.id, resolvedClientName, setRideData, setCounterOfferTouched, t);

  const {
    acceptingRide,
    isRejectingRide,
    acceptButtonScale,
    rejectButtonScale,
    allowNavigationRef,
    handleAcceptRide,
    handleRejectRide,
  } = useRideActions(
    currentRide,
    user?.id,
    activeRideGuard,
    setRideData,
    setManualOfferLock,
    cacheCurrentOffer,
    markDismissed,
    formatCurrencyFn,
    navigation,
    t,
  );

  const { modalProps: arrivalPhotoModalProps, runWithArrivalPhoto } = useArrivalPhotoGate(user?.id);

  // Auto-cierre para aperturas automáticas por proximidad:
  // si no hay cambios en el viaje ni interacción del conductor en 6s, se cierra
  // y el viaje se suprime por 1 minuto para no volver a mostrarse por aproximación.
  const lastActivityAtRef = useRef(Date.now());
  const autoDismissHandledRef = useRef(false);
  const noteUserActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);

  const rideChangeFingerprint = [
    currentRide.id,
    currentRide.clientSuggestedPrice ?? '',
    currentRide.driverOfferedPrice ?? '',
    currentRide.driverOfferStatus ?? '',
    currentRide.negotiationStatus ?? '',
    currentRide.estimatedPrice,
  ].join('|');

  useEffect(() => {
    lastActivityAtRef.current = Date.now();
  }, [rideChangeFingerprint]);

  useEffect(() => {
    if (!isAutoPresented) return;
    const timer = setInterval(() => {
      if (autoDismissHandledRef.current || cancellationHandledRef.current) return;
      if (sendingOffer || acceptingRide || isRejectingRide || customOfferVisible || photoModalUrl) {
        return;
      }
      if (Date.now() - lastActivityAtRef.current < PROXIMITY_AUTO_DISMISS_MS) return;
      autoDismissHandledRef.current = true;
      proximityService
        .markRideAutoDismissed(currentRide.id)
        .catch((err) => console.warn('[RidePreview] Error marcando auto-dismiss:', err))
        .finally(() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          }
        });
    }, PROXIMITY_DISMISS_POLL_MS);
    return () => clearInterval(timer);
  }, [
    isAutoPresented,
    currentRide.id,
    sendingOffer,
    acceptingRide,
    isRejectingRide,
    customOfferVisible,
    photoModalUrl,
    navigation,
    cancellationHandledRef,
  ]);

  useEffect(() => {
    return () => {
      stopVoiceCategory('navigation');
      stopVoiceCategory('status');
    };
  }, [stopVoiceCategory]);

  useAcceptedRideListener(navigation, currentRide.id);

  const [isSheetExpanded, setIsSheetExpanded] = useState(true);
  const priceContentAnim = useRef(new Animated.Value(1)).current;
  const [priceContentHeight, setPriceContentHeight] = useState(0);

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

  useRidePreviewVoice(
    voiceSettings.enabled,
    currentRide,
    totalDistanceKm,
    speakVoice,
    t,
  );

  const { routeCoordinates, loadingRoute } = useRidePreviewRoute(currentRide, t);

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
      origin: (next.origin as RidePreviewData['origin']) || currentRide.origin,
      destination: (next.destination as RidePreviewData['destination']) || currentRide.destination,
      extraDestinations: (next.extraDestinations as RidePreviewData['extraDestinations']) || currentRide.extraDestinations,
      estimatedPrice: typeof next.estimatedPrice === 'number' ? next.estimatedPrice : currentRide.estimatedPrice,
      estimatedDistance: typeof next.estimatedDistance === 'number' ? next.estimatedDistance : currentRide.estimatedDistance,
      estimatedDuration: typeof next.estimatedDuration === 'number' ? next.estimatedDuration : currentRide.estimatedDuration,
      clientSuggestedPrice: typeof next.clientSuggestedPrice === 'number' ? next.clientSuggestedPrice : currentRide.clientSuggestedPrice,
      driverOfferedPrice: typeof next.driverOfferedPrice === 'number' ? next.driverOfferedPrice : currentRide.driverOfferedPrice,
      driverOfferStatus: currentRide.driverOfferStatus || null,
      paymentMethod: (next.paymentMethod as RidePreviewData['paymentMethod']) || currentRide.paymentMethod,
      negotiationStatus: (next as Record<string, unknown>).negotiationStatus as string | null || currentRide.negotiationStatus || null,
      clientComment: ((next as Record<string, unknown>).clientComment as string | null) || ((next as Record<string, unknown>).comment as string | null) || ((next as Record<string, unknown>).notes as string | null) || currentRide.clientComment || null,
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

  const formatCurrency = (value?: number | null) => {
    if (value === undefined || value === null) {
      return t('driver.ridePreview.labels.notAvailable');
    }
    return t('driver.ridePreview.labels.currency', { amount: Math.round(value) });
  };

  const handleCallClient = () => {
    if (!resolvedClientPhone) {
      alertService.showInfoAlert(
        t('driver.ridePreview.alerts.infoTitle'),
        t('driver.ridePreview.alerts.noPhone'),
      );
      return;
    }

    const url = `tel:${resolvedClientPhone}`;
    Linking.canOpenURL(url).then((supported) => {
      if (!supported) {
        alertService.showErrorAlert(t('driver.ridePreview.alerts.callError'));
        return;
      }
      Linking.openURL(url).catch(() =>
        alertService.showErrorAlert(t('driver.ridePreview.alerts.callError')),
      );
    });
  };

  const handleMessageClient = () => {
    navigation.navigate('Chat', {
      rideId: ride.id,
      otherUserId: ride.clientId,
      otherUserName: resolvedClientName,
    });
  };

  const durationMin = useMemo(
    () =>
      typeof currentRide.estimatedDuration === 'number' &&
      Number.isFinite(currentRide.estimatedDuration) &&
      currentRide.estimatedDuration > 0
        ? Math.max(1, Math.round(currentRide.estimatedDuration / 60))
        : null,
    [currentRide.estimatedDuration],
  );

  const renderNearbyCard = () => {
    return (
      <RidePreviewNearbyCard
        nearbyQueue={nearbyQueue}
        colors={colors}
        isDark={isDark}
        formatCurrency={formatCurrency}
        onSwitchToNearby={switchToNearby}
        styles={styles}
        t={t}
      />
    );
  };

  const renderNegotiationContent = () => {
    return (
      <RidePreviewNegotiation
        negotiationStatus={currentRide.negotiationStatus}
        driverOfferedPrice={currentRide.driverOfferedPrice}
        clientSuggestedPrice={currentRide.clientSuggestedPrice}
        estimatedPrice={currentRide.estimatedPrice}
        counterOffer={counterOffer}
        lastSuggestedPrice={lastSuggestedPrice}
        sendingOffer={sendingOffer}
        customOfferVisible={customOfferVisible}
        quickSuggestions={quickSuggestions}
        finalPricePreview={finalPricePreview}
        isDesignatedRide={isDesignatedRide}
        isProgrammedRide={Boolean(currentRide.isProgrammed)}
        clientVehiclePhoto={currentRide.clientVehiclePhoto}
        colors={colors}
        isDark={isDark}
        formatCurrency={formatCurrency}
        customOfferInputRef={customOfferInputRef}
        onCustomOfferPress={handleCustomOfferPress}
        onCustomOfferChange={handleCustomOfferChange}
        onSendCustomOffer={() => runWithArrivalPhoto(isDesignatedRide, handleSendCustomOffer, ride.id)}
        onApplySuggestion={(value: number) => runWithArrivalPhoto(isDesignatedRide, () => handleApplySuggestion(value), ride.id)}
        onOpenPhotoModal={(url) => setPhotoModalUrl(url)}
        styles={styles}
        t={t}
      />
    );
  };

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      onTouchStart={isAutoPresented ? noteUserActivity : undefined}
    >
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={currentRide.origin.lat}
          longitude={currentRide.origin.lng}
          originMarker={{ latitude: currentRide.origin.lat, longitude: currentRide.origin.lng }}
          destinationMarker={{ latitude: currentRide.destination.lat, longitude: currentRide.destination.lng }}
          originTitle={t('common.mapPins.origin')}
          originLabel={currentRide.origin?.address}
          destinationTitle={t('common.mapPins.destination')}
          destinationLabel={currentRide.destination?.address}
          destinationMeta={finalPricePreview || undefined}
          extraStopMarkers={(currentRide.extraDestinations || []).map((stop, index) => ({
            latitude: stop.lat,
            longitude: stop.lng,
            index: index + 1,
            title: t('common.mapPins.extraStop', { index: index + 1 }),
            label: stop.address,
          }))}
          routeCoordinates={routeCoordinates}
          showMarker={false}
        />

        {loadingRoute && (
          <View style={styles.routeLoader}>
            <LoadingIcon size={24} color={colors.primary} />
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>
              {t('driver.ridePreview.loader.calculatingRoute')}
            </Text>
          </View>
        )}
        <View style={styles.nearbyWrapper} pointerEvents="box-none">
          {renderNearbyCard()}
        </View>
      </View>

      {!navigationLocked && (
        <TouchableOpacity
          style={[
            styles.fabBackButton,
            {
              top: insets.top + 12,
              backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.92)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.08)',
            },
          ]}
          onPress={() => {
            markDismissed(currentRide.id).finally(() => navigation.goBack());
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.back')}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
      )}

      <View
        style={[
          styles.bottomSheet,
          {
            backgroundColor: colors.card,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.handleArea}
          onPress={toggleSheet}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('driver.ridePreview.accessibility.toggleDetails')}
        >
          <View
            style={[
              styles.handleBar,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.16)' },
            ]}
          />
        </TouchableOpacity>

        <View style={styles.measurementContainer} onLayout={handleMeasuredContentLayout}>
          {renderNegotiationContent()}
        </View>

        <RidePreviewClientInfo
          resolvedClientName={resolvedClientName}
          estimatedPrice={currentRide.estimatedPrice}
          clientComment={currentRide.clientComment}
          clientProfile={clientProfile}
          distanceKm={totalDistanceKm}
          durationMin={durationMin}
          paymentMethod={currentRide.paymentMethod}
          colors={colors}
          isDark={isDark}
          formatCurrency={formatCurrency}
          onMessageClient={handleMessageClient}
          onCallClient={handleCallClient}
          styles={styles}
          t={t}
        />

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

        <RidePreviewActions
          acceptingRide={acceptingRide}
          isRejectingRide={isRejectingRide}
          acceptButtonScale={acceptButtonScale}
          rejectButtonScale={rejectButtonScale}
          colors={colors}
          onAccept={() => runWithArrivalPhoto(isDesignatedRide, handleAcceptRide, ride.id)}
          onReject={handleRejectRide}
          styles={styles}
          t={t}
        />
      </View>

      <RidePreviewPhotoModal
        visible={!!photoModalUrl}
        photoUrl={photoModalUrl}
        isDark={isDark}
        colors={colors}
        onClose={() => setPhotoModalUrl(null)}
        styles={styles}
        t={t}
      />
      <ArrivalVehiclePhotoModal {...arrivalPhotoModalProps} />
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
  nearbyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nearbyButton: {
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 12,
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
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '800',
  },
  clientInfo: {
    flex: 1,
    gap: 2,
  },
  clientNameText: {
    fontSize: 17,
    fontWeight: '700',
  },
  clientMetaText: {
    fontSize: 13,
    fontWeight: '600',
  },
  clientTripMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  clientNoteText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 10,
    marginLeft: 12,
  },
  iconButton: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehiclePhotoButtonText: {
    fontSize: 12,
    fontWeight: '700',
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
    gap: 14,
  },
  priceCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 16,
  },
  priceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  priceHeaderText: {
    flex: 1,
    gap: 4,
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  priceValue: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  offerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 50,
  },
  offerToggleLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  offerToggleValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  offerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
  },
  offerInputPrefix: {
    fontSize: 16,
    fontWeight: '800',
  },
  offerInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    paddingVertical: 0,
  },
  customOfferCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  customOfferLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  customOfferSendButton: {
    borderRadius: 14,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customOfferSendButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  suggestionsSection: {
    gap: 10,
  },
  suggestionsLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  chip: {
    flex: 1,
    borderRadius: 14,
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipLabel: {
    fontWeight: '700',
    fontSize: 14,
  },
  finalRow: {
    paddingTop: 14,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  finalLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  finalValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  clientOfferBanner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerTextWrap: {
    flex: 1,
    gap: 2,
  },
  clientOfferTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  clientOfferSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  acceptButton: {
    flex: 1,
    borderRadius: 999,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    flex: 1,
    borderRadius: 999,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '800',
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