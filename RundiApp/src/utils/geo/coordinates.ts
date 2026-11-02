export type LatLngPoint = { latitude: number; longitude: number };

export const parseCoordinateValue = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizePoint = (point: any): LatLngPoint | null => {
  if (!point) return null;
  const latitude =
    typeof point?.lat === 'number'
      ? point.lat
      : typeof point?.latitude === 'number'
      ? point.latitude
      : Number(point?.lat ?? point?.latitude);
  const longitude =
    typeof point?.lng === 'number'
      ? point.lng
      : typeof point?.longitude === 'number'
      ? point.longitude
      : Number(point?.lng ?? point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

export const extractCoordinateFromSource = (source: any, axis: 'lat' | 'lng'): number | null => {
  if (!source || typeof source !== 'object') return null;
  const directKey = axis === 'lat' ? 'lat' : 'lng';
  const friendlyKey = axis === 'lat' ? 'latitude' : 'longitude';
  const candidates = [
    source[directKey],
    source[friendlyKey],
    source?.coords?.[friendlyKey] ?? source?.coords?.[directKey],
    source?.location?.[friendlyKey] ?? source?.location?.[directKey],
  ];
  for (const candidate of candidates) {
    const parsed = parseCoordinateValue(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
};

export const parseInteger = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  }
  return null;
};

export const parseTimestamp = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 9999999999 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber > 9999999999 ? asNumber : asNumber * 1000;
    }
    const parsedDate = Date.parse(value);
    return Number.isFinite(parsedDate) ? parsedDate : null;
  }
  return null;
};
