/**
 * Departamentos y Municipios de Nicaragua
 * Fuente: Instituto Nacional de Información de Desarrollo (INIDE)
 */

export interface Municipality {
  name: string;
  code?: string;
}

export interface Department {
  name: string;
  code: string;
  plateCode?: string; // Código de matrícula vehicular (opcional)
  municipalities: Municipality[];
}

/**
 * Códigos de matrícula por departamento
 * Formato: 1-2 letras + 5-6 dígitos
 */
export const PLATE_CODES: { [key: string]: string } = {
  'Managua': 'M',
  'Masaya': 'MS',
  'Granada': 'GR',
  'Carazo': 'CZ',
  'Rivas': 'R',
  'León': 'L',
  'Chinandega': 'CH',
  'Estelí': 'ES',
  'Madriz': 'MD',
  'Nueva Segovia': 'NS',
  'Jinotega': 'J',
  'Matagalpa': 'MT',
  'Boaco': 'BO',
  'Chontales': 'CT',
  'Río San Juan': 'SJ',
  'RAAN': 'AN', // Región Autónoma Atlántico Norte
  'RAAS': 'AS', // Región Autónoma Atlántico Sur
};

export const NICARAGUA_LOCATIONS: Department[] = [
  {
    name: 'Managua',
    code: 'MN',
    municipalities: [
      { name: 'Managua' },
      { name: 'Ciudad Sandino' },
      { name: 'El Crucero' },
      { name: 'Mateare' },
      { name: 'San Francisco Libre' },
      { name: 'San Rafael del Sur' },
      { name: 'Ticuantepe' },
      { name: 'Tipitapa' },
      { name: 'Villa Carlos Fonseca' },
    ],
  },
  {
    name: 'Masaya',
    code: 'MS',
    municipalities: [
      { name: 'Masaya' },
      { name: 'Catarina' },
      { name: 'La Concepción' },
      { name: 'Masatepe' },
      { name: 'Nandasmo' },
      { name: 'Nindirí' },
      { name: 'Niquinohomo' },
      { name: 'San Juan de Oriente' },
      { name: 'Tisma' },
    ],
  },
  {
    name: 'Granada',
    code: 'GR',
    municipalities: [
      { name: 'Granada' },
      { name: 'Diriá' },
      { name: 'Diriomo' },
      { name: 'Nandaime' },
    ],
  },
  {
    name: 'León',
    code: 'LE',
    municipalities: [
      { name: 'León' },
      { name: 'Achuapa' },
      { name: 'El Jicaral' },
      { name: 'El Sauce' },
      { name: 'La Paz Centro' },
      { name: 'Larreynaga' },
      { name: 'Nagarote' },
      { name: 'Quezalguaque' },
      { name: 'Santa Rosa del Peñón' },
      { name: 'Telica' },
    ],
  },
  {
    name: 'Chinandega',
    code: 'CH',
    municipalities: [
      { name: 'Chinandega' },
      { name: 'Chichigalpa' },
      { name: 'Cinco Pinos' },
      { name: 'Corinto' },
      { name: 'El Realejo' },
      { name: 'El Viejo' },
      { name: 'Posoltega' },
      { name: 'Puerto Morazán' },
      { name: 'San Francisco del Norte' },
      { name: 'San Pedro del Norte' },
      { name: 'Santo Tomás del Norte' },
      { name: 'Somotillo' },
      { name: 'Villanueva' },
    ],
  },
  {
    name: 'Carazo',
    code: 'CA',
    municipalities: [
      { name: 'Jinotepe' },
      { name: 'Diriamba' },
      { name: 'Dolores' },
      { name: 'El Rosario' },
      { name: 'La Conquista' },
      { name: 'La Paz de Carazo' },
      { name: 'San Marcos' },
      { name: 'Santa Teresa' },
    ],
  },
  {
    name: 'Rivas',
    code: 'RI',
    municipalities: [
      { name: 'Rivas' },
      { name: 'Altagracia' },
      { name: 'Belén' },
      { name: 'Buenos Aires' },
      { name: 'Cárdenas' },
      { name: 'Moyogalpa' },
      { name: 'Potosí' },
      { name: 'San Jorge' },
      { name: 'San Juan del Sur' },
      { name: 'Tola' },
    ],
  },
  {
    name: 'Estelí',
    code: 'ES',
    municipalities: [
      { name: 'Estelí' },
      { name: 'Condega' },
      { name: 'La Trinidad' },
      { name: 'Pueblo Nuevo' },
      { name: 'San Juan de Limay' },
      { name: 'San Nicolás' },
    ],
  },
  {
    name: 'Matagalpa',
    code: 'MT',
    municipalities: [
      { name: 'Matagalpa' },
      { name: 'Ciudad Darío' },
      { name: 'El Tuma-La Dalia' },
      { name: 'Esquipulas' },
      { name: 'Matiguás' },
      { name: 'Muy Muy' },
      { name: 'Rancho Grande' },
      { name: 'Río Blanco' },
      { name: 'San Dionisio' },
      { name: 'San Isidro' },
      { name: 'San Ramón' },
      { name: 'Sébaco' },
      { name: 'Terrabona' },
    ],
  },
  {
    name: 'Jinotega',
    code: 'JI',
    municipalities: [
      { name: 'Jinotega' },
      { name: 'El Cuá' },
      { name: 'La Concordia' },
      { name: 'San José de Bocay' },
      { name: 'San Rafael del Norte' },
      { name: 'San Sebastián de Yalí' },
      { name: 'Santa María de Pantasma' },
      { name: 'Wiwilí de Jinotega' },
    ],
  },
  {
    name: 'Boaco',
    code: 'BO',
    municipalities: [
      { name: 'Boaco' },
      { name: 'Camoapa' },
      { name: 'San José de los Remates' },
      { name: 'San Lorenzo' },
      { name: 'Santa Lucía' },
      { name: 'Teustepe' },
    ],
  },
  {
    name: 'Chontales',
    code: 'CO',
    municipalities: [
      { name: 'Juigalpa' },
      { name: 'Acoyapa' },
      { name: 'Comalapa' },
      { name: 'Cuapa' },
      { name: 'El Coral' },
      { name: 'La Libertad' },
      { name: 'San Francisco de Cuapa' },
      { name: 'San Pedro de Lóvago' },
      { name: 'Santo Domingo' },
      { name: 'Santo Tomás' },
      { name: 'Villa Sandino' },
    ],
  },
  {
    name: 'Madriz',
    code: 'MD',
    municipalities: [
      { name: 'Somoto' },
      { name: 'Las Sabanas' },
      { name: 'Palacagüina' },
      { name: 'San José de Cusmapa' },
      { name: 'San Juan de Río Coco' },
      { name: 'San Lucas' },
      { name: 'Telpaneca' },
      { name: 'Totogalpa' },
      { name: 'Yalagüina' },
    ],
  },
  {
    name: 'Nueva Segovia',
    code: 'NS',
    municipalities: [
      { name: 'Ocotal' },
      { name: 'Ciudad Antigua' },
      { name: 'Dipilto' },
      { name: 'El Jícaro' },
      { name: 'Jalapa' },
      { name: 'Macuelizo' },
      { name: 'Mozonte' },
      { name: 'Murra' },
      { name: 'Quilalí' },
      { name: 'San Fernando' },
      { name: 'Santa María' },
      { name: 'Wiwilí de Nueva Segovia' },
    ],
  },
  {
    name: 'Río San Juan',
    code: 'RS',
    municipalities: [
      { name: 'San Carlos' },
      { name: 'El Almendro' },
      { name: 'El Castillo' },
      { name: 'Morrito' },
      { name: 'San Juan de Nicaragua' },
      { name: 'San Miguelito' },
    ],
  },
  {
    name: 'RACCS (Región Autónoma de la Costa Caribe Sur)',
    code: 'RC',
    municipalities: [
      { name: 'Bluefields' },
      { name: 'Corn Island' },
      { name: 'Desembocadura de Río Grande' },
      { name: 'El Ayote' },
      { name: 'El Rama' },
      { name: 'El Tortuguero' },
      { name: 'Kukra Hill' },
      { name: 'La Cruz de Río Grande' },
      { name: 'Laguna de Perlas' },
      { name: 'Muelle de los Bueyes' },
      { name: 'Nueva Guinea' },
      { name: 'Paiwas' },
    ],
  },
  {
    name: 'RACCN (Región Autónoma de la Costa Caribe Norte)',
    code: 'RN',
    municipalities: [
      { name: 'Bilwi (Puerto Cabezas)' },
      { name: 'Bonanza' },
      { name: 'Mulukukú' },
      { name: 'Prinzapolka' },
      { name: 'Rosita' },
      { name: 'Siuna' },
      { name: 'Waslala' },
      { name: 'Waspán' },
    ],
  },
];

/**
 * Obtener lista de departamentos
 */
export const getDepartments = (): string[] => {
  return NICARAGUA_LOCATIONS.map(dept => dept.name);
};

/**
 * Obtener municipios de un departamento
 */
export const getMunicipalitiesByDepartment = (departmentName: string): string[] => {
  const department = NICARAGUA_LOCATIONS.find(dept => dept.name === departmentName);
  return department ? department.municipalities.map(mun => mun.name) : [];
};

/**
 * Validar si un departamento existe
 */
export const isValidDepartment = (departmentName: string): boolean => {
  return NICARAGUA_LOCATIONS.some(dept => dept.name === departmentName);
};

/**
 * Validar si un municipio existe en un departamento
 */
export const isValidMunicipality = (departmentName: string, municipalityName: string): boolean => {
  const department = NICARAGUA_LOCATIONS.find(dept => dept.name === departmentName);
  if (!department) return false;
  return department.municipalities.some(mun => mun.name === municipalityName);
};
