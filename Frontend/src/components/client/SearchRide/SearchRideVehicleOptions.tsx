import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
type TrFunction = (path: string, options?: Record<string, any>) => string;

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';
type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface VehicleOption {
  type: VehicleType;
  label: string;
  subtitle: string;
  icon: string;
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
  vehicleEstimates: Record<VehicleType, VehicleEstimate>;
  designatedDriverEstimates: DesignatedDriverEstimates;
  designatedDriverMode: DesignatedDriverMode;
  designatedDriverEligibility: DesignatedDriverEligibility;
  recommendedVehicle: VehicleType | null;
  calculatingRoute: boolean;
  estimatedDuration: number;
  capacityByVehicle: Record<VehicleType, number>;
  passengersByVehicle: Record<VehicleType, number>;
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
}

export function SearchRideVehicleOptions({
  vehicleOptions,
  vehicleType,
  vehicleEstimates,
  designatedDriverEstimates,
  designatedDriverMode,
  designatedDriverEligibility,
  recommendedVehicle,
  calculatingRoute,
  estimatedDuration,
  capacityByVehicle,
  passengersByVehicle,
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
}: SearchRideVehicleOptionsProps) {
  const iconColor = colors?.primary || '#b38737';
  const metaColor = colors?.textSecondary || '#666666';
  const textColor = colors?.text || '#111111';
  return (
    <View style={[styles.section, styles.vehicleSection]}>
      <View style={styles.vehicleOptionsList}>
        {vehicleOptions.map((option) => {
          const estimate = vehicleEstimates[option.type];
          const designatedEstimate = option.type === 'designated_driver' ? designatedDriverEstimates[designatedDriverMode] : null;
          const showDesignatedMotoShortDistanceNotice =
            option.type === 'designated_driver' &&
            vehicleType === 'designated_driver' &&
            designatedDriverMode === 'moto' &&
            !designatedDriverEligibility.motoEligible &&
            (designatedDriverEstimates.moto.price ?? 0) > 0;
          const priceLabel = formatPriceValue((designatedEstimate ?? estimate)?.price ?? null);
          const isSelected = vehicleType === option.type;
          const isRecommended = recommendedVehicle === option.type;
          const etaLabel = calculatingRoute
            ? tr('labels.calculating')
            : estimatedDuration > 0
            ? tr('labels.etaValue', { minutes: estimatedDuration })
            : tr('labels.etaUnavailable');

          return (
            <TouchableOpacity
              key={option.type}
              style={[styles.vehicleOptionCard, isSelected && styles.vehicleOptionCardSelected]}
              onPress={() => onSelectVehicle(option.type)}
              accessibilityLabel={tr('vehicle.selectOption', { label: option.label })}
              accessibilityRole="button"
            >
              <View style={styles.vehicleOptionTopRow}>
                <View style={styles.vehicleOptionTitleBlock}>
                  <View style={styles.vehicleOptionTitleRow}>
                    <View style={[styles.vehicleOptionIconBubble, isSelected && styles.vehicleOptionIconBubbleSelected]}>
                      <MaterialIcons
                        name={option.icon as IconName}
                        size={22}
                        color={isSelected ? iconColor : metaColor}
                      />
                    </View>
                    <Text style={styles.vehicleOptionTitle} numberOfLines={1}>
                      {option.label}
                    </Text>
                    {isSelected ? (
                      <MaterialIcons name="check-circle" size={16} color={iconColor} />
                    ) : null}
                  </View>
                  <Text style={styles.vehicleOptionSubtitle} numberOfLines={2}>
                    {option.subtitle}
                  </Text>
                </View>
                <View style={styles.vehicleOptionPriceBlock}>
                  {isRecommended ? (
                    <Text style={styles.vehicleOptionBadge}>{tr('vehicle.recommendedBadge')}</Text>
                  ) : null}
                  <Text style={styles.vehicleOptionPrice}>{priceLabel}</Text>
                </View>
              </View>

              <View style={styles.vehicleOptionInfoRow}>
                <View style={styles.vehicleOptionMetaWrap}>
                  <MaterialIcons name="schedule" size={13} color={metaColor} />
                  <Text style={styles.vehicleOptionMeta} numberOfLines={1}>
                    {etaLabel}
                  </Text>
                </View>
                {isSelected ? (
                  <View style={styles.vehicleOptionPassengerControls}>
                    <TouchableOpacity
                      style={[styles.vehicleOptionCounterBtn, !canDecreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                      disabled={!canDecreasePassengers(option.type)}
                      onPress={() => onUpdatePassengers(option.type, -1)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.vehicleOptionCounterText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.vehicleOptionPassengerCount}>
                      <Text style={styles.vehicleOptionPassengerValue}>{getPassengersForVehicle(option.type)}</Text>
                      <MaterialIcons name="person" size={15} color={textColor} />
                    </View>
                    <TouchableOpacity
                      style={[styles.vehicleOptionCounterBtn, !canIncreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                      disabled={!canIncreasePassengers(option.type)}
                      onPress={() => onUpdatePassengers(option.type, 1)}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.vehicleOptionCounterText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.vehicleOptionPassengerDisplay}>
                    <Text style={styles.vehicleOptionPassengerValue}>{getPassengersForVehicle(option.type)}</Text>
                    <MaterialIcons name="person" size={15} color={metaColor} />
                  </View>
                )}
              </View>
              {option.type === 'designated_driver' && isSelected ? (
                <View style={styles.designatedDriverModeContainer}>
                  <Text style={styles.designatedDriverModeLabel}>{tr('vehicle.modeLabel')}</Text>
                  <View style={styles.designatedDriverModeChips}>
                    {(['auto', 'moto'] as DesignatedDriverMode[]).map((mode) => {
                      const selected = designatedDriverMode === mode;
                      return (
                        <TouchableOpacity
                          key={mode}
                          style={[styles.designatedDriverModeChip, selected && styles.designatedDriverModeChipSelected]}
                          onPress={() => onSetDesignatedDriverMode(mode)}
                          accessibilityRole="button"
                        >
                          <View style={styles.designatedDriverModeChipContent}>
                            <MaterialIcons
                              name={mode === 'auto' ? 'directions-car' : 'two-wheeler'}
                              size={16}
                              color={selected ? iconColor : metaColor}
                            />
                            <Text style={[styles.designatedDriverModeChipText, selected && styles.designatedDriverModeChipTextSelected]}>
                              {mode === 'auto' ? tr('vehicle.modeAuto') : tr('vehicle.modeMoto')}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {showDesignatedMotoShortDistanceNotice ? (
                    <View style={styles.designatedDriverModeInfoRow}>
                      <MaterialIcons name="info-outline" size={14} color={colors?.warning || '#ffa726'} />
                      <Text style={styles.designatedDriverModeInfoText}>
                        {tr('vehicle.designatedMotoShortNotice')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {requiresVehiclePhoto && (
        <View style={styles.photoRow}>
          <Text style={styles.photoHint}>{tr('photo.hint')}</Text>
          <TouchableOpacity style={styles.photoButton} onPress={onTakeVehiclePhoto} disabled={uploadingPhoto} accessibilityRole="button">
            <MaterialIcons
              name={hasVehiclePhotoSelection ? 'photo-library' : 'photo-camera'}
              size={16}
              color={iconColor}
            />
            <Text style={styles.photoButtonText}>
              {uploadingPhoto
                ? tr('photo.buttonProcessing')
                : hasVehiclePhotoSelection
                ? tr('photo.buttonChange')
                : tr('photo.buttonDefault')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
