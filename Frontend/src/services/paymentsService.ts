import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import i18n from '../i18n';

export interface PaymentIntent {
  clientSecret: string;
  amount: number;
  currency: string;
  rideId: string;
}

export interface CreatePaymentIntentData {
  rideId: string;
  amount: number;
  currency?: string;
}

class PaymentsService {
  private functions: any = null;
  private tr(path: string) {
    return i18n.t(`services.paymentsService.${path}`) as string;
  }

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  async createPaymentIntent(data: CreatePaymentIntentData): Promise<PaymentIntent> {
    if (!data.rideId) {
      throw new Error(this.tr('errors.rideIdRequired'));
    }
    
    if (!data.amount || data.amount <= 0) {
      throw new Error(this.tr('errors.amountPositive'));
    }

    try {
      const functions = await this.getFunctions();
      const createPaymentIntentFunction = httpsCallable(functions, 'createPaymentIntent');
      
      const response = await createPaymentIntentFunction({
        rideId: data.rideId,
        amount: data.amount,
        currency: data.currency || 'usd', // ✅ Cambiar a 'usd'
      });
      
      if (!response.data) {
        throw new Error(this.tr('errors.invalidResponse'));
      }
      
      return response.data as PaymentIntent;
    } catch (error: any) {
      console.error('Error en createPaymentIntent:', error);
      throw new Error(error.message || this.tr('errors.createFailed'));
    }
  }

  async getPaymentHistory(userId: string): Promise<any[]> {
    const functions = await this.getFunctions();
    const getPaymentDetailsFunction = httpsCallable(functions, 'getPaymentDetails');
    const response = await getPaymentDetailsFunction({ userId });
    return response.data as any[];
  }
}

export default new PaymentsService();
