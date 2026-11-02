/**
 * API v2 — users (internal/users del backend Go).
 * Perfil operativo Firestore-first (DATA-MAIN_users) + histórico SQL.
 * Los fcmTokens van directo por SDK (ver live/userLive.ts) — las reglas
 * permiten al owner escribir su subcolección sin pasar por el API.
 */

import client from './client';

export interface BootstrapUserRequest {
  name: string;
  email?: string;
  phone?: string;
  authProvider?: 'phone' | 'google' | 'apple' | string;
  birthDate?: string; // YYYY-MM-DD
  notificationsEnabled?: boolean;
}

export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  profilePhoto?: string; // objectPath en Cloud Storage (no URL)
  authProvider?: string;
  notificationsEnabled?: boolean;
}

/** POST /v1/users/bootstrap — tras sign-in de Firebase Auth. */
export async function bootstrapUser(body: BootstrapUserRequest): Promise<void> {
  await client.post('/users/bootstrap', body);
}

/** PATCH /v1/users/me — campos permitidos (mismo whitelist que reglas). */
export async function updateMyProfile(body: UpdateProfileRequest): Promise<void> {
  await client.patch('/users/me', body);
}

/** GET /v1/users/availability — checkUserAvailability v1. */
export async function checkUserAvailability(
  email?: string,
  phone?: string,
): Promise<{ emailAvailable: boolean; phoneAvailable: boolean }> {
  const { data } = await client.get<{ emailAvailable: boolean; phoneAvailable: boolean }>(
    '/users/availability',
    { params: { email, phone } },
  );
  return data;
}

/** POST /v1/users/me/upgrade-to-driver — upgradeClientToDriver v1. */
export async function upgradeToDriver(): Promise<void> {
  await client.post('/users/me/upgrade-to-driver');
}

/** POST /v1/users/me/deactivate — baja lógica reversible. */
export async function deactivateAccount(): Promise<void> {
  await client.post('/users/me/deactivate');
}

/** POST /v1/users/me/delete-data — borrado GDPR de PII. */
export async function deleteMyData(): Promise<void> {
  await client.post('/users/me/delete-data');
}
