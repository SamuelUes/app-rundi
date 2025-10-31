/**
 * Integración con APIs de Bancos Locales de Nicaragua
 * 
 * Este archivo contiene las configuraciones y funciones para integrar con:
 * - BAC (Banco de América Central)
 * - Banpro (Banco de la Producción)
 * - Lafise Bancentro
 * - Banco Ficohsa
 * - Avanz
 * 
 * ✅ ESTRUCTURA LISTA - Solo reemplaza los endpoints y credenciales
 */

import axios, { AxiosInstance } from 'axios';

// ============================================
// CONFIGURACIÓN DE BANCOS
// ============================================

interface BankConfig {
  name: string;
  apiUrl: string;
  apiKey: string;
  merchantId: string;
  timeout: number;
}

interface BankResponse {
  success: boolean;
  transactionId: string;
  authorizationCode?: string;
  message?: string;
  error?: string;
  rawResponse?: any;
}

// ============================================
// BAC - BANCO DE AMÉRICA CENTRAL
// ============================================

export class BACBank {
  private client: AxiosInstance;
  private config: BankConfig;

  constructor() {
    this.config = {
      name: 'BAC',
      apiUrl: process.env.BAC_API_URL || 'https://api.bac.net/v1',
      apiKey: process.env.BAC_API_KEY || '',
      merchantId: process.env.BAC_MERCHANT_ID || '',
      timeout: 30000,
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });
  }

  /**
   * Crear pre-autorización
   * TODO: Reemplazar con endpoint real de BAC
   * Referencia: https://api.bac.net/docs/payments/authorize
   */
  async authorize(request: {
    amount: number;
    currency: string;
    cardNumber: string;
    cardHolder: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
    metadata?: any;
  }): Promise<BankResponse> {
    try {
      console.log(`🏦 [BAC] Creando pre-autorización...`);
      console.log(`   Monto: ${request.currency} ${request.amount.toFixed(2)}`);

      // TODO: Reemplazar con llamada real a BAC
      const response = await this.client.post('/payments/authorize', {
        merchantId: this.config.merchantId,
        amount: request.amount,
        currency: request.currency,
        card: {
          number: request.cardNumber,
          holder: request.cardHolder,
          expiryMonth: request.expiryMonth,
          expiryYear: request.expiryYear,
          cvv: request.cvv,
        },
        metadata: request.metadata,
      });

      console.log(`✅ [BAC] Pre-autorización exitosa`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        authorizationCode: response.data.authorizationCode,
        message: 'Pre-autorización creada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [BAC] Error en pre-autorización:`, error.message);
      return {
        success: false,
        transactionId: `bac_failed_${Date.now()}`,
        error: error.message,
      };
    }
  }

  /**
   * Capturar pago pre-autorizado
   * TODO: Reemplazar con endpoint real de BAC
   */
  async capture(transactionId: string, amount: number): Promise<BankResponse> {
    try {
      console.log(`💳 [BAC] Capturando pago...`);
      console.log(`   Transaction ID: ${transactionId}`);
      console.log(`   Monto: C$ ${amount.toFixed(2)}`);

      // TODO: Reemplazar con llamada real a BAC
      const response = await this.client.post(`/payments/${transactionId}/capture`, {
        amount: amount,
      });

      console.log(`✅ [BAC] Pago capturado exitosamente`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Pago capturado exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [BAC] Error capturando pago:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }

  /**
   * Cancelar pre-autorización
   * TODO: Reemplazar con endpoint real de BAC
   */
  async cancel(transactionId: string): Promise<BankResponse> {
    try {
      console.log(`❌ [BAC] Cancelando pre-autorización...`);
      console.log(`   Transaction ID: ${transactionId}`);

      // TODO: Reemplazar con llamada real a BAC
      const response = await this.client.post(`/payments/${transactionId}/cancel`);

      console.log(`✅ [BAC] Pre-autorización cancelada`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Autorización cancelada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [BAC] Error cancelando:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }
}

// ============================================
// BANPRO - BANCO DE LA PRODUCCIÓN
// ============================================

export class BanproBank {
  private client: AxiosInstance;
  private config: BankConfig;

  constructor() {
    this.config = {
      name: 'Banpro',
      apiUrl: process.env.BANPRO_API_URL || 'https://api.banpro.com.ni/v1',
      apiKey: process.env.BANPRO_API_KEY || '',
      merchantId: process.env.BANPRO_MERCHANT_ID || '',
      timeout: 30000,
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
      },
    });
  }

  async authorize(request: {
    amount: number;
    currency: string;
    cardNumber: string;
    cardHolder: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
    metadata?: any;
  }): Promise<BankResponse> {
    try {
      console.log(`🏦 [BANPRO] Creando pre-autorización...`);

      // TODO: Reemplazar con llamada real a Banpro
      const response = await this.client.post('/transactions/authorize', {
        merchantId: this.config.merchantId,
        amount: request.amount,
        currency: request.currency,
        card: {
          number: request.cardNumber,
          holder: request.cardHolder,
          expiryMonth: request.expiryMonth,
          expiryYear: request.expiryYear,
          cvv: request.cvv,
        },
        metadata: request.metadata,
      });

      console.log(`✅ [BANPRO] Pre-autorización exitosa`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        authorizationCode: response.data.authCode,
        message: 'Pre-autorización creada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [BANPRO] Error:`, error.message);
      return {
        success: false,
        transactionId: `banpro_failed_${Date.now()}`,
        error: error.message,
      };
    }
  }

  async capture(transactionId: string, amount: number): Promise<BankResponse> {
    try {
      console.log(`💳 [BANPRO] Capturando pago...`);

      // TODO: Reemplazar con llamada real a Banpro
      const response = await this.client.post(`/transactions/${transactionId}/settle`, {
        amount: amount,
      });

      console.log(`✅ [BANPRO] Pago capturado`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Pago capturado exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [BANPRO] Error:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }

  async cancel(transactionId: string): Promise<BankResponse> {
    try {
      console.log(`❌ [BANPRO] Cancelando...`);

      // TODO: Reemplazar con llamada real a Banpro
      const response = await this.client.post(`/transactions/${transactionId}/void`);

      console.log(`✅ [BANPRO] Cancelado`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Autorización cancelada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [BANPRO] Error:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }
}

// ============================================
// LAFISE BANCENTRO
// ============================================

export class LafiseBank {
  private client: AxiosInstance;
  private config: BankConfig;

  constructor() {
    this.config = {
      name: 'Lafise',
      apiUrl: process.env.LAFISE_API_URL || 'https://api.lafise.com/v1',
      apiKey: process.env.LAFISE_API_KEY || '',
      merchantId: process.env.LAFISE_MERCHANT_ID || '',
      timeout: 30000,
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `ApiKey ${this.config.apiKey}`,
      },
    });
  }

  async authorize(request: {
    amount: number;
    currency: string;
    cardNumber: string;
    cardHolder: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
    metadata?: any;
  }): Promise<BankResponse> {
    try {
      console.log(`🏦 [LAFISE] Creando pre-autorización...`);

      // TODO: Reemplazar con llamada real a Lafise
      const response = await this.client.post('/payments/preauth', {
        merchant: this.config.merchantId,
        amount: request.amount,
        currency: request.currency,
        card: {
          number: request.cardNumber,
          name: request.cardHolder,
          expiry: `${request.expiryMonth}/${request.expiryYear}`,
          cvc: request.cvv,
        },
        reference: request.metadata.rideId,
      });

      console.log(`✅ [LAFISE] Pre-autorización exitosa`);

      return {
        success: true,
        transactionId: response.data.authId,
        authorizationCode: response.data.authCode,
        message: 'Pre-autorización creada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [LAFISE] Error:`, error.message);
      return {
        success: false,
        transactionId: `lafise_failed_${Date.now()}`,
        error: error.message,
      };
    }
  }

  async capture(transactionId: string, amount: number): Promise<BankResponse> {
    try {
      console.log(`💳 [LAFISE] Capturando pago...`);

      // TODO: Reemplazar con llamada real a Lafise
      const response = await this.client.post(`/payments/${transactionId}/capture`, {
        amount: amount,
      });

      console.log(`✅ [LAFISE] Pago capturado`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Pago capturado exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [LAFISE] Error:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }

  async cancel(transactionId: string): Promise<BankResponse> {
    try {
      console.log(`❌ [LAFISE] Cancelando...`);

      // TODO: Reemplazar con llamada real a Lafise
      const response = await this.client.post(`/payments/${transactionId}/cancel`);

      console.log(`✅ [LAFISE] Cancelado`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Autorización cancelada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [LAFISE] Error:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }
}

// ============================================
// FICOHSA - BANCO FICOHSA
// ============================================

export class FicohsaBank {
  private client: AxiosInstance;
  private config: BankConfig;

  constructor() {
    this.config = {
      name: 'Ficohsa',
      apiUrl: process.env.FICOHSA_API_URL || 'https://api.ficohsa.com/v1',
      apiKey: process.env.FICOHSA_API_KEY || '',
      merchantId: process.env.FICOHSA_MERCHANT_ID || '',
      timeout: 30000,
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Key': this.config.apiKey,
      },
    });
  }

  async authorize(request: {
    amount: number;
    currency: string;
    cardNumber: string;
    cardHolder: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
    metadata?: any;
  }): Promise<BankResponse> {
    try {
      console.log(`🏦 [FICOHSA] Creando pre-autorización...`);

      // TODO: Reemplazar con llamada real a Ficohsa
      const response = await this.client.post('/authorize', {
        merchantId: this.config.merchantId,
        amount: request.amount,
        currency: request.currency,
        card: {
          number: request.cardNumber,
          holder: request.cardHolder,
          expiryMonth: request.expiryMonth,
          expiryYear: request.expiryYear,
          cvv: request.cvv,
        },
        metadata: request.metadata,
      });

      console.log(`✅ [FICOHSA] Pre-autorización exitosa`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        authorizationCode: response.data.approvalCode,
        message: 'Pre-autorización creada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [FICOHSA] Error:`, error.message);
      return {
        success: false,
        transactionId: `ficohsa_failed_${Date.now()}`,
        error: error.message,
      };
    }
  }

  async capture(transactionId: string, amount: number): Promise<BankResponse> {
    try {
      console.log(`💳 [FICOHSA] Capturando pago...`);

      // TODO: Reemplazar con llamada real a Ficohsa
      const response = await this.client.post(`/capture`, {
        transactionId: transactionId,
        amount: amount,
      });

      console.log(`✅ [FICOHSA] Pago capturado`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Pago capturado exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [FICOHSA] Error:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }

  async cancel(transactionId: string): Promise<BankResponse> {
    try {
      console.log(`❌ [FICOHSA] Cancelando...`);

      // TODO: Reemplazar con llamada real a Ficohsa
      const response = await this.client.post(`/void`, {
        transactionId: transactionId,
      });

      console.log(`✅ [FICOHSA] Cancelado`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Autorización cancelada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [FICOHSA] Error:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }
}

// ============================================
// AVANZ - BANCO AVANZ
// ============================================

export class AvanzBank {
  private client: AxiosInstance;
  private config: BankConfig;

  constructor() {
    this.config = {
      name: 'Avanz',
      apiUrl: process.env.AVANZ_API_URL || 'https://api.avanz.com/v1',
      apiKey: process.env.AVANZ_API_KEY || '',
      merchantId: process.env.AVANZ_MERCHANT_ID || '',
      timeout: 30000,
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });
  }

  async authorize(request: {
    amount: number;
    currency: string;
    cardNumber: string;
    cardHolder: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
    metadata?: any;
  }): Promise<BankResponse> {
    try {
      console.log(`🏦 [AVANZ] Creando pre-autorización...`);

      // TODO: Reemplazar con llamada real a Avanz
      const response = await this.client.post('/transactions/authorize', {
        merchantId: this.config.merchantId,
        amount: request.amount,
        currency: request.currency,
        card: {
          number: request.cardNumber,
          holder: request.cardHolder,
          expiryMonth: request.expiryMonth,
          expiryYear: request.expiryYear,
          cvv: request.cvv,
        },
        metadata: request.metadata,
      });

      console.log(`✅ [AVANZ] Pre-autorización exitosa`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        authorizationCode: response.data.authorizationCode,
        message: 'Pre-autorización creada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [AVANZ] Error:`, error.message);
      return {
        success: false,
        transactionId: `avanz_failed_${Date.now()}`,
        error: error.message,
      };
    }
  }

  async capture(transactionId: string, amount: number): Promise<BankResponse> {
    try {
      console.log(`💳 [AVANZ] Capturando pago...`);

      // TODO: Reemplazar con llamada real a Avanz
      const response = await this.client.post(`/transactions/${transactionId}/capture`, {
        amount: amount,
      });

      console.log(`✅ [AVANZ] Pago capturado`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Pago capturado exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [AVANZ] Error:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }

  async cancel(transactionId: string): Promise<BankResponse> {
    try {
      console.log(`❌ [AVANZ] Cancelando...`);

      // TODO: Reemplazar con llamada real a Avanz
      const response = await this.client.post(`/transactions/${transactionId}/void`);

      console.log(`✅ [AVANZ] Cancelado`);

      return {
        success: true,
        transactionId: response.data.transactionId,
        message: 'Autorización cancelada exitosamente',
        rawResponse: response.data,
      };
    } catch (error: any) {
      console.error(`❌ [AVANZ] Error:`, error.message);
      return {
        success: false,
        transactionId,
        error: error.message,
      };
    }
  }
}

// ============================================
// FACTORY - Obtener instancia del banco
// ============================================

export function getBankClient(bankId: string): BACBank | BanproBank | LafiseBank | FicohsaBank | AvanzBank {
  switch (bankId.toLowerCase()) {
    case 'bac':
      return new BACBank();
    case 'banpro':
      return new BanproBank();
    case 'lafise':
      return new LafiseBank();
    case 'ficohsa':
      return new FicohsaBank();
    case 'avanz':
      return new AvanzBank();
    default:
      throw new Error(`Banco no soportado: ${bankId}`);
  }
}
