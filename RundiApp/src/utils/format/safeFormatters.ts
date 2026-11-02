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
  if (!dateString) return fallback;
  
  try {
    let date: Date;
    
    // Si es un objeto con propiedades _seconds y _nanoseconds (Firebase Timestamp)
    if (typeof dateString === 'object' && dateString._seconds) {
      date = new Date(dateString._seconds * 1000);
    }
    // Si es un objeto Date directo
    else if (dateString instanceof Date) {
      date = dateString;
    }
    // Si es un string ISO o formato válido
    else if (typeof dateString === 'string') {
      date = new Date(dateString);
    }
    // Si es un número (timestamp en ms)
    else if (typeof dateString === 'number') {
      date = new Date(dateString);
    }
    else {
      return fallback;
    }
    
    if (isNaN(date.getTime())) return fallback;
    
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.warn('⚠️ Error formateando fecha-hora:', dateString, error);
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
  if (!dateString) return fallback;
  
  try {
    let date: Date;
    
    // Si es un objeto con propiedades _seconds y _nanoseconds (Firebase Timestamp)
    if (typeof dateString === 'object' && dateString._seconds) {
      date = new Date(dateString._seconds * 1000);
    }
    // Si es un objeto Date directo
    else if (dateString instanceof Date) {
      date = dateString;
    }
    // Si es un string ISO o formato válido
    else if (typeof dateString === 'string') {
      date = new Date(dateString);
    }
    // Si es un número (timestamp en ms)
    else if (typeof dateString === 'number') {
      date = new Date(dateString);
    }
    else {
      return fallback;
    }
    
    if (isNaN(date.getTime())) return fallback;
    
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.warn('⚠️ Error formateando fecha:', dateString, error);
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
  if (!dateString) return fallback;
  
  try {
    let date: Date;
    
    // Si es un objeto con propiedades _seconds y _nanoseconds (Firebase Timestamp)
    if (typeof dateString === 'object' && dateString._seconds) {
      date = new Date(dateString._seconds * 1000);
    }
    // Si es un objeto Date directo
    else if (dateString instanceof Date) {
      date = dateString;
    }
    // Si es un string ISO o formato válido
    else if (typeof dateString === 'string') {
      date = new Date(dateString);
    }
    // Si es un número (timestamp en ms)
    else if (typeof dateString === 'number') {
      date = new Date(dateString);
    }
    else {
      return fallback;
    }
    
    if (isNaN(date.getTime())) return fallback;
    
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.warn('⚠️ Error formateando hora:', dateString, error);
    return fallback;
  }
};

/**
 * Convierte una fecha a objeto Date de forma segura
 * @param dateString - Fecha en formato string o Date
 * @returns Date object o null si es inválida
 */
export const safeToDate = (dateString: any): Date | null => {
  if (!dateString) return null;
  
  try {
    let date: Date;
    
    // Si es un objeto con propiedades _seconds y _nanoseconds (Firebase Timestamp)
    if (typeof dateString === 'object' && dateString._seconds) {
      date = new Date(dateString._seconds * 1000);
    }
    // Si es un objeto Date directo
    else if (dateString instanceof Date) {
      date = dateString;
    }
    // Si es un string ISO o formato válido
    else if (typeof dateString === 'string') {
      date = new Date(dateString);
    }
    // Si es un número (timestamp en ms)
    else if (typeof dateString === 'number') {
      date = new Date(dateString);
    }
    else {
      return null;
    }
    
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

export function currency(amount: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

export function formatCurrency(amount: number | string | undefined | null) {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  return `C$${numAmount.toFixed(2)}`;
}

export function timeAgo(date: Date | number) {
  const d = typeof date === 'number' ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'hace unos segundos';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)} h`;
}
