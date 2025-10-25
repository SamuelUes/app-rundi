import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

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

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  async createPaymentIntent(data: CreatePaymentIntentData): Promise<PaymentIntent> {
    if (!data.rideId) {
      throw new Error('rideId es requerido');
    }
    
    if (!data.amount || data.amount <= 0) {
      throw new Error('amount debe ser mayor a 0');
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
        throw new Error('Respuesta inválida del servidor');
      }
      
      return response.data as PaymentIntent;
    } catch (error: any) {
      console.error('Error en createPaymentIntent:', error);
      throw error;
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
