import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  commissionRate: number;
  status?: string;
  basePrice?: number;
  code?: string;
}

class ServicesService {
  private functions: any | null = null;

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
        name: service.name ?? 'Servicio',
        description: service.description ?? null,
        commissionRate: typeof service.commissionRate === 'number'
          ? service.commissionRate
          : parseFloat(service.commissionRate ?? '0'),
        status: service.status ?? undefined,
        basePrice: service.basePrice !== undefined ? Number(service.basePrice) : undefined,
        code: service.code ?? undefined,
      }));
    } catch (error) {
      console.error('❌ Error obteniendo servicios:', error);
      return [];
    }
  }
}

export default new ServicesService();
