import { Image, ImageSourcePropType } from 'react-native';

const vehicleIconMap: Record<string, ImageSourcePropType> = {
  sedan: require('../../assets/icons/vehicles/sedan_V2/Icon_sedan2x.png'),
  suv: require('../../assets/icons/vehicles/SUV/Icon_SUV_2x.png'),
  van: require('../../assets/icons/vehicles/VAN/Icon_VAN_2x.png'),
  pickup: require('../../assets/icons/vehicles/pickup_4x4/pickup_4x4_2x.png'),
  convertible: require('../../assets/icons/vehicles/Convertible_Car_Sedan/Convertible_Car_Sedan2x.png'),
  moto: require('../../assets/icons/vehicles/moto/moto_icon.png'),
  default: require('../../assets/icons/vehicles/sedan_V2/Icon_sedan2x.png'),
};

const SYNONYM_MAP: Record<string, string> = {
  pickup: 'pickup',
  'pick-up': 'pickup',
  'pickup truck': 'pickup',
  camioneta: 'pickup',
  '4x4': 'pickup',
  suv: 'suv',
  crossover: 'suv',
  jeep: 'suv',
  van: 'van',
  minivan: 'van',
  microbus: 'van',
  microbús: 'van',
  sedan: 'sedan',
  saloon: 'sedan',
  car: 'sedan',
  auto: 'sedan',
  automóvil: 'sedan',
  carro: 'sedan',
  coche: 'sedan',
  coupe: 'convertible',
  coupé: 'convertible',
  convertible: 'convertible',
  cabrio: 'convertible',
  moto: 'moto',
  motocicleta: 'moto',
  mototaxi: 'moto',
  'moto taxi': 'moto',
  motorcycle: 'moto',
  motorbike: 'moto',
  motoBike: 'moto',
  bike: 'moto',
};

export const normalizeVehicleType = (rawType?: string | null): string | null => {
  if (!rawType || typeof rawType !== 'string') return null;
  const lower = rawType.trim().toLowerCase();
  if (!lower) return null;
  if (SYNONYM_MAP[lower]) {
    return SYNONYM_MAP[lower];
  }

  if (lower.includes('pickup') || lower.includes('truck')) return 'pickup';
  if (lower.includes('suv') || lower.includes('crossover')) return 'suv';
  if (lower.includes('van') || lower.includes('bus')) return 'van';
  if (lower.includes('convert') || lower.includes('cabrio') || lower.includes('coupe')) return 'convertible';
  if (lower.includes('moto') || lower.includes('motorcycle') || lower.includes('bike')) return 'moto';
  if (lower.includes('sedan') || lower.includes('saloon') || lower.includes('car')) return 'sedan';

  return lower;
};

export const extractVehicleTypeFromInfo = (info: any): string | null => {
  if (!info || typeof info !== 'object') return null;

  const candidates: Array<string | null | undefined> = [
    info.currentVehicle?.type,
    info.activeVehicle?.type,
    info.vehicle?.type,
    info.vehicleType,
    info.active_vehicle?.type,
  ];

  if (Array.isArray(info?.vehicles)) {
    const active = info.vehicles.find((vehicle: any) => vehicle?.is_active || vehicle?.isActive);
    if (active?.type) {
      candidates.push(active.type);
    }
  } else if (info?.vehicles && typeof info.vehicles === 'object') {
    Object.values<any>(info.vehicles).forEach((vehicle) => {
      if (vehicle?.is_active || vehicle?.isActive) {
        candidates.push(vehicle.type);
      }
    });
  }

  for (const candidate of candidates) {
    const normalized = normalizeVehicleType(candidate ?? null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const ensureVehicleIconSource = (type?: string | null): ImageSourcePropType => {
  const normalized = normalizeVehicleType(type) ?? 'default';
  return vehicleIconMap[normalized] ?? vehicleIconMap.default;
};

export const ensureVehicleIconUri = (type?: string | null): string | undefined => {
  const source = ensureVehicleIconSource(type) as ImageSourcePropType;
  const resolved = Image.resolveAssetSource(source as any);
  return resolved?.uri;
};
