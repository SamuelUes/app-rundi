import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, TextInput, Platform, type ImageSourcePropType } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ServiceFeatureOption } from '../../../services/catalog/servicesService';
import { getFeatureAvailability, orderFeaturesBySelection } from '../../../utils/ride/rideFeatures';
type TrFunction = (path: string, options?: Record<string, any>) => string;

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface RideIconProps {
  name: IconName;
  size: number;
  color: string;
}

export function RideIcon({ name, size, color }: RideIconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}

interface VehicleOption {
  type: VehicleType;
  label: string;
  subtitle: string;
  icon: string;
  serviceCode: string;
}

interface VehicleEstimate {
  price: number | null;
}

interface DesignatedDriverEstimates {
  auto: VehicleEstimate;
  moto: VehicleEstimate;
}

interface DesignatedDriverEligibility {
  anyEligible: boolean;
  motoEligible: boolean;
}

interface SearchRideVehicleOptionsProps {
  vehicleOptions: VehicleOption[];
  vehicleType: VehicleType;
  serviceFeatures: ServiceFeatureOption[];
  featuresCatalogAvailable: boolean;
  selectedFeatureCodes: string[];
  calculationAt: Date;
  onToggleFeature: (code: string) => void;
  vehicleEstimates: Record<VehicleType, VehicleEstimate>;
  designatedDriverEstimates: DesignatedDriverEstimates;
  designatedDriverMode: DesignatedDriverMode;
  designatedDriverEligibility: DesignatedDriverEligibility;
  recommendedVehicle: VehicleType | null;
  calculatingRoute: boolean;
  calculatingPrice?: boolean;
  priceCalculationError?: boolean;
  estimatedDuration: number;
  capacityByVehicle: Record<VehicleType, number>;
  passengersByVehicle: Record<VehicleType, number>;
  surgeMultiplier?: number;
  requiresVehiclePhoto: boolean;
  hasVehiclePhotoSelection: boolean;
  uploadingPhoto: boolean;
  formatPriceValue: (value: number | null | undefined) => string;
  getPassengersForVehicle: (type: VehicleType) => number;
  canDecreasePassengers: (type: VehicleType) => boolean;
  canIncreasePassengers: (type: VehicleType) => boolean;
  onSelectVehicle: (type: VehicleType) => void;
  onSetDesignatedDriverMode: (mode: DesignatedDriverMode) => void;
  onUpdatePassengers: (type: VehicleType, delta: number) => void;
  priceSuggestion: string;
  onSetPriceSuggestion: (value: string) => void;
  onTakeVehiclePhoto: () => void;
  colors: any;
  styles: any;
  tr: TrFunction;
}

const FEATURE_ICONS: Record<string, IconName> = {
  night: 'moon',
  designated_driver_moto_discount: 'pricetag',
  senior: 'accessibility',
  premium: 'diamond',
  pet_friendly: 'paw',
};

const NIGHT_FEATURE_COLOR = '#6e44ff';
const NIGHT_FEATURE_SOFT = 'rgba(110, 68, 255, 0.14)';
const OFFER_STEP = 5;

export const VEHICLE_OPTION_IMAGES: Record<VehicleType, ImageSourcePropType> = {
  moto: require('../../../assets/images/searchImage/moto-services.png'),
  auto: require('../../../assets/images/searchImage/auto-services.png'),
  designated_driver: require('../../../assets/images/searchImage/designated-services.png'),
};

export function SearchRideVehicleOptions({
  vehicleOptions,
  vehicleType,
  serviceFeatures,
  featuresCatalogAvailable,
  selectedFeatureCodes,
  calculationAt,
  onToggleFeature,
  vehicleEstimates,
  designatedDriverEstimates,
  designatedDriverMode,
  designatedDriverEligibility,
  recommendedVehicle,
  calculatingRoute,
  calculatingPrice = false,
  priceCalculationError = false,
  estimatedDuration,
  capacityByVehicle,
  surgeMultiplier = 1,
  requiresVehiclePhoto,
  hasVehiclePhotoSelection,
  uploadingPhoto,
  formatPriceValue,
  getPassengersForVehicle,
  canDecreasePassengers,
  canIncreasePassengers,
  onSelectVehicle,
  onSetDesignatedDriverMode,
  onUpdatePassengers,
  priceSuggestion,
  onSetPriceSuggestion,
  onTakeVehiclePhoto,
  colors,
  styles,
  tr,
}: SearchRideVehicleOptionsProps) {
  const iconColor = colors?.primary || '#b38737';
  const metaColor = colors?.textSecondary || '#666666';
  const textColor = colors?.text || '#111111';
  const [offerEditing, setOfferEditing] = useState(false);
  const [offerDraft, setOfferDraft] = useState('');
  const [offerBelowNotice, setOfferBelowNotice] = useState(false);
  useEffect(() => {
    setOfferEditing(false);
    setOfferBelowNotice(false);
  }, [vehicleType, designatedDriverMode]);
  const etaLabel = calculatingRoute
    ? tr('labels.calculating')
    : estimatedDuration > 0
    ? tr('labels.etaValue', { minutes: estimatedDuration })
    : tr('labels.etaUnavailable');

  const featureTitle = (feature: ServiceFeatureOption) => {
    if (feature.code === 'night') return tr('features.night');
    if (feature.code === 'designated_driver_moto_discount') return tr('features.designatedDriverMotoDiscount');
    if (feature.code === 'senior') return tr('features.senior');
    if (feature.code === 'premium') return tr('features.premium');
    if (feature.code === 'pet_friendly') return tr('features.petFriendly');
    return feature.name;
  };


  return (
    <View style={styles.vehicleSection}>
      <View style={styles.vehicleOptionsList}>
        {vehicleOptions.map((option) => {
          const isSelected = vehicleType === option.type;
          const isDesignated = option.type === 'designated_driver';
          const estimate = isDesignated ? designatedDriverEstimates[designatedDriverMode] : vehicleEstimates[option.type];
          const priceLabel = isSelected && calculatingPrice
            ? tr('summary.updatingPrice')
            : isSelected && priceCalculationError
            ? tr('summary.priceUnavailable')
            : formatPriceValue(estimate?.price ?? null);
          const isRecommended = recommendedVehicle === option.type;
          const passengers = capacityByVehicle[option.type];
          const showMotoShortNotice =
            isDesignated &&
            isSelected &&
            designatedDriverMode === 'moto' &&
            !designatedDriverEligibility.motoEligible &&
            (designatedDriverEstimates.moto.price ?? 0) > 0;
          const showFeatureRail = isSelected && featuresCatalogAvailable && serviceFeatures.length > 0;
          const orderedFeatures = orderFeaturesBySelection(serviceFeatures, selectedFeatureCodes, calculationAt);
          const estimatedFare = Math.max(0, Math.round(estimate?.price ?? 0));
          const parsedSuggestion = Number(priceSuggestion);
          const clientOffer =
            priceSuggestion.trim().length > 0 && Number.isFinite(parsedSuggestion)
              ? Math.max(estimatedFare, Math.round(parsedSuggestion))
              : estimatedFare;
          const canLowerOffer = clientOffer > estimatedFare;
          const adjustClientOffer = (delta: number) => {
            const next = Math.max(estimatedFare, clientOffer + delta);
            setOfferBelowNotice(false);
            onSetPriceSuggestion(next <= estimatedFare ? '' : String(next));
          };
          const openOfferEdit = () => {
            setOfferDraft(String(clientOffer));
            setOfferBelowNotice(false);
            setOfferEditing(true);
          };
          const commitOfferDraft = () => {
            setOfferEditing(false);
            const parsed = Number(offerDraft.replace(',', '.'));
            if (!Number.isFinite(parsed) || parsed <= 0) return;
            const rounded = Math.round(parsed);
            if (rounded < estimatedFare) {
              setOfferBelowNotice(true);
              onSetPriceSuggestion('');
              return;
            }
            setOfferBelowNotice(false);
            onSetPriceSuggestion(rounded === estimatedFare ? '' : String(rounded));
          };

          return (
            <View key={option.type} style={[styles.vehicleOptionCard, isSelected && styles.vehicleOptionCardSelected]}>
              <View style={styles.vehicleOptionTopRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.vehicleOptionSelectArea}
                  onPress={() => onSelectVehicle(option.type)}
                  accessibilityLabel={tr('vehicle.selectOption', { label: option.label })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.vehicleOptionIconBubble, isSelected && styles.vehicleOptionIconBubbleSelected]}>
                    <Image
                      source={VEHICLE_OPTION_IMAGES[option.type]}
                      style={styles.vehicleOptionIconImage}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  </View>

                  <View style={styles.vehicleOptionTitleBlock}>
                    <View style={styles.vehicleOptionTitleRow}>
                      <Text style={styles.vehicleOptionTitle} numberOfLines={1}>
                        {option.label}
                      </Text>
                      {/* <View style={styles.vehicleOptionPassengerDisplay}>
                        <RideIcon name="person" size={13} color={iconColor} />
                        <Text style={styles.vehicleOptionPassengerValue}>{passengers}</Text>
                      </View> */}
                    </View>
                    <Text style={styles.vehicleOptionMeta} numberOfLines={1}>
                      {etaLabel}
                      {isRecommended ? ` · ${tr('vehicle.recommendedBadge')}` : ''}
                    </Text>
                    <Text style={styles.vehicleOptionSubtitle} numberOfLines={1}>
                      {option.subtitle}
                    </Text>
                  </View>
                </TouchableOpacity>

                {isSelected ? (
                  <View style={styles.vehicleOptionPassengerControlsCompact}>
                    <TouchableOpacity
                      style={[styles.vehicleOptionCounterBtnCompact, !canDecreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                      disabled={!canDecreasePassengers(option.type)}
                      onPress={() => onUpdatePassengers(option.type, -1)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <RideIcon name="remove" size={18} color={textColor} />
                    </TouchableOpacity>
                    <View style={styles.vehicleOptionPassengerCountCompact}>
                      <RideIcon name="person" size={14} color={textColor} />
                      <Text style={styles.vehicleOptionPassengerCountTextCompact}>{getPassengersForVehicle(option.type)}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.vehicleOptionCounterBtnCompact, !canIncreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                      disabled={!canIncreasePassengers(option.type)}
                      onPress={() => onUpdatePassengers(option.type, 1)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <RideIcon name="add" size={18} color={textColor} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.vehicleOptionPrice}>{priceLabel}</Text>
                )}
              </View>

              {isSelected ? (
                <View style={styles.vehicleOptionExpanded}>
                  {isDesignated ? (
                    <View style={styles.designatedDriverModeChips}>
                      {(['auto', 'moto'] as DesignatedDriverMode[]).map((mode) => {
                        const selected = designatedDriverMode === mode;
                        return (
                          <TouchableOpacity
                            key={mode}
                            style={[styles.designatedDriverModeChip, selected && styles.designatedDriverModeChipSelected]}
                            onPress={() => onSetDesignatedDriverMode(mode)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                          >
                            <RideIcon
                              name={mode === 'auto' ? 'car-sport-sharp' : 'bicycle-sharp'}
                              size={16}
                              color={selected ? textColor : metaColor}
                            />
                            <Text style={[styles.designatedDriverModeChipText, selected && styles.designatedDriverModeChipTextSelected]}>
                              {mode === 'auto' ? tr('vehicle.modeAuto') : tr('vehicle.modeMoto')}
                            </Text>
                            <Text style={styles.designatedDriverModeChipPrice}>
                              {formatPriceValue(designatedDriverEstimates[mode].price)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}

                  {showMotoShortNotice ? (
                    <View style={styles.designatedDriverModeInfoRow}>
                      <RideIcon name="information-circle" size={14} color={colors?.warning || '#ffa726'} />
                      <Text style={styles.designatedDriverModeInfoText}>{tr('vehicle.designatedMotoShortNotice')}</Text>
                    </View>
                  ) : null}

                  {estimatedFare > 0 && !calculatingPrice && !priceCalculationError ? (
                    <View style={styles.vehicleOptionOfferControls}>
                      <TouchableOpacity
                        style={[styles.vehicleOptionOfferCounterBtn, !canLowerOffer && styles.vehicleOptionCounterBtnDisabled]}
                        disabled={!canLowerOffer}
                        onPress={() => adjustClientOffer(-OFFER_STEP)}
                        hitSlop={8}
                        accessibilityRole="button"
                      >
                        <RideIcon name="remove" size={20} color={textColor} />
                      </TouchableOpacity>
                      <View style={styles.vehicleOptionOfferCenter}>
                        {clientOffer > estimatedFare ? (
                          <View style={styles.vehicleOptionSuggestRow}>
                            <Text style={styles.vehicleOptionSuggestLabel}>{tr('offer.suggesting')}</Text>
                            <Text style={styles.vehicleOptionEstimateLine}>{formatPriceValue(estimatedFare)}</Text>
                          </View>
                        ) : (
                          <Text style={styles.vehicleOptionEstimateTag}>{tr('offer.estimated')}</Text>
                        )}
                        {offerEditing ? (
                          <TextInput
                            style={styles.vehicleOptionOfferInput}
                            value={offerDraft}
                            onChangeText={setOfferDraft}
                            keyboardType={Platform.select({
                              ios: 'numbers-and-punctuation',
                              android: 'numeric',
                              default: 'numeric',
                            })}
                            autoFocus
                            selectTextOnFocus
                            onBlur={commitOfferDraft}
                            onSubmitEditing={commitOfferDraft}
                            returnKeyType="done"
                            accessibilityLabel={tr('offer.suggesting')}
                          />
                        ) : (
                          <TouchableOpacity onPress={openOfferEdit} accessibilityRole="button" accessibilityLabel={tr('offer.suggesting')}>
                            <Text style={styles.vehicleOptionOfferValue}>{formatPriceValue(clientOffer)}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.vehicleOptionOfferCounterBtn}
                        onPress={() => adjustClientOffer(OFFER_STEP)}
                        hitSlop={8}
                        accessibilityRole="button"
                      >
                        <RideIcon name="add" size={20} color={textColor} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.vehicleOptionOfferFallback}>{priceLabel}</Text>
                  )}

                  {offerBelowNotice ? (
                    <View style={styles.designatedDriverModeInfoRow}>
                      <RideIcon name="warning" size={14} color={colors?.warning || '#ffa726'} />
                      <Text style={styles.designatedDriverModeInfoText}>{tr('offer.belowEstimate')}</Text>
                    </View>
                  ) : null}

                  {showFeatureRail ? (
                    <View style={styles.vehicleFeaturesSection}>
                      <View style={styles.vehicleFeaturesHeading}>
                        <Text style={styles.vehicleFeaturesLabel}>{tr('features.sectionTitle')}</Text>
                        <Text style={styles.vehicleFeaturesHint}>{tr('features.scrollHint')}</Text>
                      </View>
                      <ScrollView
                        horizontal
                        nestedScrollEnabled
                        showsHorizontalScrollIndicator
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.vehicleFeatureRail}
                      >
                        {orderedFeatures.map((feature) => {
                          const availability = getFeatureAvailability(feature, calculationAt);
                          const conditionDisabled = availability !== 'eligible';
                          const selected = selectedFeatureCodes.includes(feature.code);
                          const isNight = feature.code === 'night';
                          const featureAccent = isNight ? NIGHT_FEATURE_COLOR : iconColor;
                          const clockHint =
                            feature.startTime && feature.endTime
                              ? tr('features.scheduleHint', { start: feature.startTime.slice(0, 5), end: feature.endTime.slice(0, 5) })
                              : null;
                          const statusHint = conditionDisabled
                            ? clockHint ?? tr('features.unavailable')
                            : clockHint;
                          const icon = FEATURE_ICONS[feature.code] ?? 'sparkles';

                          return (
                            <TouchableOpacity
                              key={feature.code}
                              style={[
                                styles.vehicleFeatureCard,
                                selected && styles.vehicleFeatureCardSelected,
                                selected && isNight && { backgroundColor: NIGHT_FEATURE_SOFT },
                                conditionDisabled && styles.vehicleFeatureCardDisabled,
                              ]}
                              activeOpacity={conditionDisabled ? 1 : 0.7}
                              disabled={conditionDisabled}
                              onPress={() => onToggleFeature(feature.code)}
                              accessibilityRole="button"
                              accessibilityState={{ selected, disabled: conditionDisabled }}
                              accessibilityLabel={tr('features.accessibilityOption', {
                                name: featureTitle(feature),
                                state: conditionDisabled
                                  ? tr('features.unavailable')
                                  : selected
                                  ? tr('features.selected')
                                  : tr('features.notSelected'),
                              })}
                            >
                              <RideIcon
                                name={icon}
                                size={18}
                                color={conditionDisabled ? metaColor : featureAccent}
                              />
                              <View style={styles.vehicleFeatureCardBody}>
                                <Text style={styles.vehicleFeatureCardTitle} numberOfLines={1}>
                                  {featureTitle(feature)}
                                </Text>
                                {statusHint ? (
                                  <Text style={styles.vehicleFeatureCardMeta} numberOfLines={1}>
                                    {statusHint}
                                  </Text>
                                ) : null}
                              </View>
                              {conditionDisabled ? null : (
                                <View
                                  style={[
                                    styles.vehicleFeatureToggle,
                                    selected && styles.vehicleFeatureToggleSelected,
                                    selected && isNight && { borderColor: NIGHT_FEATURE_COLOR, backgroundColor: NIGHT_FEATURE_COLOR },
                                  ]}
                                >
                                  {selected ? <RideIcon name="checkmark" size={12} color="#FFFFFF" /> : null}
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}

                  {isSelected && surgeMultiplier > 1 ? (
                    <View style={styles.vehicleDemandNotice}>
                      <RideIcon name="trending-up" size={14} color={colors?.warning || '#ffa726'} />
                      <Text style={styles.vehicleDemandNoticeText}>{tr('summary.highDemand')}</Text>
                    </View>
                  ) : null}

                  {requiresVehiclePhoto ? (
                    <TouchableOpacity
                      style={styles.photoButton}
                      onPress={onTakeVehiclePhoto}
                      disabled={uploadingPhoto}
                      accessibilityRole="button"
                    >
                      <RideIcon
                        name={hasVehiclePhotoSelection ? 'checkmark-circle' : 'camera'}
                        size={18}
                        color={hasVehiclePhotoSelection ? colors?.success || '#4caf50' : iconColor}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.photoButtonText}>
                          {uploadingPhoto
                            ? tr('photo.buttonProcessing')
                            : hasVehiclePhotoSelection
                            ? tr('photo.buttonChange')
                            : tr('photo.buttonDefault')}
                        </Text>
                        <Text style={styles.photoHint} numberOfLines={2}>{tr('photo.hint')}</Text>
                      </View>
                      <RideIcon name="chevron-forward" size={20} color={metaColor} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
