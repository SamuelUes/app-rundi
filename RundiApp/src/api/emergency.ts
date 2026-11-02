/**
 * API v2 — emergency calls (SOS). Port de api/emergency_calls_sequelize.ts.
 */

import client from './client';

export interface EmergencyCall {
  id: string;
  userId: string;
  userRole: string;
  emergencyType: string;
  emergencyNumber: string;
  lat?: number;
  lng?: number;
  address?: string;
  rideId?: string;
  notes?: string;
  callStatus: string;
  calledAt: string;
}

export interface CreateEmergencyCallInput {
  emergencyType: string;
  emergencyNumber: string;
  lat?: number;
  lng?: number;
  address?: string;
  rideId?: string;
  notes?: string;
}

export async function createEmergencyCall(input: CreateEmergencyCallInput): Promise<EmergencyCall> {
  const { data } = await client.post<{ call: EmergencyCall }>('/emergency-calls', input);
  return data.call;
}

export async function getMyEmergencyCalls(limit = 50): Promise<EmergencyCall[]> {
  const { data } = await client.get<{ calls: EmergencyCall[] }>(
    '/emergency-calls/mine',
    { params: { limit } },
  );
  return data.calls;
}

export async function updateEmergencyCallStatus(id: string, status: string): Promise<void> {
  await client.patch(`/emergency-calls/${id}/status`, { status });
}
