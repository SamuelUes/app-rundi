import type { TFunction } from 'i18next';

const readFeatureCodes = (ride: any): string[] => {
  const codes = ride?.featureCodes ?? ride?.feature_codes ?? ride?.pricingSnapshot?.featureCodes;
  return Array.isArray(codes) ? codes.filter((code: unknown): code is string => typeof code === 'string') : [];
};

export function getRideFeatureLabels(ride: any, t: TFunction): string[] {
  return [...new Set(readFeatureCodes(ride).map((code) => {
    switch (code) {
      case 'night':
        return t('shared.searchRide.features.night');
      case 'senior':
        return t('shared.searchRide.features.senior');
      case 'premium':
        return t('shared.searchRide.features.premium');
      case 'pet_friendly':
        return t('shared.searchRide.features.petFriendly');
      case 'designated_driver_moto_discount':
        return t('shared.searchRide.features.designatedDriverMotoDiscount');
      default:
        return code.replace(/_/g, ' ');
    }
  }))];
}

export function getRideServiceTypeLabel(ride: any, t: TFunction): string {
  const featureCodes = readFeatureCodes(ride);
  const specialServiceCodes = featureCodes.filter((code) =>
    ['senior', 'premium', 'pet_friendly'].includes(code),
  );
  const specialLabels = getRideFeatureLabels(
    { featureCodes: specialServiceCodes },
    t,
  );
  if (featureCodes.includes('night')) {
    specialLabels.push(t('shared.searchRide.features.night'));
  }
  if (specialLabels.length > 0) return [...new Set(specialLabels)].join(' · ');

  const serviceCode = String(
    ride?.serviceCode ?? ride?.service_code ?? ride?.pricingSnapshot?.serviceCode ?? '',
  ).toLowerCase();
  switch (serviceCode) {
    case 'motorcycle':
    case 'designated_driver_moto':
      return serviceCode === 'designated_driver_moto'
        ? `${t('shared.searchRide.vehicle.designatedLabel')} · ${t('shared.searchRide.vehicle.modeMoto')}`
        : t('shared.searchRide.vehicle.motoLabel');
    case 'designated_driver_auto':
      return `${t('shared.searchRide.vehicle.designatedLabel')} · ${t('shared.searchRide.vehicle.autoLabel')}`;
    case 'normal':
      return t('shared.searchRide.vehicle.autoLabel');
    default:
      if (String(ride?.rideType ?? ride?.ride_type ?? '').toLowerCase() === 'designated_driver') {
        const designatedVehicle = String(
          ride?.designatedDriverVehicle ?? ride?.designated_driver_vehicle ?? '',
        ).toLowerCase();
        return `${t('shared.searchRide.vehicle.designatedLabel')} · ${
          designatedVehicle === 'moto'
            ? t('shared.searchRide.vehicle.modeMoto')
            : t('shared.searchRide.vehicle.autoLabel')
        }`;
      }
      return String(ride?.vehicleType ?? ride?.vehicle_type ?? '').toLowerCase() === 'moto'
        ? t('shared.searchRide.vehicle.motoLabel')
        : t('shared.searchRide.vehicle.autoLabel');
  }
}
