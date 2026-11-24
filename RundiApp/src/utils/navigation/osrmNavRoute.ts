// Fetch de ruta OSRM con steps=true → NavRoute (polyline + maniobras).
import { buildCumulativeMeters } from './routeSnapper';
import type { RoutePoint } from './routeSnapper';

export interface NavStep {
  /** Metros desde el inicio de la ruta donde OCURRE esta maniobra (inicio del paso). */
  startDist: number;
  endDist: number;
  location: RoutePoint;
  /** OSRM maneuver.type: depart|arrive|turn|new name|continue|roundabout|merge|fork|end of road|off ramp|... */
  type: string;
  modifier?: string;
  streetName: string;
  distanceM: number;
  durationSec: number;
}

export interface NavRoute {
  coords: RoutePoint[];
  steps: NavStep[];
  totalDistanceM: number;
  totalDurationSec: number;
  cumulative: number[];
}

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

export const buildOsrmNavUrl = (points: RoutePoint[]): string => {
  const coordsStr = points.map((p) => `${p.longitude},${p.latitude}`).join(';');
  return `${OSRM_BASE_URL}/${coordsStr}?overview=full&geometries=geojson&steps=true`;
};

export async function fetchOsrmNavRoute(points: RoutePoint[]): Promise<NavRoute | null> {
  if (points.length < 2) return null;
  try {
    const res = await fetch(buildOsrmNavUrl(points));
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const route = data?.routes?.[0];
    const rawCoords = route?.geometry?.coordinates as Array<[number, number]> | undefined;
    if (!route || !rawCoords?.length) return null;

    const coords = rawCoords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

    // OSRM: la maniobra de cada paso ocurre al INICIO del paso; el último es 'arrive'.
    const steps: NavStep[] = [];
    let acc = 0;
    const legs = Array.isArray(route.legs) ? route.legs : [];
    for (const leg of legs) {
      const rawSteps = Array.isArray(leg?.steps) ? leg.steps : [];
      for (const s of rawSteps) {
        const loc = s?.maneuver?.location as [number, number] | undefined;
        const distanceM = typeof s?.distance === 'number' ? s.distance : 0;
        steps.push({
          startDist: acc,
          endDist: acc + distanceM,
          location: Array.isArray(loc)
            ? { latitude: loc[1], longitude: loc[0] }
            : coords[0],
          type: typeof s?.maneuver?.type === 'string' ? s.maneuver.type : 'continue',
          modifier:
            typeof s?.maneuver?.modifier === 'string' ? s.maneuver.modifier : undefined,
          streetName: typeof s?.name === 'string' ? s.name : '',
          distanceM,
          durationSec: typeof s?.duration === 'number' ? s.duration : 0,
        });
        acc += distanceM;
      }
    }

    if (coords.length < 2 || steps.length < 2) return null;

    return {
      coords,
      steps,
      totalDistanceM: typeof route.distance === 'number' ? route.distance : acc,
      totalDurationSec: typeof route.duration === 'number' ? route.duration : 0,
      cumulative: buildCumulativeMeters(coords),
    };
  } catch {
    return null;
  }
}
