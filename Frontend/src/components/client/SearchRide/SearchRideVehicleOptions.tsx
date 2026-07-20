import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
type TrFunction = (path: string, options?: Record<string, any>) => string;

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';

interface VehicleOption {
  type: VehicleType;
  label: string;
  subtitle: string;
  emoji: string;
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
  styles,
  tr,
}: SearchRideVehicleOptionsProps) {
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
            >
              <View style={styles.vehicleOptionTopRow}>
                <View style={styles.vehicleOptionTitleBlock}>
                  <View style={styles.vehicleOptionTitleRow}>
                    <View style={styles.vehicleOptionIconBubble}>
                      <Text style={styles.vehicleEmoji}>{option.emoji}</Text>
                    </View>
                    <Text style={[styles.vehicleOptionTitle, isSelected && styles.vehicleOptionTitleSelected]} numberOfLines={1}>
                      {option.label}
                    </Text>
                  </View>
                  <Text style={[styles.vehicleOptionSubtitle, isSelected && styles.vehicleOptionSubtitleSelected]} numberOfLines={2}>
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
                <Text style={[styles.vehicleOptionMeta, isSelected && styles.vehicleOptionMetaSelected]} numberOfLines={1}>
                  {etaLabel}
                </Text>
                {isSelected ? (
                  <View style={styles.vehicleOptionPassengerControls}>
                    <TouchableOpacity
                      style={[styles.vehicleOptionCounterBtn, !canDecreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                      disabled={!canDecreasePassengers(option.type)}
                      onPress={() => onUpdatePassengers(option.type, -1)}
                    >
                      <Text style={styles.vehicleOptionCounterText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.vehicleOptionPassengerCount}>
                      <Text style={[styles.vehicleOptionPassengerValue, styles.vehicleOptionPassengerValueSelected]}>{getPassengersForVehicle(option.type)}</Text>
                      <Text style={styles.vehicleOptionPassengerIcon}>👤</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.vehicleOptionCounterBtn, !canIncreasePassengers(option.type) && styles.vehicleOptionCounterBtnDisabled]}
                      disabled={!canIncreasePassengers(option.type)}
                      onPress={() => onUpdatePassengers(option.type, 1)}
                    >
                      <Text style={styles.vehicleOptionCounterText}>+</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.vehicleOptionPassengerDisplay}>
                    <Text style={[styles.vehicleOptionPassengerValue, isSelected && styles.vehicleOptionPassengerValueSelected]}>{getPassengersForVehicle(option.type)}</Text>
                    <Text style={styles.vehicleOptionPassengerIcon}>👤</Text>
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
                        >
                          <Text style={[styles.designatedDriverModeChipText, selected && styles.designatedDriverModeChipTextSelected]}>
                            {mode === 'auto' ? tr('vehicle.modeAuto') : tr('vehicle.modeMoto')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {showDesignatedMotoShortDistanceNotice ? (
                    <Text style={styles.designatedDriverModeInfoText}>
                      La distancia es muy corta para solicitar este servicio en motocicleta.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {recommendedVehicle && vehicleEstimates[recommendedVehicle]?.price ? (
        <View>
          {formatPriceValue(vehicleEstimates[recommendedVehicle]?.price ?? null)}
        </View>
      ) : null}

      {requiresVehiclePhoto && (
        <View style={styles.photoRow}>
          <Text style={styles.photoHint}>{tr('photo.hint')}</Text>
          <TouchableOpacity style={styles.photoButton} onPress={onTakeVehiclePhoto} disabled={uploadingPhoto}>
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
