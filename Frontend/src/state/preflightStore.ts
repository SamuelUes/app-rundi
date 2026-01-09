import type { PreflightRole, PreflightRegionInfo } from '../types/preflight';

export type PreflightActionType = 'pending_payment' | 'active_ride' | 'penalties';

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
};

let currentSummary: PreflightSummary | null = null;
const listeners = new Set<(summary: PreflightSummary | null) => void>();

export function setPreflightResult(summary: PreflightSummary | null) {
  currentSummary = summary;
  listeners.forEach((listener) => {
    try {
      listener(currentSummary);
    } catch (error) {
      console.warn('[preflightStore] Error notifying listener:', error);
    }
  });
}

export function getPreflightResult(): PreflightSummary | null {
  return currentSummary;
}

export function subscribePreflightResult(listener: (summary: PreflightSummary | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearPreflightResult() {
  setPreflightResult(null);
}
