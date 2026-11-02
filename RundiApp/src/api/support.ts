/**
 * Support API — cms_complaints (quejas) + chat del caso.
 * Cubre createSupportComplaint/getSupportTickets/updateSupportTicket/
 * deleteSupportTicket/joinSupportChat de v1.
 */
import client from './client';

export interface Complaint {
  id: string;
  rideId?: string;
  clientId?: string;
  driverId?: string;
  createdByUserId: string;
  createdByRole: string;
  assignedToUserId?: string;
  category: string;
  status: string;
  priority?: string;
  title: string;
  description?: string;
  resolutionNotes?: string;
  chatLogUrl?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export async function createComplaint(body: {
  title: string;
  category?: string;
  priority?: string;
  description?: string;
  rideId?: string;
}): Promise<Complaint> {
  const { data } = await client.post<{ complaint: Complaint }>('/support/complaints', body);
  return data.complaint;
}

export async function getMyComplaints(opts?: {
  status?: string;
  limit?: number;
}): Promise<Complaint[]> {
  const { data } = await client.get<{ complaints: Complaint[] }>('/support/complaints', {
    params: opts,
  });
  return data.complaints;
}

/** Staff (operator/admin): estado, prioridad, asignación, notas de resolución. */
export async function updateComplaint(
  id: string,
  patch: {
    status?: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority?: string;
    assignedToUserId?: string;
    resolutionNotes?: string;
  },
): Promise<Complaint> {
  const { data } = await client.patch<{ complaint: Complaint }>(`/support/complaints/${id}`, patch);
  return data.complaint;
}

export async function deleteComplaint(id: string): Promise<void> {
  await client.delete(`/support/complaints/${id}`);
}

/** joinSupportChat — crea/devuelve el chat del caso (participants desde SQL). */
export async function joinSupportChat(complaintId: string): Promise<{ chatId: string }> {
  const { data } = await client.post<{ chatId: string }>(`/support/complaints/${complaintId}/chat`);
  return data;
}
