/**
 * Configuración de Sequelize
 * Conexión a PostgreSQL (Supabase)
 * 
 * ✅ Usa DATABASE_URL desde Firebase config o .env
 * ✅ Compatible con Firebase Cloud Functions
 * ✅ SSL habilitado para Supabase
 */

import { Sequelize } from 'sequelize';
import * as functions from 'firebase-functions';
import dotenv from 'dotenv';

// Asegurar que las variables de entorno de .env estén disponibles en emulador/desarrollo
dotenv.config();

console.log(`🔧 [Sequelize Config] Inicializando conexión a Supabase...`);

// Obtener DATABASE_URL de múltiples fuentes
let databaseUrl: string | undefined;

// 1. Intentar obtener de Firebase config (functions:config:set)
try {
  const config = functions.config();
  if (config.supabase && config.supabase.database_url) {
    databaseUrl = config.supabase.database_url;
    console.log(`✅ [Sequelize Config] DATABASE_URL obtenida de Firebase config`);
  }
} catch (error: any) {
  console.log(`⚠️ [Sequelize Config] No se pudo obtener de Firebase config:`, error.message);
}

// 2. Fallback: obtener de process.env (para desarrollo local)
if (!databaseUrl) {
  databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    console.log(`✅ [Sequelize Config] DATABASE_URL obtenida de process.env`);
  }
}

let sequelize: Sequelize | null = null;

if (!databaseUrl) {
  console.warn(`⚠️ [Sequelize Config] DATABASE_URL no está configurada. Saltando inicialización de Sequelize.`);
  console.warn(`⚠️ [Sequelize Config] Configura en Firebase Cloud Functions: firebase functions:config:set supabase.database_url="postgresql://..."`);
  console.warn(`⚠️ [Sequelize Config] O define DATABASE_URL en el archivo functions/.env`);
} else {
  console.log(`✅ [Sequelize Config] DATABASE_URL encontrada`);
  console.log(`✅ [Sequelize Config] Conectando a: ${databaseUrl.split('@')[1] || 'Supabase'}`);

  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
      evict: 10000,
    },
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
      // ✅ Configuración para Supabase
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000,
      application_name: 'driveangel-firebase-functions',
    },
    // ✅ Retry logic para conexiones fallidas
    retry: {
      max: 3,
      timeout: 5000,
    },
    // ✅ Configuración adicional para Firebase
    define: {
      timestamps: true,
      underscored: true,
    },
  });

  const testConnection = async () => {
    try {
      console.log(`🔄 [Sequelize Config] Probando conexión a Supabase...`);
      await sequelize!.authenticate();
      console.log(`✅ [Sequelize Config] Conexión a Supabase exitosa`);
    } catch (error: any) {
      console.warn(`⚠️ [Sequelize Config] No se pudo conectar a PostgreSQL directo:`, error.message);
      console.warn(`⚠️ [Sequelize Config] Usando Supabase REST API como fallback`);
      console.warn(`⚠️ [Sequelize Config] Esto es normal en Firebase Functions`);
    }
  };

  testConnection().catch(() => {
    // Ignorar errores - usaremos REST API como fallback
  });
}

const sequelizeFallback = new Proxy({} as Sequelize, {
  get() {
    throw new Error('Sequelize no está inicializado porque DATABASE_URL no fue configurada');
  },
});

export const isSequelizeAvailable = !!sequelize;
export default sequelize ?? sequelizeFallback;
