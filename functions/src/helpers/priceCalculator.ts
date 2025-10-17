/**
 * Calculadora de precios para viajes
 * DriveAngel.ni
 * 
 * Fórmula de precios por tramos de distancia:
 * - 0.2 km a 0.4 km   → multiplicar por 10 C$
 * - 0.401 km a 1 km   → multiplicar por 15 C$
 * - 1.01 km a 2 km    → multiplicar por 20 C$
 * - 2.01 km a 4 km    → multiplicar por 25 C$
 * - Mayor a 4.01 km   → multiplicar por 30 C$
 * 
 * EJEMPLO: 13 km → 13 x 30 = C$390 (porque es mayor a 4.01 km)
 */

export interface PriceCalculationResult {
  basePrice: number;
  distanceKm: number;
  multiplier: number;
  finalPrice: number;
  breakdown: string;
}

/**
 * Calcula el precio del viaje según la distancia en kilómetros
 * @param distanceInMeters - Distancia en metros
 * @returns Resultado del cálculo con desglose
 */
export function calculateRidePrice(distanceInMeters: number): PriceCalculationResult {
  // Convertir metros a kilómetros
  const distanceKm = distanceInMeters / 1000;
  
  // Determinar el multiplicador según el tramo
  let multiplier: number;
  let tramo: string;
  
  if (distanceKm >= 0.2 && distanceKm <= 0.4) {
    multiplier = 50;
    tramo = '0.2-0.4 km';
  } else if (distanceKm >= 0.401 && distanceKm <= 0.7) {
    multiplier = 55;
    tramo = '0.401-0.7 km';
  } else if (distanceKm >= 0.701 && distanceKm <= 1) {
    multiplier = 60;
    tramo = '0.701-1 km';
  } else if (distanceKm >= 1.01 && distanceKm <= 2) {
    multiplier = 45;
    tramo = '1.01-2 km';
  } else if (distanceKm >= 2.01 && distanceKm <= 4) {
    multiplier = 40;
    tramo = '2.01-4 km';
  } else if (distanceKm >= 4.01) {
    multiplier = 35;
    tramo = 'Mayor a 4.01 km';
  } else {
    // Distancia menor a 0.2 km (200 metros) - precio mínimo
    multiplier = 10;
    tramo = 'Menor a 0.2 km (mínimo)';
  }
  
  // Calcular precio base
  const basePrice = distanceKm * multiplier;
  
  // Precio mínimo de C$50
  const MINIMUM_FARE = 50;
  const finalPrice = Math.max(Math.round(basePrice), MINIMUM_FARE);
  
  // Crear desglose legible
  const breakdown = `${distanceKm.toFixed(2)} km × C$${multiplier} = C$${basePrice.toFixed(2)} → C$${finalPrice} (Tramo: ${tramo})`;
  
  return {
    basePrice: Math.round(basePrice),
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    multiplier,
    finalPrice,
    breakdown,
  };
}

/**
 * Calcula el precio con múltiples destinos (paradas adicionales)
 * @param distanceInMeters - Distancia total en metros (incluyendo todas las paradas)
 * @param extraStops - Número de paradas adicionales (0 si es directo)
 * @param isDesignatedDriver - Si es servicio de conductor designado (multiplica por 1.5)
 * @returns Resultado del cálculo con recargo por paradas
 */
export function calculateRidePriceWithStops(
  distanceInMeters: number,
  extraStops: number = 0,
  isDesignatedDriver: boolean = false
): PriceCalculationResult {
  // Calcular precio base
  const baseCalculation = calculateRidePrice(distanceInMeters);
  
  // Recargo por paradas adicionales: C$20 por cada parada extra
  const STOP_FEE = 20;
  const stopCharge = extraStops * STOP_FEE;
  
  let finalPrice = baseCalculation.finalPrice + stopCharge;
  
  let breakdown = baseCalculation.breakdown;
  if (extraStops > 0) {
    breakdown += ` + C$${stopCharge} (${extraStops} parada${extraStops > 1 ? 's' : ''} extra)`;
  }
  
  // Si es conductor designado, multiplicar por 1.5
  if (isDesignatedDriver) {
    finalPrice = Math.round(finalPrice * 1.5);
    breakdown += ` × 1.5 (Conductor Designado) = C$${finalPrice}`;
  }
  
  return {
    ...baseCalculation,
    finalPrice,
    breakdown,
  };
}

/**
 * Validar que el precio propuesto esté dentro de un rango razonable
 * @param proposedPrice - Precio propuesto por cliente o conductor
 * @param calculatedPrice - Precio calculado por el sistema
 * @param tolerance - Tolerancia en porcentaje (por defecto 50%)
 * @returns true si el precio está dentro del rango aceptable
 */
export function validateProposedPrice(
  proposedPrice: number,
  calculatedPrice: number,
  tolerance: number = 0.5
): { valid: boolean; message: string } {
  const MINIMUM_FARE = 50;
  
  if (proposedPrice < MINIMUM_FARE) {
    return {
      valid: false,
      message: `El precio mínimo es C$${MINIMUM_FARE}`,
    };
  }
  
  const minAcceptable = calculatedPrice * (1 - tolerance);
  const maxAcceptable = calculatedPrice * (1 + tolerance);
  
  if (proposedPrice < minAcceptable) {
    return {
      valid: false,
      message: `El precio es muy bajo. Mínimo sugerido: C$${Math.round(minAcceptable)}`,
    };
  }
  
  if (proposedPrice > maxAcceptable) {
    return {
      valid: false,
      message: `El precio es muy alto. Máximo sugerido: C$${Math.round(maxAcceptable)}`,
    };
  }
  
  return {
    valid: true,
    message: 'Precio válido',
  };
}

/**
 * Obtener información de la tarifa para mostrar al usuario
 */
export function getPricingInfo() {
  return {
    ranges: [
      { min: 0.2, max: 0.4, rate: 10, label: '0.2 - 0.4 km' },
      { min: 0.401, max: 1, rate: 15, label: '0.401 - 1 km' },
      { min: 1.01, max: 2, rate: 20, label: '1.01 - 2 km' },
      { min: 2.01, max: 4, rate: 25, label: '2.01 - 4 km' },
      { min: 4.01, max: 999999, rate: 30, label: 'Mayor a 4.01 km' }, // Usar número grande en vez de Infinity
    ],
    minimumFare: 50,
    stopFee: 20,
    currency: 'C$',
  };
}
