/**
 * Price Negotiation Service
 * Servicio para negociar precios entre cliente y conductor
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

class PriceNegotiationService {
  /**
   * Sugerir o contraofertar precio
   * @param rideId ID del viaje
   * @param suggestedPrice Precio sugerido
   * @param role Rol del usuario ('client' o 'driver')
   */
  async negotiatePrice(rideId: string, suggestedPrice: number, role: 'client' | 'driver') {
    try {
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
}

export default new PriceNegotiationService();
