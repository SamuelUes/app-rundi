export interface TripLocationWriteGate {
  inFlight: boolean;
  lastConfirmedAt: number | null;
}

export const TRIP_LOCATION_WRITE_INTERVAL_MS = 8000;

export function createTripLocationWriteGate(): TripLocationWriteGate {
  return { inFlight: false, lastConfirmedAt: null };
}

export function claimTripLocationWrite(
  gate: TripLocationWriteGate,
  now: number,
  minIntervalMs = TRIP_LOCATION_WRITE_INTERVAL_MS,
): boolean {
  if (gate.inFlight) return false;
  if (
    gate.lastConfirmedAt !== null &&
    Math.max(0, now - gate.lastConfirmedAt) < minIntervalMs
  ) {
    return false;
  }
  gate.inFlight = true;
  return true;
}

export function confirmTripLocationWrite(gate: TripLocationWriteGate, now: number): void {
  gate.lastConfirmedAt = now;
  gate.inFlight = false;
}

export function releaseTripLocationWrite(gate: TripLocationWriteGate): void {
  gate.inFlight = false;
}
