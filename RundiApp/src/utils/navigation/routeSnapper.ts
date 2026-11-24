// Geometría de snap-to-route para el modo navegación (Camino A, temporal).
// Proyección equirectangular local — suficiente a escala de ciudad.

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface SnapResult {
  snapped: RoutePoint;
  /** Metros desde el inicio de la ruta hasta la proyección del punto. */
  distanceAlongRoute: number;
  /** Distancia perpendicular del punto a la ruta, en metros. */
  perpDistance: number;
  /** Índice del segmento ganador (entre coords[i] y coords[i+1]). */
  segmentIndex: number;
}

const EARTH_RADIUS_M = 6371000;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320;

const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Distancia acumulada en metros en cada vértice del polyline. */
export function buildCumulativeMeters(coords: RoutePoint[]): number[] {
  const cumulative = new Array<number>(coords.length);
  cumulative[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    cumulative[i] = cumulative[i - 1] + haversineMeters(coords[i - 1], coords[i]);
  }
  return cumulative;
}

// El conductor solo avanza: búsqueda en ventana alrededor del último match;
// scan completo si el match ventana queda lejos (teleport / ruta vieja).
const WINDOW_BACK = 6;
const WINDOW_AHEAD = 48;
const FULL_SCAN_THRESHOLD_M = 80;

export function snapToRoute(
  point: RoutePoint,
  coords: RoutePoint[],
  cumulative: number[],
  hintSegment?: number | null,
): SnapResult | null {
  if (coords.length < 2 || cumulative.length !== coords.length) return null;

  const cosLat = Math.cos(toRad(point.latitude));
  const toX = (p: RoutePoint) => p.longitude * M_PER_DEG_LNG * cosLat;
  const toY = (p: RoutePoint) => p.latitude * M_PER_DEG_LAT;
  const px = toX(point);
  const py = toY(point);

  const scanRange = (from: number, to: number): SnapResult | null => {
    let best: SnapResult | null = null;
    let bestD2 = Infinity;
    const last = Math.min(to, coords.length - 2);
    for (let i = Math.max(0, from); i <= last; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const ax = toX(a);
      const ay = toY(a);
      const vx = toX(b) - ax;
      const vy = toY(b) - ay;
      const len2 = vx * vx + vy * vy;
      let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
      t = Math.min(1, Math.max(0, t));
      const qx = ax + t * vx;
      const qy = ay + t * vy;
      const dx = px - qx;
      const dy = py - qy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        const segLen = cumulative[i + 1] - cumulative[i];
        best = {
          snapped: {
            latitude: a.latitude + t * (b.latitude - a.latitude),
            longitude: a.longitude + t * (b.longitude - a.longitude),
          },
          distanceAlongRoute: cumulative[i] + t * segLen,
          perpDistance: Math.sqrt(d2),
          segmentIndex: i,
        };
      }
    }
    return best;
  };

  const lastSegment = coords.length - 2;
  if (hintSegment != null) {
    const hinted = scanRange(
      hintSegment - WINDOW_BACK,
      Math.min(lastSegment, hintSegment + WINDOW_AHEAD),
    );
    if (hinted && hinted.perpDistance <= FULL_SCAN_THRESHOLD_M) return hinted;
  }
  return scanRange(0, lastSegment);
}

/** Rumbo inicial (0-360, 0=norte) de a→b. */
export function bearingDegrees(a: RoutePoint, b: RoutePoint): number {
  const la1 = toRad(a.latitude);
  const la2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** EMA angular con wrap 0/360 para el heading de cámara. */
export function blendHeading(prev: number, next: number, alpha: number): number {
  let d = next - prev;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return (prev + d * alpha + 360) % 360;
}
