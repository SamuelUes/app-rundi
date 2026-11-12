import { compareSupportCalls, isActiveSupportCall } from './supportCallState';

describe('support call state', () => {
  it('shows the banner only for active call statuses', () => {
    for (const status of ['initiated', 'ringing_client', 'ringing_operator', 'accepted', 'connected', ' ACCEPTED ']) {
      expect(isActiveSupportCall(status)).toBe(true);
    }
    for (const status of ['ended', 'rejected', 'missed', 'unknown', '']) {
      expect(isActiveSupportCall(status)).toBe(false);
    }
  });

  it('selects the latest active call before old terminal calls', () => {
    const calls = [
      { status: 'missed', createdAt: 100 },
      { status: 'accepted', createdAt: 200 },
      { status: 'initiated', createdAt: 300 },
      { status: 'ended', createdAt: 400 },
    ].sort(compareSupportCalls);
    expect(calls.map((call) => call.status)).toEqual(['initiated', 'accepted', 'ended', 'missed']);
  });

  it('sorts terminal calls by timestamp instead of status', () => {
    const calls = [
      { status: 'missed', createdAt: { toMillis: () => 100 } },
      { status: 'ended', createdAt: { toMillis: () => 200 } },
    ].sort(compareSupportCalls);
    expect(calls[0].status).toBe('ended');
  });
});
