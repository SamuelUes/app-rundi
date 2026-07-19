/**
 * Auth Store (Zustand)
 * Holds auth state without side effects. Actions are implemented in useAuthActions.
 */

import { create } from 'zustand';
import type { User } from '../types/User';

export type { User };

interface AuthState {
  user: User | null;
  loading: boolean;
  logoutInProgress: boolean;
  userMode: 'client' | 'driver';
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setLogoutInProgress: (value: boolean) => void;
  setUserMode: (mode: 'client' | 'driver') => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  logoutInProgress: false,
  userMode: 'client',

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setLogoutInProgress: (value) => set({ logoutInProgress: value }),
  setUserMode: (mode) => set({ userMode: mode }),
}));
