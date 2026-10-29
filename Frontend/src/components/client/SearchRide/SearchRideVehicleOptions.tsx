import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, type ImageSourcePropType } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ServiceFeatureOption } from '../../../services/servicesService';
import { getFeatureAvailability, orderFeaturesBySelection } from '../../../utils/rideFeatures';
type TrFunction = (path: string, options?: Record<string, any>) => string;

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';
type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

export type RideIconSet = 'material' | 'ionicons';
// Icon family used across the ride-search panel. Switch to 'material' to revert.
export const RIDE_ICON_SET: RideIconSet = 'ionicons';

const ION_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  'two-wheeler': 'bicycle',
  'car-sport-sharp': 'car',
  'directions-car': 'car',
  'person-pin': 'person-circle',
  elderly: 'accessibility',
  pets: 'paw',
  'workspace-premium': 'diamond',
  person: 'person',
  check: 'checkmark',
  remove: 'remove',
  add: 'add',
  'auto-awesome': 'sparkles',
  'trending-up': 'trending-up',
  'nightlight-round': 'moon',
  'local-offer': 'pricetag',
  'info-outline': 'information-circle',
  'photo-camera': 'camera',
  'check-circle': 'checkmark-circle',
  'chevron-right': 'chevron-forward',
  'expand-more': 'chevron-down',
  route: 'navigate',
  payments: 'cash',
  sell: 'pricetag',
  'chat-bubble-outline': 'chatbubble-outline',
};

interface RideIconProps {
  name: IconName;
  size: number;
  color: string;
  iconSet?: RideIconSet;
}

export function RideIcon({ name, size, color, iconSet = RIDE_ICON_SET }: RideIconProps) {
  if (iconSet === 'ionicons') {
    return <Ionicons name={ION_ICONS[name] ?? 'ellipse'} size={size} color={color} />;
  }
  return <MaterialIcons name={name} size={size} color={color} />;
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
  onTakeVehiclePhoto: () => void;
  colors: any;
  styles: any;
  tr: TrFunction;
  iconSet?: RideIconSet;
}

const FEATURE_ICONS: Record<string, IconName> = {
  night: 'nightlight-round',
  designated_driver_moto_discount: 'local-offer',
  senior: 'elderly',
  premium: 'workspace-premium',
  pet_friendly: 'pets',
};

const VEHICLE_OPTION_IMAGES: Record<VehicleType, ImageSourcePropType> = {
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
  onTakeVehiclePhoto,
  colors,
  styles,
  tr,
  iconSet,
}: SearchRideVehicleOptionsProps) {
  const iconColor = colors?.primary || '#b38737';
  const metaColor = colors?.textSecondary || '#666666';
  const textColor = colors?.text || '#111111';
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

  const featureImpact = (feature: ServiceFeatureOption) => {
    if (feature.pricingType === 'multiplier') {
      const percent = Math.round((feature.pricingValue - 1) * 100);
      return tr('features.percentImpact', {
        sign: percent < 0 ? '-' : '+',
        value: Math.abs(percent),
      });
    }
    if (feature.pricingType === 'discount') {
      return tr('features.discountImpact', { value: Math.round(feature.pricingValue) });
    }
    if (feature.pricingType === 'surcharge') {
      return tr('features.surchargeImpact', { value: Math.round(feature.pricingValue) });
    }
    return tr('features.noPriceImpact');
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
          const orderedFeatures = orderFeaturesBySelection(serviceFeatures, selectedFeatureCodes);

          return (
            <View key={option.type} style={[styles.vehicleOptionCard, isSelected && styles.vehicleOptionCardSelected]}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.vehicleOptionTopRow}
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
                    <View style={styles.vehicleOptionPassengerDisplay}>
                      <RideIcon name="person" iconSet={iconSet} size={13} color={iconColor} />
                      <Text style={styles.vehicleOptionPassengerValue}>{passengers}</Text>
                    </View>
                  </View>
                  <Text style={styles.vehicleOptionMeta} numberOfLines={1}>
                    {etaLabel}
                    {isRecommended ? ` · ${tr('vehicle.recommendedBadge')}` : ''}
                  </Text>
                  <Text style={styles.vehicleOptionSubtitle} numberOfLines={1}>
                    {option.subtitle}
                  </Text>
                </View>

                <Text style={[styles.vehicleOptionPrice, isSelected && styles.vehicleOptionPriceSelected]}>{priceLabel}</Text>
              </TouchableOpacity>

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
                              name={mode === 'auto' ? 'directions-car' : 'two-wheeler'}
                              iconSet={iconSet}
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
                      <RideIcon name="info-outline" iconSet={iconSet} size={14} color={colors?.warning || '#ffa726'} />
                      <Text style={styles.designatedDriverModeInfoText}>{tr('vehicle.designatedMotoShortNotice')}</Text>
                    </View>
                  ) : null}

                  <View style={styles.vehicleOptionPassengerControls}>
                    <TouchableOpacity
                      style={[styles.vehicleOptionCounterBtn, !canDecreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                      disabled={!canDecreasePassengers(option.type)}
                      onPress={() => onUpdatePassengers(option.type, -1)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <RideIcon name="remove" iconSet={iconSet} size={20} color={textColor} />
                    </TouchableOpacity>
                    <View style={styles.vehicleOptionPassengerCount}>
                      <RideIcon name="person" iconSet={iconSet} size={16} color={textColor} />
                      <Text style={styles.vehicleOptionPassengerCountText}>{getPassengersForVehicle(option.type)}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.vehicleOptionCounterBtn, !canIncreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                      disabled={!canIncreasePassengers(option.type)}
                      onPress={() => onUpdatePassengers(option.type, 1)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <RideIcon name="add" iconSet={iconSet} size={20} color={textColor} />
                    </TouchableOpacity>
                  </View>

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
                          const clockHint =
                            feature.startTime && feature.endTime
                              ? tr('features.scheduleHint', { start: feature.startTime.slice(0, 5), end: feature.endTime.slice(0, 5) })
                              : null;
                          const statusHint = conditionDisabled
                            ? clockHint ?? tr('features.unavailable')
                            : clockHint;
                          const icon = FEATURE_ICONS[feature.code] ?? 'auto-awesome';

                          return (
                            <TouchableOpacity
                              key={feature.code}
                              style={[
                                styles.vehicleFeatureCard,
                                selected && styles.vehicleFeatureCardSelected,
                                conditionDisabled && styles.vehicleFeatureCardDisabled,
                              ]}
                              activeOpacity={conditionDisabled ? 1 : 0.7}
                              disabled={conditionDisabled}
                              onPress={() => onToggleFeature(feature.code)}
                              accessibilityRole="button"
                              accessibilityState={{ selected, disabled: conditionDisabled }}
                              accessibilityLabel={tr('features.accessibilityOption', {
                                name: featureTitle(feature),
                                impact: featureImpact(feature),
                                state: conditionDisabled
                                  ? tr('features.unavailable')
                                  : selected
                                  ? tr('features.selected')
                                  : tr('features.notSelected'),
                              })}
                            >
                              <View style={styles.vehicleFeatureCardTitleRow}>
                                <RideIcon name={icon} iconSet={iconSet} size={16} color={conditionDisabled ? metaColor : iconColor} />
                                <Text style={styles.vehicleFeatureCardTitle} numberOfLines={1}>
                                  {featureTitle(feature)}
                                </Text>
                                <View style={[styles.vehicleFeatureToggle, selected && styles.vehicleFeatureToggleSelected]}>
                                  {selected ? <RideIcon name="check" iconSet={iconSet} size={12} color={textColor} /> : null}
                                </View>
                              </View>
                              <Text style={styles.vehicleFeatureImpact} numberOfLines={1}>
                                {featureImpact(feature)}
                              </Text>
                              {statusHint ? (
                                <Text style={styles.vehicleFeatureCondition} numberOfLines={1}>
                                  {statusHint}
                                </Text>
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}

                  {isSelected && surgeMultiplier > 1 ? (
                    <View style={styles.vehicleDemandNotice}>
                      <RideIcon name="trending-up" iconSet={iconSet} size={14} color={colors?.warning || '#ffa726'} />
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
                        name={hasVehiclePhotoSelection ? 'check-circle' : 'photo-camera'}
                        iconSet={iconSet}
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
                      <RideIcon name="chevron-right" iconSet={iconSet} size={20} color={metaColor} />
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
