export const SCHEDULE_MIN_LEAD_MS = 10 * 60 * 1000;
export const SCHEDULE_MAX_AHEAD_MS = 10 * 24 * 60 * 60 * 1000;
export const SCHEDULE_MINUTE_STEP = 5;

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function roundMinutesUp(date: Date, step: number): Date {
  const d = new Date(date);
  const rounded = Math.ceil(d.getMinutes() / step) * step;
  if (rounded >= 60) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  } else {
    d.setMinutes(rounded, 0, 0);
  }
  return d;
}

export function roundMinutesDown(date: Date, step: number): Date {
  const d = new Date(date);
  const rounded = Math.floor(d.getMinutes() / step) * step;
  d.setMinutes(rounded, 0, 0);
  return d;
}

export function getScheduleBounds(nowMs: number = Date.now()) {
  const minDate = roundMinutesUp(new Date(nowMs + SCHEDULE_MIN_LEAD_MS), SCHEDULE_MINUTE_STEP);
  const maxDate = roundMinutesDown(new Date(nowMs + SCHEDULE_MAX_AHEAD_MS), SCHEDULE_MINUTE_STEP);
  return { minDate, maxDate };
}
