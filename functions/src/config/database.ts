import { Pool } from "pg";

// Configuración de Supabase PostgreSQL
const pool = new Pool({
  host: "db.ceytngpresytjhafcadu.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "appdriveangel2025", // Password de Supabase
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10, // Máximo de conexiones
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Evento de conexión exitosa
pool.on("connect", () => {
  console.log("✅ Conectado a Supabase PostgreSQL");
});

// Evento de error
pool.on("error", (err) => {
  console.error("❌ Error en conexión a PostgreSQL:", err);
});

export default pool;
