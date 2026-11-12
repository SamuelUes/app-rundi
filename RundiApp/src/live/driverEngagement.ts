/**
 * Engagement del conductor a nivel app: tiene viaje activo u oferta/
 * negociación pendiente según los listeners de Firestore. Lo actualiza
 * useDriverActiveRides y lo aplica writeDriverLiveLocation para que
 * ningún writer (heartbeat, presence, toggle de disponibilidad) pise el
 * estado ocupado escribiendo 'online' sobre 'on_ride'.
 * Sobrevive a unmounts de pantalla (module-level) — se reevalúa en cada
 * snapshot del home del conductor.
 */

let engaged = false;

export function setDriverEngaged(value: boolean): void {
  engaged = value;
}

export function isDriverEngaged(): boolean {
  return engaged;
}
