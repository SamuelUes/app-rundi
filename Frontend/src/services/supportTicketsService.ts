import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '../config/firebase';
import backendConfig from '../config/backendConfig';

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

  private async invokeCallable<T>(functionName: string, payload: Record<string, any>): Promise<T> {
    await this.ensureFirebaseSession();
    const functions = await this.getFunctions();
    const callable = httpsCallable(functions, functionName);

    try {
      const response = await callable(payload);
      const data = (response?.data as T) ?? (response as any);
      return data;
    } catch (error: any) {
      throw error;
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

    const baseUrl = backendConfig.getApiUrl();
    if (!baseUrl) {
      throw new Error('FUNCTIONS_BASE_URL_NOT_CONFIGURED');
    }

    const response = await fetch(`${baseUrl}/deleteSupportTicketHttp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ticketId }),
    });

    const rawText = await response.text();
    let json: any = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      const message = json?.error || json?.message || rawText || 'deleteSupportTicketHttp failed';
      const err: any = new Error(message);
      err.code = `http/${response.status}`;
      throw err;
    }

    const data = (json as { success?: boolean; archivedChatUrl?: string | null }) || {};

    if (!data?.success) {
      throw new Error('deleteSupportTicketHttp returned an error');
    }

    return {
      success: true,
      archivedChatUrl: data.archivedChatUrl ?? null,
    };
  }
}

export default new SupportTicketsService();
