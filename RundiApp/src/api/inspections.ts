/**
 * API v2 — designated driver inspections (evidencia fotográfica del
 * vehículo del conductor designado).
 */

import client from './client';

export interface Inspection {
  id: string;
  rideId: string;
  driverId: string;
  vehicleFrontPhoto?: string;
  vehicleRearPhoto?: string;
  interiorFrontPhoto?: string;
  interiorRearPhoto?: string;
  status: string;
  inspectedAt: string;
}

export interface SubmitInspectionInput {
  rideId: string;
  vehicleFrontPhoto?: string;
  vehicleRearPhoto?: string;
  interiorFrontPhoto?: string;
  interiorRearPhoto?: string;
}

export async function submitInspection(input: SubmitInspectionInput): Promise<Inspection> {
  const { data } = await client.post<{ inspection: Inspection }>('/inspections', input);
  return data.inspection;
}

export async function getRideInspection(rideId: string): Promise<Inspection> {
  const { data } = await client.get<{ inspection: Inspection }>(`/inspections/ride/${rideId}`);
  return data.inspection;
}

export async function updateInspection(id: string, input: Partial<SubmitInspectionInput>): Promise<Inspection> {
  const { data } = await client.patch<{ inspection: Inspection }>(`/inspections/${id}`, input);
  return data.inspection;
}
