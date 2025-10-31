/**
 * Utilidades para manejo de fechas en zona horaria de Nicaragua (GMT-6)
 */

const NICARAGUA_TIMEZONE = 'America/Managua'; // GMT-6
const NICARAGUA_OFFSET_MINUTES = -6 * 60;

type DateInput = Date | string | number;

const toDate = (value: DateInput): Date => {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  return new Date(value);
};

const applyTimezoneOffset = (value: DateInput, offsetMinutes: number): Date => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(NaN);
  }
  const utcMillis = date.getTime();
  const targetMillis = utcMillis + offsetMinutes * 60 * 1000;
  return new Date(targetMillis);
};

/**
 * Obtiene la fecha actual en zona horaria de Nicaragua
 */
export const getNicaraguaDate = (): Date => {
  return applyTimezoneOffset(new Date(), NICARAGUA_OFFSET_MINUTES);
};

/**
 * Convierte una fecha UTC a zona horaria de Nicaragua
 */
export const toNicaraguaDate = (date: DateInput): Date => {
  return applyTimezoneOffset(date, NICARAGUA_OFFSET_MINUTES);
};

/**
 * Formatea una fecha en hora de Nicaragua (HH:MM AM/PM)
 */
export const formatNicaraguaTime = (date: DateInput): string => {
  try {
    const dateObj = toNicaraguaDate(date);
    if (Number.isNaN(dateObj.getTime())) {
      return '00:00';
    }
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (error) {
    return '00:00';
  }
};

/**
 * Formatea una fecha completa en Nicaragua (DD/MM/YYYY HH:MM AM/PM)
 */
export const formatNicaraguaDateTime = (date: DateInput): string => {
  const dateObj = toNicaraguaDate(date);
  if (Number.isNaN(dateObj.getTime())) {
    return 'Sin fecha';
  }
  const day = dateObj.getDate().toString().padStart(2, '0');
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const year = dateObj.getFullYear();
  const hours = dateObj.getHours().toString().padStart(2, '0');
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Formatea una fecha relativa (Hoy, Ayer, o fecha completa)
 */
export const formatNicaraguaRelativeDate = (date: DateInput): string => {
  try {
    const inputDate = toNicaraguaDate(date);
    if (Number.isNaN(inputDate.getTime())) {
      return 'Sin fecha';
    }
    const today = getNicaraguaDate();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = inputDate.toDateString();
    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    const time = formatNicaraguaTime(inputDate);

    if (dateStr === todayStr) {
      return `Hoy ${time}`;
    } else if (dateStr === yesterdayStr) {
      return `Ayer ${time}`;
    } else {
      const day = inputDate.getDate().toString().padStart(2, '0');
      const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const month = monthNames[inputDate.getMonth()];
      const year = inputDate.getFullYear();
      return `${day} ${month} ${year} ${time}`;
    }
  } catch (error) {
    return 'Sin fecha';
  }
};

/**
 * Calcula tiempo estimado de llegada en Nicaragua
 */
export const calculateNicaraguaETA = (durationInMinutes: number): string => {
  const now = getNicaraguaDate();
  const eta = new Date(now.getTime() + durationInMinutes * 60000);
  return formatNicaraguaTime(eta);
};

/**
 * Obtiene timestamp actual en Nicaragua
 */
export const getNicaraguaTimestamp = (): number => {
  return getNicaraguaDate().getTime();
};
