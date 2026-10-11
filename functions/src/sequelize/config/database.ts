/**
 * Configuración de Sequelize
 * Conexión a PostgreSQL (Supabase)
 * 
 * ✅ Usa DATABASE_URL desde .env
 * ✅ Compatible con Firebase Cloud Functions
 * ✅ SSL habilitado para Supabase
 */

import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

// Asegurar que las variables de entorno estén disponibles en emulador/desarrollo
const nodeEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const envFilePath = nodeEnv === 'production' ? '.env.production' : '.env.development';

dotenv.config({ path: envFilePath });

if (process.env.FUNCTIONS_EMULATOR || process.env.NODE_ENV === 'development') {
  console.log(`🔧 [Sequelize Config] Inicializando conexión a Supabase...`);
}

// Obtener DATABASE_URL de múltiples fuentes
const useLocalSupabase = process.env.USE_LOCAL_SUPABASE === 'true';
let databaseUrl: string | undefined;

if (useLocalSupabase) {
  databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('USE_LOCAL_SUPABASE=true requiere DATABASE_URL del Supabase local');
  }
  const databaseHost = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1'].includes(databaseHost)) {
    throw new Error('USE_LOCAL_SUPABASE=true requiere una DATABASE_URL de loopback');
  }
  console.log('✅ [Sequelize Config] DATABASE_URL local seleccionada por USE_LOCAL_SUPABASE');
} else {
  // DATABASE_URL desde process.env (.env.production desplegado o env de la función)
  if (process.env.DATABASE_URL) {
    databaseUrl = process.env.DATABASE_URL;
    if (process.env.FUNCTIONS_EMULATOR || process.env.NODE_ENV === 'development') {
      console.log(`✅ [Sequelize Config] DATABASE_URL obtenida de process.env`);
    }
  } else if (process.env.DATABASE_TRANS_POOLER) {
    // Luego intentar DATABASE_TRANS_POOLER (transaction pooler de Supabase)
    databaseUrl = process.env.DATABASE_TRANS_POOLER;
    if (process.env.FUNCTIONS_EMULATOR || process.env.NODE_ENV === 'development') {
      console.log(
        `✅ [Sequelize Config] DATABASE_URL obtenida de process.env.DATABASE_TRANS_POOLER (transaction pooler)`,
      );
    }
  }
}

let sequelize: Sequelize | null = null;

if (!databaseUrl) {
  console.warn(`⚠️ [Sequelize Config] DATABASE_URL no está configurada. Saltando inicialización de Sequelize.`);
  console.warn(`⚠️ [Sequelize Config] Define DATABASE_URL en functions/.env.production o como env var de la función`);
} else {
  if (process.env.FUNCTIONS_EMULATOR || process.env.NODE_ENV === 'development') {
    console.log(`✅ [Sequelize Config] DATABASE_URL encontrada`);
    console.log(`✅ [Sequelize Config] Conectando a: ${databaseUrl.split('@')[1] || 'Supabase'}`);
  }

  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 5000,
      idle: 10000,
      evict: 10000,
    },
    dialectOptions: {
      ...(useLocalSupabase ? {} : { ssl: { require: true, rejectUnauthorized: false } }),
      // ✅ Configuración para Supabase
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000,
      connectTimeoutMS: 5000,
      application_name: 'rundi-firebase-functions',
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

  const isEmulator = process.env.FUNCTIONS_EMULATOR || process.env.NODE_ENV === 'development';

  const testConnection = async () => {
    try {
      if (isEmulator) {
        console.log(`🔄 [Sequelize Config] Probando conexión a Supabase...`);
      }
      await sequelize!.authenticate();
      if (isEmulator) {
        console.log(`✅ [Sequelize Config] Conexión a Supabase exitosa`);
      }
    } catch (error: any) {
      if (isEmulator) {
        console.warn(`⚠️ [Sequelize Config] No se pudo conectar a PostgreSQL directo:`, error.message);
        console.warn(`⚠️ [Sequelize Config] Usando Supabase REST API como fallback`);
        console.warn(`⚠️ [Sequelize Config] Esto es normal en Firebase Functions`);
      } else {
        // En producción (Firebase Functions) es esperado que la conexión directa falle
        // Silenciamos los logs para evitar ruido en Cloud Logging
        console.log(`ℹ️ [Sequelize Config] PostgreSQL directo no disponible, usando REST API fallback`);
      }
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
