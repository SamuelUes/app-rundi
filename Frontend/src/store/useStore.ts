import { useState } from 'react';

// Very small placeholder store. Consider Zustand or Redux later.
export function useStore<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  return { state, setState };
}
