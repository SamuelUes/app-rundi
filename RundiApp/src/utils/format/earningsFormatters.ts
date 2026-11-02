type TFunc = (key: string, options?: any) => string;

export const formatCurrency = (t: TFunc, amount?: number | null): string =>
  t('driver.earnings.labels.currency', {
    amount: Number(amount ?? 0).toFixed(2),
  });

export const formatDate = (dateString: string, dateLocale: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString(dateLocale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDistance = (t: TFunc, meters?: number | null): string =>
  t('driver.earnings.stats.kilometers', {
    value: (Number(meters ?? 0) / 1000).toFixed(1),
  });

export const formatDurationMinutes = (t: TFunc, seconds?: number | null): string =>
  t('driver.earnings.stats.minutes', {
    value: Math.max(0, Math.round((seconds ?? 0) / 60)),
  });

export const formatStatNumber = (
  value: number | null | undefined,
  placeholder: string,
): string => (value === null || value === undefined ? placeholder : value.toString());

export const formatStatCurrency = (
  t: TFunc,
  value: number | null | undefined,
  placeholder: string,
): string => (value === null || value === undefined ? placeholder : formatCurrency(t, value));

export const formatStatDuration = (
  t: TFunc,
  value: number | null | undefined,
  placeholder: string,
): string =>
  value === null || value === undefined ? placeholder : formatDurationMinutes(t, value);

export const formatStatDistance = (
  t: TFunc,
  value: number | null | undefined,
  placeholder: string,
): string => (value === null || value === undefined ? placeholder : formatDistance(t, value));

export const DATE_LOCALE_MAP: Record<string, string> = {
  es: 'es-NI',
  en: 'en-US',
  zh: 'zh-CN',
};
