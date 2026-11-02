jest.mock('../../services/ride/ridesService', () => ({
  normalizeVehicleTypeForMatching: (value: string | null) =>
    value?.toLowerCase().includes('moto') ? 'moto' : value ? 'auto' : null,
  extractRideVehicleTypeForMatching: (ride: any) => {
    const value = ride?.rideType === 'designated_driver'
      ? ride?.designatedDriverVehicle ?? ride?.vehicleType
      : ride?.vehicleType;
    return typeof value === 'string' && value.toLowerCase().includes('moto') ? 'moto' : 'auto';
  },
}));

import { checkRideDriverCompatibility } from '../ride/availableRidesHelpers';
import { getRideServiceTypeLabel } from '../ride/rideFeatureLabels';

describe('available ride feature compatibility', () => {
  it('shows senior auto and designated-auto rides without requiring badges', () => {
    expect(checkRideDriverCompatibility({
      rideType: 'normal',
      vehicleType: 'auto',
      serviceCode: 'normal',
      featureCodes: ['senior'],
    }, 'auto', false).ok).toBe(true);

    expect(checkRideDriverCompatibility({
      rideType: 'designated_driver',
      vehicleType: 'designated_driver',
      designatedDriverVehicle: 'auto',
      serviceCode: 'designated_driver_auto',
      featureCodes: ['senior'],
    }, 'auto', true).ok).toBe(true);
  });

  it('rejects senior and premium motorcycle requests', () => {
    expect(checkRideDriverCompatibility({
      rideType: 'normal',
      vehicleType: 'moto',
      serviceCode: 'motorcycle',
      featureCodes: ['senior'],
    }, 'moto', false).ok).toBe(false);
    expect(checkRideDriverCompatibility({
      rideType: 'normal',
      vehicleType: 'moto',
      serviceCode: 'motorcycle',
      featureCodes: ['premium'],
    }, 'moto', false).ok).toBe(false);
  });

  it('requires the Premium vehicle badge and permits Premium only for normal auto', () => {
    const premiumRide = {
      rideType: 'normal',
      vehicleType: 'auto',
      serviceCode: 'normal',
      featureCodes: ['premium'],
    };
    expect(checkRideDriverCompatibility(premiumRide, 'auto', false).ok).toBe(false);
    expect(checkRideDriverCompatibility(premiumRide, 'auto', false, [], ['premium']).ok).toBe(true);
    expect(checkRideDriverCompatibility({
      ...premiumRide,
      rideType: 'designated_driver',
      vehicleType: 'designated_driver',
      designatedDriverVehicle: 'auto',
      serviceCode: 'designated_driver_auto',
    }, 'auto', true, [], ['premium']).ok).toBe(false);
  });

  it('requires the driver capability for pet-friendly auto and does not require it for night', () => {
    const petRide = {
      rideType: 'normal',
      vehicleType: 'auto',
      serviceCode: 'normal',
      featureCodes: ['pet_friendly'],
    };
    expect(checkRideDriverCompatibility(petRide, 'auto', false).ok).toBe(false);
    expect(checkRideDriverCompatibility(petRide, 'auto', false, ['pet_friendly']).ok).toBe(true);
    expect(checkRideDriverCompatibility({
      rideType: 'normal',
      vehicleType: 'auto',
      serviceCode: 'normal',
      featureCodes: ['night'],
    }, 'auto', false).ok).toBe(true);
  });

  it('labels the selected service type separately from its base vehicle service', () => {
    const translate = (key: string) => key;
    expect(getRideServiceTypeLabel({
      serviceCode: 'normal',
      featureCodes: ['senior', 'night'],
    }, translate as any)).toBe('shared.searchRide.features.senior · shared.searchRide.features.night');
    expect(getRideServiceTypeLabel({
      serviceCode: 'designated_driver_auto',
      featureCodes: [],
    }, translate as any)).toBe('shared.searchRide.vehicle.designatedLabel · shared.searchRide.vehicle.autoLabel');
  });
});
