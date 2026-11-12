import { compareRideOrder, rideRequestedAtMillis } from '../ride/rideOrder';

test('orders by exact distance, then oldest request, then id', () => {
  const rides = [
    { id: 'new', distance: 0.3, requestedAt: 200 },
    { id: 'far', distance: 0.301, requestedAt: 1 },
    { id: 'old', distance: 0.3, requestedAt: { toMillis: () => 100 } },
    { id: 'missing', distance: 0.3 },
  ];
  expect(rides.sort(compareRideOrder).map((ride) => ride.id)).toEqual(['old', 'new', 'missing', 'far']);
  expect(rideRequestedAtMillis('2026-01-01T00:00:00Z')).toBe(Date.parse('2026-01-01T00:00:00Z'));
});
