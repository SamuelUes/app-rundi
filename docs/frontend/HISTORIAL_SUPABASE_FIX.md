# 📋 SOLUCIÓN FINAL - HISTORIAL CON SUPABASE

**Fecha:** 2025-10-10  
**Estado:** ⚠️ **REQUIERE CONFIGURACIÓN**

---

## 🐛 **PROBLEMA:**

```
❌ Error al ver historial
❌ No se muestran los viajes
```

**Causa:** Firebase Functions no tiene las credenciales de Supabase configuradas.

---

## 🔍 **ARQUITECTURA:**

```
Frontend
  └─ ridesService.getMyRides()
      └─ Firebase Callable Function: getMyRides
          └─ Consulta Supabase PostgreSQL ✅
              └─ Tabla: rides
```

**El código está correcto**, solo falta configurar las credenciales.

---

## ✅ **SOLUCIÓN:**

### **Paso 1: Configurar Variables de Entorno**

```powershell
# Desde la raíz del proyecto
.\configure-firebase-env.ps1
```

Este script configura:
- ✅ `supabase.url`
- ✅ `supabase.anon_key`
- ✅ `supabase.db_password`
- ✅ `database.url`

---

### **Paso 2: Redesplegar Functions**

```powershell
cd functions
firebase deploy --only functions
```

**Importante:** Las variables de entorno solo se aplican después de redesplegar.

---

### **Paso 3: Verificar**

```powershell
# Ver configuración actual
firebase functions:config:get
```

**Salida esperada:**
```json
{
  "supabase": {
    "url": "https://ceytngpresytjhafcadu.supabase.co",
    "anon_key": "eyJhbGci...",
    "db_password": "appdriveangel2025"
  },
  "database": {
    "url": "postgresql://postgres.ceytngpresytjhafcadu:..."
  }
}
```

---

## 📊 **FLUJO COMPLETO:**

```
1. Usuario abre RideHistoryScreen
   └─ Llama a ridesService.getMyRides(userId)

2. Frontend llama a Firebase Function
   └─ httpsCallable(functions, 'getMyRides')

3. Firebase Function se conecta a Supabase
   └─ const client = await pool.connect()
   └─ Usa DATABASE_URL de variables de entorno

4. Consulta PostgreSQL
   └─ SELECT * FROM rides WHERE client_id = $1 OR driver_id = $1

5. Retorna viajes al frontend
   └─ { success: true, rides: [...] }

6. Frontend muestra en pantalla
   └─ Con filtros: Todos, Completados, Cancelados
```

---

## 🗄️ **CONFIGURACIÓN DE SUPABASE:**

### **Credenciales:**

```env
SUPABASE_URL=https://ceytngpresytjhafcadu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_DB_PASSWORD=appdriveangel2025

DATABASE_URL=postgresql://postgres.ceytngpresytjhafcadu:appdriveangel2025@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### **Tabla `rides` en Supabase:**

```sql
CREATE TABLE rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  origin_lat DECIMAL(10, 8),
  origin_lng DECIMAL(11, 8),
  origin_address TEXT,
  destination_lat DECIMAL(10, 8),
  destination_lng DECIMAL(11, 8),
  destination_address TEXT,
  distance INTEGER,
  duration INTEGER,
  estimated_price DECIMAL(10, 2),
  final_price DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_rides_client_id ON rides(client_id);
CREATE INDEX idx_rides_driver_id ON rides(driver_id);
CREATE INDEX idx_rides_created_at ON rides(created_at DESC);
```

---

## 🐛 **TROUBLESHOOTING:**

### **Error 1: "Cannot connect to database"**

**Causa:** Variables de entorno no configuradas

**Solución:**
```powershell
.\configure-firebase-env.ps1
cd functions
firebase deploy --only functions
```

---

### **Error 2: "Function not found"**

**Causa:** Function no está desplegada

**Solución:**
```powershell
cd functions
npm run build
firebase deploy --only functions
```

---

### **Error 3: "Historial vacío pero hay viajes en BD"**

**Causa:** Los viajes no tienen el `client_id` o `driver_id` correcto

**Verificar en Supabase:**
```sql
-- Ver todos los viajes
SELECT id, client_id, driver_id, status, created_at 
FROM rides 
ORDER BY created_at DESC 
LIMIT 10;

-- Ver viajes de un usuario específico
SELECT * FROM rides 
WHERE client_id = 'tu_user_id' OR driver_id = 'tu_user_id';
```

---

### **Error 4: "User not authenticated"**

**Causa:** Token de Firebase no válido

**Solución:**
1. Cierra sesión en la app
2. Vuelve a iniciar sesión
3. Intenta de nuevo

---

## 📝 **VERIFICAR CONFIGURACIÓN ACTUAL:**

```powershell
# Ver variables de entorno en Firebase
cd functions
firebase functions:config:get

# Ver logs de la función
firebase functions:log --only getMyRides

# Probar la función directamente
firebase functions:shell
> getMyRides({ userId: 'test-user-id', limit: 10, offset: 0 })
```

---

## 🔧 **ALTERNATIVA: Variables de Entorno Locales**

Si prefieres usar `.env` local (para desarrollo):

### **En `functions/.env`:**

```env
DATABASE_URL=postgresql://postgres.ceytngpresytjhafcadu:appdriveangel2025@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://ceytngpresytjhafcadu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### **En `functions/src/config/database.ts`:**

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export default pool;
```

---

## ✅ **PASOS FINALES:**

```powershell
# 1. Configurar variables
.\configure-firebase-env.ps1

# 2. Redesplegar
cd functions
firebase deploy --only functions

# 3. Verificar
firebase functions:config:get

# 4. Probar en la app
# - Abre RideHistoryScreen
# - Deberías ver tus viajes
```

---

## 📊 **ESTADO ESPERADO:**

```
✅ Variables de entorno configuradas
✅ Functions desplegadas
✅ Conexión a Supabase funcionando
✅ Historial mostrando viajes
✅ Filtros funcionando
```

---

## 🎯 **COMANDOS RÁPIDOS:**

```powershell
# Todo en uno
.\configure-firebase-env.ps1
cd functions
firebase deploy --only functions
cd ..

# Verificar
cd functions
firebase functions:log --only getMyRides
```

---

**¡Después de configurar las variables, el historial funcionará!** 📋✅
