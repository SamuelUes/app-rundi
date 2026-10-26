/**
 * OCR on-device para documentos del conductor.
 * iOS: Apple Vision (VNRecognizeTextRequest) via modules/rundi-native.
 * Android: ML Kit Text Recognition via modules/rundi-native.
 *
 * - Extrae texto de fotos de licencia, tarjeta de circulación y póliza.
 * - Parsea campos con regex tolerantes al formato nicaragüense.
 * - NUNCA sobreescribe campos: la pantalla solo aplica campos vacíos y el
 *   usuario siempre puede corregir.
 *
 * Nota: los patrones están afinados para documentos NI; ajustar con fotos
 * reales si cambian los layouts.
 */
import { Platform } from 'react-native';
import { INSURANCE_COMPANIES } from '../../constants/insuranceCompanies';

export type DocumentOcrType = 'license' | 'registration' | 'insurance';

export interface ExtractedDocumentFields {
  licenseNumber?: string;
  licenseExpiry?: string;
  plate?: string;
  brand?: string;
  model?: string;
  year?: string;
  color?: string;
  type?: string;
  passengers?: string;
  registrationNumber?: string;
  registrationExpiry?: string;
  insuranceNumber?: string;
  insuranceCompany?: string;
  insuranceExpiry?: string;
}

export interface DocumentOcrResult {
  fields: ExtractedDocumentFields;
  rawText: string;
}

type RecognizeTextFn = (imagePath: string) => Promise<{ text: string }>;

let cachedRecognizer: RecognizeTextFn | null | undefined;

/**
 * Carga perezosa del módulo nativo: si la app corre en Expo Go / web (sin el
 * binario compilado), devuelve null y el OCR simplemente queda desactivado.
 */
function getRecognizer(): RecognizeTextFn | null {
  if (cachedRecognizer !== undefined) {
    return cachedRecognizer ?? null;
  }
  try {
    if (Platform.OS === 'web') {
      cachedRecognizer = null;
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../../modules/rundi-native/src');
    const ocr = mod?.DocumentOcrModule;
    cachedRecognizer =
      typeof ocr?.recognizeText === 'function'
        ? (imagePath: string) => ocr.recognizeText(imagePath)
        : null;
  } catch {
    cachedRecognizer = null;
  }
  return cachedRecognizer ?? null;
}

export function isOcrAvailable(): boolean {
  return getRecognizer() !== null;
}

async function recognizeImageText(imageUri: string): Promise<string> {
  const recognizeText = getRecognizer();
  if (!recognizeText) return '';
  try {
    const result = await recognizeText(imageUri);
    return result?.text ?? '';
  } catch {
    // Algunos binarios esperan path sin esquema file://
    try {
      const result = await recognizeText(imageUri.replace(/^file:\/\//, ''));
      return result?.text ?? '';
    } catch {
      return '';
    }
  }
}

// ---------- Parsing ----------

const SPANISH_MONTHS: Record<string, number> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

const EXPIRY_KEYWORDS = /(vence|vencimiento|vigente|v[áa]lida?|expira|expiraci[oó]n|hasta)/i;
// Fechas que NO son vencimiento: emisión, expedición, nacimiento, "desde".
const ISSUE_KEYWORDS = /(emisi[oó]n|emitida|expedida|expedici[oó]n|nacimiento|desde)/i;

interface FoundDate {
  iso: string;
  index: number;
}

function toIso(year: number, month: number, day: number): string | null {
  if (year < 100) year += year < 70 ? 2000 : 1900;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1950 || year > 2150) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Extrae todas las fechas del texto como YYYY-MM-DD con su posición. */
function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];

  const numeric = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = numeric.exec(text)) !== null) {
    // Día de 1 dígito pegado a una letra = probablemente dígito comido por
    // el OCR ("A4/02/2029" es 14, no 4). Lo rescata findDatesLenient.
    if (m[1].length === 1 && /[A-Za-z]/.test(text[m.index - 1] ?? '')) {
      continue;
    }
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);
    // Formato local DD/MM/YYYY. Si el segundo componente no cabe como mes
    // (ej. "05/31/2028"), la entrada era MM/DD y se intercambia.
    const day = b > 12 ? b : a;
    const month = b > 12 ? a : b;
    const iso = toIso(year, month, day);
    if (iso) found.push({ iso, index: m.index });
  }

  const isoPattern = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g;
  while ((m = isoPattern.exec(text)) !== null) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) found.push({ iso, index: m.index });
  }

  const named =
    /(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,12})\s*(?:de(?:l)?\s+)?(\d{4})/gi;
  while ((m = named.exec(text)) !== null) {
    const month = SPANISH_MONTHS[m[2].toLowerCase()];
    if (!month) continue;
    const iso = toIso(Number(m[3]), month, Number(m[1]));
    if (iso) found.push({ iso, index: m.index });
  }

  return found.sort((a, b) => a.index - b.index);
}

// Segundo pase tolerante: en texto de bajo contraste (fechas en rojo sobre
// fondo salmón de la licencia) el OCR suele confundir dígitos con letras.
const CONFUSABLE_DIGITS: Record<string, string> = {
  O: '0', o: '0',
  I: '1', i: '1', l: '1', '|': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  G: '6', g: '6',
  B: '8',
};
const LENIENT_CHARS = '0-9OIoilZzSsGgB|';
const LENIENT_DATE = new RegExp(
  `([${LENIENT_CHARS}]{1,2})[\\/\\-.]([${LENIENT_CHARS}]{1,2})[\\/\\-.]([${LENIENT_CHARS}]{2,4})`,
  'g',
);
// Cluster alfanumérico en posición de día: "A4/02/2029" → el OCR cambió un
// dígito por letra ("14"→"A4"). Debe tener ≥1 letra Y ≥1 dígito.
const CLUSTER_DATE = /([A-Za-z0-9]{1,3})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
// Variante con mes+año fusionados: "A4/022029" → 02/2029. El \b final evita
// partir secuencias de dígitos largas (barcode "0900515645").
const CLUSTER_DATE_FUSED = /([A-Za-z0-9]{1,3})[\/\-.](\d{2})(\d{4})\b/g;

/**
 * Interpreta un cluster tipo "A4"/"RA4"/"I4" como día: mapea letras a
 * dígitos confundidos, descarta las no mapeables y prueba A→4 y luego A→1.
 */
function mapDayCluster(cluster: string): number | null {
  if (!/[0-9]/.test(cluster) || !/[A-Za-z]/.test(cluster)) return null;
  const tryMap = (aAs: string): number | null => {
    let out = '';
    for (const ch of cluster) {
      if (/[0-9]/.test(ch)) out += ch;
      else if (ch === 'A' || ch === 'a') out += aAs;
      else if (CONFUSABLE_DIGITS[ch]) out += CONFUSABLE_DIGITS[ch];
      // letra sin mapeo (R, E, ...) → se descarta
    }
    const n = Number(out);
    return out.length > 0 && n >= 1 && n <= 31 ? n : null;
  };
  return tryMap('4') ?? tryMap('1');
}

/**
 * Fechas con dígitos confundidos por el OCR ("14/O2/2O29" → 2029-02-14,
 * "A4/02/2029" → 14/02/2029). Solo aporta matches donde findDates no vio nada.
 */
function findDatesLenient(text: string, strict: FoundDate[]): FoundDate[] {
  const found: FoundDate[] = [];
  let m: RegExpExecArray | null;

  while ((m = CLUSTER_DATE.exec(text)) !== null) {
    const matchIndex = m.index;
    if (strict.some((d) => Math.abs(d.index - matchIndex) < 4)) continue;
    const day = mapDayCluster(m[1]);
    if (day === null) continue;
    const iso = toIso(Number(m[3]), Number(m[2]), day);
    if (iso) found.push({ iso, index: matchIndex });
  }

  while ((m = CLUSTER_DATE_FUSED.exec(text)) !== null) {
    const matchIndex = m.index;
    if ([...strict, ...found].some((d) => Math.abs(d.index - matchIndex) < 4)) continue;
    const day = mapDayCluster(m[1]);
    if (day === null) continue;
    const iso = toIso(Number(m[3]), Number(m[2]), day);
    if (iso) found.push({ iso, index: matchIndex });
  }

  while ((m = LENIENT_DATE.exec(text)) !== null) {
    const matchIndex = m.index;
    if ([...strict, ...found].some((d) => Math.abs(d.index - matchIndex) < 4)) continue;
    // Igual que en el pase estricto: día de 1 dígito pegado a letra lo
    // maneja el cluster de arriba.
    if (m[1].length === 1 && /[A-Za-z]/.test(text[matchIndex - 1] ?? '')) {
      continue;
    }
    const clean = (s: string) =>
      Number([...s].map((c) => CONFUSABLE_DIGITS[c] ?? c).join(''));
    const a = clean(m[1]);
    const b = clean(m[2]);
    const year = clean(m[3]);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(year)) continue;
    const day = b > 12 ? b : a;
    const month = b > 12 ? a : b;
    const iso = toIso(year, month, day);
    if (iso) found.push({ iso, index: m.index });
  }
  return found;
}

/**
 * Elige la fecha de vencimiento:
 * 1. Fechas en ventana de una keyword de vencimiento (vence, expira,
 *    hasta...) → la MÁS TARDÍA (vencimiento siempre > emisión/nacimiento).
 * 2. Sin keyword: la más tardía EXCLUYENDO fechas junto a keywords de
 *    emisión (emisión, expedida, desde, nacimiento) — así la circulación,
 *    que solo muestra "Emisión", no rellena el vencimiento con ella.
 */
function pickExpiryDate(text: string): string | undefined {
  const strict = findDates(text);
  const dates = [...strict, ...findDatesLenient(text, strict)].sort(
    (a, b) => a.index - b.index,
  );
  if (!dates.length) return undefined;

  const isIssueIndex = new Set<number>();
  for (const kw of text.matchAll(new RegExp(ISSUE_KEYWORDS.source, 'gi'))) {
    const kwIndex = kw.index ?? 0;
    // Solo la fecha MÁS CERCANA a la keyword de emisión se descarta —
    // "Emisión d1 d2" no debe arrastrar también a d2 (vencimiento real).
    let nearest: FoundDate | undefined;
    let nearestDistance = Infinity;
    for (const d of dates) {
      const distance = d.index - kwIndex;
      if (distance > -10 && distance < 60 && distance < nearestDistance) {
        nearestDistance = distance;
        nearest = d;
      }
    }
    if (nearest) isIssueIndex.add(nearest.index);
  }

  const candidates = new Set<string>();
  for (const kw of text.matchAll(new RegExp(EXPIRY_KEYWORDS.source, 'gi'))) {
    const kwIndex = kw.index ?? 0;
    for (const d of dates) {
      const distance = d.index - kwIndex;
      if (distance > -10 && distance < 120) candidates.add(d.iso);
    }
  }
  const pool = candidates.size
    ? [...candidates]
    : dates.filter((d) => !isIssueIndex.has(d.index)).map((d) => d.iso);
  return pool.sort().pop();
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Valor alfanumérico que sigue a una etiqueta ("LICENCIA N° 1234..."). */
/** Devuelve el primer grupo capturado del primer match, limpio. */
function firstGroup(re: RegExp, text: string): string | undefined {
  const m = re.exec(text);
  if (!m) return undefined;
  const raw = m.slice(1).find((g) => g !== undefined) ?? m[0];
  return raw.replace(/^[N°º.:#\-\s]+/, '').replace(/[\s.,;:]+$/, '');
}

// Marcador numérico impreso antes del valor: "N°", "Nº", "N.", "No.",
// "NÚMERO", "#". La N sola NO vale (comería "NACION"→"ACION") y NO exige
// límite de palabra (no debe comer "NOMBRE"→"MBRE").
const NUM_MARK = '(?:N\\s*[°º#.]|NO\\b\\.?|N[UÚ]MERO|#)\\s*[:.-]?\\s*';

function extractLicenseFields(text: string): ExtractedDocumentFields {
  const norm = normalize(text);
  const fields: ExtractedDocumentFields = {};

  // N° de licencia NI: serie letra+dígitos ("C5845456"), impresa en el
  // reverso junto a CATEGORÍAS. La cédula del frente (001-XXXXXX-XXXXA)
  // NO es el número de licencia — no se usa como fallback.
  // El marcador N°/No. es obligatorio tras "LICENCIA" para no capturar el
  // nombre del titular que sigue al título "LICENCIA DE CONDUCIR".
  const num =
    firstGroup(
      new RegExp(
        `LICENCIA\\s*(?:DE\\s+CONDU[ZC]IR)?[\\s:.-]*${NUM_MARK}([A-Z0-9][A-Z0-9\\-]{4,17})`,
      ),
      norm,
    ) ??
    norm.match(/\b[A-Z][-\s]?\d{6,8}\b/)?.[0]?.replace(/[-\s]/g, '');
  if (num) fields.licenseNumber = num;

  const expiry = pickExpiryDate(text);
  if (expiry) fields.licenseExpiry = expiry;

  return fields;
}

/** "TOYOTA" → "Toyota" (valores legibles en el formulario). */
function toTitle(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

// Tipos del picker del formulario → equivalencias en los documentos.
const VEHICLE_TYPES: Record<string, string> = {
  SEDAN: 'sedan',
  SUV: 'suv',
  CAMIONETA: 'suv',
  JEEP: 'suv',
  VAN: 'van',
  MOTO: 'moto',
  MOTOCICLETA: 'moto',
};

/** Placa NI: "PLACA M 090051", "M123-456", "LE1234"... */
function findPlate(norm: string): string | undefined {
  return (
    firstGroup(/PLACA\s*[:.-]?\s*([A-Z]{1,3}\s?-?\d{3}-?\d{3,4})/, norm) ??
    norm.match(/\b[A-Z]{1,2}\s?-?\d{3}-?\d{3,4}\b/)?.[0]
  );
}

/** Tipo de vehículo: "TIPO: SEDAN" o palabra suelta en la circulación. */
function findVehicleType(norm: string): string | undefined {
  const word =
    firstGroup(/TIPO\s*[:.-]?\s*([A-Z]+)/, norm) ??
    norm.match(/\b(SEDAN|SUV|CAMIONETA|JEEP|VAN|MOTOCICLETA|MOTO)\b/)?.[0];
  return word ? VEHICLE_TYPES[word] : undefined;
}

function extractRegistrationFields(text: string): ExtractedDocumentFields {
  const norm = normalize(text);
  const fields: ExtractedDocumentFields = {};

  const plate = findPlate(norm);
  if (plate) fields.plate = plate.replace(/\s+/g, '');

  // Frente: "AUTOMOVIL,TOYOTA,COROLLA" en una línea; o etiquetas MARCA/MODELO.
  const auto = /AUTOMOVIL\s*,\s*([A-Z0-9&.-]+)\s*,\s*([A-Z0-9&.-]+)/.exec(norm);
  const brand =
    auto?.[1] ?? firstGroup(/MARCA\s*[:.-]?\s*([A-Z][A-Z0-9&.-]*)/, norm);
  const model =
    auto?.[2] ?? firstGroup(/MODELO\s*[:.-]?\s*([A-Z0-9][A-Z0-9&.-]*)/, norm);
  if (brand) fields.brand = toTitle(brand);
  if (model) fields.model = toTitle(model);

  const type = findVehicleType(norm);
  if (type) fields.type = type;

  const color = firstGroup(/COLOR\s*[:.-]?\s*([A-Z]+)/, norm);
  if (color) fields.color = toTitle(color);

  // Reverso: "Año 2007", "Pasajeros 5"
  const year = firstGroup(/\bANO\s*[:.-]?\s*(\d{4})\b/, norm);
  if (year) fields.year = year;
  const passengers = firstGroup(/PASAJEROS\s*[:.-]?\s*(\d{1,2})\b/, norm);
  if (passengers) fields.passengers = passengers;

  // N° de circulación (reverso, esquina sup. derecha, sin etiqueta):
  // serie B + dígitos. 7+ dígitos para no confundir la placa M090051.
  const regNumber =
    firstGroup(
      new RegExp(`REGISTRO\\s*[:.-]?\\s*${NUM_MARK}([A-Z]?\\d[A-Z0-9\\-]{4,17})`),
      norm,
    ) ??
    firstGroup(
      new RegExp(`CIRCULACI[OÓ]N\\s*[:.-]?\\s*${NUM_MARK}([A-Z]?\\d[A-Z0-9\\-]{4,17})`),
      norm,
    ) ??
    norm.match(/\b[A-Z]\d{7,9}\b/)?.[0];
  if (regNumber) fields.registrationNumber = regNumber.replace(/\s+/g, '');

  // La tarjeta solo trae "Emisión"; sin keyword de vencimiento queda vacío.
  const expiry = pickExpiryDate(text);
  if (expiry) fields.registrationExpiry = expiry;

  return fields;
}

function extractInsuranceFields(text: string): ExtractedDocumentFields {
  const norm = normalize(text);
  const fields: ExtractedDocumentFields = {};

  // "Póliza No RCO-2022113-0"
  const policy =
    firstGroup(
      new RegExp(`P[OÓ]LIZA\\s*[:.-]?\\s*${NUM_MARK}?([A-Z0-9][A-Z0-9\\-]{4,19})`),
      norm,
    ) ?? norm.match(/\b[A-Z]{2,4}\d{6,12}\b/)?.[0];
  if (policy) fields.insuranceNumber = policy.replace(/\s+/g, '');

  for (const company of INSURANCE_COMPANIES) {
    const needle = normalize(company).replace('SEGUROS ', '').split(' ')[0];
    if (needle.length >= 4 && norm.includes(needle)) {
      fields.insuranceCompany = company;
      break;
    }
  }

  // La póliza repite datos del vehículo: sirven de respaldo si la
  // circulación no los llenó.
  const plate = findPlate(norm);
  if (plate) fields.plate = plate.replace(/\s+/g, '');
  const brand = firstGroup(/MARCA\s*[:.-]?\s*([A-Z][A-Z0-9&.-]*)/, norm);
  if (brand) fields.brand = toTitle(brand);
  const type = findVehicleType(norm);
  if (type) fields.type = type;

  // "Desde: 17/11/2024  Hasta: 16/11/2025" → el vencimiento es Hasta.
  const expiry = pickExpiryDate(text);
  if (expiry) fields.insuranceExpiry = expiry;

  return fields;
}

const PARSERS: Record<
  DocumentOcrType,
  (text: string) => ExtractedDocumentFields
> = {
  license: extractLicenseFields,
  registration: extractRegistrationFields,
  insurance: extractInsuranceFields,
};

/**
 * Corre OCR sobre la foto y devuelve los campos detectados.
 * Si el módulo nativo no está disponible o no lee nada, devuelve fields vacío.
 */
export async function extractFieldsFromDocument(
  imageUri: string,
  documentType: DocumentOcrType,
): Promise<DocumentOcrResult> {
  const rawText = await recognizeImageText(imageUri);
  if (__DEV__) {
    console.log(`[OCR:${documentType}] texto crudo:\n${rawText}`);
  }
  if (!rawText) {
    return { fields: {}, rawText: '' };
  }
  const fields = PARSERS[documentType](rawText);
  if (__DEV__) {
    console.log(`[OCR:${documentType}] campos extraídos:`, fields);
  }
  return { fields, rawText };
}

// Exportados para tests
export const __testing = {
  findDates,
  pickExpiryDate,
  extractLicenseFields,
  extractRegistrationFields,
  extractInsuranceFields,
  normalize,
};
