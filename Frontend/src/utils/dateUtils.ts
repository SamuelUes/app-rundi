/**
 * Utilidades para manejo de fechas en zona horaria de Nicaragua (GMT-6)
 */

const NICARAGUA_TIMEZONE = 'America/Managua'; // GMT-6

/**
 * Obtiene la fecha actual en zona horaria de Nicaragua
 */
export const getNicaraguaDate = (): Date => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: NICARAGUA_TIMEZONE }));
};

/**
 * Convierte una fecha UTC a zona horaria de Nicaragua
 */
export const toNicaraguaDate = (date: Date | string): Date => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Date(dateObj.toLocaleString('en-US', { timeZone: NICARAGUA_TIMEZONE }));
};

/**
 * Formatea una fecha en hora de Nicaragua (HH:MM AM/PM)
 */
export const formatNicaraguaTime = (date: Date | string): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
      return '00:00';
    }
    return dateObj.toLocaleTimeString('es-NI', {
      timeZone: NICARAGUA_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (error) {
    return '00:00';
  }
};

/**
 * Formatea una fecha completa en Nicaragua (DD/MM/YYYY HH:MM AM/PM)
 */
export const formatNicaraguaDateTime = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('es-NI', {
    timeZone: NICARAGUA_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Formatea una fecha relativa (Hoy, Ayer, o fecha completa)
 */
export const formatNicaraguaRelativeDate = (date: Date | string): string => {
  try {
    const inputDate = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(inputDate.getTime())) {
      return 'Sin fecha';
    }
    
    const dateObj = toNicaraguaDate(inputDate);
    const today = getNicaraguaDate();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = dateObj.toDateString();
    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    const time = formatNicaraguaTime(dateObj);

    if (dateStr === todayStr) {
      return `Hoy ${time}`;
    } else if (dateStr === yesterdayStr) {
      return `Ayer ${time}`;
    } else {
      const formattedDate = dateObj.toLocaleDateString('es-NI', {
        timeZone: NICARAGUA_TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      return `${formattedDate} ${time}`;
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
