import * as functions from "firebase-functions";
import { firestore } from "../config/firebase";
import { regionConfig } from "../config/functions-config";

interface ServiceAreaDoc {
  id: string;
  name?: string;
  countryCode?: string;
  active?: boolean;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

interface CheckRegionRequest {
  latitude: number;
  longitude: number;
  platform?: string;
  appVersion?: string;
}

interface CheckRegionResponse {
  allowed: boolean;
  serviceAreaId: string | null;
  areaName?: string;
  reasonCode: string;
  message?: string;
  isFallback?: boolean;
}

function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPointInBounds(lat: number, lng: number, bounds: { north: number; south: number; east: number; west: number }): boolean {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

function isPointInServiceArea(lat: number, lng: number, area: ServiceAreaDoc): boolean {
  if (area.bounds) {
    return isPointInBounds(lat, lng, area.bounds);
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

async function handleCheckRegionAvailability(data: CheckRegionRequest): Promise<CheckRegionResponse> {
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
        await collectionRef.doc("ni-managua").set(
          {
            name: "Managua",
            countryCode: "NI",
            active: true,
            bounds: {
              north: 12.2,
              south: 12.05,
              east: -86.15,
              west: -86.35,
            },
          },
          { merge: true }
        );
      } catch (bootstrapError) {
        console.warn(
          "⚠️ [checkRegionAvailability] No se pudo crear service_areas/ni-managua por defecto:",
          bootstrapError
        );
      }
    }

    const snapshot = await collectionRef.where("active", "==", true).get();

    const areas: ServiceAreaDoc[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as Partial<ServiceAreaDoc>;
      areas.push({
        id: doc.id,
        name: data.name,
        countryCode: data.countryCode,
        active: data.active,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
        radiusKm: data.radiusKm,
        bounds: data.bounds as any,
      });
    });

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
    return {
      allowed: true,
      serviceAreaId: "ni-managua",
      areaName: "Managua",
      reasonCode: "OK_FALLBACK",
      message: "Servicio disponible en Managua (configuración por defecto).",
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
