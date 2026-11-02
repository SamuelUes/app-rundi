/**
 * Chats API — creación del doc REALTIME_chats/{chatId} por backend
 * (participants derivados de la autoridad SQL; las reglas prohíben
 * create/update del doc desde cliente).
 */
import client from './client';

/** createRideChat — crea/devuelve el chat del viaje (chatId = ride-{rideId}). */
export async function createRideChat(rideId: string): Promise<{ chatId: string }> {
  const { data } = await client.post<{ chatId: string }>('/chats', { rideId });
  return data;
}
