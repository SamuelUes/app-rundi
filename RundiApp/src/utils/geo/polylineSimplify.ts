import type { LatLng } from 'react-native-maps';

function perpendicularDistance(
  point: LatLng,
  lineStart: LatLng,
  lineEnd: LatLng,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRad(lineStart.latitude);
  const lon1 = toRad(lineStart.longitude);
  const lat2 = toRad(lineEnd.latitude);
  const lon2 = toRad(lineEnd.longitude);
  const latP = toRad(point.latitude);
  const lonP = toRad(point.longitude);

  const dx = lon2 - lon1;
  const dy = lat2 - lat1;
  const dxP = lonP - lon1;
  const dyP = latP - lat1;

  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 1e-12) {
    const dLat = latP - lat1;
    const dLon = lonP - lon1;
    return R * Math.sqrt(dLat * dLat + dLon * dLon);
  }

  const t = Math.max(0, Math.min(1, (dxP * dx + dyP * dy) / segLenSq));
  const projLat = lat1 + t * dy;
  const projLon = lon1 + t * dx;

  const dLat = latP - projLat;
  const dLon = lonP - projLon;
  return R * Math.sqrt(dLat * dLat + dLon * dLon);
}

function rdp(
  points: LatLng[],
  epsilon: number,
  startIndex: number,
  endIndex: number,
  keep: boolean[],
): void {
  if (endIndex <= startIndex + 1) return;

  let maxDist = 0;
  let maxIndex = startIndex;

  for (let i = startIndex + 1; i < endIndex; i++) {
    const dist = perpendicularDistance(points[i], points[startIndex], points[endIndex]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    keep[maxIndex] = true;
    rdp(points, epsilon, startIndex, maxIndex, keep);
    rdp(points, epsilon, maxIndex, endIndex, keep);
  }
}

/**
 * Firma barata del contenido de un array de coordenadas (rolling hash).
 * Permite memoizar la simplificación por contenido en vez de identidad de
 * array — útil cuando el padre recrea el array en cada render (p.ej. cada
 * snapshot de ubicación en rides activos).
 */
export function coordsSignature(
  coordinates: Array<{ latitude: number; longitude: number }>,
): number {
  let hash = coordinates.length;
  for (let i = 0; i < coordinates.length; i++) {
    const c = coordinates[i];
    hash = (hash * 31 + ((c.latitude * 1e6) | 0)) | 0;
    hash = (hash * 31 + ((c.longitude * 1e6) | 0)) | 0;
  }
  return hash;
}

export function simplifyPolyline(
  coordinates: LatLng[],
  epsilonMeters: number = 10,
): LatLng[] {
  if (!coordinates || coordinates.length <= 2) return coordinates;

  const keep = new Array(coordinates.length).fill(false);
  keep[0] = true;
  keep[coordinates.length - 1] = true;

  rdp(coordinates, epsilonMeters, 0, coordinates.length - 1, keep);

  return coordinates.filter((_, i) => keep[i]);
}
