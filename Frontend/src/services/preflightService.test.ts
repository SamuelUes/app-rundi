import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';
import client from '../api/client';
import { waitForFirebaseAuthUser } from '../utils/firebaseAuthReady';
import preflightService from './preflightService';

jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('../config/firebase', () => ({ getFirebaseFunctions: jest.fn() }));
jest.mock('../api/client', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../utils/firebaseAuthReady', () => ({ waitForFirebaseAuthUser: jest.fn() }));

const mockedCallable = httpsCallable as any;
const mockedGetFunctions = getFirebaseFunctions as any;
const mockedPost = client.post as any;
const mockedWaitForAuth = waitForFirebaseAuthUser as any;

function authUser(uid: string) {
  return { uid, getIdToken: (jest.fn() as any).mockResolvedValue('id-token') };
}

function response(userId: string) {
  return {
    success: true,
    role: 'client' as const,
    userId,
    timestamp: 1,
    terms: { currentVersion: '1.0', acceptedAllDocuments: true },
    activeRide: null,
    programmedRide: null,
    pendingPayments: null,
  };
}

describe('preflightService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    preflightService.clearCache();
    mockedGetFunctions.mockResolvedValue({});
    mockedCallable.mockReturnValue(jest.fn());
  });

  it('caches a valid response for the same authenticated user and request', async () => {
    const user = authUser('client-1');
    mockedWaitForAuth.mockResolvedValue(user);
    mockedPost.mockResolvedValue({ data: response('client-1') });

    const payload = { role: 'client' as const, userId: 'client-1' };
    const first = await preflightService.fetchPreflightData(payload);
    const second = await preflightService.fetchPreflightData(payload);

    expect(first).toEqual(second);
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(user.getIdToken).not.toHaveBeenCalled();
  });

  it('does not reuse a cached response when the authenticated user changes', async () => {
    mockedWaitForAuth
      .mockResolvedValueOnce(authUser('client-1'))
      .mockResolvedValueOnce(authUser('client-2'));
    mockedPost
      .mockResolvedValueOnce({ data: response('client-1') })
      .mockResolvedValueOnce({ data: response('client-2') });

    const payload = { role: 'client' as const };
    const first = await preflightService.fetchPreflightData(payload);
    const second = await preflightService.fetchPreflightData(payload);

    expect(first.userId).toBe('client-1');
    expect(second.userId).toBe('client-2');
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });

  it('falls back to the callable when the HTTP endpoint is missing', async () => {
    const callable = (jest.fn() as any).mockResolvedValue({ data: response('client-1') });
    mockedWaitForAuth.mockResolvedValue(authUser('client-1'));
    mockedPost.mockRejectedValue({ response: { status: 404 } });
    mockedCallable.mockReturnValue(callable);

    const result = await preflightService.fetchPreflightData({ role: 'client', userId: 'client-1' });

    expect(result.userId).toBe('client-1');
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token only after an HTTP 401 response', async () => {
    const user = {
      uid: 'client-1',
      getIdToken: (jest.fn() as any).mockResolvedValueOnce('expired-token').mockResolvedValueOnce('refreshed-token'),
    };
    mockedWaitForAuth.mockResolvedValue(user);
    mockedPost
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce({ data: response('client-1') });

    const result = await preflightService.fetchPreflightData({ role: 'client', userId: 'client-1' });

    expect(result.userId).toBe('client-1');
    expect(user.getIdToken.mock.calls).toEqual([[true]]);
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });

  it('uses the callable after an HTTP server failure', async () => {
    const callable = (jest.fn() as any).mockResolvedValue({ data: response('client-1') });
    mockedWaitForAuth.mockResolvedValue(authUser('client-1'));
    mockedPost.mockRejectedValue({ response: { status: 503 } });
    mockedCallable.mockReturnValue(callable);

    const result = await preflightService.fetchPreflightData({ role: 'client', userId: 'client-1' });

    expect(result.userId).toBe('client-1');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it('discards an in-flight response after the cache is cleared', async () => {
    mockedWaitForAuth.mockResolvedValue(authUser('client-1'));
    mockedPost.mockImplementationOnce(async () => {
      preflightService.clearCache();
      return { data: response('client-1') };
    });

    await expect(
      preflightService.fetchPreflightData({ role: 'client', userId: 'client-1' }),
    ).rejects.toThrow('sesión cambió');
  });

  it('does not cache a response for a different user', async () => {
    mockedWaitForAuth.mockResolvedValue(authUser('client-1'));
    mockedPost.mockResolvedValue({ data: response('other-user') });

    const payload = { role: 'client' as const, userId: 'client-1' };
    await expect(preflightService.fetchPreflightData(payload)).rejects.toThrow('otro usuario');
    await expect(preflightService.fetchPreflightData(payload)).rejects.toThrow('otro usuario');
    expect(mockedPost).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable HTTP permission error', async () => {
    const error = { response: { status: 403 } };
    mockedWaitForAuth.mockResolvedValue(authUser('client-1'));
    mockedPost.mockRejectedValue(error);

    await expect(
      preflightService.fetchPreflightData({ role: 'client', userId: 'client-1' }),
    ).rejects.toBe(error);
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('sends the expected UID with terms acceptance', async () => {
    const callable = (jest.fn() as any).mockResolvedValue({ data: { success: true } });
    mockedWaitForAuth.mockResolvedValue(authUser('client-1'));
    mockedCallable.mockReturnValue(callable);

    await preflightService.acceptTerms('client-1', '1.0', {
      general: true,
      users: true,
      designated_driver: true,
    });

    expect(callable).toHaveBeenCalledWith({
      expectedUid: 'client-1',
      version: '1.0',
      acceptedDocuments: { general: true, users: true, designated_driver: true },
    });
  });

  it('refuses terms acceptance if the Firebase user changed', async () => {
    mockedWaitForAuth.mockResolvedValue(authUser('other-user'));

    await expect(
      preflightService.acceptTerms('client-1', '1.0', {
        general: true,
        users: true,
        designated_driver: true,
      }),
    ).rejects.toThrow('no coincide');
    expect(mockedGetFunctions).not.toHaveBeenCalled();
  });
});
