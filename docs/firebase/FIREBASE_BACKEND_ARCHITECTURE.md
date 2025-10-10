# 🔥 Backend 100% en Firebase Functions + PostgreSQL Externo

## 🏗️ Arquitectura Final

```
┌─────────────────────────────────────────────────┐
│              FRONTEND (React Native)             │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│         FIREBASE FUNCTIONS (Todo el Backend)    │
│                                                  │
│  📱 API REST                                     │
│  ├── /api/auth/register                         │
│  ├── /api/auth/login                            │
│  ├── /api/rides/request                         │
│  ├── /api/rides/accept                          │
│  ├── /api/payments/create                       │
│  └── ...                                         │
│                                                  │
│  🔔 Triggers Automáticos                        │
│  ├── onUserCreated                              │
│  ├── onRideStatusChanged                        │
│  ├── onPaymentCompleted                         │
│  └── ...                                         │
│                                                  │
│  🪝 Webhooks                                     │
│  ├── /webhooks/stripe                           │
│  └── ...                                         │
└────────────┬────────────────────┬───────────────┘
             │                    │
             ▼                    ▼
┌────────────────────┐   ┌────────────────────┐
│     FIREBASE       │   │    POSTGRESQL      │
│                    │   │   (Cloud SQL)      │
│ • Authentication   │   │                    │
│ • Firestore        │   │ • drivers          │
│   - users          │   │ • vehicles         │
│   - notifications  │   │ • rides            │
│                    │   │ • payments         │
│ • Realtime DB      │   │ • ratings          │
│   - activeRides    │   │ • ride_locations   │
│   - driverLocation │   │ • analytics        │
│   - chat           │   │                    │
└────────────────────┘   └────────────────────┘
```

---

## 📦 Estructura del Proyecto

```
App-Uber/
├── Frontend/              # React Native App
├── functions/             # Firebase Functions (Backend)
│   ├── src/
│   │   ├── index.ts       # Punto de entrada
│   │   ├── config/
│   │   │   ├── firebase.ts
│   │   │   └── database.ts  # Conexión PostgreSQL
│   │   ├── api/
│   │   │   ├── auth.ts
│   │   │   ├── rides.ts
│   │   │   ├── drivers.ts
│   │   │   ├── payments.ts
│   │   │   └── users.ts
│   │   ├── triggers/
│   │   │   ├── auth.ts
│   │   │   ├── rides.ts
│   │   │   └── payments.ts
│   │   ├── webhooks/
│   │   │   └── stripe.ts
│   │   ├── services/
│   │   │   ├── database.service.ts
│   │   │   ├── maps.service.ts
│   │   │   ├── stripe.service.ts
│   │   │   └── notifications.service.ts
│   │   └── models/
│   │       ├── driver.model.ts
│   │       ├── ride.model.ts
│   │       └── payment.model.ts
│   ├── package.json
│   └── tsconfig.json
└── database/              # Scripts SQL
    ├── schema.sql
    └── migrations/
```

---

## 🔧 Configuración de PostgreSQL en Cloud

### **Opción A: Google Cloud SQL (Recomendada)**

#### **Ventajas:**
- ✅ Integración perfecta con Firebase
- ✅ Misma cuenta de Google
- ✅ Backups automáticos
- ✅ Alta disponibilidad
- ✅ Conexión segura desde Functions

#### **Pasos:**

1. **Ir a Google Cloud Console:**
   ```
   https://console.cloud.google.com
   ```

2. **Crear instancia de Cloud SQL:**
   - SQL → Crear instancia
   - Elegir PostgreSQL
   - Configuración:
     - Nombre: `driveangel-db`
     - Región: `us-central1` (misma que Functions)
     - Versión: PostgreSQL 15
     - Tipo: `db-f1-micro` (1 vCPU, 614 MB) - $10/mes
     - Almacenamiento: 10 GB SSD

3. **Configurar conexión:**
   - Habilitar "Private IP" (más seguro)
   - O usar "Public IP" + Cloud SQL Proxy

4. **Crear base de datos:**
   ```sql
   CREATE DATABASE driveangel_production;
   ```

#### **Costos:**
- **db-f1-micro:** ~$10/mes (suficiente para empezar)
- **db-g1-small:** ~$25/mes (más potente)
- **Almacenamiento:** $0.17/GB/mes

---

### **Opción B: Supabase (PostgreSQL Managed)**

#### **Ventajas:**
- ✅ **Gratis hasta 500MB**
- ✅ API REST automática
- ✅ Realtime incluido
- ✅ Backups automáticos
- ✅ Muy fácil de usar

#### **Pasos:**

1. **Ir a Supabase:**
   ```
   https://supabase.com
   ```

2. **Crear proyecto:**
   - Nombre: `driveangel`
   - Región: `US East`
   - Password: (guardar)

3. **Obtener credenciales:**
   ```
   Host: db.xxxxx.supabase.co
   Port: 5432
   Database: postgres
   User: postgres
   Password: tu_password
   ```

#### **Costos:**
- **Free:** 500MB, 2GB transferencia, 50MB archivos
- **Pro:** $25/mes, 8GB, 50GB transferencia

---

### **Opción C: DigitalOcean Managed Database**

#### **Ventajas:**
- ✅ Económico ($15/mes)
- ✅ Fácil de usar
- ✅ Backups automáticos

#### **Pasos:**

1. **Ir a DigitalOcean:**
   ```
   https://www.digitalocean.com
   ```

2. **Crear Managed Database:**
   - Databases → Create
   - PostgreSQL 15
   - Plan: Basic ($15/mes)
   - Región: New York

---

## 💻 Conexión desde Firebase Functions

### **Instalar dependencias:**
```bash
cd functions
npm install pg
npm install @types/pg --save-dev
```

### **Configurar conexión (functions/src/config/database.ts):**

```typescript
import { Pool } from 'pg';

// Configuración de PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false, // Para Cloud SQL
  },
  max: 10, // Máximo de conexiones
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export default pool;
```

### **Usar en Functions:**

```typescript
import * as functions from 'firebase-functions';
import pool from './config/database';

// Ejemplo: Crear conductor
export const createDriver = functions.https.onCall(async (data, context) => {
  const { userId, licenseNumber, vehicleData } = data;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insertar conductor
    const driverResult = await client.query(
      'INSERT INTO drivers (user_id, license_number) VALUES ($1, $2) RETURNING id',
      [userId, licenseNumber]
    );
    
    const driverId = driverResult.rows[0].id;
    
    // Insertar vehículo
    await client.query(
      'INSERT INTO vehicles (driver_id, plate, brand, model) VALUES ($1, $2, $3, $4)',
      [driverId, vehicleData.plate, vehicleData.brand, vehicleData.model]
    );
    
    await client.query('COMMIT');
    
    return { success: true, driverId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw new functions.https.HttpsError('internal', 'Error creating driver');
  } finally {
    client.release();
  }
});
```

---

## 🔐 Variables de Entorno en Firebase

### **Configurar secrets:**

```bash
# Configurar variables de entorno
firebase functions:secrets:set DB_HOST
firebase functions:secrets:set DB_PORT
firebase functions:secrets:set DB_NAME
firebase functions:secrets:set DB_USER
firebase functions:secrets:set DB_PASSWORD
firebase functions:secrets:set STRIPE_SECRET_KEY
```

### **Usar en código:**

```typescript
import { defineSecret } from 'firebase-functions/params';

const dbHost = defineSecret('DB_HOST');
const dbPassword = defineSecret('DB_PASSWORD');

export const myFunction = functions
  .runWith({ secrets: [dbHost, dbPassword] })
  .https.onCall(async (data, context) => {
    const host = dbHost.value();
    const password = dbPassword.value();
    // ...
  });
```

---

## 💰 Costos Totales Estimados

### **Configuración Recomendada:**

| Servicio | Plan | Costo/Mes |
|----------|------|-----------|
| **Firebase Functions** | Blaze | $0-5 (2M invocaciones gratis) |
| **Firebase Firestore** | - | $0 (10GB gratis) |
| **Firebase Realtime DB** | - | $0 (10GB gratis) |
| **Firebase Auth** | - | $0 (ilimitado) |
| **Google Cloud SQL** | db-f1-micro | $10 |
| **Almacenamiento** | 10GB | $2 |
| **TOTAL** | | **~$12-17/mes** |

### **Alternativa Económica:**

| Servicio | Plan | Costo/Mes |
|----------|------|-----------|
| **Firebase Functions** | Blaze | $0-5 |
| **Firebase Firestore** | - | $0 |
| **Supabase PostgreSQL** | Free | $0 |
| **TOTAL** | | **~$0-5/mes** |

---

## 🚀 Ventajas de esta Arquitectura

### **✅ Ventajas:**

1. **Serverless:** No mantienes servidor
2. **Escalable:** Escala automáticamente
3. **Económico:** Solo pagas por uso
4. **Integrado:** Todo en el ecosistema de Google/Firebase
5. **Backups:** Automáticos en Cloud SQL
6. **Seguro:** Conexiones encriptadas
7. **Rápido:** Baja latencia
8. **Fácil deploy:** `firebase deploy`

### **❌ Consideraciones:**

1. **Cold Start:** Primera invocación puede ser lenta (~1-2 seg)
2. **Límites:** Timeout de 60 segundos (540 seg en plan premium)
3. **Vendor Lock-in:** Dependes de Firebase/Google
4. **Debugging:** Más complejo que servidor tradicional

---

## 📊 Comparación Final

| Aspecto | NestJS + VPS | **Firebase + Cloud SQL** |
|---------|--------------|--------------------------|
| **Costo** | $5-20/mes | **$12-17/mes** ✅ |
| **Mantenimiento** | Alto | **Bajo** ✅ |
| **Escalabilidad** | Manual | **Automática** ✅ |
| **Deploy** | Complejo | **Fácil** ✅ |
| **Backups** | Manual | **Automático** ✅ |
| **Monitoring** | Manual | **Incluido** ✅ |
| **Cold Start** | No | Sí (~1-2 seg) |
| **Control** | Total | Limitado |

---

## 🎯 Recomendación Final

**Para DriveAngel.ni, te recomiendo:**

### **Fase 1: MVP (Gratis)**
- ✅ Firebase Functions (Blaze plan)
- ✅ Firebase Firestore
- ✅ **Supabase PostgreSQL (Free)**
- **Costo: $0-5/mes**

### **Fase 2: Producción (Cuando tengas usuarios)**
- ✅ Firebase Functions (Blaze plan)
- ✅ Firebase Firestore
- ✅ **Google Cloud SQL (db-f1-micro)**
- **Costo: $12-17/mes**

### **Fase 3: Escala (Cuando crezcas)**
- ✅ Firebase Functions (más recursos)
- ✅ Firebase Firestore
- ✅ **Google Cloud SQL (db-g1-small)**
- **Costo: $30-50/mes**

---

## ✅ Próximos Pasos

1. ✅ Crear proyecto en Firebase Console
2. ✅ Habilitar plan Blaze
3. ✅ Crear base de datos PostgreSQL (Supabase o Cloud SQL)
4. ✅ Instalar Firebase CLI
5. ✅ Inicializar Functions
6. ✅ Configurar conexión a PostgreSQL
7. ✅ Migrar código de NestJS a Functions
8. ✅ Deploy

---

**¿Quieres que empiece a migrar tu backend de NestJS a Firebase Functions?** 🔥
