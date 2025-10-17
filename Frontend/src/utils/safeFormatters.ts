/**
 * Utilidades para formateo seguro de datos
 * Previene errores de renderizado por tipos incorrectos
 */

/**
 * Convierte cualquier valor a string de forma segura
 * @param value - Valor a convertir
 * @param fallback - Valor por defecto si es inválido
 * @returns String seguro para renderizar
 */
export const safeString = (value: any, fallback: string = 'N/A'): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return fallback;
  return String(value);
};

/**
 * Formatea una fecha de forma segura
 * @param dateString - Fecha en formato string o Date
 * @param fallback - Valor por defecto si es inválida
 * @returns Fecha formateada o fallback
 */
export const safeFormatDateTime = (dateString: any, fallback: string = 'N/A'): string => {
  if (!dateString || typeof dateString === 'object') return fallback;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return fallback;
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fallback;
  }
};

/**
 * Formatea una fecha de forma segura (solo fecha)
 * @param dateString - Fecha en formato string o Date
 * @param fallback - Valor por defecto si es inválida
 * @returns Fecha formateada o fallback
 */
export const safeFormatDate = (dateString: any, fallback: string = 'N/A'): string => {
  if (!dateString || typeof dateString === 'object') return fallback;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return fallback;
  }
};

/**
 * Formatea una fecha de forma segura (solo hora)
 * @param dateString - Fecha en formato string o Date
 * @param fallback - Valor por defecto si es inválida
 * @returns Hora formateada o fallback
 */
export const safeFormatTime = (dateString: any, fallback: string = 'N/A'): string => {
  if (!dateString || typeof dateString === 'object') return fallback;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return fallback;
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fallback;
  }
};

/**
 * Convierte una fecha a objeto Date de forma segura
 * @param dateString - Fecha en formato string o Date
 * @returns Date object o null si es inválida
 */
export const safeToDate = (dateString: any): Date | null => {
  if (!dateString || typeof dateString === 'object') return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
};

/**
 * Formatea duración en segundos a formato legible
 * @param seconds - Segundos a formatear
 * @returns String formateado (ej: "1h 30m" o "45m")
 */
export const safeFormatDuration = (seconds: any): string => {
  const sec = parseInt(String(seconds || 0));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

/**
 * Convierte número a formato de precio
 * @param value - Valor numérico
 * @param currency - Símbolo de moneda
 * @returns Precio formateado
 */
export const safeFormatPrice = (value: any, currency: string = 'C$'): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === null || num === undefined) return `${currency}0.00`;
  return `${currency}${num.toFixed(2)}`;
};

/**
 * Convierte número a formato de distancia en km
 * @param meters - Distancia en metros
 * @returns Distancia formateada en km
 */
export const safeFormatDistance = (meters: any): string => {
  const m = parseFloat(String(meters || 0));
  if (isNaN(m)) return '0.0 km';
  return `${(m / 1000).toFixed(1)} km`;
};
