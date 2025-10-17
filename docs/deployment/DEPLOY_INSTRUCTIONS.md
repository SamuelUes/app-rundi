# 🚀 INSTRUCCIONES DE DEPLOY

## 📋 PASOS PARA DEPLOY COMPLETO

### **1. INSTALAR DEPENDENCIAS**

#### **Firebase Functions:**
```bash
cd functions
npm install @supabase/supabase-js
npm run build
cd ..
```

#### **Backend NestJS (Opcional - Respaldo):**
```bash
cd Backend
npm install @supabase/supabase-js
npm run build
cd ..
```

---

### **2. CONFIGURAR VARIABLES DE ENTORNO**

#### **Firebase Functions** (`functions/.env`):
```env
# Supabase
SUPABASE_URL=https://ceytngpresytjhafcadu.supabase.co
SUPABASE_SERVICE_KEY=<tu_service_role_key_aqui>

# Stripe (ya configurado)
STRIPE_SECRET_KEY=<tu_stripe_key>
STRIPE_WEBHOOK_SECRET=<tu_webhook_secret>
```

#### **Backend NestJS** (`Backend/.env`):
```env
# Supabase
SUPABASE_URL=https://ceytngpresytjhafcadu.supabase.co
SUPABASE_SERVICE_KEY=<tu_service_role_key_aqui>

# Database PostgreSQL (ya configurado)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=driveangel

# Stripe (ya configurado)
STRIPE_SECRET_KEY=<tu_stripe_key>
STRIPE_WEBHOOK_SECRET=<tu_webhook_secret>
```

**¿Dónde obtener SUPABASE_SERVICE_KEY?**
1. Ir a: https://ceytngpresytjhafcadu.supabase.co
2. Settings → API
3. Copiar "service_role" key (NO la "anon" key)

---

### **3. APLICAR SCHEMA EN SUPABASE**

#### **Opción A: Ejecutar migración (Recomendado)**
1. Ir a: https://ceytngpresytjhafcadu.supabase.co
2. SQL Editor → New Query
3. Copiar y pegar contenido de: `database/migrations/add_emergency_calls.sql`
4. Click "Run"

#### **Opción B: Ejecutar schema completo**
1. SQL Editor → New Query
2. Copiar y pegar contenido de: `database/supabase-only.sql`
3. Click "Run"

**Verificar que se creó la tabla:**
```sql
SELECT * FROM emergency_calls LIMIT 1;
```

---

### **4. DESPLEGAR FIREBASE FUNCTIONS**

```bash
# Compilar
cd functions
npm run build

# Deploy
cd ..
firebase deploy --only functions

# O deploy solo las nuevas funciones:
firebase deploy --only functions:logEmergencyCall,functions:updateEmergencyCallStatus,functions:getEmergencyCalls,functions:getTodayRides,functions:getRideHistory,functions:getDriverStats,functions:getRideDetailsFromSupabase
```

**Tiempo estimado:** 5-10 minutos

**Verificar deploy:**
```bash
firebase functions:log --only logEmergencyCall
```

O visitar: https://us-central1-driveangel-ni.cloudfunctions.net/healthCheck

---

### **5. INICIAR BACKEND NESTJS (OPCIONAL)**

Si quieres tener el backend local como respaldo:

```bash
cd Backend
npm run start:dev
```

El backend estará disponible en: http://localhost:3000/api

---

## ✅ VERIFICACIÓN

### **Verificar Firebase Functions:**

```bash
# Ver lista de funciones desplegadas
firebase functions:list

# Deberías ver 35 funciones (28 anteriores + 7 nuevas):
# - logEmergencyCall
# - updateEmergencyCallStatus
# - getEmergencyCalls
# - getTodayRides
# - getRideHistory
# - getDriverStats
# - getRideDetailsFromSupabase
```

### **Verificar Supabase:**

```sql
-- Ver tablas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Debería incluir: emergency_calls

-- Ver estructura
\d emergency_calls
```

### **Verificar Backend NestJS:**

```bash
curl http://localhost:3000/api/health
```

---

## 🔧 TROUBLESHOOTING

### **Error: "Cannot find module '@supabase/supabase-js'"**
```bash
cd functions
npm install @supabase/supabase-js
```

### **Error: "SUPABASE_SERVICE_KEY no configurada"**
- Asegúrate de tener el archivo `.env` en la carpeta `functions/`
- Verifica que la key sea la "service_role" y no la "anon"

### **Error: "Table emergency_calls does not exist"**
- Ejecuta la migración SQL en Supabase
- Verifica que estés conectado a la base de datos correcta

### **Error al desplegar funciones:**
```bash
# Limpiar y volver a intentar
cd functions
rm -rf node_modules
npm install
npm run build
cd ..
firebase deploy --only functions
```

---

## 📊 ENDPOINTS NUEVOS

### **Firebase Functions:**

**Emergency:**
- `logEmergencyCall` - POST - Registrar llamada de emergencia
- `updateEmergencyCallStatus` - POST - Actualizar estado
- `getEmergencyCalls` - GET - Obtener historial

**Ride History:**
- `getTodayRides` - GET - Viajes del día
- `getRideHistory` - GET - Historial completo
- `getDriverStats` - GET - Estadísticas del conductor
- `getRideDetailsFromSupabase` - GET - Detalles de viaje

### **Backend NestJS:**

**Emergency:**
- `POST /api/emergency/log` - Registrar llamada
- `POST /api/emergency/update-status` - Actualizar estado
- `GET /api/emergency/history` - Obtener historial

**Ride History:**
- `GET /api/ride-history/today` - Viajes del día
- `GET /api/ride-history/history?limit=50&offset=0` - Historial
- `GET /api/ride-history/driver-stats` - Estadísticas
- `GET /api/ride-history/:rideId` - Detalles de viaje

---

## 🎯 DESPUÉS DEL DEPLOY

1. ✅ Verificar que las funciones estén desplegadas
2. ✅ Probar endpoints con Postman o curl
3. ✅ Verificar logs en Firebase Console
4. ✅ Continuar con implementación de Frontend

---

**Última actualización:** 2025-10-09 19:40
