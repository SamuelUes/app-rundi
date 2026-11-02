import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFirebaseData, useFirebaseItem } from '../useFirebaseData';
import { getFirebaseFirestore } from '../../../../config/firebase';
import { onSnapshot, getDoc } from 'firebase/firestore';
import { liveTripDocId } from '../../../../live/tripIds';
import { FS_COL } from '../../../../constants/firestore';

let mockUid = 'user-a';
jest.mock('../../../../stores/authStore', () => ({
  useAuthStore: (selector) => selector({ user: mockUid ? { id: mockUid } : null }),
}));
jest.mock('../../../../config/firebase', () => ({ getFirebaseFirestore: jest.fn() }));
jest.mock('../../../../live/tripIds', () => ({ liveTripDocId: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, path) => ({ path })),
  collection: jest.fn((_db, path) => ({ path })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn((ref) => ref),
  orderBy: jest.fn(),
  limit: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUid = 'user-a';
  getFirebaseFirestore.mockResolvedValue({});
});

test('does not attach a listener after unmount during initialization', async () => {
  let resolve;
  getFirebaseFirestore.mockImplementation(() => new Promise((r) => { resolve = r; }));
  const hook = renderHook(() => useFirebaseData('DATA-MAIN_users/user-a'));
  hook.unmount();
  await act(async () => { resolve({}); });
  expect(onSnapshot).not.toHaveBeenCalled();
});

test('ignores old reads when path changes', async () => {
  let resolve;
  getDoc.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ value: 'new' }) });
  const hook = renderHook(({ path }) => useFirebaseData(path, { once: true }), {
    initialProps: { path: 'DATA-MAIN_users/old' },
  });
  await waitFor(() => expect(resolve).toBeDefined());
  hook.rerender({ path: 'DATA-MAIN_users/new' });
  await waitFor(() => expect(hook.result.current.data).toEqual({ value: 'new' }));
  await act(async () => { resolve({ exists: () => true, data: () => ({ value: 'old' }) }); });
  expect(hook.result.current.data).toEqual({ value: 'new' });
});

test('does not reuse cached data between users', async () => {
  getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ owner: 'a' }) });
  getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ owner: 'b' }) });
  const hook = renderHook(() => useFirebaseData('DATA-MAIN_users/shared', { once: true, maxCacheAge: 60000 }));
  await waitFor(() => expect(hook.result.current.data).toEqual({ owner: 'a' }));
  mockUid = 'user-b';
  hook.rerender({});
  await waitFor(() => expect(hook.result.current.data).toEqual({ owner: 'b' }));
  expect(getDoc).toHaveBeenCalledTimes(2);
});

test('does not subscribe to the previous trip while a new id resolves', async () => {
  let resolveNew;
  liveTripDocId.mockResolvedValueOnce('live-old');
  liveTripDocId.mockImplementationOnce(() => new Promise((r) => { resolveNew = r; }));
  const unsubscribe = jest.fn();
  onSnapshot.mockReturnValue(unsubscribe);
  const hook = renderHook(({ id }) => useFirebaseItem(FS_COL.tripsLive, id), {
    initialProps: { id: 'old' },
  });
  await waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));
  hook.rerender({ id: 'new' });
  await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  expect(onSnapshot).toHaveBeenCalledTimes(1);
  await act(async () => { resolveNew('live-new'); });
  await waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(2));
});
