import { describe, expect, it, jest } from '@jest/globals';
import { getPremiumStatus } from '../driver/premiumStatus';
import { checkRideDriverCompatibility } from '../ride/availableRidesHelpers';

jest.mock('../../services/ride/ridesService', () => ({
  normalizeVehicleTypeForMatching: (value: string) => value === 'moto' ? 'moto' : 'auto',
  extractRideVehicleTypeForMatching: (ride: { vehicleType?: string }) => ride.vehicleType ?? 'auto',
}));

describe('premium vehicle eligibility', () => {
  const from = Date.parse('2022-01-01T06:00:00Z');
  const grace = Date.parse('2027-01-01T06:00:00Z');
  const until = Date.parse('2027-07-01T06:00:00Z');

  it('applies the Managua grace period through June 30', () => {
    expect(getPremiumStatus(from, grace, until, from - 1)).toEqual({ eligible: false, grace: false, expired: false });
    expect(getPremiumStatus(from, grace, until, grace - 1)).toEqual({ eligible: true, grace: false, expired: false });
    expect(getPremiumStatus(from, grace, until, grace)).toEqual({ eligible: true, grace: true, expired: false });
    expect(getPremiumStatus(from, grace, until, until - 1)).toEqual({ eligible: true, grace: true, expired: false });
    expect(getPremiumStatus(from, grace, until, until)).toEqual({ eligible: false, grace: false, expired: true });
  });

  it('does not grant premium without OCR dates', () => {
    expect(getPremiumStatus(null, null, null, grace)).toEqual({ eligible: false, grace: false, expired: false });
  });

  it('shows premium rides only for the active vehicle capability', () => {
    const ride = { serviceCode: 'normal', vehicleType: 'auto', featureCodes: ['premium'] };
    expect(checkRideDriverCompatibility(ride, 'auto', false, ['premium'], []).ok).toBe(false);
    expect(checkRideDriverCompatibility(ride, 'auto', false, [], ['premium']).ok).toBe(true);
    expect(checkRideDriverCompatibility(ride, null, false, [], ['premium']).ok).toBe(false);
  });

  it('recognizes premium inside a pricing snapshot', () => {
    const ride = { serviceCode: 'normal', vehicleType: 'auto', featureCodes: [], pricingSnapshot: { featureCodes: ['premium'] } };
    expect(checkRideDriverCompatibility(ride, 'auto', false).ok).toBe(false);
    expect(checkRideDriverCompatibility(ride, 'auto', false, [], ['premium']).ok).toBe(true);
  });
});
