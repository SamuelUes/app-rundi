/**
 * Utilidades para formateo de datos de vehículos y conductor.
 * Funciones puras reutilizables extraídas de CompleteVehicleInfoScreen.
 */

/**
 * Convierte un valor de fecha (string, Firestore Timestamp, objeto vacío, null)
 * a formato YYYY-MM-DD. Devuelve '' si el valor no es válido.
 */
export const formatDateValue = (dateValue: any): string => {
  if (!dateValue || dateValue === null || dateValue === undefined) {
    return '';
  }

  if (typeof dateValue === 'object' && Object.keys(dateValue).length === 0) {
    return '';
  }

  if (typeof dateValue === 'object' && dateValue._seconds) {
    const date = new Date(dateValue._seconds * 1000);
    return date.toISOString().split('T')[0];
  }

  if (typeof dateValue === 'string' && dateValue.length > 0) {
    if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateValue;
    }
    if (dateValue.includes('T')) {
      return dateValue.split('T')[0];
    }
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  return '';
};

/**
 * Convierte cualquier valor a string seguro ('' si null/undefined).
 */
export const safeString = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};
