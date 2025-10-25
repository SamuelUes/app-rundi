/**
 * Price Negotiation Service
 * Servicio para negociar precios entre cliente y conductor
 */

import { httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../config/firebase';

// Helper para obtener functions
async function getFirebaseFunctions() {
  const { functions } = await initializeFirebase();
  return functions;
}

class PriceNegotiationService {
  /**
   * Calcular límites dinámicos basados en el precio estimado
   * Mínimo: 66.67% del precio estimado (con piso de 50 C$)
   * Máximo: 133.33% del precio estimado (con techo de 500 C$)
   */
  private calculatePriceLimits(estimatedPrice: number): { min: number; max: number } {
    const min = Math.max(50, Math.round(estimatedPrice * 0.6667 * 100) / 100);
    const max = Math.min(500, Math.round(estimatedPrice * 1.3333 * 100) / 100);
    return { min, max };
  }

  /**
   * Validar que el precio esté dentro de los límites permitidos
   * @param price Precio a validar
   * @param estimatedPrice Precio estimado del viaje (para calcular límites dinámicos)
   */
  private validatePrice(price: number, estimatedPrice?: number): { valid: boolean; error?: string } {
    if (isNaN(price)) {
      return { valid: false, error: 'El precio debe ser un número válido' };
    }

    // Si no se proporciona estimatedPrice, usar límites globales
    if (!estimatedPrice) {
      const globalMin = 50; // Mínimo absoluto de todos los viajes
      const globalMax = 500;
      if (price < globalMin) {
        return { valid: false, error: `El precio mínimo permitido es C$${globalMin}` };
      }
      if (price > globalMax) {
        return { valid: false, error: `El precio máximo permitido es C$${globalMax}` };
      }
      return { valid: true };
    }

    // Usar límites dinámicos basados en estimatedPrice
    const { min: MIN_PRICE, max: MAX_PRICE } = this.calculatePriceLimits(estimatedPrice);
    
    console.log('💰 Validando precio:', {
      price,
      estimatedPrice,
      MIN_PRICE,
      MAX_PRICE,
      isValid: price >= MIN_PRICE && price <= MAX_PRICE,
    });

    if (price < MIN_PRICE) {
      return { valid: false, error: `El precio mínimo permitido es C$${MIN_PRICE}` };
    }
    if (price > MAX_PRICE) {
      return { valid: false, error: `El precio máximo permitido es C$${MAX_PRICE}` };
    }
    return { valid: true };
  }

  /**
   * Sugerir o contraofertar precio
   * @param rideId ID del viaje
   * @param suggestedPrice Precio sugerido
   * @param role Rol del usuario ('client' o 'driver')
   * @param estimatedPrice Precio estimado del viaje (para validación dinámica)
   */
  async negotiatePrice(rideId: string, suggestedPrice: number, role: 'client' | 'driver', estimatedPrice?: number) {
    try {
      // Validar precio con límites dinámicos
      const validation = this.validatePrice(suggestedPrice, estimatedPrice);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const functions = await getFirebaseFunctions();
      const negotiatePriceFunction = httpsCallable(functions, 'negotiatePrice');
      
      const response = await negotiatePriceFunction({
        rideId,
        suggestedPrice,
        role,
      });

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || 'Error negociando precio');
      }

      return result.ride;
    } catch (error: any) {
      console.error('Error negociando precio:', error);
      throw error;
    }
  }

  /**
   * Conductor acepta el precio del cliente directamente
   * @param rideId ID del viaje
   */
  async acceptClientPrice(rideId: string) {
    try {
      console.log('🔐 Verificando autenticación...');
      const { getFirebaseAuth } = require('../config/firebase');
      const auth = await getFirebaseAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        console.error('❌ Usuario no autenticado en Firebase Auth');
        throw new Error('Usuario no autenticado. Por favor inicia sesión nuevamente.');
      }
      
      console.log(`✅ Usuario autenticado: ${currentUser.uid}`);
      console.log(`📤 Llamando acceptClientPrice con rideId: ${rideId}`);
      
      const functions = await getFirebaseFunctions();
      const acceptClientPriceFunction = httpsCallable(functions, 'acceptClientPrice');
      
      const response = await acceptClientPriceFunction({ rideId });

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || 'Error aceptando precio del cliente');
      }

      console.log('✅ Precio del cliente aceptado exitosamente');
      return result;
    } catch (error: any) {
      console.error('❌ Error aceptando precio del cliente:', error);
      console.error('Código de error:', error.code);
      console.error('Mensaje:', error.message);
      throw error;
    }
  }

  /**
   * Cliente acepta la oferta de un conductor específico
   * @param rideId ID del viaje
   * @param driverId ID del conductor
   * @param acceptedPrice Precio aceptado
   */
  async acceptDriverOffer(rideId: string, driverId: string, acceptedPrice: number) {
    try {
      const functions = await getFirebaseFunctions();
      const acceptDriverOfferFunction = httpsCallable(functions, 'acceptDriverOffer');
      
      const response = await acceptDriverOfferFunction({
        rideId,
        driverId,
        acceptedPrice,
      });

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || 'Error aceptando oferta del conductor');
      }

      return result.ride;
    } catch (error: any) {
      console.error('Error aceptando oferta del conductor:', error);
      throw error;
    }
  }

  /**
   * @deprecated Usar acceptDriverOffer en su lugar
   */
  async acceptCounterOffer(rideId: string, acceptedPrice: number, role: 'client' | 'driver') {
    try {
      const functions = await getFirebaseFunctions();
      const acceptCounterOfferFunction = httpsCallable(functions, 'acceptCounterOffer');
      
      const response = await acceptCounterOfferFunction({
        rideId,
        acceptedPrice,
        role,
      });

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || 'Error aceptando contraoferta');
      }

      return result.ride;
    } catch (error: any) {
      console.error('Error aceptando contraoferta:', error);
      throw error;
    }
  }

  /**
   * Rechazar contraoferta
   * @param rideId ID del viaje
   * @param role Rol del usuario
   */
  async rejectCounterOffer(rideId: string, role: 'client' | 'driver') {
    try {
      const functions = await getFirebaseFunctions();
      const rejectCounterOfferFunction = httpsCallable(functions, 'rejectCounterOffer');
      
      const response = await rejectCounterOfferFunction({
        rideId,
        role,
      });

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || 'Error rechazando contraoferta');
      }

      return true;
    } catch (error: any) {
      console.error('Error rechazando contraoferta:', error);
      throw error;
    }
  }

  /**
   * Conductor envía una oferta para un viaje
   * @param rideId ID del viaje
   * @param driverId ID del conductor
   * @param offerPrice Precio ofrecido por el conductor
   * @param estimatedPrice Precio estimado del viaje (para validación dinámica)
   */
  async sendOffer(rideId: string, driverId: string, offerPrice: number, estimatedPrice?: number) {
    try {
      // Validar precio con límites dinámicos
      const validation = this.validatePrice(offerPrice, estimatedPrice);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      console.log('📤 Enviando oferta del conductor...');
      console.log(`  - Viaje: ${rideId}`);
      console.log(`  - Conductor: ${driverId}`);
      console.log(`  - Precio: C$${offerPrice}`);
      
      const { getFirebaseAuth } = require('../config/firebase');
      const auth = await getFirebaseAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        throw new Error('Usuario no autenticado. Por favor inicia sesión nuevamente.');
      }
      
      const functions = await getFirebaseFunctions();
      const sendDriverOfferFunction = httpsCallable(functions, 'sendDriverOffer');
      
      const response = await sendDriverOfferFunction({
        rideId,
        driverId,
        offerPrice,
      });

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || 'Error enviando oferta');
      }

      console.log('✅ Oferta enviada exitosamente');
      return result;
    } catch (error: any) {
      console.error('❌ Error enviando oferta:', error);
      console.error('Código de error:', error.code);
      console.error('Mensaje:', error.message);
      throw error;
    }
  }

  /**
   * Alias para sendOffer (compatibilidad)
   */
  async sendDriverOffer(rideId: string, driverId: string, offerPrice: number) {
    return this.sendOffer(rideId, driverId, offerPrice);
  }

  /**
   * Crear oferta del conductor (alias alternativo)
   */
  async createOffer(params: { rideId: string; driverId: string; offerPrice: number }) {
    return this.sendOffer(params.rideId, params.driverId, params.offerPrice);
  }
}

export default new PriceNegotiationService();
