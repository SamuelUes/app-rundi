import { describe, expect, it } from '@jest/globals';
import { isPendingDispatchOffer, normalizeRidePreviewPayload } from '../driver/driverHomeHelpers';

describe('driver dispatch offers', () => {
  it('does not treat previously accepted or expired offers as pending requests', () => {
    expect(isPendingDispatchOffer('accepted', null, 100)).toBe(false);
    expect(isPendingDispatchOffer('pending', 100, 100)).toBe(false);
    expect(isPendingDispatchOffer('pending', 101, 100)).toBe(true);
    expect(isPendingDispatchOffer('pending', null, 100)).toBe(true);
  });

  it('keeps requested features when reopening a pending ride', () => {
    const payload = normalizeRidePreviewPayload(
      { id: 'ride', clientId: 'client', pricingSnapshot: { featureCodes: ['senior', 'pet_friendly'] } },
      { rideId: 'ride', clientId: 'client' } as any,
      'driver',
    );
    expect(payload.featureCodes).toEqual(['senior', 'pet_friendly']);
  });
});
