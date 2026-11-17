/**
 * API v2 — reconocimiento de dispositivo (internal/users/devices.go).
 * recognize/token son públicos (App Check + rate limit, sin Bearer);
 * registerMyDevice requiere auth. Los deviceId/secret los gestiona
 * services/auth/deviceIdentityService.
 */

import client from './client';

export interface RecognizedDevice {
  recognized: boolean;
  name?: string;
  profilePhoto?: string;
}

/** POST /v1/users/me/devices — registra o rota el secret del dispositivo. */
export async function registerMyDevice(body: {
  deviceId: string;
  deviceSecret: string;
  platform?: string;
  appVersion?: string;
}): Promise<void> {
  await client.post('/users/me/devices', body);
}

/** POST /v1/auth/devices/recognize — hint "continuar como X" pre-login. */
export async function recognizeDevice(deviceId: string, deviceSecret: string): Promise<RecognizedDevice> {
  const { data } = await client.post<RecognizedDevice>('/auth/devices/recognize', { deviceId, deviceSecret });
  return data;
}

/** POST /v1/auth/devices/token — deviceId+secret → Firebase custom token. */
export async function deviceToken(
  deviceId: string,
  deviceSecret: string,
): Promise<{ customToken: string }> {
  const { data } = await client.post<{ customToken: string }>('/auth/devices/token', {
    deviceId,
    deviceSecret,
  });
  return data;
}
