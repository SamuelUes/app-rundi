import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, Animated, Modal, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import StorageImage from '../../shared/StorageImage';
import type { OfferItem } from '../../../hooks/client/HomeScreenOffers/useRideOffers';
import type { TFunction } from 'i18next';

interface HomeScreenOffersOfferCardProps {
  item: OfferItem;
  selected: boolean;
  isDark: boolean;
  colors: any;
  arrivalLabel: string;
  etaLabel: string;
  plate: string;
  clientPriceLabel: string;
  driverPriceLabel: string;
  currentPriceLabel: string;
  currentPricePending: boolean;
  previousPriceLabel: string | null;
  offerCaption: string;
  hasDriverPrice: boolean;
  negotiationLabel: string | null;
  driverAcceptedMyPrice: boolean;
  confirming: boolean;
  displayName: string;
  vehicleType: string | null;
  ratingLabel: string | null;
  photoUri: string | null;
  isDesignatedRide: boolean;
  acceptedAnim: Animated.Value;
  onSelect: () => void;
  onMessageDriver: () => void;
  onOpenNegotiation: () => void;
  onConfirmDriver: () => void;
  styles: any;
  t: TFunction;
}

const TYPED_VEHICLE_LABELS = new Set(['sedan', 'suv', 'van', 'moto']);

const getInitials = (name?: string, fallback: string = 'C') => {
  if (!name) return fallback;
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

export function HomeScreenOffersOfferCard({
  item,
  selected,
  isDark,
  colors,
  arrivalLabel,
  etaLabel,
  plate,
  clientPriceLabel,
  driverPriceLabel,
  currentPriceLabel,
  currentPricePending,
  previousPriceLabel,
  offerCaption,
  hasDriverPrice,
  negotiationLabel,
  driverAcceptedMyPrice,
  confirming,
  displayName,
  vehicleType,
  ratingLabel,
  photoUri,
  isDesignatedRide,
  acceptedAnim,
  onSelect,
  onMessageDriver,
  onOpenNegotiation,
  onConfirmDriver,
  styles,
  t,
}: HomeScreenOffersOfferCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [arrivalPhotoOpen, setArrivalPhotoOpen] = useState(false);
  const [arrivalPhotoFailed, setArrivalPhotoFailed] = useState(false);
  const [modalPhotoFailed, setModalPhotoFailed] = useState(false);
  const [modalPhotoLoading, setModalPhotoLoading] = useState(true);
  const [followerPhotoFailed, setFollowerPhotoFailed] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUri]);
  useEffect(() => {
    setArrivalPhotoFailed(false);
    setModalPhotoFailed(false);
    setModalPhotoLoading(true);
  }, [item.arrivalVehiclePhoto]);
  useEffect(() => {
    setFollowerPhotoFailed(false);
  }, [item.crewFollower?.photoURL]);

  const isAccepted = item.status === 'accepted';
  const designatedPalette = isDark
    ? { card: '#252421', border: '#494237', selectedBorder: '#C49A50', surface: '#302E29', accent: '#E8C47F', muted: '#BAB3A7', modal: '#262522', image: '#181817' }
    : { card: '#FFFCF6', border: '#EADFCB', selectedBorder: '#B38737', surface: '#F5F0E6', accent: '#805C1F', muted: '#71695D', modal: '#FFFCF6', image: '#EDE8DE' };

  const vehicleLabel = vehicleType
    ? t(
        `shared.profile.vehicle.typeLabels.${TYPED_VEHICLE_LABELS.has(vehicleType) ? vehicleType : 'other'}`,
        { type: vehicleType },
      )
    : null;

  const driverDetails = [arrivalLabel, vehicleLabel, plate !== '—' ? plate : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.offerCard,
        {
          backgroundColor: isDesignatedRide
            ? designatedPalette.card
            : selected
            ? isDark
              ? 'rgba(33,33,33,0.9)'
              : '#FFF6E6'
            : isDark
              ? '#1F1F1F'
              : '#F5F5F5',
          borderColor: isDesignatedRide
            ? selected ? designatedPalette.selectedBorder : designatedPalette.border
            : selected
            ? isDark
              ? 'rgba(255,255,255,0.12)'
              : 'rgba(227, 197, 146, 0.1)'
            : isDark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.0)',
        },
        pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${arrivalLabel}, ${driverPriceLabel}`}
    >
      {isDesignatedRide ? (
        <View style={designatedStyles.heading}>
          <View style={[designatedStyles.serviceIcon, { backgroundColor: designatedPalette.surface }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={designatedPalette.accent} />
          </View>
          <Text style={[designatedStyles.serviceLabel, { color: designatedPalette.accent }]}>
            {t('client.homeOffers.list.designatedOffer')}
          </Text>
        </View>
      ) : null}
      <View style={[styles.offerPriceHeader, isDesignatedRide && { backgroundColor: designatedPalette.surface }]}>
        <View style={styles.offerPriceHeading}>
          <Text style={[styles.offerPriceEyebrow, { color: colors.textSecondary }]}>
            {offerCaption}
          </Text>
          <View style={styles.offerPriceLine}>
            <Text
              style={[
                currentPricePending ? styles.offerPricePending : styles.offerPriceValue,
                { color: currentPricePending ? colors.textSecondary : colors.primary },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {currentPriceLabel}
            </Text>
            {previousPriceLabel ? (
              <Text
                style={[styles.offerPreviousPrice, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {previousPriceLabel}
              </Text>
            ) : null}
          </View>
        </View>
        <View
          style={[
            styles.offerEtaBadge,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)' },
          ]}
        >
          <Ionicons name="time-outline" size={15} color={colors.primary} />
          <Text style={[styles.offerEtaText, { color: colors.text }]}>
            {etaLabel}
          </Text>
        </View>
      </View>

      <View style={styles.offerTopRow}>
        <View
          style={[
            styles.offerAvatar,
            { backgroundColor: isDark ? 'rgba(179,135,55,0.30)' : '#F1E4C8' },
          ]}
        >
          {photoUri && !photoFailed ? (
            <StorageImage
              uri={photoUri}
              style={styles.offerAvatarPhoto}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <Text style={[styles.offerAvatarInitials, { color: colors.primary }]}>
              {getInitials(displayName, t('client.homeOffers.list.initialFallback', 'D'))}
            </Text>
          )}
        </View>

        <View style={styles.offerInfo}>
          <View style={styles.offerDriverHeading}>
            <Text style={[styles.offerName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {ratingLabel ? (
              <View style={styles.offerRatingBadge}>
                <Ionicons name="star" size={12} color={colors.primary} />
                <Text style={[styles.offerRatingText, { color: colors.text }]}>
                  {ratingLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.offerMetaText, { color: colors.textSecondary }]} numberOfLines={2}>
            {driverDetails}
          </Text>
          {isAccepted || negotiationLabel ? (
            <View style={styles.offerStatusRow}>
              <Ionicons
                name={isAccepted ? 'checkmark-circle' : 'chatbubble-ellipses'}
                size={12}
                color={isAccepted ? (isDark ? '#A5D6A7' : '#2E7D32') : colors.textTertiary}
              />
              <Text
                style={[
                  styles.offerStatusText,
                  { color: isAccepted ? (isDark ? '#A5D6A7' : '#2E7D32') : colors.textTertiary },
                ]}
                numberOfLines={1}
              >
                {isAccepted ? t('client.homeOffers.list.acceptedSecondary') : negotiationLabel}
              </Text>
            </View>
          ) : null}
        </View>

      </View>

      {isDesignatedRide ? (
        <View style={[designatedStyles.crewPanel, { borderColor: designatedPalette.border, backgroundColor: designatedPalette.surface }]}>
          <View style={designatedStyles.crewHeading}>
            <Ionicons name="people-outline" size={16} color={designatedPalette.accent} />
            <Text style={[designatedStyles.headingText, { color: designatedPalette.accent }]}>
              {t('client.homeOffers.list.crewTitle')}
            </Text>
          </View>
          {item.crewFollower ? (
            <View style={designatedStyles.crewMember}>
              {item.crewFollower.photoURL && !followerPhotoFailed ? (
                <StorageImage
                  uri={item.crewFollower.photoURL}
                  style={designatedStyles.crewAvatar}
                  contentFit="cover"
                  onError={() => setFollowerPhotoFailed(true)}
                />
              ) : (
                <View style={[designatedStyles.crewAvatar, designatedStyles.crewAvatarFallback, { backgroundColor: isDark ? '#51432C' : '#EADBC0' }]}>
                  <Text style={[designatedStyles.crewInitials, { color: colors.primary }]}>
                    {getInitials(item.crewFollower.name)}
                  </Text>
                </View>
              )}
              <View style={designatedStyles.vehicleText}>
                <Text style={[designatedStyles.vehicleTitle, { color: colors.text }]} numberOfLines={1}>
                  {item.crewFollower.name || t('client.homeOffers.list.crewColleague')}
                </Text>
                <Text style={[designatedStyles.vehicleHint, { color: colors.textSecondary }]}>
                  {t('client.homeOffers.list.crewColleague')}
                </Text>
              </View>
              {typeof item.crewFollower.rating === 'number' && item.crewFollower.rating > 0 ? (
                <Text style={[designatedStyles.crewRating, { color: colors.text }]}>
                  {'★ '}{item.crewFollower.rating.toFixed(1)}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={[designatedStyles.vehicleHint, { color: designatedPalette.muted }]}>
              {t('client.homeOffers.list.crewUnavailable')}
            </Text>
          )}
          <Text style={[designatedStyles.crewNote, { color: designatedPalette.muted }]}>
            {t('client.homeOffers.list.crewNote')}
          </Text>
        </View>
      ) : null}

      {isDesignatedRide ? (
        <Pressable
          style={({ pressed }) => [designatedStyles.vehicleRow, { backgroundColor: designatedPalette.surface, borderColor: designatedPalette.border }, pressed && { opacity: 0.8 }]}
          disabled={!item.arrivalVehiclePhoto || arrivalPhotoFailed}
          onPress={(event) => {
            event.stopPropagation();
            setArrivalPhotoOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('client.homeOffers.list.arrivalVehiclePhoto')}
        >
          {item.arrivalVehiclePhoto && !arrivalPhotoFailed ? (
            <StorageImage
              uri={item.arrivalVehiclePhoto}
              style={designatedStyles.vehicleThumbnail}
              contentFit="cover"
              onError={() => setArrivalPhotoFailed(true)}
            />
          ) : (
            <View style={[designatedStyles.vehiclePlaceholder, { backgroundColor: isDark ? '#403A30' : '#E8DFCF' }]}>
              <Ionicons name="car-outline" size={23} color={designatedPalette.accent} />
            </View>
          )}
          <View style={designatedStyles.vehicleText}>
            <Text style={[designatedStyles.vehicleTitle, { color: colors.text }]}>
              {t('client.homeOffers.list.arrivalVehiclePhoto')}
            </Text>
            <Text style={[designatedStyles.vehicleHint, { color: designatedPalette.muted }]}>
              {item.arrivalVehiclePhoto && !arrivalPhotoFailed
                ? t('client.homeOffers.list.viewArrivalVehiclePhoto')
                : t('client.homeOffers.list.arrivalVehiclePhotoMissing')}
            </Text>
          </View>
          {item.arrivalVehiclePhoto && !arrivalPhotoFailed ? (
            <View style={[designatedStyles.expandIcon, { backgroundColor: designatedPalette.card }]}>
              <Ionicons name="expand-outline" size={17} color={designatedPalette.accent} />
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <Modal visible={arrivalPhotoOpen} transparent animationType="fade" onRequestClose={() => setArrivalPhotoOpen(false)}>
        <View style={designatedStyles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setArrivalPhotoOpen(false)} accessibilityElementsHidden importantForAccessibility="no" />
          <View accessibilityViewIsModal style={[designatedStyles.modalContent, { backgroundColor: designatedPalette.modal, borderColor: designatedPalette.border }]}>
            <View style={designatedStyles.modalHeader}>
              <View style={designatedStyles.modalHeading}>
                <Text style={[designatedStyles.modalEyebrow, { color: designatedPalette.accent }]}>
                  {t('client.homeOffers.list.designatedOffer')}
                </Text>
                <Text style={[designatedStyles.modalTitle, { color: colors.text }]}>
                  {t('client.homeOffers.list.arrivalVehiclePhoto')}
                </Text>
              </View>
              <Pressable
                onPress={() => setArrivalPhotoOpen(false)}
                style={({ pressed }) => [designatedStyles.closeButton, { backgroundColor: designatedPalette.surface }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={t('common.actions.close')}
                testID="arrival-photo-close"
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <View style={[designatedStyles.modalImageFrame, { height: Math.min(420, Math.max(180, windowHeight * 0.42)), backgroundColor: designatedPalette.image }]}>
              {modalPhotoFailed || !item.arrivalVehiclePhoto ? (
                <View style={designatedStyles.modalPlaceholder}>
                  <Ionicons name="image-outline" size={30} color={designatedPalette.muted} />
                  <Text style={[designatedStyles.modalPlaceholderText, { color: designatedPalette.muted }]}>
                    {t('client.homeOffers.list.arrivalVehiclePhotoMissing')}
                  </Text>
                </View>
              ) : (
                <>
                  <StorageImage
                    uri={item.arrivalVehiclePhoto}
                    style={designatedStyles.modalImage}
                    contentFit="contain"
                    onLoad={() => setModalPhotoLoading(false)}
                    onError={() => { setModalPhotoLoading(false); setModalPhotoFailed(true); }}
                  />
                  {modalPhotoLoading ? (
                    <View style={designatedStyles.loadingOverlay} pointerEvents="none">
                      <ActivityIndicator color={designatedPalette.accent} />
                    </View>
                  ) : null}
                </>
              )}
            </View>
            <View style={designatedStyles.modalFooter}>
              <View style={[designatedStyles.footerIcon, { backgroundColor: designatedPalette.surface }]}>
                <Ionicons name="car-outline" size={20} color={designatedPalette.accent} />
              </View>
              <View style={designatedStyles.vehicleText}>
                <Text style={[designatedStyles.footerTitle, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
                <Text style={[designatedStyles.vehicleHint, { color: designatedPalette.muted }]} numberOfLines={2}>
                  {[vehicleLabel, plate !== '—' ? plate : null].filter(Boolean).join(' · ') || t('client.homeOffers.list.arrivalVehiclePhoto')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {selected ? (
        <>
          {/* <View
            style={[
              styles.pricePanel,
              { backgroundColor: 'transparent' },
            ]}
          >
            <View style={styles.priceItemRow}>
              <Text style={[styles.priceItemLabel, { color: colors.textSecondary }]}>
                {t('client.homeOffers.list.driverPriceLabel')}
              </Text>
              <Text
                style={[
                  hasDriverPrice ? styles.priceItemValueHero : styles.priceItemValue,
                  { color: hasDriverPrice ? colors.primary : colors.textSecondary },
                ]}
              >
                {driverPriceLabel}
              </Text>
            </View>
            <View
              style={[
                styles.priceItemDivider,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5D5B8' },
              ]}
            />
            <View style={styles.priceItemRow}>
              <Text style={[styles.priceItemLabel, { color: colors.textSecondary }]}>
                {t('client.homeOffers.list.clientPriceLabel')}
              </Text>
              <Text style={[styles.priceItemValue, { color: colors.text }]}>
                {clientPriceLabel}
              </Text>
            </View>
          </View> */}

          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              onPress={onMessageDriver}
              style={[
                styles.iconActionBtn,
                {
                  backgroundColor: isDark
                    ? 'rgba(81, 79, 189, 0.22)'
                    : 'rgba(107, 105, 218, 0.80)',
                },
              ]}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('client.homeOffers.a11y.messageDriver')}
            >
              <Ionicons
                name="chatbubble"
                size={19}
                color={
                  isDark
                    ? colors.textSecondary
                    : 'rgba(255, 255, 255, 0.8)'
                }
              />
            </TouchableOpacity>

            {isAccepted ? (
              <Animated.View
                style={[
                  styles.acceptedPill,
                  {
                    backgroundColor: isDark ? 'rgba(76,175,80,0.18)' : 'rgba(76,175,80,0.10)',
                    borderColor: isDark ? 'rgba(129,199,132,0.5)' : 'rgba(76,175,80,0.28)',
                    transform: [
                      {
                        scale: acceptedAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.85, 1],
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
                <View
                  style={[
                    styles.acceptedIconWrap,
                    {
                      backgroundColor: isDark
                        ? 'rgba(129,199,132,0.22)'
                        : 'rgba(76,175,80,0.16)',
                    },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={isDark ? '#A5D6A7' : '#2E7D32'}
                  />
                </View>
                <Text
                  style={[
                    styles.acceptedPillText,
                    { color: isDark ? '#A5D6A7' : '#2E7D32' },
                  ]}
                >
                  {t('client.homeOffers.list.acceptedPrimary')}
                </Text>
              </Animated.View>
            ) : driverAcceptedMyPrice ? (
              <TouchableOpacity
                onPress={onConfirmDriver}
                style={[
                  styles.negotiatePill,
                  {
                    backgroundColor: isDark ? 'rgba(76,175,80,0.18)' : 'rgba(76,175,80,0.14)',
                    borderColor: isDark ? 'rgba(129,199,132,0.5)' : 'rgba(76,175,80,0.35)',
                  },
                ]}
                activeOpacity={0.85}
                disabled={confirming}
                accessibilityRole="button"
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={isDark ? '#A5D6A7' : '#2E7D32'}
                />
                <Text
                  style={[
                    styles.negotiateText,
                    { color: isDark ? '#A5D6A7' : '#2E7D32' },
                  ]}
                >
                  {t('client.homeOffers.primaryAction.confirmDriver')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={onOpenNegotiation}
                style={[
                  styles.negotiatePill,
                  {
                    backgroundColor: isDark
                      ? 'rgba(212,175,55,0.12)'
                      : 'rgba(179,135,55,0.20)',
                    borderColor: isDark ? 'rgba(212,175,55,0.36)' : 'rgba(179,135,55,0.38)',
                  },
                ]}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Ionicons
                  name="swap-horizontal"
                  size={19}
                  color={isDark ? '#FFD666' : '#8A5800'}
                />
                <Text
                  style={[
                    styles.negotiateText,
                    { color: isDark ? '#FFD666' : '#8A5800' },
                  ]}
                >
                  {t('client.homeOffers.negotiation.pill')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

const designatedStyles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  serviceIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  serviceLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2, flexShrink: 1 },
  headingText: { fontSize: 12, fontWeight: '700' },
  crewPanel: { borderWidth: 0.1, borderRadius: 14, padding: 12, marginTop: 12 },
  crewHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crewMember: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9 },
  crewAvatar: { width: 38, height: 38, borderRadius: 19 },
  crewAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  crewInitials: { fontSize: 13, fontWeight: '700' },
  crewRating: { fontSize: 12, fontWeight: '700' },
  crewNote: { fontSize: 11, lineHeight: 15, marginTop: 8 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderWidth: 0.1, borderRadius: 14, marginTop: 8 },
  vehicleThumbnail: { width: 64, height: 54, borderRadius: 10 },
  vehiclePlaceholder: { width: 64, height: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expandIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  vehicleText: { flex: 1, minWidth: 0 },
  vehicleTitle: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  vehicleHint: { fontSize: 12, marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10,10,10,0.78)', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  modalContent: { width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 24, borderWidth: 0.1, padding: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  modalHeading: { flex: 1, minWidth: 0 },
  modalEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  modalTitle: { fontSize: 19, lineHeight: 24, fontWeight: '800' },
  closeButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalImageFrame: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  modalImage: { width: '100%', height: '100%' },
  loadingOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  modalPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  modalPlaceholderText: { fontSize: 13, textAlign: 'center' },
  modalFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14 },
  footerIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  footerTitle: { fontSize: 14, fontWeight: '700' },
});
