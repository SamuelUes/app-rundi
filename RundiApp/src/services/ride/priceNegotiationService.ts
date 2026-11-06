/**
 * Price Negotiation Service — migrado a v2.
 * Mutaciones → REST Go (/v1/rides/*). Listeners → Firestore
 * (REALTIME_trips_live + REALTIME_driver_offers). El rol lo deriva el
 * backend del JWT; ya no se envía en el payload.
 */

import { getAuth } from 'firebase/auth';
import {
  acceptRide,
  confirmDriver,
  negotiateRidePrice,
  rejectRide,
} from '../../api/rides';
import { listenRideOffers, listenTripLive } from '../../live/listeners';
import { sqlRideIdForTrip } from '../../live/tripIds';
import { hideOverlayBubble } from './proximityService';
import i18n from '../../i18n';

const MAX_NEGOTIATED_PRICE = 100000;

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

function currentUid(): string {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('not_authenticated');
  return uid;
}

class PriceNegotiationService {
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.priceNegotiationService.${path}`, options) as string;
  }

  /**
   * Listener combinado: doc vivo del viaje + ofertas pendientes del rideId.
   * `offers` mantiene la forma Record<driverId, oferta> que espera la UI.
   */
  async subscribeToRideNegotiation(
    rideId: string,
    onChange: (snapshot: RideNegotiationSnapshot | null) => void,
    onError?: (error: unknown) => void,
  ): Promise<() => void> {
    let tripData: any = null;
    let tripSeen = false;
    const offersByDriver: Record<string, any> = {};

    const emit = () => {
      if (!tripSeen) return;
      if (!tripData) {
        onChange(null);
        return;
      }
      onChange({
        rideId,
        negotiationStatus: tripData.negotiationStatus ?? null,
        clientSuggestedPrice: tripData.clientSuggestedPrice ?? null,
        driverOfferedPrice: tripData.driverOfferedPrice ?? null,
        finalFare: tripData.finalFare ?? null,
        acceptedClientPrice: !!tripData.acceptedClientPrice,
        driverId: tripData.driverId ?? null,
        offers: Object.keys(offersByDriver).length ? { ...offersByDriver } : undefined,
        negotiation: tripData.negotiation ?? undefined,
      });
    };

    const unsubTrip = await listenTripLive(rideId, (data) => {
      tripSeen = true;
      tripData = data ?? null;
      emit();
    });
    // El campo rideId de la oferta guarda el UUID SQL — resolver por si el
    // caller pasa el doc id vivo.
    const sqlId = await sqlRideIdForTrip(rideId);
    const unsubOffers = await listenRideOffers(sqlId, currentUid(), (docs) => {
      Object.keys(offersByDriver).forEach((k) => delete offersByDriver[k]);
      docs.forEach(({ id, data }) => {
        offersByDriver[data.driverId ?? id] = { ...data, offerId: id };
      });
      emit();
    });

    return () => {
      unsubTrip();
      unsubOffers();
    };
  }

  private calculatePriceLimits(
    estimatedPrice: number,
    dynamicMinimumFare?: number,
  ): { min: number; max: number } {
    const min = Math.min(
      MAX_NEGOTIATED_PRICE,
      Math.max(
        50,
        Math.round(estimatedPrice * 0.6667 * 100) / 100,
        Number.isFinite(dynamicMinimumFare) ? Number(dynamicMinimumFare) : 0,
      ),
    );
    const max = Math.max(
      min,
      Math.min(MAX_NEGOTIATED_PRICE, Math.round(estimatedPrice * 1.3333 * 100) / 100),
    );
    return { min, max };
  }

  private validatePrice(
    price: number,
    estimatedPrice?: number,
    dynamicMinimumFare?: number,
  ): { valid: boolean; error?: string } {
    if (!Number.isFinite(price) || price > MAX_NEGOTIATED_PRICE) {
      return { valid: false, error: this.tr('errors.invalidNumber') };
    }

    if (!estimatedPrice) {
      const globalMin = 50;
      const globalMax = MAX_NEGOTIATED_PRICE;
      if (price < globalMin) {
        return { valid: false, error: this.tr('errors.minPrice', { value: globalMin }) };
      }
      if (price > globalMax) {
        return { valid: false, error: this.tr('errors.maxPrice', { value: globalMax }) };
      }
      return { valid: true };
    }

    const { min: MIN_PRICE, max: MAX_PRICE } = this.calculatePriceLimits(
      estimatedPrice,
      dynamicMinimumFare,
    );

    if (price < MIN_PRICE) {
      return { valid: false, error: this.tr('errors.minPrice', { value: MIN_PRICE }) };
    }
    if (price > MAX_PRICE) {
      return { valid: false, error: this.tr('errors.maxPrice', { value: MAX_PRICE }) };
    }
    return { valid: true };
  }

  /** Sugerir/contraofertar precio → POST /rides/{id}/negotiate (rol por JWT). */
  async negotiatePrice(
    rideId: string,
    suggestedPrice: number,
    _role: 'client' | 'driver',
    estimatedPrice?: number,
    _driverId?: string,
    dynamicMinimumFare?: number,
  ) {
    try {
      const validation = this.validatePrice(suggestedPrice, estimatedPrice, dynamicMinimumFare);
      if (!validation.valid) throw new Error(validation.error);

      const { ride } = await negotiateRidePrice(rideId, { offeredPrice: suggestedPrice });
      return ride;
    } catch (error: any) {
      const serverMessage = typeof error?.response?.data?.error === 'string'
        ? error.response.data.error
        : undefined;
      console.error('Error negociando precio:', {
        status: error?.response?.status,
        serverMessage,
        requestId: error?.config?.headers?.['X-Request-ID'],
        message: error?.message,
      });
      throw new Error(serverMessage || error.message || this.tr('errors.negotiateFailed'));
    }
  }

  /** Conductor acepta el precio del cliente → acceptRide al precio sugerido. */
  async acceptClientPrice(rideId: string) {
    try {
      const driverId = currentUid();
      const response = await acceptRide(rideId, { driverId });
      await hideOverlayBubble('acceptedRide');
      return { success: true, ride: response.ride };
    } catch (error: any) {
      console.error('Error aceptando precio del cliente:', error);
      throw new Error(error.message || this.tr('errors.acceptClientPriceFailed'));
    }
  }

  /** Cliente acepta la oferta de un conductor → confirmDriver. */
  async acceptDriverOffer(rideId: string, driverId: string, _acceptedPrice: number) {
    try {
      const { ride } = await confirmDriver(rideId, driverId);
      return ride;
    } catch (error: any) {
      console.error('Error aceptando oferta del conductor:', error);
      throw new Error(error.message || this.tr('errors.acceptDriverOfferFailed'));
    }
  }

  /** Aceptar contraoferta: cliente → confirmDriver; conductor → acceptRide. */
  async acceptCounterOffer(
    rideId: string,
    _acceptedPrice: number,
    role: 'client' | 'driver',
    driverId?: string,
  ) {
    try {
      if (role === 'client') {
        const target = driverId ?? currentUid();
        const { ride } = await confirmDriver(rideId, target);
        return ride;
      }
      const { ride } = await acceptRide(rideId, { driverId: driverId ?? currentUid() });
      await hideOverlayBubble('acceptedRide');
      return ride;
    } catch (error: any) {
      console.error('Error aceptando contraoferta:', error);
      throw new Error(error.message || this.tr('errors.acceptCounterOfferFailed'));
    }
  }

  /** Rechazar oferta/contraoferta → POST /rides/{id}/reject. */
  async rejectCounterOffer(rideId: string, _role: 'client' | 'driver') {
    try {
      await rejectRide(rideId, 'counter_offer_rejected');
      return true;
    } catch (error: any) {
      console.error('Error rechazando contraoferta:', error);
      throw new Error(error.message || this.tr('errors.rejectCounterOfferFailed'));
    }
  }

  /** Conductor envía oferta → negotiate con el precio ofrecido. */
  async sendOffer(rideId: string, _driverId: string, offerPrice: number, estimatedPrice?: number) {
    try {
      const validation = this.validatePrice(offerPrice, estimatedPrice);
      if (!validation.valid) throw new Error(validation.error);
      const { ride } = await negotiateRidePrice(rideId, { offeredPrice: offerPrice });
      return { success: true, ride };
    } catch (error: any) {
      console.error('Error enviando oferta:', error);
      throw new Error(error.message || this.tr('errors.sendOfferFailed'));
    }
  }

  async sendDriverOffer(rideId: string, driverId: string, offerPrice: number) {
    return this.sendOffer(rideId, driverId, offerPrice);
  }

  async createOffer(params: { rideId: string; driverId: string; offerPrice: number }) {
    return this.sendOffer(params.rideId, params.driverId, params.offerPrice);
  }
}

export default new PriceNegotiationService();
