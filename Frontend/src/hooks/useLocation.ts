import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Ubicación por defecto: Managua, Nicaragua
const DEFAULT_LOCATION: Coordinates = {
  latitude: 12.1364,
  longitude: -86.2514,
};

export function useLocation() {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUsingMockLocation, setIsUsingMockLocation] = useState(false);

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async () => {
    try {
      setLoading(true);
      setError(null);
      setIsUsingMockLocation(false);

      // Solicitar permisos
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        console.warn('⚠️ Permiso de ubicación denegado. Usando ubicación mock: Managua');
        setError('Permiso de ubicación denegado');
        setCoords(DEFAULT_LOCATION);
        setIsUsingMockLocation(true);
        return;
      }

      // Obtener ubicación actual con timeout
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000)
      );

      const location = await Promise.race([locationPromise, timeoutPromise]) as Location.LocationObject;

      console.log('✅ Ubicación obtenida:', location.coords.latitude, location.coords.longitude);
      setCoords({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (err: any) {
      console.warn('⚠️ Error al obtener ubicación GPS. Usando ubicación mock: Managua');
      console.error('Error details:', err.message);
      setError(err.message === 'Timeout' ? 'Timeout al obtener ubicación' : 'Error al obtener ubicación');
      setCoords(DEFAULT_LOCATION);
      setIsUsingMockLocation(true);
    } finally {
      setLoading(false);
    }
  };

  const refreshLocation = () => {
    getLocation();
  };

  return {
    coords,
    error,
    loading,
    refreshLocation,
    isUsingMockLocation,
  };
}
