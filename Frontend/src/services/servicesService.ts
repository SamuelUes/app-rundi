import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';
import i18n from '../i18n';

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  commissionRate: number;
  status?: string;
  basePrice?: number;
  code?: string;
  pricePerKm?: number;
  pricePerMinute?: number;
  minimumFare?: number;
}

class ServicesService {
  private functions: any | null = null;

  private tr(path: string) {
    return i18n.t(`services.servicesService.${path}`) as string;
  }

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  async listServices(): Promise<ServiceItem[]> {
    try {
      const functions = await this.getFunctions();
      const callable = httpsCallable(functions, 'getServices');
      const result: any = await callable({});

      if (!result?.data?.services) {
        return [];
      }

      return result.data.services.map((service: any) => ({
        id: String(service.id),
        name: service.name ?? this.tr('messages.defaultName'),
        description: service.description ?? null,
        commissionRate: typeof service.commissionRate === 'number'
          ? service.commissionRate
          : parseFloat(service.commissionRate ?? '0'),
        status: service.status ?? undefined,
        basePrice: service.basePrice !== undefined ? Number(service.basePrice) : undefined,
        code: service.code ?? undefined,
        pricePerKm: service.pricePerKm !== undefined
          ? Number(service.pricePerKm)
          : service.price_per_km !== undefined
          ? Number(service.price_per_km)
          : undefined,
        pricePerMinute: service.pricePerMinute !== undefined
          ? Number(service.pricePerMinute)
          : service.price_per_minute !== undefined
          ? Number(service.price_per_minute)
          : undefined,
        minimumFare: service.minimumFare !== undefined
          ? Number(service.minimumFare)
          : service.minimum_fare !== undefined
          ? Number(service.minimum_fare)
          : undefined,
      }));
    } catch (error) {
      console.error('❌ Error obteniendo servicios:', error);
      throw new Error(this.tr('errors.fetchFailed'));
    }
  }
}

export default new ServicesService();
