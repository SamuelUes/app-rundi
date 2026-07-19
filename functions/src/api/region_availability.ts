import * as functions from "firebase-functions";
import { firestore } from "../config/firebase";
import { regionConfig } from "../config/functions-config";
import { checkRateLimit } from "../utils/rateLimiter";
import { DEFAULT_SERVICE_AREA_ID } from "../config/constants";

type ServiceAreaPoint = {
  lat: number;
  lng: number;
};

interface ServiceAreaDoc {
  id: string;
  name?: string;
  countryCode?: string;
  active?: boolean;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  points?: ServiceAreaPoint[];
}

const DEFAULT_MANAGUA_POLYGON: ServiceAreaPoint[] = [
  { lat: 12.2, lng: -86.35 }, // Noroeste
  { lat: 12.2, lng: -86.15 }, // Noreste
  { lat: 12.05, lng: -86.15 }, // Sureste
  { lat: 12.05, lng: -86.35 }, // Suroeste
  { lat: 12.2, lng: -86.35 }, // Cierre
];

export interface CheckRegionRequest {
  latitude: number;
  longitude: number;
  platform?: string;
  appVersion?: string;
}

export interface CheckRegionResponse {
  allowed: boolean;
  serviceAreaId: string | null;
  areaName?: string;
  reasonCode: string;
  message?: string;
  isFallback?: boolean;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const LAT_KEY_PATHS = [
  "lat",
  "Lat",
  "latitude",
  "Latitude",
  "_lat",
  "_latitude",
  "coords.lat",
  "coords.latitude",
  "location.lat",
  "location.latitude",
  "point.lat",
  "point.latitude",
];

const LNG_KEY_PATHS = [
  "lng",
  "Lng",
  "lon",
  "Lon",
  "long",
  "Long",
  "longitude",
  "Longitude",
  "_lng",
  "_lon",
  "_long",
  "_longitude",
  "coords.lng",
  "coords.lon",
  "coords.long",
  "coords.longitude",
  "location.lng",
  "location.lon",
  "location.long",
  "location.longitude",
  "point.lng",
  "point.lon",
  "point.long",
  "point.longitude",
];

function getNestedValue(source: any, path: string): unknown {
  if (source == null) {
    return undefined;
  }
  const segments = path.split(".");
  let current: any = source;
  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }
    const value = current[segment];
    current = typeof value === "function" ? value.call(current) : value;
  }
  return current;
}

function extractPoint(rawPoint: unknown): ServiceAreaPoint | null {
  if (rawPoint == null) {
    return null;
  }

  if (Array.isArray(rawPoint)) {
    if (rawPoint.length < 2) {
      return null;
    }
    const lat = toFiniteNumber(rawPoint[0]);
    const lng = toFiniteNumber(rawPoint[1]);
    return lat != null && lng != null ? { lat, lng } : null;
  }

  if (typeof rawPoint === "string") {
    const parts = rawPoint.split(/[,\s;]+/).filter(Boolean);
    if (parts.length >= 2) {
      const lat = toFiniteNumber(parts[0]);
      const lng = toFiniteNumber(parts[1]);
      return lat != null && lng != null ? { lat, lng } : null;
    }
    return null;
  }

  if (typeof rawPoint === "object") {
    const candidate = rawPoint as Record<string, unknown>;

    const latCandidates = LAT_KEY_PATHS.map((path) => getNestedValue(candidate, path));
    const lngCandidates = LNG_KEY_PATHS.map((path) => getNestedValue(candidate, path));

    let lat: number | null = null;
    for (const value of latCandidates) {
      lat = toFiniteNumber(value);
      if (lat != null) {
        break;
      }
    }

    let lng: number | null = null;
    for (const value of lngCandidates) {
      lng = toFiniteNumber(value);
      if (lng != null) {
        break;
      }
    }

    if (
      lat == null &&
      typeof (candidate as any).latitude === "function" &&
      typeof (candidate as any).longitude === "function"
    ) {
      const geoLat = toFiniteNumber((candidate as any).latitude());
      const geoLng = toFiniteNumber((candidate as any).longitude());
      if (geoLat != null && geoLng != null) {
        return { lat: geoLat, lng: geoLng };
      }
    }

    if (lat != null && lng != null) {
      return { lat, lng };
    }

    return null;
  }

  return null;
}

function normalizePolygon(points: unknown): ServiceAreaPoint[] | undefined {
  if (!Array.isArray(points)) {
    return undefined;
  }

  const normalized: ServiceAreaPoint[] = [];
  for (const rawPoint of points) {
    const point = extractPoint(rawPoint);
    if (!point) {
      continue;
    }
    normalized.push(point);
  }

  if (normalized.length < 3) {
    return undefined;
  }

  return normalized;
}

function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasValidPolygon(points?: ServiceAreaPoint[]): points is ServiceAreaPoint[] {
  return Array.isArray(points) && points.length >= 3;
}

function isPointInPolygon(lat: number, lng: number, polygon: ServiceAreaPoint[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > lat !== yj > lat &&
      lng <
        ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInServiceArea(lat: number, lng: number, area: ServiceAreaDoc): boolean {
  if (hasValidPolygon(area.points)) {
    return isPointInPolygon(lat, lng, area.points);
  }

  if (isValidCoordinate(area.centerLat) && isValidCoordinate(area.centerLng) && isValidCoordinate(area.radiusKm)) {
    const R = 6371; // km
    const dLat = (lat - area.centerLat) * Math.PI / 180;
    const dLon = (lng - area.centerLng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(area.centerLat * Math.PI / 180) *
        Math.cos(lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    return distanceKm <= area.radiusKm;
  }

  return false;
}

function isPointInBounds(lat: number, lng: number, bounds: { north: number; south: number; east: number; west: number }): boolean {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

// Fallback estático para Managua por si aún no hay configuración en Firestore
function isInDefaultManagua(lat: number, lng: number): boolean {
  const MANAGUA_BOUNDS = {
    north: 12.20,
    south: 12.05,
    east: -86.15,
    west: -86.35,
  };

  return isPointInBounds(lat, lng, MANAGUA_BOUNDS);
}

export async function handleCheckRegionAvailability(data: CheckRegionRequest): Promise<CheckRegionResponse> {
  const { latitude, longitude } = data || ({} as any);

  if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Parámetros inválidos. Debes enviar latitude y longitude numéricos."
    );
  }

  // 1) Leer áreas de servicio activas desde Firestore
  let matchedArea: ServiceAreaDoc | null = null;

  try {
    const collectionRef = firestore.collection("service_areas");

    const anyDocSnapshot = await collectionRef.limit(1).get();
    if (anyDocSnapshot.empty) {
      try {
        await collectionRef.doc(DEFAULT_SERVICE_AREA_ID).set(
          {
            name: "Managua",
            countryCode: "NI",
            active: true,
            points: DEFAULT_MANAGUA_POLYGON,
          },
          { merge: true }
        );
      } catch (bootstrapError) {
        console.warn(
          `⚠️ [checkRegionAvailability] No se pudo crear service_areas/${DEFAULT_SERVICE_AREA_ID} por defecto:`,
          bootstrapError
        );
      }
    }

    const snapshot = await collectionRef.where("active", "==", true).get();

    const areas: ServiceAreaDoc[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as Partial<ServiceAreaDoc>;
      const normalizedPoints = normalizePolygon((data as any)?.points);

      areas.push({
        id: doc.id,
        name: data.name,
        countryCode: data.countryCode,
        active: data.active,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        radiusKm: data.radiusKm,
        points: normalizedPoints,
      });

      if (!normalizedPoints) {
        console.warn(
          `⚠️ [checkRegionAvailability] El área ${doc.id} no tiene puntos válidos (points=${JSON.stringify(
            (data as any)?.points,
          )})`,
        );
      }
    });

    console.log(
      `[checkRegionAvailability] Áreas activas cargadas: ${areas.length}. IDs: ${areas
        .map((area) => area.id)
        .join(", ")}`,
    );

    for (const area of areas) {
      if (isPointInServiceArea(latitude, longitude, area)) {
        matchedArea = area;
        break;
      }
    }
  } catch (error) {
    console.warn("⚠️ [checkRegionAvailability] Error leyendo service_areas desde Firestore:", error);
  }

  // 2) Si encontramos un área activa que contenga el punto, permitir
  if (matchedArea) {
    return {
      allowed: true,
      serviceAreaId: matchedArea.id,
      areaName: matchedArea.name || matchedArea.id,
      reasonCode: "OK",
      message: `Servicio disponible en tu zona (${matchedArea.name ?? matchedArea.id}).`,
    };
  }

  // 3) Fallback: lógica estática de Managua para mantener compatibilidad
  if (isInDefaultManagua(latitude, longitude)) {
    console.warn(
      "[checkRegionAvailability] Usando fallback estático de Managua: ninguna área activa coincidió con la ubicación enviada.",
    );
    return {
      allowed: true,
      serviceAreaId: DEFAULT_SERVICE_AREA_ID,
      areaName: "Prueba",
      reasonCode: "OK_FALLBACK",
      message: "Servicio disponible en prueba (configuración por defecto).",
      isFallback: true,
    };
  }

  // 4) Ningún área soporta esta ubicación → región no disponible
  return {
    allowed: false,
    serviceAreaId: null,
    areaName: undefined,
    reasonCode: "AREA_NOT_SUPPORTED",
    message:
      "Por el momento el servicio solo está disponible dentro de las áreas activas (actualmente Managua).",
  };
}

export const checkRegionAvailability = functions
  .runWith(regionConfig)
  .https.onCall(async (data: CheckRegionRequest, _context): Promise<CheckRegionResponse> => {
    return handleCheckRegionAvailability(data);
  });

export const checkRegionAvailabilityHttp = functions
  .runWith(regionConfig)
  .https.onRequest(async (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
      const rateLimit = checkRateLimit(`region:${clientIp}`, 30);
      if (!rateLimit.allowed) {
        res.status(429).json({ error: "Too many requests", retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) });
        return;
      }

      const data = (req.body || {}) as CheckRegionRequest;
      const result = await handleCheckRegionAvailability(data);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("❌ [checkRegionAvailabilityHttp] Error verificando región:", error);

      const code = (error && error.code) as string | undefined;
      const message =
        typeof error?.message === "string" ? error.message : "Error interno verificando región";

      if (code === "invalid-argument") {
        res.status(400).json({ error: message, code });
        return;
      }

      res.status(500).json({ error: message, code: code ?? "internal" });
    }
  });
