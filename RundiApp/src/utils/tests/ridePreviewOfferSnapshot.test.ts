import { matchesRidePreviewOffer, mergeRidePreviewOffer } from '../ride/ridePreviewOfferSnapshot';

describe('mergeRidePreviewOffer', () => {
  it('updates the client price without losing the driver offer', () => {
    const previous = { clientSuggestedPrice: 100, driverOfferedPrice: 140, driverOfferStatus: 'pending' };
    expect(mergeRidePreviewOffer(previous, { clientSuggestedPrice: 120 })).toEqual({
      clientSuggestedPrice: 120, driverOfferedPrice: 140, driverOfferStatus: 'pending',
    });
  });

  it('keeps the existing price when a snapshot has no valid client price', () => {
    const previous = { clientSuggestedPrice: 100, driverOfferedPrice: null, driverOfferStatus: null };
    expect(mergeRidePreviewOffer(previous, { clientSuggestedPrice: null })).toEqual(previous);
  });
});

describe('matchesRidePreviewOffer', () => {
  const offer = { rideId: 'sql-ride', firebaseRideId: 'live-ride', driverId: 'driver' };

  it('finds the same offer by SQL or Firestore ride id', () => {
    expect(matchesRidePreviewOffer(offer, 'sql-ride')).toBe(true);
    expect(matchesRidePreviewOffer(offer, 'live-ride')).toBe(true);
    expect(matchesRidePreviewOffer(offer, 'other-ride')).toBe(false);
  });
});
