import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

/**
 * POST /tracking/location
 * Guardar ubicación del conductor durante el viaje
 * Solo se guarda si el viaje está en estado 'in_progress'
 */
export const saveLocation = async (req: Request, res: Response) => {
  try {
    const { rideId, latitude, longitude, speed, heading, accuracy } = req.body;

    // Validaciones
    if (!rideId || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'rideId, latitude y longitude son requeridos',
      });
    }

    // Verificar que el viaje existe y está en progreso
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('id, status')
      .eq('id', rideId)
      .single() as { data: any; error: any };

    if (rideError || !ride) {
      return res.status(404).json({
        success: false,
        message: 'Viaje no encontrado',
      });
    }

    // Solo guardar si el viaje está en progreso
    if (ride.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: `No se puede guardar ubicación. El viaje está en estado: ${ride.status}. Solo se guarda cuando está "in_progress"`,
      });
    }

    // Guardar ubicación
    const { data: location, error: locationError } = await supabase
      .from('ride_locations')
      .insert({
        ride_id: rideId,
        latitude,
        longitude,
        speed: speed || null,
        heading: heading || null,
        accuracy: accuracy || null,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single() as { data: any; error: any };

    if (locationError) {
      console.error('Error guardando ubicación:', locationError);
      return res.status(500).json({
        success: false,
        message: 'Error guardando ubicación',
        error: locationError.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Ubicación guardada correctamente',
      data: location,
    });
  } catch (error: any) {
    console.error('Error en saveLocation:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
    });
  }
};

/**
 * GET /tracking/route/:rideId
 * Obtener historial completo de ruta de un viaje
 */
export const getRouteHistory = async (req: Request, res: Response) => {
  try {
    const { rideId } = req.params;

    if (!rideId) {
      return res.status(400).json({
        success: false,
        message: 'rideId es requerido',
      });
    }

    // Verificar que el viaje existe
    const { data: ride, error: rideError } = (await supabase
      .from('rides')
      .select('id')
      .eq('id', rideId)
      .single()) as { data: any; error: any };

    if (rideError || !ride) {
      return res.status(404).json({
        success: false,
        message: 'Viaje no encontrado',
      });
    }

    // Obtener todas las ubicaciones ordenadas por timestamp
    const { data: locations, error: locationsError } = (await supabase
      .from('ride_locations')
      .select('*')
      .eq('ride_id', rideId)
      .order('timestamp', { ascending: true })) as { data: any; error: any };

    if (locationsError) {
      console.error('Error obteniendo historial:', locationsError);
      return res.status(500).json({
        success: false,
        message: 'Error obteniendo historial de ruta',
        error: locationsError.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        rideId,
        totalPoints: locations?.length || 0,
        route: locations || [],
      },
    });
  } catch (error: any) {
    console.error('Error en getRouteHistory:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
    });
  }
};

/**
 * GET /tracking/eta/:rideId?lat=&lng=
 * Calcular ETA (Estimated Time of Arrival)
 */
export const calculateETA = async (req: Request, res: Response) => {
  try {
    const { rideId } = req.params;
    const { lat, lng } = req.query;

    if (!rideId || !lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'rideId, lat y lng son requeridos',
      });
    }

    const currentLat = parseFloat(lat as string);
    const currentLng = parseFloat(lng as string);

    if (isNaN(currentLat) || isNaN(currentLng)) {
      return res.status(400).json({
        success: false,
        message: 'Coordenadas inválidas',
      });
    }

    // Obtener el viaje
    const { data: ride, error: rideError } = (await supabase
      .from('rides')
      .select('id, destination_latitude, destination_longitude')
      .eq('id', rideId)
      .single()) as { data: any; error: any };

    if (rideError || !ride) {
      return res.status(404).json({
        success: false,
        message: 'Viaje no encontrado',
      });
    }

    // Calcular distancia restante (Haversine)
    const distanceRemaining = calculateDistance(
      currentLat,
      currentLng,
      ride.destination_latitude,
      ride.destination_longitude,
    );

    // Obtener velocidad promedio de las últimas 5 ubicaciones
    const { data: recentLocations } = (await supabase
      .from('ride_locations')
      .select('speed')
      .eq('ride_id', rideId)
      .order('timestamp', { ascending: false })
      .limit(5)) as { data: any; error: any };

    let avgSpeed = 30; // Default 30 km/h
    if (recentLocations && recentLocations.length > 0) {
      const speeds = recentLocations
        .filter((loc: any) => loc.speed && loc.speed > 5) // Filtrar velocidades muy bajas
        .map((loc: any) => loc.speed);

      if (speeds.length > 0) {
        avgSpeed = speeds.reduce((a: number, b: number) => a + b, 0) / speeds.length;
      }
    }

    // Calcular ETA en minutos
    const etaMinutes = Math.round((distanceRemaining / avgSpeed) * 60);

    // Calcular hora de llegada
    const arrivalTime = new Date();
    arrivalTime.setMinutes(arrivalTime.getMinutes() + etaMinutes);
    const etaTime = arrivalTime.toLocaleTimeString('es-NI', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return res.status(200).json({
      success: true,
      data: {
        etaMinutes,
        etaTime,
        distanceRemaining: Math.round(distanceRemaining * 1000) / 1000, // Redondear a 3 decimales
      },
    });
  } catch (error: any) {
    console.error('Error en calculateETA:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
    });
  }
};

/**
 * GET /tracking/deviation/:rideId?lat=&lng=
 * Verificar si el conductor se ha desviado de la ruta
 */
export const checkDeviation = async (req: Request, res: Response) => {
  try {
    const { rideId } = req.params;
    const { lat, lng } = req.query;

    if (!rideId || !lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'rideId, lat y lng son requeridos',
      });
    }

    const currentLat = parseFloat(lat as string);
    const currentLng = parseFloat(lng as string);

    if (isNaN(currentLat) || isNaN(currentLng)) {
      return res.status(400).json({
        success: false,
        message: 'Coordenadas inválidas',
      });
    }

    // Verificar que el viaje existe
    const { data: ride, error: rideError } = (await supabase
      .from('rides')
      .select('id')
      .eq('id', rideId)
      .single()) as { data: any; error: any };

    if (rideError || !ride) {
      return res.status(404).json({
        success: false,
        message: 'Viaje no encontrado',
      });
    }

    // Obtener la última ubicación guardada
    const { data: lastLocation } = (await supabase
      .from('ride_locations')
      .select('latitude, longitude')
      .eq('ride_id', rideId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()) as { data: any; error: any };

    if (!lastLocation) {
      return res.status(200).json({
        success: true,
        data: {
          isDeviated: false,
          deviationDistance: 0,
        },
      });
    }

    // Calcular distancia desde la última ubicación guardada
    const distanceFromLastPoint = calculateDistance(
      currentLat,
      currentLng,
      lastLocation.latitude,
      lastLocation.longitude,
    );

    // Si se movió más de 0.5 km (500m) desde el último punto
    const MAX_DEVIATION = 0.5; // km
    const isDeviated = distanceFromLastPoint > MAX_DEVIATION;

    return res.status(200).json({
      success: true,
      data: {
        isDeviated,
        deviationDistance: Math.round(distanceFromLastPoint * 1000), // en metros
      },
    });
  } catch (error: any) {
    console.error('Error en checkDeviation:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
    });
  }
};

/**
 * Calcular distancia entre dos puntos (Haversine formula)
 * Retorna distancia en kilómetros
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
