jest.mock('../../api/ratings', () => ({
  submitRating: jest.fn(),
  skipRating: jest.fn(),
}));
jest.mock('../../live/tripIds', () => ({ sqlRideIdForTrip: jest.fn() }));

const service = require('../ride/ratingService').default;
const api = require('../../api/ratings');
const { sqlRideIdForTrip } = require('../../live/tripIds');

beforeEach(() => {
  jest.resetAllMocks();
  sqlRideIdForTrip.mockResolvedValue('sql-ride');
});

test('rejects a rating without a recipient instead of reporting success', async () => {
  await expect(service.submitRideRating({ rideId: 'ride', rating: 5 })).rejects.toThrow();
  expect(api.submitRating).not.toHaveBeenCalled();
});

test('skip uses the SQL ride ID and propagates failures', async () => {
  api.skipRating.mockRejectedValueOnce(new Error('unavailable'));
  await expect(service.skipRideRating('ride')).rejects.toThrow('unavailable');
  expect(api.skipRating).toHaveBeenCalledWith('sql-ride');
});
