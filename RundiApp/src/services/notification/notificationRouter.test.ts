import { routeNotification } from './notificationRouter';
import { getRideDetail } from '../../api/rides';
import { navigate } from '../../navigation/NavigationService';

jest.mock('../../api/rides', () => ({ getRideDetail: jest.fn() }));
jest.mock('../../stores/programmedPromptStore', () => ({ openProgrammedPrompt: jest.fn() }));
jest.mock('../../navigation/NavigationService', () => ({
  navigate: jest.fn(),
  navigationRef: {
    isReady: jest.fn(() => true),
    getRootState: jest.fn(() => ({ routeNames: ['ClientHome', 'HomeOffers', 'RideTracking'] })),
  },
}));

const mockDetail = getRideDetail as jest.Mock;
const mockNavigate = navigate as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

test('an old offer opens tracking when the driver has arrived', async () => {
  mockDetail.mockResolvedValue({ id: 'ride', status: 'driver_arrived', driverId: 'driver' });
  await routeNotification({ type: 'ride_driver_offered', rideId: 'ride' });
  expect(mockNavigate).toHaveBeenCalledWith('RideTracking', expect.objectContaining({
    rideId: 'ride', driverId: 'driver',
  }));
});

test('a live notification opens offers when the ride is still awaiting a driver', async () => {
  mockDetail.mockResolvedValue({ id: 'ride', status: 'driver_offered' });
  await routeNotification({ type: 'ride_live_update', rideId: 'ride' });
  expect(mockNavigate).toHaveBeenCalledWith('HomeOffers', { rideId: 'ride' });
});

test('a completed card ride opens payment', async () => {
  mockDetail.mockResolvedValue({ id: 'ride', status: 'completed', paymentType: 'card_local', finalFare: 120 });
  await routeNotification({ type: 'ride_live_update', rideId: 'ride' });
  expect(mockNavigate).toHaveBeenCalledWith('Payment', expect.objectContaining({ rideId: 'ride', amount: 120 }));
});

test('a failed detail lookup does not navigate using stale notification data', async () => {
  mockDetail.mockRejectedValue(new Error('offline'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await routeNotification({ type: 'ride_live_update', rideId: 'ride' });
  expect(mockNavigate).not.toHaveBeenCalled();
  warning.mockRestore();
});
