import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  Pressable,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingIcon } from '../../ui/LoadingIcon';
import StorageImage from '../../shared/StorageImage';
import type { OfferItem } from '../../../hooks/client/HomeScreenOffers/useRideOffers';
import type { TFunction } from 'i18next';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const PULSE_DURATION_MS = 2400;

interface AssignedDriverInfo {
  driverId: string;
  name: string;
  rating: number | null;
  photoUri: string | null;
  plate: string | null;
  driverConfirmed?: boolean;
  scheduledAt: number | null;
}

interface HomeScreenOffersBottomSheetProps {
  loading: boolean;
  offers: OfferItem[];
  assignedDriver?: AssignedDriverInfo | null;
  selectedDriverId: string | null;
  selectedOffer: OfferItem | undefined;
  isConfirming: boolean;
  isCancelling: boolean;
  confirmBtnAnim: Animated.Value;
  cancelBtnAnim: Animated.Value;
  primaryActionLabel: string;
  colors: any;
  isDark: boolean;
  renderOffer: (props: { item: OfferItem }) => React.ReactElement;
  onShowDriverReviews: () => void;
  onConfirmSelectedDriver: () => void;
  onCancelSearch: () => void;
  styles: any;
  t: TFunction;
}

export function HomeScreenOffersBottomSheet({
  loading,
  offers,
  assignedDriver,
  selectedOffer,
  isConfirming,
  isCancelling,
  confirmBtnAnim,
  cancelBtnAnim,
  primaryActionLabel,
  colors,
  isDark,
  renderOffer,
  onShowDriverReviews,
  onConfirmSelectedDriver,
  onCancelSearch,
  styles,
  t,
}: HomeScreenOffersBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const listMaxHeight = Math.min(320, Math.round(windowHeight * 0.4));

  const searching = loading || offers.length === 0;
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [slowSearch, setSlowSearch] = useState(false);

  useEffect(() => {
    if (!searching) {
      setSlowSearch(false);
      return;
    }
    const timer = setTimeout(() => setSlowSearch(true), 45_000);
    return () => clearTimeout(timer);
  }, [searching]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(Boolean(enabled));
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || !searching) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion, searching]);

  const ringProgress = [pulse, Animated.modulo(Animated.add(pulse, 0.5), 1)];
  const ringColor = isDark ? 'rgba(212,175,55,0.5)' : 'rgba(179,135,55,0.35)';

  const canConfirm = !!selectedOffer && !isConfirming;
  const cancelColor = isDark ? '#EF5350' : '#D32F2F';
  const sheetBorderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';

  const statusPill = searching
    ? {
        backgroundColor: isDark ? 'rgba(212,175,55,0.14)' : 'rgba(179,135,55,0.10)',
        borderColor: isDark ? 'rgba(212,175,55,0.4)' : 'rgba(179,135,55,0.3)',
        textColor: isDark ? '#FFD666' : '#8A5800',
      }
    : {
        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)',
        borderColor: 'transparent',
        textColor: colors.textSecondary,
      };

  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: colors.card,
          borderTopColor: sheetBorderColor,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View
        style={[
          styles.sheetHandle,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)' },
        ]}
      />

      <View style={styles.sheetHeaderRow}>
        <Text style={styles.sheetTitle}>{t('client.homeOffers.title')}</Text>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: statusPill.backgroundColor,
              borderColor: statusPill.borderColor,
            },
          ]}
        >
          {searching ? (
            <Animated.View
              style={[
                styles.statusDot,
                {
                  backgroundColor: statusPill.textColor,
                  opacity: pulse.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.9, 0.9, 0.35] }),
                  transform: [
                    { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) },
                  ],
                },
              ]}
            />
          ) : (
            <MaterialIcons name="directions-car" size={12} color={statusPill.textColor} />
          )}
          <Text style={[styles.statusPillText, { color: statusPill.textColor }]}>
            {searching
              ? `${t('client.homeOffers.searching')}…`
              : t('client.homeOffers.count', { count: offers.length })}
          </Text>
        </View>
      </View>

      {assignedDriver ? (
        <View
          style={[
            styles.assignedDriverCard,
            {
              backgroundColor: isDark ? 'rgba(212,175,55,0.08)' : 'rgba(179,135,55,0.07)',
              borderColor: isDark ? 'rgba(212,175,55,0.35)' : 'rgba(179,135,55,0.3)',
            },
          ]}
        >
          <View
            style={[
              styles.offerAvatar,
              { backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : 'rgba(179,135,55,0.18)' },
            ]}
          >
            {assignedDriver.photoUri ? (
              <StorageImage uri={assignedDriver.photoUri} style={styles.offerAvatarPhoto} />
            ) : (
              <Text
                style={[
                  styles.offerAvatarInitials,
                  { color: isDark ? '#FFD666' : '#8A5800' },
                ]}
              >
                {(assignedDriver.name || 'D').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.offerInfo}>
            <Text style={[styles.offerName, { color: colors.text }]} numberOfLines={1}>
              {assignedDriver.name}
            </Text>
            <View style={styles.offerChipsRow}>
              <View
                style={[
                  styles.offerChip,
                  {
                    backgroundColor: assignedDriver.driverConfirmed
                      ? isDark
                        ? 'rgba(76,175,80,0.20)'
                        : 'rgba(46,125,50,0.12)'
                      : isDark
                        ? 'rgba(212,175,55,0.18)'
                        : 'rgba(179,135,55,0.12)',
                  },
                ]}
              >
                <MaterialIcons
                  name={assignedDriver.driverConfirmed ? 'check-circle' : 'event-available'}
                  size={11}
                  color={
                    assignedDriver.driverConfirmed
                      ? isDark
                        ? '#7FCF83'
                        : '#2E7D32'
                      : isDark
                        ? '#FFD666'
                        : '#8A5800'
                  }
                />
                <Text
                  style={[
                    styles.offerChipText,
                    {
                      color: assignedDriver.driverConfirmed
                        ? isDark
                          ? '#7FCF83'
                          : '#2E7D32'
                        : isDark
                          ? '#FFD666'
                          : '#8A5800',
                    },
                  ]}
                >
                  {assignedDriver.driverConfirmed
                    ? t('client.homeOffers.assignedDriver.confirmedBadge')
                    : t('client.homeOffers.assignedDriver.badge')}
                </Text>
              </View>
              {assignedDriver.plate ? (
                <View
                  style={[
                    styles.offerChip,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                  ]}
                >
                  <MaterialIcons name="directions-car" size={11} color={colors.textSecondary} />
                  <Text style={[styles.offerChipText, { color: colors.textSecondary }]}>
                    {assignedDriver.plate}
                  </Text>
                </View>
              ) : null}
              {assignedDriver.rating !== null ? (
                <View
                  style={[
                    styles.offerChip,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                  ]}
                >
                  <MaterialIcons name="star" size={11} color={colors.textSecondary} />
                  <Text style={[styles.offerChipText, { color: colors.textSecondary }]}>
                    {assignedDriver.rating.toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {assignedDriver.scheduledAt ? (
            <Text style={[styles.assignedDriverTime, { color: colors.textSecondary }]}>
              {t('client.homeOffers.assignedDriver.pickupAt', {
                time: new Date(assignedDriver.scheduledAt).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <LoadingIcon icon="refresh" size={26} color={colors.primary} animation="spin" />
          <Text style={styles.loadingText}>{t('client.homeOffers.loading')}</Text>
        </View>
      ) : offers.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.radarWrap}>
            {!reduceMotion
              ? ringProgress.map((progress, index) => (
                  <Animated.View
                    key={index}
                    style={[
                      styles.radarRing,
                      {
                        borderColor: ringColor,
                        opacity: progress.interpolate({
                          inputRange: [0, 0.15, 1],
                          outputRange: [0, 0.5, 0],
                        }),
                        transform: [
                          {
                            scale: progress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.55, 1.7],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ))
              : null}
            <View
              style={[
                styles.radarCoreOuter,
                { backgroundColor: isDark ? 'rgba(212,175,55,0.14)' : 'rgba(179,135,55,0.10)' },
              ]}
            >
              <View
                style={[
                  styles.radarCoreInner,
                  { backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : 'rgba(179,135,55,0.16)' },
                ]}
              >
                <MaterialIcons name="radar" size={20} color={colors.primary} />
              </View>
            </View>
          </View>
          <Text style={styles.emptyText}>{t('client.homeOffers.empty')}</Text>
          <Text style={styles.emptyHint}>
            {slowSearch ? t('client.homeOffers.searchingLong') : t('client.homeOffers.emptyHint')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(it) => it.driverId}
          renderItem={renderOffer}
          style={{ maxHeight: listMaxHeight }}
          contentContainerStyle={styles.offerListContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selectedOffer ? (
        <Pressable
          style={({ pressed }) => [
            styles.reviewsRow,
            {
              backgroundColor: isDark ? 'rgba(212,175,55,0.10)' : 'rgba(179,135,55,0.08)',
              borderColor: isDark ? 'rgba(212,175,55,0.35)' : 'rgba(179,135,55,0.3)',
            },
            pressed && { opacity: 0.85 },
          ]}
          onPress={onShowDriverReviews}
          accessibilityRole="button"
          accessibilityLabel={t('client.homeOffers.a11y.seeReviews')}
        >
          <MaterialIcons
            name="rate-review"
            size={15}
            color={isDark ? '#FFD666' : '#8A5800'}
          />
          <Text style={[styles.reviewsRowText, { color: colors.text }]}>
            {t('client.homeOffers.buttons.seeDriverReviews')}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
      ) : null}

      <AnimatedTouchableOpacity
        style={[
          styles.primaryBtn,
          canConfirm ? styles.primaryBtnEnabled : null,
          {
            backgroundColor: canConfirm ? colors.primary : isDark ? '#3A3A3A' : '#E6E6E6',
            transform: [{ scale: confirmBtnAnim }],
          },
        ]}
        onPress={onConfirmSelectedDriver}
        disabled={!canConfirm}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        {isConfirming ? (
          <LoadingIcon icon="refresh" size={22} color="#FFFFFF" animation="spin" />
        ) : (
          <Text
            style={[
              styles.primaryBtnText,
              { color: canConfirm ? '#FFFFFF' : colors.textTertiary },
            ]}
            numberOfLines={2}
          >
            {primaryActionLabel}
          </Text>
        )}
      </AnimatedTouchableOpacity>

      <AnimatedTouchableOpacity
        style={[
          styles.cancelBtn,
          {
            borderColor: isDark ? 'rgba(239,83,80,0.45)' : 'rgba(211,47,47,0.4)',
            transform: [{ scale: cancelBtnAnim }],
            opacity: isCancelling ? 0.6 : 1,
          },
        ]}
        onPress={onCancelSearch}
        disabled={isCancelling}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        {isCancelling ? (
          <LoadingIcon icon="refresh" size={20} color={cancelColor} animation="spin" />
        ) : (
          <View style={styles.cancelBtnInner}>
            <MaterialIcons name="close" size={15} color={cancelColor} />
            <Text style={[styles.cancelBtnText, { color: cancelColor }]}>
              {t('client.homeOffers.buttons.cancelSearch')}
            </Text>
          </View>
        )}
      </AnimatedTouchableOpacity>
    </View>
  );
}
