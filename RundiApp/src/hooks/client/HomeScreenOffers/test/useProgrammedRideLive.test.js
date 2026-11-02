import { act, renderHook, waitFor } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../../config/firebase';
import { useProgrammedRideLive } from '../useProgrammedRideLive';

jest.mock('../../../../config/firebase', () => ({ getFirebaseFirestore: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, path, id) => ({ path, id })),
  onSnapshot: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  getFirebaseFirestore.mockResolvedValue({});
});

test('does not attach a programmed-ride listener after unmount', async () => {
  let resolve;
  getFirebaseFirestore.mockImplementation(() => new Promise((r) => { resolve = r; }));
  const hook = renderHook(() => useProgrammedRideLive('ride', 'client', true));
  await waitFor(() => expect(resolve).toBeDefined());
  hook.unmount();
  await act(async () => { resolve({}); });
  expect(onSnapshot).not.toHaveBeenCalled();
});

test('clears programmed-ride data on identity change and ignores old events', async () => {
  const listeners = [];
  onSnapshot.mockImplementation((ref, next) => {
    const unsubscribe = jest.fn();
    listeners.push({ ref, next, unsubscribe });
    return unsubscribe;
  });
  const hook = renderHook(({ ride, user }) => useProgrammedRideLive(ride, user, true), {
    initialProps: { ride: 'ride-a', user: 'a' },
  });
  await waitFor(() => expect(listeners).toHaveLength(1));
  act(() => listeners[0].next({ id: 'ride-a', exists: () => true, data: () => ({ clientId: 'a', driverId: 'driver-a' }) }));
  expect(hook.result.current.driverId).toBe('driver-a');
  hook.rerender({ ride: 'ride-b', user: 'b' });
  expect(hook.result.current).toBeNull();
  await waitFor(() => expect(listeners).toHaveLength(2));
  expect(listeners[0].unsubscribe).toHaveBeenCalledTimes(1);
  act(() => listeners[0].next({ id: 'ride-a', exists: () => true, data: () => ({ clientId: 'a', driverId: 'stale' }) }));
  expect(hook.result.current).toBeNull();
  hook.rerender({ ride: 'ride-a', user: 'a' });
  expect(hook.result.current).toBeNull();
  hook.unmount();
});

test('clears data after a listener error and does not subscribe when disabled', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  let next;
  let onError;
  const unsubscribe = jest.fn();
  onSnapshot.mockImplementation((_ref, callback, error) => {
    next = callback;
    onError = error;
    return unsubscribe;
  });
  const hook = renderHook(({ enabled }) => useProgrammedRideLive('ride', 'client', enabled), {
    initialProps: { enabled: true },
  });
  await waitFor(() => expect(next).toBeDefined());
  act(() => next({ id: 'ride', exists: () => true, data: () => ({ clientId: 'other', driverId: 'driver' }) }));
  expect(hook.result.current).toBeNull();
  act(() => next({ id: 'ride', exists: () => true, data: () => ({ clientId: 'client', driverId: 'driver' }) }));
  expect(hook.result.current.driverId).toBe('driver');
  act(() => onError(new Error('permission denied')));
  expect(hook.result.current).toBeNull();
  act(() => next({ id: 'ride', exists: () => true, data: () => ({ clientId: 'client', driverId: 'stale' }) }));
  expect(hook.result.current).toBeNull();
  hook.rerender({ enabled: false });
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(hook.result.current).toBeNull();
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  hook.unmount();
  warn.mockRestore();
});
