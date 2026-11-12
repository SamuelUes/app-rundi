const { clientRatingAfterPreflight } = require('./pendingRating');

const rating = { rideId: 'ride', status: 'pending' };
const data = { role: 'client', pendingRating: rating };

test('offers the latest pending rating after preflight', () => {
  expect(clientRatingAfterPreflight(data)).toBe(rating);
});

test.each([
  { pendingPayments: { count: 1 } },
  { activeRide: { rideId: 'active' } },
  { programmedRide: { rideId: 'scheduled' } },
  { role: 'driver' },
  { pendingRating: { status: 'completed' } },
  { pendingRating: { status: 'skipped' } },
])('does not interrupt a higher priority action: %p', (override) => {
  expect(clientRatingAfterPreflight({ ...data, ...override })).toBeNull();
});
