import { createInFlightRegistration } from './inFlightRegistration';

describe('in-flight FCM registrations', () => {
  it('shares concurrent requests for the same user and retries after completion', async () => {
    const registrations = createInFlightRegistration();
    const user = { uid: 'user-a' };
    let finish!: (value: boolean) => void;
    const register = jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const first = registrations.run(user, register);
    const second = registrations.run(user, register);
    await Promise.resolve();
    expect(register).toHaveBeenCalledTimes(1);
    finish(false);
    expect(await Promise.all([first, second])).toEqual([false, false]);
    expect(await registrations.run(user, async () => true)).toBe(true);
  });

  it('isolates users and does not let an old completion clear a new request', async () => {
    const registrations = createInFlightRegistration();
    const user = { uid: 'user-a' };
    let finishOld!: (value: boolean) => void;
    const old = registrations.run(user, () => new Promise((resolve) => { finishOld = resolve; }));
    const other = registrations.run({ uid: 'user-b' }, async () => true);
    await Promise.resolve();
    registrations.clear();
    let finishNew!: (value: boolean) => void;
    const registerNew = jest.fn(() => new Promise<boolean>((resolve) => { finishNew = resolve; }));
    const current = registrations.run(user, registerNew);
    await Promise.resolve();
    finishOld(true);
    await old;
    const shared = registrations.run(user, registerNew);
    expect(registerNew).toHaveBeenCalledTimes(1);
    finishNew(true);
    expect(await Promise.all([other, current, shared])).toEqual([true, true, true]);
  });

  it('does not share work between sessions for the same user ID', async () => {
    const registrations = createInFlightRegistration();
    const first = registrations.run({ uid: 'user-a' }, async () => false);
    const second = registrations.run({ uid: 'user-a' }, async () => true);
    expect(await Promise.all([first, second])).toEqual([false, true]);
  });
});
