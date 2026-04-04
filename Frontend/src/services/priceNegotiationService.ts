/**
 * Price Negotiation Service
 * Servicio para negociar precios entre cliente y conductor
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';
import { getFirebaseDatabase } from '../config/firebase';
import { ref, onValue, off, type DataSnapshot } from 'firebase/database';
import i18n from '../i18n';

export interface RideNegotiationSnapshot {
  rideId: string;
  negotiationStatus?: string | null;
  clientSuggestedPrice?: number | null;
  driverOfferedPrice?: number | null;
  finalFare?: number | null;
  acceptedClientPrice?: boolean;
  driverId?: string | null;
  offers?: Record<string, any>;
  negotiation?: Record<string, any>;
}

class PriceNegotiationService {
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.priceNegotiationService.${path}`, options) as string;
  }

  async subscribeToRideNegotiation(
    rideId: string,
    onChange: (snapshot: RideNegotiationSnapshot | null) => void,
    onError?: (error: unknown) => void,
  ): Promise<() => void> {
    const database = await getFirebaseDatabase();
    const rideRef = ref(database, `activeRides/${rideId}`);

    const unsubscribe = onValue(
      rideRef,
      (snapshot: DataSnapshot) => {
        const data = snapshot.val();
        if (!data) {
          onChange(null);
          return;
        }

        onChange({
          rideId,
          negotiationStatus: data.negotiationStatus ?? null,
          clientSuggestedPrice: data.clientSuggestedPrice ?? null,
          driverOfferedPrice: data.driverOfferedPrice ?? null,
          finalFare: data.finalFare ?? null,
          acceptedClientPrice: !!data.acceptedClientPrice,
          driverId: data.driverId ?? null,
          offers: data.offers ?? undefined,
          negotiation: data.negotiation ?? undefined,
        });
      },
      (error) => {
        console.error('[priceNegotiationService] subscribeToRideNegotiation error:', error);
        onError?.(error);
      },
    );

    return () => {
      off(rideRef);
      unsubscribe();
    };
  }

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
      return { valid: false, error: this.tr('errors.invalidNumber') };
    }

    // Si no se proporciona estimatedPrice, usar límites globales
    if (!estimatedPrice) {
      const globalMin = 50; // Mínimo absoluto de todos los viajes
      const globalMax = 500;
      if (price < globalMin) {
        return { valid: false, error: this.tr('errors.minPrice', { value: globalMin }) };
      }
      if (price > globalMax) {
        return { valid: false, error: this.tr('errors.maxPrice', { value: globalMax }) };
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
      return { valid: false, error: this.tr('errors.minPrice', { value: MIN_PRICE }) };
    }
    if (price > MAX_PRICE) {
      return { valid: false, error: this.tr('errors.maxPrice', { value: MAX_PRICE }) };
    }
    return { valid: true };
  }

  /**
   * Sugerir o contraofertar precio
   * @param rideId ID del viaje
   * @param suggestedPrice Precio sugerido
   * @param role Rol del usuario ('client' o 'driver')
   * @param estimatedPrice Precio estimado del viaje (para validación dinámica)
   * @param driverId ID del conductor (requerido si role es 'driver')
   */
  async negotiatePrice(rideId: string, suggestedPrice: number, role: 'client' | 'driver', estimatedPrice?: number, driverId?: string) {
    try {
      // Validar precio con límites dinámicos
      const validation = this.validatePrice(suggestedPrice, estimatedPrice);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const functions = await getFirebaseFunctions();
      const negotiatePriceFunction = httpsCallable(functions, 'negotiatePrice');
      
      const payload: any = {
        rideId,
        suggestedPrice,
        role,
      };
      
      // ✅ NUEVO: Agregar driverId si es conductor
      if (role === 'driver' && driverId) {
        payload.driverId = driverId;
        console.log(`💰 [negotiatePrice] Enviando driverId: ${driverId}`);
      }
      
      const response = await negotiatePriceFunction(payload);

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || this.tr('errors.negotiateFailed'));
      }

      return result.ride;
    } catch (error: any) {
      console.error('Error negociando precio:', error);
      throw new Error(error.message || this.tr('errors.negotiateFailed'));
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
        throw new Error(this.tr('errors.notAuthenticated'));
      }
      
      console.log(`✅ Usuario autenticado: ${currentUser.uid}`);
      console.log(`📤 Llamando acceptClientPrice con rideId: ${rideId}`);
      
      const functions = await getFirebaseFunctions();
      const acceptClientPriceFunction = httpsCallable(functions, 'acceptClientPrice');
      
      const response = await acceptClientPriceFunction({ rideId });

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || this.tr('errors.acceptClientPriceFailed'));
      }

      console.log('✅ Precio del cliente aceptado exitosamente');
      return result;
    } catch (error: any) {
      console.error('❌ Error aceptando precio del cliente:', error);
      console.error('Código de error:', error.code);
      console.error('Mensaje:', error.message);
      throw new Error(error.message || this.tr('errors.acceptClientPriceFailed'));
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
      const acceptDriverOfferFunction = httpsCallable(functions, 'acceptCounterOffer');
      
      const response = await acceptDriverOfferFunction({
        rideId,
        driverId,
        acceptedPrice,
        role: 'client',
      });

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || this.tr('errors.acceptDriverOfferFailed'));
      }

      return result.ride;
    } catch (error: any) {
      console.error('Error aceptando oferta del conductor:', error);
      throw new Error(error.message || this.tr('errors.acceptDriverOfferFailed'));
    }
  }

  /**
   * Aceptar contraoferta - Cliente acepta la contraoferta del conductor
   * @param rideId ID del viaje
   * @param acceptedPrice Precio aceptado
   * @param role Rol del usuario ('client' o 'driver')
   * @param driverId ID del conductor (opcional, para actualizar status de oferta)
   */
  async acceptCounterOffer(rideId: string, acceptedPrice: number, role: 'client' | 'driver', driverId?: string) {
    try {
      const functions = await getFirebaseFunctions();
      const acceptCounterOfferFunction = httpsCallable(functions, 'acceptCounterOffer');
      
      const payload: any = {
        rideId,
        acceptedPrice,
        role,
      };
      
      // ✅ NUEVO: Agregar driverId si se proporciona
      if (driverId) {
        payload.driverId = driverId;
        console.log(`💰 [acceptCounterOffer] Enviando driverId: ${driverId}`);
      }
      
      const response = await acceptCounterOfferFunction(payload);

      const result = response.data as any;
      
      if (!result.success) {
        throw new Error(result.message || this.tr('errors.acceptCounterOfferFailed'));
      }

      return result.ride;
    } catch (error: any) {
      console.error('Error aceptando contraoferta:', error);
      throw new Error(error.message || this.tr('errors.acceptCounterOfferFailed'));
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
        throw new Error(result.message || this.tr('errors.rejectCounterOfferFailed'));
      }

      return true;
    } catch (error: any) {
      console.error('Error rechazando contraoferta:', error);
      throw new Error(error.message || this.tr('errors.rejectCounterOfferFailed'));
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
        throw new Error(this.tr('errors.notAuthenticated'));
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
        throw new Error(result.message || this.tr('errors.sendOfferFailed'));
      }

      console.log('✅ Oferta enviada exitosamente');
      return result;
    } catch (error: any) {
      console.error('❌ Error enviando oferta:', error);
      console.error('Código de error:', error.code);
      console.error('Mensaje:', error.message);
      throw new Error(error.message || this.tr('errors.sendOfferFailed'));
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
