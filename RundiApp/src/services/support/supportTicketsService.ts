import {
  deleteComplaint,
  getMyComplaints,
  type Complaint,
} from '../../api/support';

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

const toMillis = (value?: string | null): number | null => {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
};

const toTicket = (c: Complaint): SupportTicket => ({
  id: c.id,
  rideId: c.rideId ?? null,
  clientId: c.clientId ?? null,
  driverId: c.driverId ?? null,
  createdByUserId: c.createdByUserId,
  createdByRole: c.createdByRole,
  assignedToUserId: c.assignedToUserId ?? null,
  category: c.category,
  status: c.status,
  priority: c.priority ?? null,
  title: c.title,
  description: c.description ?? null,
  resolutionNotes: c.resolutionNotes ?? null,
  chatLogUrl: c.chatLogUrl ?? null,
  createdAt: toMillis(c.createdAt),
  updatedAt: toMillis(c.updatedAt),
  resolvedAt: toMillis(c.resolvedAt),
});

class SupportTicketsService {
  async getMyTickets(params?: {
    status?: string;
    category?: string;
    priority?: string;
    pageSize?: number;
  }): Promise<SupportTicket[]> {
    const complaints = await getMyComplaints({
      status: params?.status,
      limit: params?.pageSize ?? 50,
    });
    return complaints.map(toTicket);
  }

  async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    if (!ticketId) return null;
    const complaints = await getMyComplaints({ limit: 100 });
    const found = complaints.find((c) => c.id === ticketId);
    return found ? toTicket(found) : null;
  }

  async deleteTicket(ticketId: string): Promise<{ success: boolean; archivedChatUrl?: string | null }> {
    if (!ticketId) {
      throw new Error('ticketId is required to delete a support ticket');
    }
    await deleteComplaint(ticketId);
    return { success: true, archivedChatUrl: null };
  }
}

export default new SupportTicketsService();
