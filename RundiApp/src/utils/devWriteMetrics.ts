type Operation = 'driver_live' | 'trip_location' | 'presence' | 'session';
type Counts = { attempts: number; lt250ms: number; lt1s: number; lt2500ms: number; gte2500ms: number };
type Window = { startedAt: number | null; previousAt: number | null; counts: Counts };

const emptyCounts = (): Counts => ({ attempts: 0, lt250ms: 0, lt1s: 0, lt2500ms: 0, gte2500ms: 0 });

export function createWriteWindow(): Window {
  return { startedAt: null, previousAt: null, counts: emptyCounts() };
}

export function observeWrite(window: Window, now: number): (Counts & { durationMs: number }) | null {
  if (window.startedAt === null) window.startedAt = now;
  if (window.previousAt !== null) {
    const gap = Math.max(0, now - window.previousAt);
    const bucket = gap < 250 ? 'lt250ms' : gap < 1000 ? 'lt1s' : gap < 2500 ? 'lt2500ms' : 'gte2500ms';
    window.counts[bucket]++;
  }
  window.previousAt = now;
  window.counts.attempts++;
  if (now - window.startedAt < 30000) return null;
  const report = { durationMs: now - window.startedAt, ...window.counts };
  window.counts = emptyCounts();
  window.startedAt = now;
  return report;
}

const windows: Partial<Record<Operation, Window>> = {};

export function devWriteAttempt(operation: Operation): void {
  if (!__DEV__) return;
  const window = windows[operation] ?? (windows[operation] = createWriteWindow());
  const report = observeWrite(window, Date.now());
  if (report) console.log('[Firestore write intervals]', { operation, ...report });
}

type RideTrackingStage =
  | 'task_callback' | 'task_error' | 'task_no_data' | 'task_inactive'
  | 'task_ride_bound' | 'task_ride_missing' | 'task_driver_write_start'
  | 'task_driver_write_confirmed' | 'task_ride_write_start' | 'task_failure'
  | 'task_permission_failure' | 'task_auth_failure'
  | 'tracking_already_active' | 'tracking_started' | 'tracking_fallback' | 'tracking_setup_failed'
  | 'trip_auth_ready' | 'trip_no_auth' | 'trip_no_location'
  | 'trip_write_start' | 'trip_id_resolved' | 'trip_write_skipped'
  | 'trip_write_confirmed' | 'trip_write_failed';

export function devRideTrackingStage(stage: RideTrackingStage): void {
  if (__DEV__) console.log('[Ride tracking diagnostic]', { stage });
}
