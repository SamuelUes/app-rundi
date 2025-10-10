# 🐘 Configuración de Supabase PostgreSQL - DriveAngel.ni

## ✅ Credenciales de tu Supabase

Ya tienes tu proyecto de Supabase configurado:

```
URL: https://ceytngpresytjhafcadu.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🔑 Obtener Password de la Base de Datos

### **Paso 1: Ir a Supabase Dashboard**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu
```

### **Paso 2: Ir a Settings → Database**
- En el menú lateral: Settings
- Luego: Database
- Buscar "Connection string"

### **Paso 3: Copiar el password**
Verás algo como:
```
postgresql://postgres:[YOUR-PASSWORD]@db.ceytngpresytjhafcadu.supabase.co:5432/postgres
```

El `[YOUR-PASSWORD]` es tu contraseña de la base de datos.

---

## 🔧 Configurar en Firebase Functions

### **Opción 1: Usar Firebase Secrets (Recomendado para producción)**

```bash
cd functions
firebase functions:secrets:set SUPABASE_DB_PASSWORD
# Pegar tu password cuando te lo pida
```

### **Opción 2: Usar .env local (Solo para desarrollo)**

Crear archivo `functions/.env`:
```env
SUPABASE_DB_PASSWORD=tu_password_aqui
```

**⚠️ IMPORTANTE:** Agregar `.env` al `.gitignore`

---

## 📊 Crear Tablas en Supabase

### **Paso 1: Ir al SQL Editor**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/sql
```

### **Paso 2: Ejecutar este SQL:**

```sql
-- ============================================
-- DRIVERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) UNIQUE NOT NULL,
  license_number VARCHAR(50),
  license_expiry DATE,
  license_photo VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending',
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- VEHICLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  plate VARCHAR(20) NOT NULL,
  brand VARCHAR(50),
  model VARCHAR(50),
  year INTEGER,
  color VARCHAR(30),
  type VARCHAR(20),
  
  -- Documentos
  registration_number VARCHAR(50),
  registration_expiry DATE,
  registration_photo VARCHAR(500),
  
  insurance_number VARCHAR(50),
  insurance_company VARCHAR(100),
  insurance_expiry DATE,
  insurance_photo VARCHAR(500),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- RIDES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255),
  
  -- Ubicaciones
  origin_lat DECIMAL(10, 8),
  origin_lng DECIMAL(11, 8),
  origin_address TEXT,
  destination_lat DECIMAL(10, 8),
  destination_lng DECIMAL(11, 8),
  destination_address TEXT,
  
  -- Métricas
  estimated_distance INTEGER,
  estimated_duration INTEGER,
  actual_distance INTEGER,
  actual_duration INTEGER,
  
  -- Precios
  estimated_price DECIMAL(10, 2),
  final_fare DECIMAL(10, 2),
  
  -- Estados
  status VARCHAR(20) DEFAULT 'requested',
  cancel_reason VARCHAR(100),
  
  -- Timestamps
  requested_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  canceled_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  tip DECIMAL(10, 2) DEFAULT 0,
  payment_method VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255),
  
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- RATINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  from_user_id VARCHAR(255) NOT NULL,
  to_user_id VARCHAR(255) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- RIDE LOCATIONS (Tracking History)
-- ============================================
CREATE TABLE IF NOT EXISTS ride_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  speed DECIMAL(5, 2),
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ÍNDICES PARA MEJOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_client_id ON rides(client_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_payments_ride_id ON payments(ride_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ride_id ON ratings(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_locations_ride_id ON ride_locations(ride_id);

-- ============================================
-- TRIGGERS PARA UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON rides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 🔒 Configurar Row Level Security (RLS)

Supabase tiene RLS habilitado por defecto. Para permitir acceso desde Firebase Functions:

### **Opción 1: Deshabilitar RLS (Más simple para empezar)**

```sql
ALTER TABLE drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE rides DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ratings DISABLE ROW LEVEL SECURITY;
ALTER TABLE ride_locations DISABLE ROW LEVEL SECURITY;
```

### **Opción 2: Configurar políticas RLS (Más seguro)**

```sql
-- Permitir acceso desde service role (Firebase Functions)
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do anything"
  ON drivers
  FOR ALL
  USING (auth.role() = 'service_role');

-- Repetir para todas las tablas
```

---

## ✅ Verificar Conexión

### **Desde Firebase Functions:**

Crear un archivo de prueba `functions/src/test-db.ts`:

```typescript
import pool from "./config/database";

export async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    console.log("✅ Conexión exitosa:", result.rows[0]);
    client.release();
    return true;
  } catch (error) {
    console.error("❌ Error de conexión:", error);
    return false;
  }
}
```

---

## 📊 Monitoreo en Supabase

### **Ver tablas y datos:**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/editor
```

### **Ver logs:**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/logs
```

### **Ver uso:**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/settings/billing
```

---

## 💰 Límites del Plan Gratuito

| Recurso | Límite Gratuito |
|---------|-----------------|
| **Base de datos** | 500 MB |
| **Transferencia** | 2 GB/mes |
| **Conexiones** | 60 simultáneas |
| **Backups** | 7 días |

**Suficiente para:**
- ~10,000 viajes
- ~1,000 conductores
- ~5,000 usuarios

---

## 🚀 Próximos Pasos

1. ✅ Obtener password de la base de datos
2. ✅ Configurar en Firebase Functions
3. ✅ Ejecutar SQL para crear tablas
4. ✅ Deshabilitar RLS (o configurar políticas)
5. ✅ Probar conexión
6. ✅ Desplegar Functions

---

**¡Supabase configurado y listo!** 🐘
