import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../services/ride/ridesService', () => ({
  normalizeVehicleTypeForMatching: (value?: string) =>
    value === 'moto' ? 'moto' : value === 'sedan' || value === 'auto' ? 'auto' : null,
  extractRideVehicleTypeForMatching: (ride: { vehicleType?: string }) => ride.vehicleType ?? 'auto',
}));

import { checkRideDriverCompatibility, resolveSelectedDriverVehicleType } from '../ride/availableRidesHelpers';

describe('premium ride eligibility', () => {
  const ride = { serviceCode: 'normal', vehicleType: 'auto', featureCodes: ['premium'] };

  it('requires premium on the active vehicle', () => {
    expect(checkRideDriverCompatibility(ride, 'auto', false, ['premium'], []).ok).toBe(false);
    expect(checkRideDriverCompatibility(ride, 'auto', false, [], ['premium']).ok).toBe(true);
    expect(checkRideDriverCompatibility(ride, null, false, [], ['premium']).ok).toBe(false);
  });

  it('also recognizes features inside the pricing snapshot', () => {
    const snapshotRide = { serviceCode: 'normal', vehicleType: 'auto', pricingSnapshot: { featureCodes: ['premium'] } };
    expect(checkRideDriverCompatibility(snapshotRide, 'auto', false, [], []).ok).toBe(false);
    expect(checkRideDriverCompatibility(snapshotRide, 'auto', false, [], ['premium']).ok).toBe(true);
  });

  it('uses the active sedan as an auto while keeping feature restrictions', () => {
    const vehicleType = resolveSelectedDriverVehicleType({ vehicle: { type: 'sedan' } });
    expect(vehicleType).toBe('auto');
    const petRide = { serviceCode: 'normal', vehicleType: 'auto', featureCodes: ['pet_friendly'] };
    expect(checkRideDriverCompatibility(petRide, vehicleType, false, ['pet_friendly']).ok).toBe(true);
    expect(checkRideDriverCompatibility(petRide, vehicleType, false, []).ok).toBe(true);
  });
});
