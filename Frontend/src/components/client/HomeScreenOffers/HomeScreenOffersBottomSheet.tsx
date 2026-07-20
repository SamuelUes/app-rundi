import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Animated } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { OfferItem } from '../../../hooks/client/HomeScreenOffers/useRideOffers';
import type { TFunction } from 'i18next';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface HomeScreenOffersBottomSheetProps {
  loading: boolean;
  offers: OfferItem[];
  selectedDriverId: string | null;
  selectedOffer: OfferItem | undefined;
  isConfirming: boolean;
  isCancelling: boolean;
  confirmBtnAnim: Animated.Value;
  cancelBtnAnim: Animated.Value;
  primaryActionLabel: string;
  colors: any;
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
  selectedOffer,
  isConfirming,
  isCancelling,
  confirmBtnAnim,
  cancelBtnAnim,
  primaryActionLabel,
  colors,
  renderOffer,
  onShowDriverReviews,
  onConfirmSelectedDriver,
  onCancelSearch,
  styles,
  t,
}: HomeScreenOffersBottomSheetProps) {
  return (
    <View style={[styles.sheet, { backgroundColor: colors.card }]}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>{t('client.homeOffers.title')}</Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <LoadingIcon icon="refresh" size={32} color={colors.primary} animation="spin" />
        </View>
      ) : offers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('client.homeOffers.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(it) => it.driverId}
          renderItem={renderOffer}
          contentContainerStyle={{ paddingBottom: 12 }}
        />
      )}

      {selectedOffer ? (
        <TouchableOpacity
          style={styles.reviewsBtn}
          onPress={onShowDriverReviews}
          activeOpacity={0.85}
        >
          <Text style={styles.reviewsBtnText}>{t('client.homeOffers.buttons.seeDriverReviews')}</Text>
        </TouchableOpacity>
      ) : null}

      <AnimatedTouchableOpacity
        style={[
          styles.primaryBtn,
          {
            backgroundColor: selectedOffer ? '#D39838' : '#BDBDBD',
            transform: [{ scale: confirmBtnAnim }],
          },
        ]}
        onPress={onConfirmSelectedDriver}
        disabled={!selectedOffer || isConfirming}
        activeOpacity={0.85}
      >
        {isConfirming ? (
          <LoadingIcon icon="refresh" size={24} color="#FFFFFF" animation="spin" />
        ) : (
          <Text style={styles.primaryBtnText}>{primaryActionLabel}</Text>
        )}
      </AnimatedTouchableOpacity>

      <AnimatedTouchableOpacity
        style={[
          styles.cancelBtn,
          {
            backgroundColor: '#E53935',
            transform: [{ scale: cancelBtnAnim }],
            opacity: isCancelling ? 0.7 : 1,
          },
        ]}
        onPress={onCancelSearch}
        disabled={isCancelling}
        activeOpacity={0.85}
      >
        {isCancelling ? (
          <LoadingIcon icon="refresh" size={24} color="#FFFFFF" animation="spin" />
        ) : (
          <Text style={styles.cancelBtnText}>{t('client.homeOffers.buttons.cancelSearch')}</Text>
        )}
      </AnimatedTouchableOpacity>
    </View>
  );
}
