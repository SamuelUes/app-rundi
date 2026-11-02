import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getDocs, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../../config/firebase';
import { liveTripDocId, sqlRideIdForTrip } from '../../../../live/tripIds';
import { useRideOffers } from '../useRideOffers';

jest.mock('../../../../config/firebase', () => ({ getFirebaseFirestore: jest.fn() }));
jest.mock('../../../../live/tripIds', () => ({
  liveTripDocId: jest.fn(),
  sqlRideIdForTrip: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, path) => ({ kind: 'collection', path })),
  doc: jest.fn((_db, path, id) => ({ kind: 'doc', path, id })),
  getDocs: jest.fn(),
  query: jest.fn((ref, ...filters) => ({ ...ref, filters })),
  where: jest.fn((field, _op, value) => ({ field, value })),
  onSnapshot: jest.fn(),
}));

let listeners;
beforeEach(() => {
  jest.clearAllMocks();
  listeners = [];
  getFirebaseFirestore.mockResolvedValue({});
  liveTripDocId.mockImplementation(async (id) => `live-${id}`);
  sqlRideIdForTrip.mockImplementation(async (id) => id);
  onSnapshot.mockImplementation((ref, next, error) => {
    const unsubscribe = jest.fn();
    listeners.push({ ref, next, error, unsubscribe });
    return unsubscribe;
  });
});

const snapshot = (items) => ({ docs: items.map((item) => ({ id: item.driverId, data: () => item })) });
const profile = (data) => ({ exists: () => true, data: () => data });
const offerListener = () => listeners.find((entry) => entry.ref.path === 'REALTIME_driver_offers');
const driverListener = (id) => listeners.find((entry) => entry.ref.path === 'REALTIME_driver_public_profiles' && entry.ref.id === id);

test('only listens to offerers and does not restart ride listeners on profile changes', async () => {
  const hook = renderHook(() => useRideOffers('ride', 'client', 'area', 'Driver'));
  await waitFor(() => expect(offerListener()).toBeDefined());
  expect(listeners).toHaveLength(2);
  act(() => offerListener().next(snapshot([
    { driverId: 'd1', status: 'pending', offeredPrice: 100 },
    { driverId: 'd2', status: 'rejected' },
    { driverId: 'd4', status: 'canceled' },
    { driverId: 'd5', status: 'expired' },
  ])));
  expect(offerListener().ref.filters).toEqual([
    { field: 'clientId', value: 'client' },
    { field: 'rideId', value: 'ride' },
  ]);
  expect(driverListener('d1')).toBeDefined();
  expect(driverListener('d2')).toBeUndefined();
  expect(driverListener('d4')).toBeUndefined();
  expect(driverListener('d5')).toBeUndefined();
  act(() => driverListener('d1').next(profile({ name: 'Ana' })));
  expect(hook.result.current.driversInfo.d1.name).toBe('Ana');
  act(() => hook.result.current.setSelectedDriverId('d1'));
  expect(hook.result.current.selectedDriverId).toBe('d1');
  act(() => driverListener('d1').next(profile({ name: 'Ana Updated' })));
  expect(hook.result.current.offers[0].driver.name).toBe('Ana Updated');
  expect(hook.result.current.selectedDriverId).toBe('d1');
  expect(listeners.filter((entry) => entry.ref.path === 'REALTIME_driver_offers')).toHaveLength(1);
  expect(listeners.filter((entry) => entry.ref.path === 'REALTIME_trips_live')).toHaveLength(1);
  const first = driverListener('d1');
  act(() => offerListener().next(snapshot([{ driverId: 'd3', status: 'pending' }])));
  expect(first.unsubscribe).toHaveBeenCalledTimes(1);
  expect(hook.result.current.driversInfo.d1).toBeUndefined();
  expect(driverListener('d3')).toBeDefined();
  act(() => first.next(profile({ name: 'Old' })));
  expect(hook.result.current.driversInfo.d1).toBeUndefined();
  hook.unmount();
  expect(driverListener('d3').unsubscribe).toHaveBeenCalledTimes(1);
});

test('ignores a cached trip belonging to a different client', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const hook = renderHook(() => useRideOffers('ride', 'client', 'area', 'Driver'));
  await waitFor(() => expect(listeners).toHaveLength(2));
  const ride = listeners.find((entry) => entry.ref.path === 'REALTIME_trips_live');
  act(() => ride.next({ id: 'live-ride', exists: () => true, data: () => ({ clientId: 'another-client' }) }));
  expect(hook.result.current.rideSnapshot).toBeNull();
  expect(hook.result.current.error).toBeTruthy();
  act(() => hook.result.current.retry());
  await waitFor(() => expect(listeners.filter((entry) => entry.ref.path === 'REALTIME_trips_live')).toHaveLength(2));
  const retried = listeners.filter((entry) => entry.ref.path === 'REALTIME_trips_live')[1];
  act(() => retried.next({ id: 'live-ride', exists: () => true, data: () => ({ clientId: 'client' }) }));
  expect(hook.result.current.rideSnapshot.clientId).toBe('client');
  hook.unmount();
  warn.mockRestore();
});

test('remains loading until both ride and offers have been received', async () => {
  const hook = renderHook(() => useRideOffers('ride', 'client', 'area', 'Driver'));
  await waitFor(() => expect(offerListener()).toBeDefined());
  act(() => offerListener().next(snapshot([])));
  expect(hook.result.current.loading).toBe(true);
  const ride = listeners.find((entry) => entry.ref.path === 'REALTIME_trips_live');
  act(() => ride.next({ id: 'live-ride', exists: () => true, data: () => ({ clientId: 'client' }) }));
  expect(hook.result.current.loading).toBe(false);
  hook.unmount();
});

test('does not reuse a discovered ride after switching away and back', async () => {
  getDocs.mockResolvedValueOnce({
    docs: [{ id: 'live-a', data: () => ({ status: 'requested', rideId: 'ride-a' }) }],
  });
  getDocs.mockImplementationOnce(() => new Promise(() => {}));
  getDocs.mockResolvedValueOnce({ docs: [] });
  const hook = renderHook(({ user }) => useRideOffers(null, user, 'area', 'Driver'), {
    initialProps: { user: 'a' },
  });
  await waitFor(() => expect(hook.result.current.rideId).toBe('ride-a'));
  hook.rerender({ user: 'b' });
  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2));
  hook.rerender({ user: 'a' });
  expect(hook.result.current.rideId).toBeNull();
  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(3));
  expect(hook.result.current.rideId).toBeNull();
  hook.unmount();
});

test('reports and retries a failed active-ride discovery', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  getDocs.mockRejectedValueOnce(new Error('unavailable'));
  getDocs.mockResolvedValueOnce({
    docs: [{ id: 'live-a', data: () => ({ status: 'requested', rideId: 'ride-a' }) }],
  });
  const hook = renderHook(() => useRideOffers(null, 'a', 'area', 'Driver'));
  await waitFor(() => expect(hook.result.current.error).toBeTruthy());
  expect(hook.result.current.loading).toBe(false);
  act(() => hook.result.current.retry());
  expect(hook.result.current.error).toBeNull();
  await waitFor(() => expect(hook.result.current.rideId).toBe('ride-a'));
  expect(getDocs).toHaveBeenCalledTimes(2);
  hook.unmount();
  warn.mockRestore();
});

test('cleans up a partially attached listener when initialization fails', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const unsubscribe = jest.fn();
  onSnapshot.mockReturnValueOnce(unsubscribe).mockImplementationOnce(() => { throw new Error('failed'); });
  const hook = renderHook(() => useRideOffers('ride', 'client', 'area', 'Driver'));
  await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.offers).toEqual([]);
  hook.unmount();
  warn.mockRestore();
});

test('ignores old listeners and data after changing user and ride', async () => {
  const hook = renderHook(({ ride, user }) => useRideOffers(ride, user, 'area', 'Driver'), {
    initialProps: { ride: 'old', user: 'a' },
  });
  await waitFor(() => expect(offerListener()).toBeDefined());
  const old = offerListener();
  act(() => old.next(snapshot([{ driverId: 'd1', status: 'pending' }])));
  const oldProfile = driverListener('d1');
  act(() => oldProfile.next(profile({ name: 'Old' })));
  hook.rerender({ ride: 'new', user: 'b' });
  expect(hook.result.current.offers).toEqual([]);
  await waitFor(() => expect(listeners.filter((entry) => entry.ref.path === 'REALTIME_driver_offers')).toHaveLength(2));
  expect(old.unsubscribe).toHaveBeenCalledTimes(1);
  expect(oldProfile.unsubscribe).toHaveBeenCalledTimes(1);
  act(() => { old.next(snapshot([{ driverId: 'd1', status: 'pending' }])); oldProfile.next(profile({ name: 'Stale' })); });
  expect(hook.result.current.offers).toEqual([]);
  expect(hook.result.current.driversInfo.d1).toBeUndefined();
  hook.rerender({ ride: 'old', user: 'a' });
  expect(hook.result.current.offers).toEqual([]);
  expect(hook.result.current.driversInfo.d1).toBeUndefined();
  hook.unmount();
});

test('ignores a removed profile listener if the same driver is added again', async () => {
  const hook = renderHook(() => useRideOffers('ride', 'client', 'area', 'Driver'));
  await waitFor(() => expect(offerListener()).toBeDefined());
  act(() => offerListener().next(snapshot([{ driverId: 'd1', status: 'pending' }])));
  const old = driverListener('d1');
  act(() => offerListener().next(snapshot([])));
  act(() => offerListener().next(snapshot([{ driverId: 'd1', status: 'pending' }])));
  const current = listeners.filter((entry) => entry.ref.path === 'REALTIME_driver_public_profiles' && entry.ref.id === 'd1')[1];
  act(() => current.next(profile({ name: 'New' })));
  act(() => old.next(profile({ name: 'Old' })));
  expect(hook.result.current.driversInfo.d1.name).toBe('New');
  hook.unmount();
});

test('does not subscribe after unmount during async initialization', async () => {
  let resolve;
  liveTripDocId.mockImplementation(() => new Promise((r) => { resolve = r; }));
  const hook = renderHook(() => useRideOffers('ride', 'client', 'area', 'Driver'));
  await waitFor(() => expect(resolve).toBeDefined());
  hook.unmount();
  await act(async () => { resolve('live-ride'); });
  expect(onSnapshot).not.toHaveBeenCalled();
});

test('clears offers and profiles if the offer listener fails', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const hook = renderHook(() => useRideOffers('ride', 'client', 'area', 'Driver'));
  await waitFor(() => expect(offerListener()).toBeDefined());
  act(() => offerListener().next(snapshot([{ driverId: 'd1', status: 'pending' }])));
  act(() => driverListener('d1').next(profile({ name: 'Ana' })));
  act(() => offerListener().error(new Error('permission denied')));
  expect(hook.result.current.offers).toEqual([]);
  expect(hook.result.current.driversInfo).toEqual({});
  expect(hook.result.current.error).toBeTruthy();
  expect(driverListener('d1').unsubscribe).toHaveBeenCalledTimes(1);
  act(() => offerListener().next(snapshot([{ driverId: 'd1', status: 'pending' }])));
  expect(hook.result.current.offers).toEqual([]);
  act(() => hook.result.current.retry());
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.loading).toBe(true);
  await waitFor(() => expect(listeners.filter((entry) => entry.ref.path === 'REALTIME_driver_offers')).toHaveLength(2));
  const retried = listeners.filter((entry) => entry.ref.path === 'REALTIME_driver_offers')[1];
  act(() => retried.next(snapshot([{ driverId: 'd2', status: 'pending' }])));
  expect(hook.result.current.offers[0].driverId).toBe('d2');
  hook.unmount();
  warn.mockRestore();
});
