/**
 * Utilidades centralizadas de fechas para compliance.
 * Todas las comparaciones usan DATE calendario en America/Managua
 * (formato 'YYYY-MM-DD', comparable lexicográficamente).
 * Nada de `if (expiry < today)` disperso en el backend.
 */

const NICARAGUA_TZ = 'America/Managua';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NICARAGUA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día calendario actual en Nicaragua como 'YYYY-MM-DD'. */
export function todayNicaragua(now: Date = new Date()): string {
  return dateFormatter.format(now);
}

/** Normaliza Date|string|timestamp a 'YYYY-MM-DD'; null si no es fecha válida. */
export function toDateOnly(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // DATEONLY llega como string 'YYYY-MM-DD'; un Date real se convierte a UTC date
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString().slice(0, 10);
    }
  }

  return null;
}

function toUtcDays(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** -1 si a<b, 0 si iguales, 1 si a>b. */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** expiry < today */
export function isExpired(expiryDate: string | null | undefined, today: string): boolean {
  const date = toDateOnly(expiryDate);
  if (!date) return false;
  return compareDates(date, today) < 0;
}

/** effectiveFrom > today (documento aún no vigente) */
export function isNotYetValid(startDate: string | null | undefined, today: string): boolean {
  const date = toDateOnly(startDate);
  if (!date) return false;
  return compareDates(date, today) > 0;
}

/** today <= expiry <= today + warningDays */
export function isExpiringSoon(
  expiryDate: string | null | undefined,
  today: string,
  warningDays: number,
): boolean {
  const date = toDateOnly(expiryDate);
  if (!date) return false;
  const diff = toUtcDays(date) - toUtcDays(today);
  return diff >= 0 && diff <= warningDays;
}

/** Días hasta el vencimiento (negativo si ya venció). */
export function daysUntilExpiration(
  expiryDate: string | null | undefined,
  today: string,
): number | null {
  const date = toDateOnly(expiryDate);
  if (!date) return null;
  return toUtcDays(date) - toUtcDays(today);
}

/** Días desde el vencimiento (0 si aún vigente). */
export function daysSinceExpiration(
  expiryDate: string | null | undefined,
  today: string,
): number | null {
  const days = daysUntilExpiration(expiryDate, today);
  if (days == null) return null;
  return days < 0 ? -days : 0;
}

export function addDays(dateOnly: string, days: number): string {
  const utc = toUtcDays(dateOnly) + days;
  return new Date(utc * 86_400_000).toISOString().slice(0, 10);
}

/** Año calendario de una fecha 'YYYY-MM-DD'. */
export function yearOf(dateOnly: string): number {
  return Number(dateOnly.slice(0, 4));
}

/**
 * TRUE si today está dentro del período de gracia de pago del rodamiento
 * (Ley 431 Art. 11: pago durante el primer trimestre → hasta el 31 de marzo).
 */
export function isWithinTaxGracePeriod(
  today: string,
  graceEndMonth: number = 3,
  graceEndDay: number = 31,
): boolean {
  const [, m, d] = today.split('-').map(Number);
  if (m < graceEndMonth) return true;
  if (m === graceEndMonth) return d <= graceEndDay;
  return false;
}
