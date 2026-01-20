import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirebaseAuth } from '../config/firebase';
import backendConfig from '../config/backendConfig';
import { isNativeFirebaseSupported, loadNativeFirebaseApp, loadNativeFirebaseAppCheck } from '../utils/nativeFirebase';

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'rejected' | string;
export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent' | string | null;

export interface SupportTicket {
  id: string;
  rideId: string | null;
  clientId: string | null;
  driverId: string | null;
  createdByUserId: string;
  createdByRole: string;
  assignedToUserId: string | null;
  category: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  title: string;
  description: string | null;
  resolutionNotes: string | null;
  chatLogUrl: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  resolvedAt: number | null;
}

interface GetSupportTicketsResponse {
  success: boolean;
  scope: 'mine' | 'all';
  count: number;
  tickets: SupportTicket[];
}

class SupportTicketsService {
  private functions: any = null;
  private appCheckInstance: any = null;
  private appCheckInitPromise: Promise<any | null> | null = null;

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  private async ensureFirebaseSession() {
    const auth = await getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('USER_NOT_AUTHENTICATED');
    }
    try {
      await currentUser.getIdToken(true);
    } catch (error) {
      console.warn('[supportTicketsService] No se pudo refrescar el ID token antes de la llamada.', error);
    }
    return currentUser;
  }

  private async ensureAppCheckInitialized(): Promise<any | null> {
    if (this.appCheckInstance) {
      return this.appCheckInstance;
    }

    if (!isNativeFirebaseSupported()) {
      return null;
    }

    if (this.appCheckInitPromise) {
      return this.appCheckInitPromise;
    }

    this.appCheckInitPromise = (async () => {
      const rnApp = await loadNativeFirebaseApp();
      const rnAppCheck = await loadNativeFirebaseAppCheck();
      if (!rnApp || !rnAppCheck) {
        return null;
      }

      const { getApp } = rnApp as any;
      const { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } = rnAppCheck as any;
      if (!getApp || !initializeAppCheck || !ReactNativeFirebaseAppCheckProvider) {
        return null;
      }

      const debugTokenEnv = process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN as string | undefined;
      const siteKey = (process.env.FIREBASE_APP_CHECK_SITE_KEY as string | undefined) || undefined;

      const debugToken = debugTokenEnv || undefined;
      if (__DEV__ && !debugToken) {
        console.warn(
          '[supportTicketsService] FIREBASE_APP_CHECK_DEBUG_TOKEN no está configurado. Si App Check está enforced, debes allowlistear un debug token y ponerlo en .env.development.',
        );
      }

      const provider = new ReactNativeFirebaseAppCheckProvider();
      provider.configure({
        android: {
          provider: __DEV__ ? 'debug' : 'playIntegrity',
          debugToken: __DEV__ ? debugToken : undefined,
        },
        apple: {
          provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
          debugToken: __DEV__ ? debugToken : undefined,
        },
        web: {
          provider: __DEV__ ? 'debug' : 'reCaptchaV3',
          siteKey,
        },
        isTokenAutoRefreshEnabled: true,
      });

      try {
        const instance = await initializeAppCheck(getApp(), {
          provider,
          isTokenAutoRefreshEnabled: true,
        } as any);

        this.appCheckInstance = instance;
        return instance;
      } catch (error) {
        console.warn('[supportTicketsService] No se pudo inicializar App Check.', error);
        return null;
      }
    })().finally(() => {
      this.appCheckInitPromise = null;
    });

    return this.appCheckInitPromise;
  }

  private async getAppCheckToken(): Promise<string | null> {
    const instance = await this.ensureAppCheckInitialized();
    if (!instance) {
      return null;
    }

    try {
      const tokenResult = await instance.getToken(true);
      const token = tokenResult?.token;
      return typeof token === 'string' && token ? token : null;
    } catch (error) {
      console.warn('[supportTicketsService] No se pudo obtener token de App Check.', error);
      return null;
    }
  }

  private shouldFallbackToAlternateCallable(error: any): boolean {
    const code = error?.code || error?.message || '';
    return (
      code === 'functions/unauthenticated' ||
      code === 'functions/unavailable' ||
      code === 'Unavailable' ||
      code === 'Unauthenticated' ||
      String(code).includes('CALLABLE_HTTP_ERROR_401') ||
      String(code).includes('CALLABLE_HTTP_ERROR_403') ||
      String(code).includes('CALLABLE_HTTP_ERROR_503')
    );
  }

  private async callCallableWithFetch<T>(functionName: string, payload: Record<string, any>): Promise<T> {
    const currentUser = await this.ensureFirebaseSession();
    const baseUrl = backendConfig.getApiUrl();
    if (!baseUrl) {
      throw new Error('FUNCTIONS_BASE_URL_NOT_CONFIGURED');
    }

    const idToken = await currentUser.getIdToken(true);
    const appCheckToken = await this.getAppCheckToken();

    if (!appCheckToken) {
      console.warn('[supportTicketsService] App Check token no disponible para llamada HTTP.', {
        functionName,
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    };

    if (appCheckToken) {
      headers['X-Firebase-AppCheck'] = appCheckToken;
    }

    const response = await fetch(`${baseUrl}/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: payload }),
    });

    const rawText = await response.text();
    let json: any = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const message =
        json?.error?.message ||
        json?.error?.status ||
        rawText ||
        `CALLABLE_HTTP_ERROR_${response.status}`;

      const err: any = new Error(message);
      err.code = `http/${response.status}`;
      throw err;
    }

    const data = (json?.data as T) ?? (json?.result as T) ?? (json as T);
    return data;
  }

  private async invokeCallable<T>(functionName: string, payload: Record<string, any>): Promise<T> {
    await this.ensureFirebaseSession();
    const functions = await this.getFunctions();
    const callable = httpsCallable(functions, functionName);

    try {
      const response = await callable(payload);
      const data = (response?.data as T) ?? (response as any);
      return data;
    } catch (error: any) {
      if (!this.shouldFallbackToAlternateCallable(error)) {
        throw error;
      }

      try {
        return await this.callCallableWithFetch<T>(functionName, payload);
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  async getMyTickets(params?: {
    status?: string;
    category?: string;
    priority?: string;
    pageSize?: number;
  }): Promise<SupportTicket[]> {
    const data = await this.invokeCallable<GetSupportTicketsResponse>('getSupportTickets', {
      scope: 'mine',
      status: params?.status,
      category: params?.category,
      priority: params?.priority,
      pageSize: params?.pageSize ?? 50,
    });

    if (!data?.success || !Array.isArray(data.tickets)) {
      return [];
    }

    return data.tickets;
  }

  async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    if (!ticketId) return null;

    const data = await this.invokeCallable<GetSupportTicketsResponse>('getSupportTickets', {
      scope: 'mine',
      ticketId,
      pageSize: 1,
    });

    if (!data?.success || !Array.isArray(data.tickets) || data.tickets.length === 0) {
      return null;
    }

    return data.tickets[0];
  }

  async deleteTicket(ticketId: string): Promise<{ success: boolean; archivedChatUrl?: string | null }> {
    if (!ticketId) {
      throw new Error('ticketId is required to delete a support ticket');
    }

    const data = await this.callCallableWithFetch<{ success?: boolean; archivedChatUrl?: string | null }>(
      'deleteSupportTicket',
      { ticketId },
    );

    if (!data?.success) {
      throw new Error('deleteSupportTicket callable function returned an error');
    }

    return {
      success: true,
      archivedChatUrl: data.archivedChatUrl ?? null,
    };
  }
}

export default new SupportTicketsService();
