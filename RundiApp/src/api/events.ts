/**
 * Events — poke del consumer tras escribir SYSTEM_pending_events.
 *
 * Los pending events (chat, call-end, foto de llegada) los crea el cliente por
 * SDK en un batch atómico; sin este aviso esperan al tick programado del
 * consumer. POST /events/poke no tiene cuerpo ni efecto propio: su 204 activa
 * el wake-up del outbox en el backend. Best-effort: si falla, el tick lo cubre.
 */
import client from './client';

export function pokeConsumer(): void {
  client.post('/events/poke').catch(() => {
    // Silencioso — el barrido programado del consumer procesa el evento igual.
  });
}
