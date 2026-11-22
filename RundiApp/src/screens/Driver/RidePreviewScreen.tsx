import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Linking,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
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
import { getRideFeatureLabels } from '../../utils/ride/rideFeatureLabels';
import { RidePreviewNegotiation } from '../../components/driver/RidePreview/RidePreviewNegotiation';
import { RidePreviewClientInfo } from '../../components/driver/RidePreview/RidePreviewClientInfo';
import { RidePreviewActions } from '../../components/driver/RidePreview/RidePreviewActions';
import { RidePreviewPhotoModal } from '../../components/driver/RidePreview/RidePreviewPhotoModal';
import { RidePreviewNearbyCard } from '../../components/driver/RidePreview/RidePreviewNearbyCard';
import { ArrivalVehiclePhotoModal } from '../../components/driver/DesignatedCrew/ArrivalVehiclePhotoModal';
import { useArrivalPhotoGate } from '../../hooks/driver/shared/useArrivalPhotoGate';

const PROXIMITY_AUTO_DISMISS_MS = 5000; // auto-cierre si no hay cambios ni interacción
const PROXIMITY_DISMISS_POLL_MS = 500;
const SHEET_SPRING = { damping: 26, stiffness: 300, overshootClamping: true };

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
  const isFocused = useIsFocused();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopVoiceCategory } = useVoiceAssistant();
  const { t } = useTranslation();

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
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

  const resolvedClientPhoto = useMemo(
    () => currentRide.clientPhoto || clientProfile?.photoUrl || null,
    [currentRide.clientPhoto, clientProfile?.photoUrl]
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
  // si no hay cambios en el viaje ni interacción del conductor en 5s, se cierra
  // y el viaje se suprime por 1 minuto para no volver a mostrarse por aproximación.
  const lastActivityAtRef = useRef(Date.now());
  const autoDismissHandledRef = useRef(false);
  const noteUserActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    noteUserActivity();
  }, [arrivalPhotoModalProps.visible, noteUserActivity]);

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
  }, [rideChangeFingerprint, isFocused]);

  useEffect(() => {
    if (!isAutoPresented) return;
    return navigation.addListener('beforeRemove', (event) => {
      const action = event.data.action.type;
      if (action === 'GO_BACK' || action === 'POP') {
        if (acceptingRide || navigationLocked || activeRideGuard) {
          proximityService.cancelProximitySequence();
          return;
        }
        void proximityService.markRideAutoDismissed(currentRide.id);
        proximityService.scheduleNextProximityRide(currentRide.id);
      } else {
        proximityService.cancelProximitySequence();
      }
    });
  }, [isAutoPresented, navigation, currentRide.id, acceptingRide, navigationLocked, activeRideGuard]);

  useEffect(() => {
    if (!isAutoPresented || isDesignatedRide) return;
    const timer = setInterval(() => {
      if (!isFocused || autoDismissHandledRef.current || cancellationHandledRef.current) return;
      if (sendingOffer || acceptingRide || isRejectingRide || customOfferVisible || photoModalUrl || arrivalPhotoModalProps.visible) {
        return;
      }
      if (Date.now() - lastActivityAtRef.current < PROXIMITY_AUTO_DISMISS_MS) return;
      autoDismissHandledRef.current = true;
      if (navigation.canGoBack()) navigation.goBack();
    }, PROXIMITY_DISMISS_POLL_MS);
    return () => clearInterval(timer);
  }, [
    isAutoPresented,
    isDesignatedRide,
    isFocused,
    currentRide.id,
    sendingOffer,
    acceptingRide,
    isRejectingRide,
    customOfferVisible,
    photoModalUrl,
    arrivalPhotoModalProps.visible,
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
  const sheetProgress = useSharedValue(1);
  const dragStartProgress = useSharedValue(1);
  const sheetTarget = useSharedValue(1);
  const isDraggingSheet = useSharedValue(false);
  const [priceContentHeight, setPriceContentHeight] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [actionsHeight, setActionsHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const negotiationScrollRef = useRef<ScrollViewInstance>(null);
  const sheetBottomPadding = keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 12) + 8;
  const availableContentHeight = screenHeight && headerHeight && actionsHeight
    ? Math.max(0, screenHeight - keyboardHeight - insets.top - 12 - headerHeight - actionsHeight - sheetBottomPadding)
    : priceContentHeight;
  const expandedContentHeight = Math.min(priceContentHeight, availableContentHeight);

  useEffect(() => {
    if (!isFocused) {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
      return;
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', (event) => {
      if (Platform.OS === 'ios') {
        const height = Math.max(0, windowHeight - event.endCoordinates.screenY);
        setKeyboardHeight(height);
        setKeyboardVisible(height > 0);
      } else {
        setKeyboardVisible(true);
      }
      requestAnimationFrame(() => negotiationScrollRef.current?.scrollToEnd({ animated: true }));
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [isFocused, windowHeight]);

  const updateSheetState = useCallback((expanded: boolean) => {
    setIsSheetExpanded(expanded);
    if (!expanded) Keyboard.dismiss();
  }, []);

  useRidePreviewVoice(
    voiceSettings.enabled && isFocused,
    currentRide,
    totalDistanceKm,
    speakVoice,
    t,
  );

  const { routeCoordinates, loadingRoute } = useRidePreviewRoute(currentRide, t);

  const toggleSheet = useCallback(() => {
    const target = sheetTarget.value === 1 ? 0 : 1;
    sheetTarget.value = target;
    sheetProgress.value = withSpring(target, SHEET_SPRING);
    updateSheetState(target === 1);
  }, [sheetProgress, sheetTarget, updateSheetState]);

  const sheetPan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-24, 24])
        .onStart(() => {
          'worklet';
          cancelAnimation(sheetProgress);
          isDraggingSheet.value = true;
          dragStartProgress.value = sheetProgress.value;
        })
        .onUpdate((e) => {
          'worklet';
          const denom = Math.max(expandedContentHeight, 1);
          const next = dragStartProgress.value - e.translationY / denom;
          sheetProgress.value = Math.min(1, Math.max(0, next));
        })
        .onEnd((e) => {
          'worklet';
          const denom = Math.max(expandedContentHeight, 1);
          const projected = sheetProgress.value - (e.velocityY * 0.18) / denom;
          const target = projected > 0.5 ? 1 : 0;
          sheetTarget.value = target;
          isDraggingSheet.value = false;
          sheetProgress.value = withSpring(target, SHEET_SPRING);
          runOnJS(updateSheetState)(target === 1);
        })
        .onFinalize(() => {
          'worklet';
          if (isDraggingSheet.value) {
            isDraggingSheet.value = false;
            sheetProgress.value = withSpring(sheetTarget.value, SHEET_SPRING);
          }
        }),
    [expandedContentHeight, sheetProgress, dragStartProgress, sheetTarget, isDraggingSheet, updateSheetState],
  );

  const handleGesture = useMemo(() => {
    const tap = Gesture.Tap().maxDistance(8).onEnd((_event, success) => {
      'worklet';
      if (success) {
        const target = sheetTarget.value === 1 ? 0 : 1;
        sheetTarget.value = target;
        sheetProgress.value = withSpring(target, SHEET_SPRING);
        runOnJS(updateSheetState)(target === 1);
      }
    });
    return Gesture.Race(sheetPan, tap);
  }, [sheetPan, sheetTarget, sheetProgress, updateSheetState]);

  const collapsibleStyle = useAnimatedStyle(() => ({
    height: sheetProgress.value * expandedContentHeight,
    opacity: sheetProgress.value,
  }));

  const switchToNearby = useCallback(() => {
    if (!nearbyQueue || nearbyQueue.length === 0) return;
    if (isAutoPresented) {
      if (navigation.canGoBack()) navigation.goBack();
      return;
    }
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
      featureCodes: next.featureCodes ?? [],
      clientSuggestedPrice: typeof next.clientSuggestedPrice === 'number' ? next.clientSuggestedPrice : currentRide.clientSuggestedPrice,
      driverOfferedPrice: typeof next.driverOfferedPrice === 'number' ? next.driverOfferedPrice : currentRide.driverOfferedPrice,
      driverOfferStatus: currentRide.driverOfferStatus || null,
      clientPhoto: next.clientPhoto ?? null,
      rideType: next.rideType ?? null,
      clientVehiclePhoto: next.clientVehiclePhoto ?? null,
      paymentMethod: (next.paymentMethod as RidePreviewData['paymentMethod']) || currentRide.paymentMethod,
      negotiationStatus: (next as Record<string, unknown>).negotiationStatus as string | null || currentRide.negotiationStatus || null,
      clientComment: ((next as Record<string, unknown>).clientComment as string | null) || ((next as Record<string, unknown>).comment as string | null) || ((next as Record<string, unknown>).notes as string | null) || currentRide.clientComment || null,
    };
    setRideData(nextRide);
    setNearbyQueue(rest);
  }, [nearbyQueue, currentRide, isAutoPresented, navigation]);

  const handleMeasuredContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      setPriceContentHeight((previous) => previous === height ? previous : height);
    },
    [],
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
      rideId: currentRide.id,
      otherUserId: currentRide.clientId,
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

  const renderNegotiationContent = (measurement = false) => {
    return (
      <RidePreviewNegotiation
        negotiationStatus={currentRide.negotiationStatus}
        lastOfferBy={currentRide.lastOfferBy}
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
        customOfferInputRef={measurement ? { current: null } : customOfferInputRef}
        onCustomOfferPress={handleCustomOfferPress}
        onCustomOfferChange={handleCustomOfferChange}
        onSendCustomOffer={() => runWithArrivalPhoto(isDesignatedRide, handleSendCustomOffer)}
        onApplySuggestion={(value: number) => runWithArrivalPhoto(isDesignatedRide, () => handleApplySuggestion(value))}
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
      onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
    >
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={currentRide.origin.lat}
          longitude={currentRide.origin.lng}
          allowRouteZoomOut
          fitEdgePadding={{
            top: 100,
            left: 60,
            right: 60,
            bottom: Math.min(windowHeight - 180, Math.max(160, headerHeight + actionsHeight + sheetBottomPadding + (isSheetExpanded ? expandedContentHeight : 0) + 24)),
          }}
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
            bottom: keyboardHeight,
            paddingBottom: sheetBottomPadding,
          },
        ]}
      >
        <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
          <GestureHandlerRootView>
            <GestureDetector gesture={handleGesture}>
              <View
                style={styles.handleArea}
                accessibilityRole="button"
                accessibilityLabel={t('driver.ridePreview.accessibility.toggleDetails')}
                accessibilityState={{ expanded: isSheetExpanded }}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'activate') toggleSheet();
                }}
              >
                <View
                  style={[
                    styles.handleBar,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.16)' },
                  ]}
                />
              </View>
            </GestureDetector>
          </GestureHandlerRootView>

          <View
            style={styles.measurementContainer}
            onLayout={handleMeasuredContentLayout}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {renderNegotiationContent(true)}
          </View>

          <RidePreviewClientInfo
            resolvedClientName={resolvedClientName}
            estimatedPrice={currentRide.estimatedPrice}
            clientComment={currentRide.clientComment}
            clientProfile={clientProfile}
            clientPhotoUrl={resolvedClientPhoto}
            distanceKm={totalDistanceKm}
            durationMin={durationMin}
            paymentMethod={currentRide.paymentMethod}
            featureLabels={getRideFeatureLabels(currentRide, t)}
            colors={colors}
            isDark={isDark}
            formatCurrency={formatCurrency}
            onMessageClient={handleMessageClient}
            onCallClient={handleCallClient}
            styles={styles}
            t={t}
          />
        </View>

        <Reanimated.View
          style={[
            styles.collapsibleContainer,
            collapsibleStyle,
          ]}
        >
          <ScrollView
            ref={negotiationScrollRef}
            pointerEvents={isSheetExpanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!isSheetExpanded}
            importantForAccessibility={isSheetExpanded ? 'auto' : 'no-hide-descendants'}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={priceContentHeight > expandedContentHeight}
            onLayout={() => {
              if (keyboardVisible && customOfferVisible) {
                negotiationScrollRef.current?.scrollToEnd({ animated: true });
              }
            }}
          >
            {renderNegotiationContent()}
          </ScrollView>
        </Reanimated.View>

        <View onLayout={(event) => setActionsHeight(event.nativeEvent.layout.height)}>
          {isDesignatedRide && (
            <TouchableOpacity
              style={styles.arrivalPhotoButton}
              onPress={() => runWithArrivalPhoto(true, () => {})}
              accessibilityRole="button"
              accessibilityLabel={t('driver.crew.arrivalPhoto.open')}
            >
              <Ionicons name="camera-outline" size={18} color={isDark ? '#E8C47F' : '#805C1F'} />
              <Text style={[styles.arrivalPhotoButtonText, { color: isDark ? '#E8C47F' : '#805C1F' }]}>
                {t('driver.crew.arrivalPhoto.open')}
              </Text>
            </TouchableOpacity>
          )}
          <RidePreviewActions
            acceptingRide={acceptingRide}
            isRejectingRide={isRejectingRide}
            acceptButtonScale={acceptButtonScale}
            rejectButtonScale={rejectButtonScale}
            colors={colors}
            onAccept={() => runWithArrivalPhoto(isDesignatedRide, handleAcceptRide)}
            onReject={handleRejectRide}
            styles={styles}
            t={t}
          />
        </View>
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
  arrivalPhotoButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  arrivalPhotoButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
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
    boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.2)',
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
    boxShadow: '0px -4px 12px rgba(0, 0, 0, 0.15)',
    paddingTop: 8,
  },
  handleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
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
    ...Platform.select({
      ios: { filter: [{ dropShadow: { offsetX: 0, offsetY: 3, standardDeviation: 6, color: 'rgba(0,0,0,0.2)' } }] },
      default: {},
    }),
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
  featureBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  featureBadge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  featureBadgeText: {
    fontSize: 11,
    fontWeight: '600',
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
    left: 0,
    right: 0,
    opacity: 0,
    zIndex: -1,
    pointerEvents: 'none',
  },
  negotiationWrapper: {
    gap: 14,
  },
  priceCard: {
    borderWidth: 0.3,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 16,
    boxShadow: '0px 0px 2px rgba(0, 0, 0, 0.1)',
    elevation: Platform.OS === 'android' ? 0 : 4,
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
    borderWidth: 0.1,
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
    borderWidth: 0.1,
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
    borderWidth: 0.1,
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
    borderWidth: 0.1,
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
    borderRadius: 18,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    flex: 1,
    borderRadius: 16,
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