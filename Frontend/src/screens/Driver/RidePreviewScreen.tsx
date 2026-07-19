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
  Image,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DynamicMap from '../../components/map/DynamicMap';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import alertService from '../../services/alertService';
import { DriverStackParamList } from '../../navigation/DriverStack';
import { useAcceptedRideListener } from '../../hooks/driver/DriverHomeScreen/useAcceptedRideListener';
import { useRidePreviewData, type RidePreviewData } from '../../hooks/driver/RidePreviewScreen/useRidePreviewData';
import { useRidePreviewRoute } from '../../hooks/driver/RidePreviewScreen/useRidePreviewRoute';
import { useRidePreviewVoice } from '../../hooks/driver/RidePreviewScreen/useRidePreviewVoice';
import { useRideNegotiation } from '../../hooks/driver/RidePreviewScreen/useRideNegotiation';
import { useRideActions } from '../../hooks/shared/ride/useRideActions';
import { useClientProfile } from '../../hooks/driver/RidePreviewScreen/useClientProfile';
import { useTranslation } from 'react-i18next';
import { calculateTotalDistanceKm } from '../../utils/ridePreviewHelpers';

const BACK_ICON = require('../../assets/icons/back_button/back_button2x.png');

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

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
  const { t } = useTranslation();

  const { ride } = route.params as RidePreviewParams;
  const initialNearby = (route.params as RidePreviewParams)?.nearbyRides || [];
  const {
    rideData,
    setRideData,
    activeRideGuard,
    counterOfferTouched,
    setCounterOfferTouched,
    cancellationHandledRef,
    markDismissed,
  } = useRidePreviewData(ride, user?.id, t, navigation);
  const [nearbyQueue, setNearbyQueue] = useState<Array<Partial<RidePreviewData> & { distanceMeters?: number }>>(initialNearby);
  const proximityParam = (route.params as Record<string, unknown>)?.proximity === true;
  const proximityMode = proximityParam || initialNearby.length > 0;
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(ride.clientVehiclePhoto || null);
  const currentRide = rideData;

  const { clientProfile } = useClientProfile(currentRide.clientId);

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
    setCounterOffer,
    lastSuggestedPrice,
    sendingOffer,
    customOfferVisible,
    setCustomOfferVisible,
    customOfferInputRef,
    manualOfferLock,
    setManualOfferLock,
    hasPendingOffer,
    navigationLocked,
    quickSuggestions,
    finalPricePreview,
    cacheCurrentOffer,
    submitCounterOffer,
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
      otherUserName: resolvedClientName,
    });
  };

  const renderNegotiationBanner = () => {
    const status = (currentRide.negotiationStatus || '').toLowerCase();
    const driverSuggested =
      typeof currentRide.driverOfferedPrice === 'number' && !Number.isNaN(currentRide.driverOfferedPrice);
    const clientSuggested =
      typeof currentRide.clientSuggestedPrice === 'number' && !Number.isNaN(currentRide.clientSuggestedPrice);

    const statusText = t(`driver.ridePreview.negotiation.status.${status}`, {
      defaultValue:
        status === 'driver_offered'
          ? t('driver.ridePreview.negotiation.status.defaultDriver')
          : t('driver.ridePreview.negotiation.status.defaultClient'),
    });

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
            {t('driver.ridePreview.negotiation.driverOfferTitle', {
              amount: formatCurrency(currentRide.driverOfferedPrice),
            })}
          </Text>
          <Text style={[styles.clientOfferSubtitle, { color: colors.textSecondary }]}>{statusText}</Text>
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
            {t('driver.ridePreview.negotiation.clientOfferTitle', {
              amount: formatCurrency(currentRide.clientSuggestedPrice),
            })}
          </Text>
          <Text style={[styles.clientOfferSubtitle, { color: colors.textSecondary }]}>{statusText}</Text>
        </View>
      );
    }

    return null;
  };

  const renderNearbyCard = () => {
    if (!nearbyQueue || nearbyQueue.length === 0) return null;
    const next = nearbyQueue[0] as Partial<RidePreviewData> & { distanceMeters?: number };
    const labelDistance =
      typeof next?.distanceMeters === 'number'
        ? t('driver.ridePreview.nearby.distanceMeters', {
            distance: Math.max(1, Math.round(next.distanceMeters)),
          })
        : typeof next?.estimatedDistance === 'number'
          ? t('driver.ridePreview.nearby.distanceKilometers', {
              distance: Math.round((next.estimatedDistance || 0) / 100) / 10,
            })
          : t('driver.ridePreview.nearby.distanceFallback');
    const priceText =
      typeof next?.estimatedPrice === 'number'
        ? formatCurrency(next.estimatedPrice)
        : t('driver.ridePreview.nearby.priceFallback');
    const originText = next?.origin?.address || t('driver.ridePreview.nearby.originFallback');

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
          <Text style={[styles.nearbyTitle, { color: colors.text }]}>{t('driver.ridePreview.nearby.title')}</Text>
          <Text style={[styles.nearbySubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {labelDistance} • {priceText} • {originText}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.nearbyButton, { backgroundColor: colors.primary }]}
          onPress={switchToNearby}
        >
          <Text style={styles.nearbyButtonText}>{t('driver.ridePreview.nearby.view')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNegotiationContent = () => {
    const customOfferButtonLabel = lastSuggestedPrice
      ? formatCurrency(lastSuggestedPrice)
      : t('driver.ridePreview.negotiation.customOfferButton');

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
          <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
            {t('driver.ridePreview.negotiation.estimatedLabel')}
          </Text>
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
                <Text style={[styles.suggestionsLabel, { color: colors.textSecondary }]}>
                  {t('driver.ridePreview.negotiation.suggestionsLabel')}
                </Text>
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
                <MaterialIcons name="directions-car" size={20} color="#FFFFFF" />
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
                <Text style={[styles.customOfferLabel, { color: colors.textSecondary }]}>
                  {t('driver.ridePreview.negotiation.customLabel')}
                </Text>
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
                  placeholder={t('driver.ridePreview.negotiation.placeholderExample')}
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
                    <LoadingIcon size={20} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.customOfferSendButtonText}>
                      {t('driver.ridePreview.negotiation.send')}
                    </Text>
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
            <Text style={[styles.finalLabel, { color: colors.textSecondary }]}>
              {t('driver.ridePreview.negotiation.finalLabel')}
            </Text>
            <Text style={[styles.finalValue, { color: colors.text }]}>{finalPricePreview}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.mapContainer}>
        <DynamicMap
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
              backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.92)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.08)',
            },
          ]}
          onPress={() => {
            markDismissed(currentRide.id).finally(() => navigation.goBack());
          }}
          activeOpacity={0.9}
        >
          <Image
            source={BACK_ICON}
            style={[styles.backIconImage, { tintColor: isDark ? '#FFFFFF' : '#1F1F1F' }]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}

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
            <Text style={[styles.clientMetaText, { color: colors.textSecondary }]}> 
              {t('driver.ridePreview.labels.estimatedPrice', {
                amount: formatCurrency(currentRide.estimatedPrice),
              })}
            </Text>
            {typeof currentRide.clientComment === 'string' && currentRide.clientComment.trim().length > 0 ? (
              <Text style={[styles.clientMetaText, { color: colors.textSecondary }]} numberOfLines={2}>
                {`Nota: ${currentRide.clientComment.trim()}`}
              </Text>
            ) : null}
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
              <MaterialIcons name="chat" size={24} color={colors.textSecondary || '#666'} />
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
              <MaterialIcons name="call" size={24} color={colors.textSecondary || '#666'} />
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
              <LoadingIcon size={20} color="#FFFFFF" />
            ) : (
              <Text style={styles.actionButtonText}>{t('driver.ridePreview.buttons.accept')}</Text>
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
              <LoadingIcon size={20} color="#FFFFFF" />
            ) : (
              <Text style={styles.actionButtonText}>{t('driver.ridePreview.buttons.reject')}</Text>
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
              <Text style={styles.closeModalText}>{t('driver.ridePreview.modal.close')}</Text>
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
    fontWeight: '800',
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