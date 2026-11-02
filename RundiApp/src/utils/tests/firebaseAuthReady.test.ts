import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getFirebaseAuth } from '../../config/firebase';
import { requireFirebaseAuthUser } from '../firebase/firebaseAuthReady';

jest.mock('../../config/firebase', () => ({
  getFirebaseAuth: jest.fn(),
}));

const mockedGetFirebaseAuth = jest.mocked(getFirebaseAuth);

describe('requireFirebaseAuthUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the current Firebase user', async () => {
    const user = { uid: 'user-1' };
    mockedGetFirebaseAuth.mockResolvedValue({ currentUser: user } as any);

    await expect(requireFirebaseAuthUser()).resolves.toBe(user);
  });

  it('fails immediately when Auth resolved without a user', async () => {
    mockedGetFirebaseAuth.mockResolvedValue({ currentUser: null } as any);

    await expect(requireFirebaseAuthUser()).rejects.toThrow('Se requiere una sesión de Firebase válida');
  });

  it('rejects a user that does not match the expected UID', async () => {
    mockedGetFirebaseAuth.mockResolvedValue({ currentUser: { uid: 'other-user' } } as any);

    await expect(requireFirebaseAuthUser('expected-user')).rejects.toThrow('Se requiere una sesión de Firebase válida');
  });
});
