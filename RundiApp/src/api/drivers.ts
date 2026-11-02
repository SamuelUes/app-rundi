/**
 * API v2 — drivers (internal/drivers del backend Go).
 * Registro/aprobación de conductores, servicios asignados y vehículos.
 * Autoridad SQL; campos sensibles (licencias, ganancias) solo en GET propio.
 */

import client from './client';

/**
 * snake_case → camelCase para payloads de PATCH/POST: los whitelists del
 * backend solo aceptan camelCase y descartan keys desconocidas en silencio.
 * `is_4x4` → `is4x4` (caso especial).
 */
const SNAKE_TO_CAMEL: Record<string, string> = { is_4x4: 'is4x4' };
export function camelize<T extends Record<string, any>>(fields: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    const key = SNAKE_TO_CAMEL[k] ?? k.replace(/_([a-z0-9])/g, (_, c) => String(c).toUpperCase());
    out[key] = v;
  }
  return out as T;
}

export type DriverAccountStatus = 'pending' | 'active' | 'suspended' | 'rejected';

export interface DriverProfile {
  id: string;
  userId: string;
  accountStatus: DriverAccountStatus;
  documentsStatus: string;
  designatedRoleStatus: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  profilePhoto?: string;
  department?: string;
  municipality?: string;
  verifiedAt?: string;
  totalRides: number;
  averageRating: number;
  totalEarnings: number;
  rechargeBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterDriverRequest {
  licenseNumber: string;
  licenseExpiry: string; // YYYY-MM-DD
  profilePhoto?: string;
  licensePhotoFront?: string;
  licensePhotoBack?: string;
  department?: string;
  municipality?: string;
}

export interface DriverService {
  id: string;
  serviceCode: string;
  serviceName: string;
  isActive: boolean;
  isApproved: boolean;
  customCommissionRate?: number;
  approvedAt?: string;
  assignedAt?: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: string;
  is4x4?: boolean;
  isActive?: boolean;
  vehiclePhoto?: string;
  createdAt: string;
}

export interface RegisterVehicleRequest {
  plate: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: 'auto' | 'moto' | 'suv' | 'pickup';
  fuelType?: string;
  passengers?: number;
  is4x4?: boolean;
  vehiclePhoto?: string;
  registrationNumber?: string;
  registrationExpiry?: string;
  insuranceNumber?: string;
  insuranceCompany?: string;
  insuranceExpiry?: string;
}

/** POST /v1/drivers/register — crea perfil (account_status='pending'). */
export async function registerDriver(body: RegisterDriverRequest): Promise<string> {
  const { data } = await client.post<{ driverId: string }>('/drivers/register', body);
  return data.driverId;
}

/** GET /v1/drivers/me — perfil completo propio (incluye campos sensibles). */
export async function getMyDriverProfile(): Promise<DriverProfile> {
  const { data } = await client.get<DriverProfile>('/drivers/me');
  return data;
}

/** PATCH /v1/drivers/me — solo campos no privilegiados. */
export async function updateMyDriverProfile(
  fields: Partial<RegisterDriverRequest>,
): Promise<void> {
  await client.patch('/drivers/me', camelize(fields));
}

/** GET /v1/drivers/me/services. */
export async function getMyDriverServices(): Promise<DriverService[]> {
  const { data } = await client.get<{ services: DriverService[] }>('/drivers/me/services');
  return data.services;
}

/** POST /v1/drivers/me/services — pide servicio (is_approved=false). */
export async function requestDriverService(serviceCode: string): Promise<void> {
  await client.post('/drivers/me/services', { serviceCode });
}

/** POST /v1/drivers/me/driver-services/{id}/deactivate. */
export async function deactivateDriverService(driverServiceId: string): Promise<void> {
  await client.post(`/drivers/me/driver-services/${driverServiceId}/deactivate`);
}

/** GET /v1/drivers/me/vehicles. */
export async function getMyVehicles(): Promise<Vehicle[]> {
  const { data } = await client.get<{ vehicles: Vehicle[] }>('/drivers/me/vehicles');
  return data.vehicles;
}

/** POST /v1/drivers/me/vehicles. */
export async function registerVehicle(body: RegisterVehicleRequest): Promise<string> {
  const { data } = await client.post<{ vehicleId: string }>(
    '/drivers/me/vehicles',
    camelize(body),
  );
  return data.vehicleId;
}

/** PATCH /v1/drivers/me/vehicles/{id}. */
export async function updateVehicle(
  vehicleId: string,
  fields: Partial<RegisterVehicleRequest>,
): Promise<void> {
  await client.patch(`/drivers/me/vehicles/${vehicleId}`, camelize(fields));
}

/** POST /v1/drivers/me/vehicles/{id}/switch — vehículo activo (switchVehicle v1). */
export async function switchVehicle(vehicleId: string): Promise<void> {
  await client.post(`/drivers/me/vehicles/${vehicleId}/switch`);
}

/** DELETE /v1/drivers/me/vehicles/{id} — soft delete del vehículo. */
export async function deleteVehicle(vehicleId: string): Promise<void> {
  await client.delete(`/drivers/me/vehicles/${vehicleId}`);
}

/** POST /v1/drivers/me/designated-access — solicitud de rol designado. */
export async function requestDesignatedDriverAccess(): Promise<string> {
  const { data } = await client.post<{ status: string }>('/drivers/me/designated-access');
  return data.status;
}

/** GET /v1/drivers/me/designated-access — estado de la solicitud. */
export async function getDesignatedDriverRequestStatus(): Promise<string> {
  const { data } = await client.get<{ status: string }>('/drivers/me/designated-access');
  return data.status;
}

export interface DriverStats {
  driverId: string;
  totalRides: number;
  completedRides: number;
  canceledRides: number;
  averageRating: number;
  totalEarnings: number;
  rechargeBalance: number;
  accountStatus: string;
}

/** GET /v1/drivers/me/stats (getDriverStats v1). */
export async function getDriverStats(): Promise<DriverStats> {
  const { data } = await client.get<DriverStats>('/drivers/me/stats');
  return data;
}

/** GET /v1/drivers/me/features (getMyRideFeatureCapabilities v1). */
export async function getMyFeatureCapabilities(): Promise<string[]> {
  const { data } = await client.get<{ features: string[] }>('/drivers/me/features');
  return data.features;
}

export interface RechargeEntry {
  id: string;
  type: string;
  source: string;
  amount: number;
  status: string;
  externalReference?: string;
  createdAt: string;
}

/** GET /v1/drivers/me/recharges (getDriverRechargeFundsSummary v1). */
export async function getRechargeSummary(limit = 50): Promise<{ balance: number; recharges: RechargeEntry[] }> {
  const { data } = await client.get<{ balance: number; recharges: RechargeEntry[] }>(
    '/drivers/me/recharges',
    { params: { limit } },
  );
  return data;
}

export interface CrewCandidate {
  userId: string;
  name: string;
  rating: number;
  department: string;
  profilePhoto?: string;
}

/** GET /v1/drivers/crew-candidates?q= (searchDesignatedCrewCandidates v1). */
export async function searchCrewCandidates(q = '', limit = 20): Promise<CrewCandidate[]> {
  const { data } = await client.get<{ candidates: CrewCandidate[] }>(
    '/drivers/crew-candidates',
    { params: { q, limit } },
  );
  return data.candidates;
}

export interface DriverPublic {
  userId: string;
  name: string;
  averageRating: number;
  totalRides: number | null;
  department: string;
  municipality: string;
  profilePhoto?: string;
}

/** GET /v1/drivers — getDriversByRating/getDriversByDepartment v1. */
export async function getDrivers(
  opts: { minRating?: number; department?: string; limit?: number } = {},
): Promise<DriverPublic[]> {
  const { data } = await client.get<{ drivers: DriverPublic[] }>('/drivers', {
    params: opts,
  });
  return data.drivers;
}

/** GET /v1/drivers/me/vehicles/{id} — getVehicleById v1. */
export async function getVehicleById(vehicleId: string): Promise<Vehicle> {
  const { data } = await client.get<Vehicle>(`/drivers/me/vehicles/${vehicleId}`);
  return data;
}
