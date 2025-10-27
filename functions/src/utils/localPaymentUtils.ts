/**
 * Utilidades para pagos con bancos locales de Nicaragua
 * 
 * Bancos soportados:
 * - BAC (Banco de América Central)
 * - Banpro (Banco de la Producción)
 * - Lafise Bancentro
 * - Banco Ficohsa
 * - Avanz
 * 
 * ✅ ACTUALIZADO: Usa clases de bankAPIs.ts
 */

import { getBankClient } from './bankAPIs';

export enum LocalBank {
  BAC = 'bac',
  BANPRO = 'banpro',
  LAFISE = 'lafise',
  FICOHSA = 'ficohsa',
  AVANZ = 'avanz',
}

export enum LocalPaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export interface LocalPaymentRequest {
  amount: number;
  currency: string;
  bank: LocalBank;
  cardNumber: string;
  cardHolder: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  metadata?: {
    rideId: string;
    clientId: string;
    driverId: string;
    [key: string]: any;
  };
}

export interface LocalPaymentResponse {
  success: boolean;
  transactionId: string;
  authorizationCode?: string;
  status: LocalPaymentStatus;
  message?: string;
  error?: string;
}

/**
 * Crear pre-autorización con banco local
 * ✅ ACTUALIZADO: Usa clases de bankAPIs.ts
 */
export async function createLocalPaymentAuthorization(
  request: LocalPaymentRequest
): Promise<LocalPaymentResponse> {
  console.log(`🏦 [${request.bank.toUpperCase()}] Creando pre-autorización...`);
  console.log(`   Monto: C$${request.amount.toFixed(2)}`);
  console.log(`   Tarjeta: ****${request.cardNumber.slice(-4)}`);

  try {
    const bankClient = getBankClient(request.bank);
    const response = await bankClient.authorize(request);

    if (response.success) {
      return {
        success: true,
        transactionId: response.transactionId,
        authorizationCode: response.authorizationCode,
        status: LocalPaymentStatus.PENDING,
        message: response.message,
      };
    } else {
      return {
        success: false,
        transactionId: response.transactionId,
        status: LocalPaymentStatus.FAILED,
        error: response.error,
      };
    }
  } catch (error: any) {
    console.error(`❌ Error creando pre-autorización con ${request.bank}:`, error);
    return {
      success: false,
      transactionId: `local_${Date.now()}`,
      status: LocalPaymentStatus.FAILED,
      error: error.message,
    };
  }
}

/**
 * Capturar pago pre-autorizado
 * ✅ ACTUALIZADO: Usa clases de bankAPIs.ts
 */
export async function captureLocalPayment(
  transactionId: string,
  amount: number,
  bank: LocalBank
): Promise<LocalPaymentResponse> {
  console.log(`💳 [${bank.toUpperCase()}] Capturando pago...`);
  console.log(`   Transaction ID: ${transactionId}`);
  console.log(`   Monto: C$${amount.toFixed(2)}`);

  try {
    const bankClient = getBankClient(bank);
    const response = await bankClient.capture(transactionId, amount);

    if (response.success) {
      return {
        success: true,
        transactionId: response.transactionId,
        status: LocalPaymentStatus.COMPLETED,
        message: response.message,
      };
    } else {
      return {
        success: false,
        transactionId,
        status: LocalPaymentStatus.FAILED,
        error: response.error,
      };
    }
  } catch (error: any) {
    console.error(`❌ Error capturando pago con ${bank}:`, error);
    return {
      success: false,
      transactionId,
      status: LocalPaymentStatus.FAILED,
      error: error.message,
    };
  }
}

/**
 * Cancelar pre-autorización
 * ✅ ACTUALIZADO: Usa clases de bankAPIs.ts
 */
export async function cancelLocalPaymentAuthorization(
  transactionId: string,
  bank: LocalBank
): Promise<LocalPaymentResponse> {
  console.log(`❌ [${bank.toUpperCase()}] Cancelando pre-autorización...`);
  console.log(`   Transaction ID: ${transactionId}`);

  try {
    const bankClient = getBankClient(bank);
    const response = await bankClient.cancel(transactionId);

    if (response.success) {
      return {
        success: true,
        transactionId: response.transactionId,
        status: LocalPaymentStatus.CANCELED,
        message: response.message,
      };
    } else {
      return {
        success: false,
        transactionId,
        status: LocalPaymentStatus.FAILED,
        error: response.error,
      };
    }
  } catch (error: any) {
    console.error(`❌ Error cancelando autorización con ${bank}:`, error);
    return {
      success: false,
      transactionId,
      status: LocalPaymentStatus.FAILED,
      error: error.message,
    };
  }
}

// ============================================
// IMPLEMENTACIONES POR BANCO - REMOVIDAS
// ============================================
// ✅ Todas las implementaciones están en bankAPIs.ts
// Las funciones ahora usan las clases BACBank, BanproBank, etc.
// Solo reemplaza los endpoints y credenciales en bankAPIs.ts
