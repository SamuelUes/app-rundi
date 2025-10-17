/**
 * Utilidades para calcular el progreso del viaje
 */

import * as admin from 'firebase-admin';

/**
 * Calcular progreso del viaje basado en la distancia recorrida
 * @param rideId ID del viaje
 * @param estimatedDistance Distancia estimada en metros
 * @returns Porcentaje de progreso (0-100)
 */
export async function calculateRideProgress(
  rideId: string,
  estimatedDistance: number
): Promise<number> {
  try {
    // Obtener ubicaciones del tracking
    const locationsSnapshot = await admin
      .database()
      .ref(`activeRides/${rideId}/tracking`)
      .once('value');

    const locations = locationsSnapshot.val();

    if (!locations || Object.keys(locations).length < 2) {
      return 0; // No hay suficientes puntos para calcular
    }

    // Convertir a array y ordenar por timestamp
    const locationArray = Object.values(locations).sort(
      (a: any, b: any) => a.timestamp - b.timestamp
    );

    // Calcular distancia recorrida usando la fórmula de Haversine
    let totalDistance = 0;

    for (let i = 1; i < locationArray.length; i++) {
      const prev: any = locationArray[i - 1];
      const curr: any = locationArray[i];

      const distance = calculateDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude
      );

      totalDistance += distance;
    }

    // Calcular porcentaje
    const progress = (totalDistance / estimatedDistance) * 100;

    // Limitar entre 0 y 100
    return Math.min(Math.max(progress, 0), 100);
  } catch (error) {
    console.error('Error calculando progreso del viaje:', error);
    return 0;
  }
}

/**
 * Calcular distancia entre dos puntos usando la fórmula de Haversine
 * @returns Distancia en metros
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calcular monto a cobrar según el progreso del viaje
 * @param totalAmount Monto total del viaje
 * @param progress Porcentaje de progreso (0-100)
 * @returns Monto a cobrar
 */
export function calculateChargeAmount(
  totalAmount: number,
  progress: number
): number {
  // Si el progreso es menor al 60%, no se cobra
  if (progress < 60) {
    return 0;
  }

  // Si el progreso es 60% o más, se cobra ese porcentaje
  const chargePercentage = Math.min(progress, 100) / 100;
  return totalAmount * chargePercentage;
}

/**
 * Determinar si se debe cobrar según el progreso
 * @param progress Porcentaje de progreso (0-100)
 * @returns true si se debe cobrar, false si no
 */
export function shouldChargeForCancellation(progress: number): boolean {
  return progress >= 60;
}
