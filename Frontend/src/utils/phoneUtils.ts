export type CountryDialOption = {
  code: string; // ISO 3166-1 alpha-2
  dialCode: string; // e.g. +505
  name: string;
};

const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: 'NI', dialCode: '+505', name: 'Nicaragua' },
  { code: 'US', dialCode: '+1', name: 'Estados Unidos' },
  { code: 'CA', dialCode: '+1', name: 'Canadá' },
  { code: 'MX', dialCode: '+52', name: 'México' },
  { code: 'SV', dialCode: '+503', name: 'El Salvador' },
  { code: 'HN', dialCode: '+504', name: 'Honduras' },
  { code: 'CR', dialCode: '+506', name: 'Costa Rica' },
  { code: 'PA', dialCode: '+507', name: 'Panamá' },
  { code: 'CO', dialCode: '+57', name: 'Colombia' },
  { code: 'AR', dialCode: '+54', name: 'Argentina' },
  { code: 'CL', dialCode: '+56', name: 'Chile' },
  { code: 'VE', dialCode: '+58', name: 'Venezuela' },
  { code: 'ES', dialCode: '+34', name: 'España' },
  { code: 'BR', dialCode: '+55', name: 'Brasil' },
  { code: 'PE', dialCode: '+51', name: 'Perú' },
  { code: 'EC', dialCode: '+593', name: 'Ecuador' },
  { code: 'GT', dialCode: '+502', name: 'Guatemala' },
  { code: 'DO', dialCode: '+1809', name: 'República Dominicana' },
];

const COUNTRY_LOCAL_LENGTH: Record<string, number> = {
  NI: 8,
  US: 12,
  CA: 10,
  MX: 10,
  SV: 8,
  HN: 8,
  CR: 8,
  PA: 8,
  CO: 10,
  AR: 10,
  CL: 9,
  VE: 10,
  ES: 9,
  BR: 11,
  PE: 9,
  EC: 9,
  GT: 8,
  DO: 10,
};

const COUNTRY_AREA_LENGTH: Record<string, number> = {
  US: 3,
  CA: 3,
};

export const getCountryDialOptions = (): CountryDialOption[] => COUNTRY_DIAL_OPTIONS;

export const getCountryLocalNumberLength = (country: CountryDialOption | string): number => {
  const code = typeof country === 'string' ? country : country.code;
  const configured = COUNTRY_LOCAL_LENGTH[code];
  if (configured) {
    return configured;
  }

  const dial = COUNTRY_DIAL_OPTIONS.find((c) => c.code === code)?.dialCode ?? '+';
  const dialDigits = dial.replace(/\D/g, '');
  const defaultLength = Math.max(6, 15 - dialDigits.length);
  return defaultLength;
};

export const getCountryAreaCodeLength = (country: CountryDialOption | string): number => {
  const code = typeof country === 'string' ? country : country.code;
  return COUNTRY_AREA_LENGTH[code] ?? 0;
};

export const normalizePhoneNumber = (value: string, dialCode: string): string => {
  if (!value) {
    return '';
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  const normalizedDial = dialCode.replace(/\D/g, '');
  const numberWithoutDial = digits.startsWith(normalizedDial)
    ? digits.slice(normalizedDial.length)
    : digits;

  if (!numberWithoutDial) {
    return '';
  }

  const maxLocalLength = Math.max(0, 15 - normalizedDial.length);
  const limitedLocalNumber = numberWithoutDial.slice(0, maxLocalLength);

  if (!limitedLocalNumber) {
    return '';
  }

  return `+${normalizedDial}${limitedLocalNumber}`;
};

export const formatPhoneNumber = (value: string, dialCode: string): string => {
  const normalized = normalizePhoneNumber(value, dialCode);

  if (!normalized) {
    return `${dialCode} `;
  }

  const digits = normalized.replace('+', '');
  const normalizedDial = dialCode.replace('+', '');

  const localNumber = digits.slice(normalizedDial.length);

  if (!localNumber) {
    return `${dialCode}`;
  }

  return `${dialCode} ${localNumber}`;
};

export const extractLocalNumber = (fullNumber: string, dialCode: string): string => {
  if (!fullNumber) {
    return '';
  }

  const digits = fullNumber.replace(/\D/g, '');
  const normalizedDial = dialCode.replace(/\D/g, '');

  if (!digits.startsWith(normalizedDial)) {
    return digits;
  }

  return digits.slice(normalizedDial.length);
};
