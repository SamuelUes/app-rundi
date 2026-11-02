export function createInFlightRegistration() {
  const pending = new Map<object, Promise<boolean>>();

  return {
    run(key: object, register: () => Promise<boolean>): Promise<boolean> {
      const existing = pending.get(key);
      if (existing) return existing;

      const request = Promise.resolve().then(register);
      pending.set(key, request);
      void request.finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      }).catch(() => {});
      return request;
    },
    clear() {
      pending.clear();
    },
  };
}
