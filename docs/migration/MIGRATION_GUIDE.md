# 🚀 Guía de Migración: NestJS → Firebase Functions

## 📋 Estado Actual

### ✅ Completado:
- [x] Firebase Functions inicializado
- [x] Estructura de carpetas creada
- [x] Conexión a Supabase PostgreSQL configurada
- [x] Auth API implementado (register, login, logout)
- [x] Archivos stub creados para otros módulos

### ⏳ Pendiente:
- [ ] Migrar Rides API
- [ ] Migrar Drivers API
- [ ] Migrar Payments API
- [ ] Migrar Users API
- [ ] Migrar Triggers
- [ ] Migrar Webhooks
- [ ] Configurar secrets en Firebase
- [ ] Deploy a Firebase

---

## 🗂️ Estructura Creada

```
functions/
├── src/
│   ├── index.ts              ✅ Punto de entrada
│   ├── config/
│   │   ├── firebase.ts       ✅ Configuración Firebase
│   │   └── database.ts       ✅ Conexión PostgreSQL
│   ├── api/
│   │   ├── auth.ts           ✅ Implementado
│   │   ├── rides.ts          ⏳ Stub
│   │   ├── drivers.ts        ⏳ Stub
│   │   ├── payments.ts       ⏳ Stub
│   │   └── users.ts          ⏳ Stub
│   ├── triggers/
│   │   ├── auth.ts           ✅ Básico
│   │   ├── rides.ts          ⏳ Stub
│   │   └── payments.ts       ⏳ Stub
│   └── webhooks/
│       └── stripe.ts         ⏳ Stub
├── package.json              ✅
├── tsconfig.json             ✅
└── .eslintrc.js              ✅
```

---

## 🔄 Proceso de Migración

### **Paso 1: Configurar Supabase** ⏳

1. **Obtener password de la base de datos:**
   - Ir a: https://supabase.com/dashboard/project/ceytngpresytjhafcadu
   - Settings → Database
   - Copiar password de "Connection string"

2. **Crear tablas en Supabase:**
   - Ir al SQL Editor
   - Ejecutar el SQL de `SUPABASE_CONFIG.md`

3. **Configurar password en Firebase:**
   ```bash
   cd functions
   firebase functions:secrets:set SUPABASE_DB_PASSWORD
   # Pegar tu password
   ```

---

### **Paso 2: Migrar Código de NestJS** ⏳

#### **Ejemplo: Migrar RidesService**

**Antes (NestJS):**
```typescript
// Backend/src/rides/rides.service.ts
@Injectable()
export class RidesService {
  async requestRide(dto: RequestRideDto) {
    const ride = await this.rideRepository.save({
      ...dto,
      status: 'requested'
    });
    return ride;
  }
}
```

**Después (Firebase Functions):**
```typescript
// functions/src/api/rides.ts
export const requestRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "No autenticado");
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO rides (client_id, origin_lat, origin_lng, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [context.auth.uid, data.originLat, data.originLng, 'requested']
    );
    
    return { success: true, ride: result.rows[0] };
  } finally {
    client.release();
  }
});
```

---

### **Paso 3: Actualizar Frontend** ⏳

**Antes (con NestJS):**
```typescript
const response = await axios.post(
  `${API_BASE_URL}/api/rides/request`,
  rideData
);
```

**Después (con Firebase Functions):**
```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const requestRide = httpsCallable(functions, 'requestRide');

const result = await requestRide(rideData);
```

---

## 📦 Comandos Útiles

### **Desarrollo Local:**

```bash
# Instalar dependencias
cd functions
npm install

# Compilar TypeScript
npm run build

# Iniciar emuladores
firebase emulators:start

# Ver logs
firebase functions:log
```

### **Deploy:**

```bash
# Deploy todas las functions
firebase deploy --only functions

# Deploy una function específica
firebase deploy --only functions:register

# Ver estado
firebase functions:list
```

---

## 🔐 Configurar Secrets

```bash
# Supabase
firebase functions:secrets:set SUPABASE_DB_PASSWORD

# Stripe
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET

# MapBox
firebase functions:secrets:set MAPBOX_TOKEN
```

---

## 🧪 Testing

### **Probar localmente:**

```bash
# Iniciar emuladores
firebase emulators:start

# Las functions estarán en:
http://localhost:5001/driveangel-ni/us-central1/register
http://localhost:5001/driveangel-ni/us-central1/requestRide
```

### **Probar con curl:**

```bash
# Health check
curl http://localhost:5001/driveangel-ni/us-central1/healthCheck

# Register (requiere auth)
curl -X POST http://localhost:5001/driveangel-ni/us-central1/register \
  -H "Content-Type: application/json" \
  -d '{"data": {"email": "test@test.com", "password": "123456", "name": "Test", "role": "client"}}'
```

---

## 📊 Comparación de Código

### **NestJS vs Firebase Functions**

| Aspecto | NestJS | Firebase Functions |
|---------|--------|-------------------|
| **Decoradores** | `@Get()`, `@Post()` | `functions.https.onCall()` |
| **DI** | `@Injectable()` | Imports directos |
| **Auth** | Guards | `context.auth` |
| **DB** | TypeORM | pg (raw SQL) |
| **Validación** | class-validator | Manual |
| **Errores** | Exceptions | `HttpsError` |

---

## 🎯 Prioridades de Migración

### **Alta Prioridad:**
1. ✅ Auth (register, login) - COMPLETADO
2. ⏳ Rides (request, accept, complete)
3. ⏳ Payments (Stripe integration)
4. ⏳ Drivers (register, location)

### **Media Prioridad:**
5. ⏳ Triggers (notifications)
6. ⏳ Webhooks (Stripe)
7. ⏳ Users (profile)

### **Baja Prioridad:**
8. ⏳ Analytics
9. ⏳ Reports
10. ⏳ Admin panel

---

## 💡 Tips de Migración

### **1. Usar Transactions:**
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Múltiples queries
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### **2. Manejo de Errores:**
```typescript
try {
  // Tu código
} catch (error: any) {
  console.error("Error:", error);
  throw new functions.https.HttpsError(
    "internal",
    error.message
  );
}
```

### **3. Validaciones:**
```typescript
if (!data.email || !data.password) {
  throw new functions.https.HttpsError(
    "invalid-argument",
    "Faltan campos requeridos"
  );
}
```

### **4. Auth:**
```typescript
if (!context.auth) {
  throw new functions.https.HttpsError(
    "unauthenticated",
    "Usuario no autenticado"
  );
}

const userId = context.auth.uid;
```

---

## 🚀 Próximos Pasos

1. **Configurar Supabase:**
   - Obtener password
   - Crear tablas
   - Configurar secrets

2. **Migrar Rides API:**
   - requestRide
   - acceptRide
   - completeRide
   - cancelRide

3. **Migrar Payments API:**
   - createPaymentIntent
   - capturePayment
   - Webhook de Stripe

4. **Actualizar Frontend:**
   - Cambiar axios por Firebase SDK
   - Actualizar llamadas a API

5. **Testing:**
   - Probar localmente
   - Probar en producción

6. **Deploy:**
   - Deploy a Firebase
   - Actualizar frontend

---

## 📚 Recursos

- **Firebase Functions Docs:** https://firebase.google.com/docs/functions
- **Supabase Docs:** https://supabase.com/docs
- **pg (PostgreSQL):** https://node-postgres.com

---

**¿Listo para migrar?** 🚀

**Siguiente paso:** Configurar Supabase y migrar Rides API
