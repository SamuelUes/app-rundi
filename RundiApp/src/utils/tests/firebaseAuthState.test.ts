import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { onAuthStateChanged } from 'firebase/auth';
import { waitForFirebaseAuthInitialization } from '../firebase/firebaseAuthState';

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
}));

const mockedOnAuthStateChanged = jest.mocked(onAuthStateChanged);

describe('waitForFirebaseAuthInitialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves after the initial signed-out state and unsubscribes', async () => {
    let emitInitialState: ((user: null) => void) | undefined;
    const unsubscribe = jest.fn();
    mockedOnAuthStateChanged.mockImplementation((_auth, callback) => {
      emitInitialState = callback as (user: null) => void;
      return unsubscribe;
    });
    const auth = {} as any;

    let initialized = false;
    const ready = waitForFirebaseAuthInitialization(auth).then(() => {
      initialized = true;
    });

    expect(initialized).toBe(false);
    emitInitialState?.(null);
    await ready;

    expect(initialized).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
