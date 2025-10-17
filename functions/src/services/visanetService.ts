import * as functions from 'firebase-functions';
import axios from 'axios';

/**
 * Servicio para integración con Visanet Nicaragua
 * Documentación: https://www.visanet.com.ni/developers
 */

interface VisanetConfig {
  merchantId: string;
  apiKey: string;
  apiUrl: string;
  environment: 'sandbox' | 'production';
}

interface CreateTransactionRequest {
  amount: number; // En centavos (C$100 = 10000)
  currency: string; // 'NIO'
  description: string;
  orderId: string; // rideId
  metadata?: Record<string, any>;
}

interface TransactionResponse {
  transactionId: string;
  status: 'pending' | 'authorized' | 'captured' | 'failed';
  authorizationCode?: string;
  message?: string;
}

export class VisanetService {
  private config: VisanetConfig;

  constructor() {
    const environment = functions.config().visanet?.environment || 'sandbox';
    
    this.config = {
      merchantId: functions.config().visanet?.merchant_id || '',
      apiKey: functions.config().visanet?.api_key || '',
      apiUrl: environment === 'production' 
        ? 'https://api.visanet.com.ni/v1'
        : 'https://sandbox.visanet.com.ni/v1',
      environment: environment as 'sandbox' | 'production',
    };

    if (!this.config.merchantId || !this.config.apiKey) {
      console.warn('⚠️ Visanet no configurado. Usa: firebase functions:config:set visanet.merchant_id="xxx" visanet.api_key="xxx"');
    }
  }

  /**
   * Crear transacción (PRE-AUTORIZACIÓN)
   * Similar a Stripe PaymentIntent con capture_method: manual
   */
  async createTransaction(data: CreateTransactionRequest): Promise<TransactionResponse> {
    try {
      console.log(`💳 [Visanet] Creando transacción para orden ${data.orderId}...`);
      
      const response = await axios.post(
        `${this.config.apiUrl}/transactions/authorize`,
        {
          merchantId: this.config.merchantId,
          amount: data.amount,
          currency: data.currency,
          orderId: data.orderId,
          description: data.description,
          captureType: 'manual', // Pre-autorización, capturar después
          metadata: data.metadata,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 segundos
        }
      );

      console.log(`✅ [Visanet] Transacción autorizada: ${response.data.transactionId}`);
      
      return {
        transactionId: response.data.transactionId,
        status: response.data.status,
        authorizationCode: response.data.authorizationCode,
        message: response.data.message,
      };
    } catch (error: any) {
      console.error('❌ [Visanet] Error creando transacción:', error.response?.data || error.message);
      
      throw new Error(
        error.response?.data?.message || 
        'Error al procesar el pago con Visanet. Intenta con otro método.'
      );
    }
  }

  /**
   * Capturar transacción pre-autorizada
   * Se llama cuando el viaje se completa
   */
  async captureTransaction(transactionId: string, amount?: number): Promise<TransactionResponse> {
    try {
      console.log(`💰 [Visanet] Capturando transacción ${transactionId}...`);
      
      const response = await axios.post(
        `${this.config.apiUrl}/transactions/${transactionId}/capture`,
        {
          merchantId: this.config.merchantId,
          amount: amount, // Opcional: capturar monto diferente (ej: con propina)
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log(`✅ [Visanet] Transacción capturada: ${transactionId}`);
      
      return {
        transactionId: response.data.transactionId,
        status: response.data.status,
        message: response.data.message,
      };
    } catch (error: any) {
      console.error('❌ [Visanet] Error capturando transacción:', error.response?.data || error.message);
      
      throw new Error(
        error.response?.data?.message || 
        'Error al capturar el pago con Visanet.'
      );
    }
  }

  /**
   * Cancelar transacción pre-autorizada
   * Se llama si el viaje se cancela
   */
  async cancelTransaction(transactionId: string): Promise<TransactionResponse> {
    try {
      console.log(`❌ [Visanet] Cancelando transacción ${transactionId}...`);
      
      const response = await axios.post(
        `${this.config.apiUrl}/transactions/${transactionId}/void`,
        {
          merchantId: this.config.merchantId,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      console.log(`✅ [Visanet] Transacción cancelada: ${transactionId}`);
      
      return {
        transactionId: response.data.transactionId,
        status: response.data.status,
        message: response.data.message,
      };
    } catch (error: any) {
      console.error('❌ [Visanet] Error cancelando transacción:', error.response?.data || error.message);
      
      throw new Error(
        error.response?.data?.message || 
        'Error al cancelar el pago con Visanet.'
      );
    }
  }

  /**
   * Verificar estado de transacción
   */
  async getTransactionStatus(transactionId: string): Promise<TransactionResponse> {
    try {
      const response = await axios.get(
        `${this.config.apiUrl}/transactions/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          timeout: 15000,
        }
      );

      return {
        transactionId: response.data.transactionId,
        status: response.data.status,
        authorizationCode: response.data.authorizationCode,
        message: response.data.message,
      };
    } catch (error: any) {
      console.error('❌ [Visanet] Error obteniendo estado:', error.response?.data || error.message);
      throw new Error('Error al verificar el estado del pago.');
    }
  }

  /**
   * Verificar si Visanet está configurado
   */
  isConfigured(): boolean {
    return !!(this.config.merchantId && this.config.apiKey);
  }
}

export default VisanetService;
