import { describe, expect, it } from '@jest/globals';
import { __testing } from './documentOcrService';

const {
  extractLicenseFields,
  extractRegistrationFields,
  extractInsuranceFields,
  findDates,
  pickExpiryDate,
  normalize,
} = __testing;

describe('documentOcrService parsers', () => {
  describe('license (licencia de conducir NI)', () => {
    const licenseText = `
      REPÚBLICA DE NICARAGUA
      MINISTERIO DE TRANSPORTE E INFRAESTRUCTURA
      LICENCIA DE CONDUCIR
      N° 001-234567-0001A
      NOMBRE: JUAN CARLOS PÉREZ LÓPEZ
      FECHA DE NACIMIENTO: 12/03/1990
      EMITIDA: 16/08/2025
      VENCIMIENTO: 15/08/2030
      CATEGORÍA: B
    `;

    it('extrae el número de licencia con formato cédula', () => {
      const fields = extractLicenseFields(licenseText);
      expect(fields.licenseNumber).toBe('001-234567-0001A');
    });

    it('prefiere la fecha de vencimiento sobre emisión/nacimiento', () => {
      const fields = extractLicenseFields(licenseText);
      expect(fields.licenseExpiry).toBe('2030-08-15');
    });

    it('extrae número simple después de LICENCIA', () => {
      const fields = extractLicenseFields('LICENCIA No. 123456789\nVENCE 31/12/2028');
      expect(fields.licenseNumber).toBe('123456789');
      expect(fields.licenseExpiry).toBe('2028-12-31');
    });

    // Layout real licencia NI (Policía Nacional)
    const licenseFront = `
      REPUBLICA DE NICARAGUA
      POLICIA NACIONAL
      LICENCIA DE CONDUCIR
      SAMUEL ULISES
      ESPINOZA SAAVEDRA
      001-140206-1002S
      NICARAGUENSE
      O+
      Emisión 15/03/2024  Expiración 14/02/2029
    `;

    const licenseBack = `
      CATEGORIAS
      C5845456
      3. Vehiculo Liviano 3 1/2 ton.,
    `;

    it('frente: no captura el nombre ni la cédula como número de licencia', () => {
      const fields = extractLicenseFields(licenseFront);
      expect(fields.licenseNumber).toBeUndefined();
    });

    it('frente: elige expiración (roja) sobre emisión', () => {
      const fields = extractLicenseFields(licenseFront);
      expect(fields.licenseExpiry).toBe('2029-02-14');
    });

    it('reverso: extrae el número de licencia serie C', () => {
      const fields = extractLicenseFields(licenseBack);
      expect(fields.licenseNumber).toBe('C5845456');
    });

    it('etiquetas y fechas en líneas separadas: sigue eligiendo expiración', () => {
      const fields = extractLicenseFields(
        'Emisión Expiración\n15/03/2024 14/02/2029',
      );
      expect(fields.licenseExpiry).toBe('2029-02-14');
    });

    it('rescata fechas con dígitos confundidos por OCR (texto rojo)', () => {
      const fields = extractLicenseFields(
        'Emisión 15/03/2024  Expiración 14/O2/2O29',
      );
      expect(fields.licenseExpiry).toBe('2029-02-14');
    });

    it('no extrae basura de palabras que empiezan con N (NACION→ACION)', () => {
      // OCR real: "LICENCIA DE CONDUCIR ... NACION" no debe dar número.
      const fields = extractLicenseFields(
        'POLICIA NACIONAL\nLICENCIA DE CONDUCIR\nNACION\nAMUEL ULISES',
      );
      expect(fields.licenseNumber).toBeUndefined();
    });

    it('rescata día+mes fusionados con letra (RA4/022029 → 14/02/2029)', () => {
      // OCR real: "15/03/2024RA4/022029" — RA4→14, 022029→02/2029.
      const fields = extractLicenseFields(
        'Emisión\n15/03/2024RA4/022029',
      );
      expect(fields.licenseExpiry).toBe('2029-02-14');
    });

    it('cluster de día sin dígitos no rescata (RA/022029 → vacío)', () => {
      const fields = extractLicenseFields(
        'Emisión 15/03/2024 RA/022029',
      );
      expect(fields.licenseExpiry).toBeUndefined();
    });

    it('rescata "14" leído como "A4" (OCR real: 15/03/2024A4/02/2029)', () => {
      const fields = extractLicenseFields(
        'Emisión\n15/03/2024A4/02/2029',
      );
      expect(fields.licenseExpiry).toBe('2029-02-14');
    });

    it('día de un dígito pegado a letra no pasa como fecha truncada', () => {
      // Sin el guard, "A4/02/2029" daría 2029-02-04 (día equivocado).
      const fields = extractLicenseFields(
        'Emisión 15/03/2024\nExpiración l4/02/2029',
      );
      expect(fields.licenseExpiry).toBe('2029-02-14');
    });

    it('rescata día/mes con el año en línea separada (rojo mutilado)', () => {
      // OCR real licencia NI: la "Expiración" roja pierde el año a otra
      // línea ("A4/02 ... 2029").
      const fields = extractLicenseFields('Emisión 15/03/2024\nA4/02\n2029');
      expect(fields.licenseExpiry).toBe('2029-02-14');
    });

    it('fragmento limpio día/mes + año separado también rescata', () => {
      const fields = extractLicenseFields('Emisión 15/03/2024\n14/02\n2029');
      expect(fields.licenseExpiry).toBe('2029-02-14');
    });

    it('texto demasiado degradado no inventa la expiración', () => {
      // OCR real: "Expiración 14/02/2029" quedó como "RAfa/0 ... 2029" —
      // sin dígito rescatable no se fabrica una fecha.
      const fields = extractLicenseFields(
        'Emisión\n15/03/2024 RAfa/0\nSESMDI\nО КАСТОВАЙ\n2029',
      );
      expect(fields.licenseExpiry).toBeUndefined();
    });
  });

  describe('registration (tarjeta de circulación)', () => {
    const registrationText = `
      REPÚBLICA DE NICARAGUA
      TARJETA DE CIRCULACIÓN VEHICULAR
      PLACA: M123-456
      MARCA: TOYOTA  MODELO: COROLLA  AÑO: 2020
      REGISTRO N° B2301230
      VÁLIDA HASTA: 28/02/2029
    `;

    it('extrae la placa', () => {
      const fields = extractRegistrationFields(registrationText);
      expect(fields.plate).toBe('M123-456');
    });

    it('extrae el número de registro sin confundirlo con la placa', () => {
      const fields = extractRegistrationFields(registrationText);
      expect(fields.registrationNumber).toBe('B2301230');
    });

    it('extrae el vencimiento', () => {
      const fields = extractRegistrationFields(registrationText);
      expect(fields.registrationExpiry).toBe('2029-02-28');
    });

    // Layout real tarjeta de circulación NI (Policía Nacional)
    const registrationFront = `
      República de Nicaragua
      POLICÍA NACIONAL
      CIRCULACION VEHICULAR
      Placa M 090051
      AUTOMOVIL,TOYOTA,COROLLA
      SEDAN
      Color BLANCO
      Motor 3ZZE562072
      Chasis 9BR53ZEC108556455
      VIN
      0009
      Emisión 02/06/2017
      Autorizado
    `;

    const registrationBack = `
      B2985039
      Gravamen NINGUNO
      Pasajeros 5   Combustible Gasolina
      Tonelaje .0   Año 2007  Uso PARTICULAR
      Cilindros 4   Servicio PRIVADO
      Propietario: ELBA AGUSTINA CRUZ QUINTANA
      Dirección: COL. MAXIMO JERE, CASA NO. F-463. MANAGUA
      500M 0900515645M 20170602SED2017
    `;

    it('frente: extrae placa con espacio (M 090051)', () => {
      expect(extractRegistrationFields(registrationFront).plate).toBe('M090051');
    });

    it('frente: extrae marca, modelo, tipo y color', () => {
      const fields = extractRegistrationFields(registrationFront);
      expect(fields.brand).toBe('Toyota');
      expect(fields.model).toBe('Corolla');
      expect(fields.type).toBe('sedan');
      expect(fields.color).toBe('Blanco');
    });

    it('frente: solo hay emisión, NO rellena vencimiento', () => {
      expect(extractRegistrationFields(registrationFront).registrationExpiry).toBeUndefined();
    });

    it('frente: extrae la emisión de la circulación', () => {
      expect(extractRegistrationFields(registrationFront).emissionDate).toBe('2017-06-02');
    });

    it('frente: extrae motor, chasis y VIN', () => {
      const fields = extractRegistrationFields(registrationFront);
      expect(fields.motor).toBe('3ZZE562072');
      expect(fields.chasis).toBe('9BR53ZEC108556455');
      expect(fields.vin).toBe('0009');
    });

    it('reverso: extrae número de circulación, pasajeros y año', () => {
      const fields = extractRegistrationFields(registrationBack);
      expect(fields.registrationNumber).toBe('B2985039');
      expect(fields.passengers).toBe('5');
      expect(fields.year).toBe('2007');
    });
  });

  describe('insurance (póliza)', () => {
    const insuranceText = `
      SEGUROS AMÉRICA
      PÓLIZA No. RCO30201102
      ASEGURADO: JUAN PÉREZ
      VIGENCIA DESDE: 01/01/2025  HASTA: 01/01/2026
    `;

    it('extrae número de póliza y aseguradora', () => {
      const fields = extractInsuranceFields(insuranceText);
      expect(fields.insuranceNumber).toBe('RCO30201102');
      expect(fields.insuranceCompany).toBe('Seguros América');
    });

    it('toma la fecha HASTA como vencimiento', () => {
      const fields = extractInsuranceFields(insuranceText);
      expect(fields.insuranceExpiry).toBe('2026-01-01');
    });

    // Layout real póliza Seguros América
    const insuranceReal = `
      SEGUROS AMERICA
      Póliza No RCO-2022113-0
      Accidentes 1800-9999
      Asegurado: ELBA AGUSTINA CRUZ QUINTANA
      No. de Cédula: 0010205740009M
      Desde: 17/11/2024   Hasta: 16/11/2025
      Marca: TOYOTA   Tipo: SEDAN
      Motor: 3ZZE562072   Placa: M 090051
      Chasis: 9BR53ZEC108556455
      Firma:
    `;

    it('extrae póliza con formato RCO-NNNNNNN-N', () => {
      expect(extractInsuranceFields(insuranceReal).insuranceNumber).toBe('RCO-2022113-0');
    });

    it('toma Hasta como vencimiento e ignora Desde', () => {
      expect(extractInsuranceFields(insuranceReal).insuranceExpiry).toBe('2025-11-16');
    });

    it('extrae datos del vehículo de respaldo (placa, marca, tipo)', () => {
      const fields = extractInsuranceFields(insuranceReal);
      expect(fields.plate).toBe('M090051');
      expect(fields.brand).toBe('Toyota');
      expect(fields.type).toBe('sedan');
    });

    it('extrae motor y chasis de la póliza', () => {
      const fields = extractInsuranceFields(insuranceReal);
      expect(fields.motor).toBe('3ZZE562072');
      expect(fields.chasis).toBe('9BR53ZEC108556455');
    });

    it('no se traga la etiqueta siguiente cuando el valor está vacío', () => {
      const fields = extractInsuranceFields('Motor:\nChasis: 9BR53ZEC108556455');
      expect(fields.motor).toBeUndefined();
      expect(fields.chasis).toBe('9BR53ZEC108556455');
    });
  });

  describe('helpers', () => {
    it('normalize quita acentos y pasa a mayúsculas', () => {
      expect(normalize('CIRCULACIÓN válida')).toBe('CIRCULACION VALIDA');
    });

    it('findDates soporta DD/MM/YYYY y nombres de mes en español', () => {
      const dates = findDates('emitida 05/11/2025, vence 5 de diciembre de 2030');
      expect(dates.map((d) => d.iso)).toEqual(['2025-11-05', '2030-12-05']);
    });

    it('pickExpiryDate sin claves elige la fecha más tardía', () => {
      expect(pickExpiryDate('fechas 01/01/2025 y 01/01/2027')).toBe('2027-01-01');
    });

    it('texto sin datos devuelve campos vacíos', () => {
      expect(extractLicenseFields('foto borrosa ### ...')).toEqual({});
    });
  });
});
