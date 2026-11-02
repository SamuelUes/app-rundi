import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let mockAuthStateListener: ((user: null) => void) | undefined;
const mockAuth = { currentUser: null };
const mockStorage = {};

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(() => mockAuth),
  getAuth: jest.fn(() => mockAuth),
  onAuthStateChanged: jest.fn((_auth: unknown, listener: (user: null) => void) => {
    mockAuthStateListener = listener;
    return jest.fn();
  }),
  connectAuthEmulator: jest.fn(),
  getReactNativePersistence: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  initializeFirestore: jest.fn(() => ({})),
  connectFirestoreEmulator: jest.fn(),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
}));

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => mockStorage),
  connectStorageEmulator: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
jest.mock('../localEmulatorHost', () => ({ resolveLocalEmulatorHost: jest.fn(() => 'localhost') }));

describe('Firebase service initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthStateListener = undefined;
    delete process.env.USE_FIREBASE_EMULATORS;
  });

  it('waits for Auth initialization and completes while signed out', async () => {
    let settled = false;
    const { getFirebaseStorage } = require('../firebase');
    const storagePromise = getFirebaseStorage().then((storage: unknown) => {
      settled = true;
      return storage;
    });

    expect(mockAuthStateListener).toBeDefined();
    expect(settled).toBe(false);
    mockAuthStateListener?.(null);

    await expect(storagePromise).resolves.toBe(mockStorage);
    expect(mockAuth.currentUser).toBeNull();
  });
});
