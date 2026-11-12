import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import alertService from '../../../services/notification/alertService';
import { useTranslation } from 'react-i18next';

interface Driver {
  id?: string;
  name?: string;
  rating?: number;
  phone?: string;
}

const normalizePriceValue = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d,.-]/g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

interface PriceNegotiationModalProps {
  visible: boolean;
  onClose: () => void;
  driver?: Driver | null;
  estimatedPrice?: number;
  dynamicMinimumFare?: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number;
  onAcceptDriverOffer: () => void;
  onSendCounterOffer: (price: number) => void;
  onAcceptAndStartRide: () => void;
  negotiationStatus?: string;
  acceptedClientPrice?: boolean;
}

export default function PriceNegotiationModal({
  visible,
  onClose,
  driver = null,
  estimatedPrice = 0,
  dynamicMinimumFare = 0,
  clientSuggestedPrice = 0,
  driverOfferedPrice = 0,
  onAcceptDriverOffer,
  onSendCounterOffer,
  onAcceptAndStartRide,
  negotiationStatus = '',
  acceptedClientPrice = false,
}: PriceNegotiationModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [counterOffer, setCounterOffer] = useState('');

  const numericEstimatedPrice = typeof estimatedPrice === 'string'
    ? parseFloat(estimatedPrice)
    : estimatedPrice;

  const parsedClientSuggestedPrice = normalizePriceValue(clientSuggestedPrice);
  const parsedDriverOfferedPrice = normalizePriceValue(driverOfferedPrice);

  const fallbackBasePrice =
    (Number.isFinite(numericEstimatedPrice) && numericEstimatedPrice > 0 ? numericEstimatedPrice : null) ??
    parsedClientSuggestedPrice ??
    parsedDriverOfferedPrice ??
    0;

  const effectiveEstimatedPrice = fallbackBasePrice > 0 ? fallbackBasePrice : 0;

  // Límites relativos a la cotización; solo se conserva el límite técnico de C$100,000.
  const computedMin = Math.round(effectiveEstimatedPrice * 0.6667 * 100) / 100;
  const computedMax = Math.round(effectiveEstimatedPrice * 1.3333 * 100) / 100;
  const MAX_NEGOTIATED_PRICE = 100000;
  const surgeFloor = Number.isFinite(dynamicMinimumFare) ? dynamicMinimumFare : 0;
  const MIN_PRICE = Math.min(MAX_NEGOTIATED_PRICE, Math.max(50, computedMin, surgeFloor));
  const MAX_PRICE = Math.max(
    MIN_PRICE,
    Math.min(MAX_NEGOTIATED_PRICE, computedMax),
  );

  const handleSendCounterOffer = () => {
    const price = parseFloat(counterOffer);

    if (isNaN(price)) {
      alertService.showErrorAlert(
        t('common.components.priceNegotiationModal.alerts.invalidInput'),
      );
      return;
    }

    if (price < MIN_PRICE) {
      alertService.showErrorAlert(
        t('common.components.priceNegotiationModal.alerts.minPrice', { amount: MIN_PRICE }),
      );
      return;
    }

    if (price > MAX_PRICE) {
      alertService.showErrorAlert(
        t('common.components.priceNegotiationModal.alerts.maxPrice', { amount: MAX_PRICE }),
      );
      return;
    }

    onSendCounterOffer(price);
    setCounterOffer('');
    // Cerrar el modal después de enviar la contraoferta
    onClose();
  };

  // Función para validar y formatear el input
  const handleCounterOfferChange = (text: string) => {
    // Solo permitir números y un punto decimal
    const numericText = text.replace(/[^0-9.]/g, '');
    // Limitar a un solo punto decimal
    const parts = numericText.split('.');
    if (parts.length > 2) {
      setCounterOffer(parts[0] + '.' + parts[1]);
    } else {
      setCounterOffer(numericText);
    }
  };

  const driverAcceptedClientPrice = acceptedClientPrice || negotiationStatus === 'driver_accepted';
  const driverMadeCounterOffer = driverOfferedPrice > 0 && !acceptedClientPrice;

  const textColor = colors?.text || '#000';
  const textSecondaryColor = colors?.textSecondary || '#666';
  const textTertiaryColor = colors?.textTertiary || '#999';
  const cardColor = colors?.card || '#FFF';
  const primaryColor = colors?.primary || '#b38737';
  const successColor = colors?.success || '#4CAF50';
  const warningColor = colors?.warning || '#FFA726';

  const insetBg = isDark ? 'rgba(255,255,255,0.05)' : '#F5F5F5';
  const insetBorder = isDark ? 'rgba(255,255,255,0.09)' : '#E7E7E7';
  const goldTint = isDark ? 'rgba(212,175,55,0.16)' : 'rgba(179,135,55,0.10)';
  const goldBorder = isDark ? 'rgba(212,175,55,0.38)' : 'rgba(179,135,55,0.3)';
  const successSoft = isDark ? 'rgba(129,199,132,0.16)' : 'rgba(76,175,80,0.10)';
  const successBorder = isDark ? 'rgba(129,199,132,0.4)' : 'rgba(76,175,80,0.3)';
  const suggestionInk = isDark ? '#7DE6AD' : '#268C5C';
  const priceCardBg = isDark ? 'rgba(33,33,33,0.9)' : '#FFF6E6';
  const priceCardBorder = isDark ? 'rgba(255,255,255,0.06)' : '#E3C592';
  const dividerWarm = isDark ? 'rgba(255,255,255,0.08)' : '#E5D5B8';
  const iconWrapTint = isDark ? 'rgba(179,135,55,0.16)' : 'rgba(179,135,55,0.10)';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel={t('common.actions.close')}
          />
          <View
            style={[
              styles.container,
              {
                backgroundColor: cardColor,
                borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View
              style={[
                styles.handle,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)' },
              ]}
            />

            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View
                  style={[
                    styles.titleIconWrap,
                    { backgroundColor: iconWrapTint },
                  ]}
                >
                  <Ionicons name="swap-horizontal" size={18} color={primaryColor} />
                </View>
                <Text style={[styles.title, { color: textColor }]}>
                  {t('common.components.priceNegotiationModal.header.title')}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
                  },
                ]}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('common.actions.close')}
              >
                <Ionicons name="close" size={17} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Información del Conductor */}
              {driver && driver.name ? (
                <View
                  style={[
                    styles.driverInfo,
                    { backgroundColor: insetBg, borderColor: insetBorder },
                  ]}
                >
                  <View style={[styles.driverIconWrap, { backgroundColor: iconWrapTint }]}>
                    <Ionicons name="car-sport-sharp" size={18} color={primaryColor} />
                  </View>
                  <Text
                    style={[styles.driverName, { color: textColor }]}
                    numberOfLines={1}
                  >
                    {t('common.components.priceNegotiationModal.driverInfo.label', {
                      name: String(driver.name),
                    })}
                  </Text>
                  {driver.rating && driver.rating > 0 ? (
                    <View
                      style={[
                        styles.ratingChip,
                        { backgroundColor: iconWrapTint, borderColor: goldBorder },
                      ]}
                    >
                      <Ionicons name="star" size={11} color={primaryColor} />
                      <Text style={[styles.ratingChipText, { color: primaryColor }]}>
                        {t('common.components.priceNegotiationModal.driverInfo.rating', {
                          value: driver.rating.toFixed(1),
                        })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Resumen de Precios */}
              <View
                style={[
                  styles.pricesSummary,
                  { backgroundColor: priceCardBg, borderColor: priceCardBorder },
                ]}
              >
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: textSecondaryColor }]}>
                    {t('common.components.priceNegotiationModal.summary.estimatedLabel')}
                  </Text>
                  <Text style={[styles.priceValue, { color: textColor }]}>
                    {'C$' + effectiveEstimatedPrice.toFixed(2)}
                  </Text>
                </View>
                {parsedClientSuggestedPrice && parsedClientSuggestedPrice > 0 ? (
                  <>
                    <View style={[styles.priceDivider, { backgroundColor: dividerWarm }]} />
                    <View style={styles.priceRow}>
                      <Text style={[styles.priceLabel, { color: textSecondaryColor }]}>
                        {t('common.components.priceNegotiationModal.summary.clientLabel')}
                      </Text>
                      <Text style={[styles.priceValue, { color: textColor }]}>
                        {'C$' + parsedClientSuggestedPrice.toFixed(2)}
                      </Text>
                    </View>
                  </>
                ) : null}
                {parsedDriverOfferedPrice && parsedDriverOfferedPrice > 0 ? (
                  <>
                    <View style={[styles.priceDivider, { backgroundColor: dividerWarm }]} />
                    <View style={[styles.priceRow, styles.priceRowLast]}>
                      <Text style={[styles.priceLabel, { color: textSecondaryColor }]}>
                        {t('common.components.priceNegotiationModal.summary.driverLabel')}
                      </Text>
                      <Text style={[styles.priceValueHero, { color: primaryColor }]}>
                        {'C$' + parsedDriverOfferedPrice.toFixed(2)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Estado de Negociación */}
              {driverAcceptedClientPrice ? (
                // Conductor aceptó el precio del cliente
                <View style={styles.stateBlock}>
                  <View
                    style={[
                      styles.stateIconWrap,
                      { backgroundColor: successSoft, borderColor: successBorder },
                    ]}
                  >
                    <Ionicons name="checkmark-circle" size={32} color={successColor} />
                  </View>
                  <Text style={[styles.stateTitle, { color: textColor }]}>
                    {t('common.components.priceNegotiationModal.state.accepted.title')}
                  </Text>
                  <Text style={[styles.stateSubtitle, { color: textSecondaryColor }]}>
                    {t('common.components.priceNegotiationModal.state.accepted.subtitle', {
                      amount: clientSuggestedPrice || 0,
                    })}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      { backgroundColor: primaryColor },
                    ]}
                    onPress={onAcceptAndStartRide}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <Ionicons name="play" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>
                      {t('common.components.priceNegotiationModal.state.accepted.button')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : driverMadeCounterOffer ? (
                // Conductor hizo contraoferta
                <View style={styles.stateBlock}>
                  <View
                    style={[
                      styles.offerBanner,
                      { backgroundColor: goldTint, borderColor: goldBorder },
                    ]}
                  >
                    <View
                      style={[
                        styles.bannerIconWrap,
                        { backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : 'rgba(179,135,55,0.16)' },
                      ]}
                    >
                      <Ionicons name="pricetag" size={18} color={primaryColor} />
                    </View>
                    <View style={styles.bannerTextWrap}>
                      <Text style={[styles.offerBannerText, { color: textColor }]}>
                        {t('common.components.priceNegotiationModal.state.counterOffer.title', {
                          amount: driverOfferedPrice || 0,
                        })}
                      </Text>
                      <Text style={[styles.bannerSubText, { color: textSecondaryColor }]}>
                        {t('common.components.priceNegotiationModal.state.counterOffer.subtitle')}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: warningColor }]}
                    onPress={onAcceptDriverOffer}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <Ionicons name="checkmark" size={18} color="#0D0D0D" />
                    <Text style={[styles.primaryButtonText, { color: '#0D0D0D' }]}>
                      {t('common.components.priceNegotiationModal.actions.acceptOffer', {
                        amount: driverOfferedPrice || 0,
                      })}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: insetBorder }]} />
                    <Text style={[styles.dividerLabel, { color: textTertiaryColor }]}>
                      {t('common.components.priceNegotiationModal.counterOffer.label')}
                    </Text>
                    <View style={[styles.dividerLine, { backgroundColor: insetBorder }]} />
                  </View>

                  <View
                    style={[
                      styles.priceRangeContainer,
                      { backgroundColor: insetBg, borderColor: goldBorder },
                    ]}
                  >
                    <Text style={[styles.priceRangeHint, { color: textTertiaryColor }]}>
                      {t('common.components.priceNegotiationModal.counterOffer.rangeHint')}
                    </Text>
                    <View style={styles.priceRangeValues}>
                      <View style={styles.priceRangeItem}>
                        <Text style={[styles.priceRangeLabel, { color: textSecondaryColor }]}>
                          {t('common.components.priceNegotiationModal.counterOffer.minLabel')}
                        </Text>
                        <Text style={[styles.priceRangeValue, { color: suggestionInk }]}>
                          C${MIN_PRICE.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={[styles.priceRangeDash, { color: textTertiaryColor }]}>
                        —
                      </Text>
                      <View style={styles.priceRangeItem}>
                        <Text style={[styles.priceRangeLabel, { color: textSecondaryColor }]}>
                          {t('common.components.priceNegotiationModal.counterOffer.maxLabel')}
                        </Text>
                        <Text style={[styles.priceRangeValue, { color: warningColor }]}>
                          C${MAX_PRICE.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.counterOfferInput}>
                    <View
                      style={[
                        styles.inputWrap,
                        { backgroundColor: insetBg, borderColor: insetBorder },
                      ]}
                    >
                      <Text style={[styles.currencyPrefix, { color: textTertiaryColor }]}>
                        C$
                      </Text>
                      <TextInput
                        style={[styles.input, { color: textColor }]}
                        value={counterOffer}
                        onChangeText={handleCounterOfferChange}
                        keyboardType="decimal-pad"
                        placeholder={t('common.components.priceNegotiationModal.counterOffer.placeholder', {
                          value: Math.round((MIN_PRICE + MAX_PRICE) / 2),
                        })}
                        placeholderTextColor={textTertiaryColor}
                      />
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.sendButton,
                        { backgroundColor: primaryColor },
                      ]}
                      onPress={handleSendCounterOffer}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                    >
                      <Ionicons name="send" size={16} color="#FFFFFF" />
                      <Text style={styles.sendButtonText}>
                        {t('common.components.priceNegotiationModal.counterOffer.send')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // Esperando respuesta del conductor
                <View style={styles.stateBlock}>
                  <View
                    style={[
                      styles.stateIconWrap,
                      { backgroundColor: goldTint, borderColor: goldBorder },
                    ]}
                  >
                    <Ionicons name="time" size={32} color={primaryColor} />
                  </View>
                  <Text style={[styles.stateSubtitle, { color: textSecondaryColor }]}>
                    {t('common.components.priceNegotiationModal.state.waiting.message')}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 2.5,
    marginTop: 8,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  titleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 0.6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  driverIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ratingChipText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  pricesSummary: {
    borderRadius: 16,
    borderWidth: 0.1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  priceDivider: {
    height: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  priceRowLast: {},
  priceLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  priceValueHero: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  stateBlock: {
    marginTop: 14,
    alignItems: 'center',
  },
  stateIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 14,
    lineHeight: 18,
  },
  offerBanner: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 0.1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
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
  offerBannerText: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bannerSubText: {
    fontSize: 13,
    fontWeight: '500',
  },
  primaryButton: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  priceRangeContainer: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 0.1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  priceRangeHint: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  priceRangeValues: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  priceRangeItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceRangeLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  priceRangeValue: {
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  priceRangeDash: {
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  counterOfferInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginTop: 12,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '800',
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    paddingVertical: 0,
    fontVariant: ['tabular-nums'],
  },
  sendButton: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
