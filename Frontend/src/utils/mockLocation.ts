/**
 * Mock Location Helper
 * Útil para testing en emulador sin GPS
 */

export const MOCK_LOCATIONS = {
  // Managua, Nicaragua
  managua: {
    latitude: 12.1364,
    longitude: -86.2514,
  },
  // Metrocentro Managua
  metrocentro: {
    latitude: 12.1258,
    longitude: -86.2674,
  },
  // Plaza Inter
  plazaInter: {
    latitude: 12.1167,
    longitude: -86.2362,
  },
  // Aeropuerto Internacional Augusto C. Sandino
  aeropuerto: {
    latitude: 12.1415,
    longitude: -86.1682,
  },
  // Universidad Centroamericana (UCA)
  uca: {
    latitude: 12.1167,
    longitude: -86.2697,
  },
  // Rotonda El Güegüense
  rotondaGueguense: {
    latitude: 12.1308,
    longitude: -86.2508,
  },
};

/**
 * Obtener ubicación mock para testing
 * @param locationName Nombre de la ubicación predefinida
 * @returns Coordenadas de la ubicación
 */
export const getMockLocation = (locationName: keyof typeof MOCK_LOCATIONS = 'managua') => {
  return MOCK_LOCATIONS[locationName];
};

/**
 * Verificar si estamos en modo desarrollo
 */
export const isDevelopment = () => {
  return __DEV__;
};

/**
 * Usar ubicación mock si estamos en desarrollo y no hay GPS
 */
export const useMockLocationIfNeeded = async (
  getCurrentPosition: () => Promise<{ latitude: number; longitude: number } | null>
): Promise<{ latitude: number; longitude: number }> => {
  try {
    const position = await getCurrentPosition();
    if (position) {
      return position;
    }
  } catch (error) {
    console.warn('No se pudo obtener ubicación real, usando mock:', error);
  }

  // Si falla o estamos en desarrollo, usar ubicación mock
  if (isDevelopment()) {
    console.log('🧪 Usando ubicación mock: Managua, Nicaragua');
    return getMockLocation('managua');
  }

  throw new Error('No se pudo obtener la ubicación');
};
