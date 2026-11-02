/**
 * Preflight Store (Zustand)
 * Replaces the manual pub/sub pattern with a Zustand store.
 * Exports the same function-based API as a shim for backward compatibility.
 */

import { create } from 'zustand';
import type { GetPreflightDataResponse, PreflightRole, PreflightRegionInfo } from '../types/preflight';

export type PreflightActionType =
  | 'pending_payment'
  | 'active_ride'
  | 'penalties'
  | 'recharge_funds'
  | 'programmed_ride_client_confirm'
  | 'programmed_ride_driver_confirm';

export type PreflightAction = {
  type: PreflightActionType;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  routeName?: string;
  routeParams?: Record<string, any> | undefined;
  metadata?: Record<string, any>;
};

export type PreflightSummary = {
  role: PreflightRole;
  timestamp: number;
  actions: PreflightAction[];
  region?: PreflightRegionInfo;
  preflightData?: GetPreflightDataResponse;
};

interface PreflightState {
  summary: PreflightSummary | null;
  setSummary: (summary: PreflightSummary | null) => void;
  clear: () => void;
}

const usePreflightStore = create<PreflightState>((set) => ({
  summary: null,
  setSummary: (summary) => set({ summary }),
  clear: () => set({ summary: null }),
}));

// Shim: backward-compatible function API
export function setPreflightResult(summary: PreflightSummary | null) {
  usePreflightStore.getState().setSummary(summary);
}

export function getPreflightResult(): PreflightSummary | null {
  return usePreflightStore.getState().summary;
}

export function subscribePreflightResult(listener: (summary: PreflightSummary | null) => void) {
  return usePreflightStore.subscribe((state) => listener(state.summary));
}

export function clearPreflightResult() {
  usePreflightStore.getState().clear();
}
