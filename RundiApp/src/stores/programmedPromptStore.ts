import { create } from 'zustand';

type PromptRole = 'client' | 'driver';

type PromptRequest = {
  rideId: string;
  role: PromptRole;
  sequence: number;
};

type State = {
  request: PromptRequest | null;
  open: (role: PromptRole, rideId: string) => void;
};

export const useProgrammedPromptStore = create<State>((set) => ({
  request: null,
  open: (role, rideId) => set((state) => ({
    request: { role, rideId, sequence: (state.request?.sequence ?? 0) + 1 },
  })),
}));

export const openProgrammedPrompt = (role: PromptRole, rideId: string) => {
  useProgrammedPromptStore.getState().open(role, rideId);
};
