# 🚀 PLAN DE UPGRADE DE INFRAESTRUCTURA
## DriveAngel.ni - Optimizado para 3000 usuarios simultáneos con presupuesto de $200/mes

---

## 📊 ARQUITECTURA OBJETIVO

```
App móvil (React Native / Expo)
        ↓
Firebase Auth (login seguro)
        ↓
API Gateway (Google Cloud Endpoints)
        ↓
Cloud Functions 2nd Gen (API layer)
        ↓
├── Firestore / Realtime DB (datos vivos)
└── Supabase PostgreSQL (datos persistentes)
        ↓
Redis Cache (Upstash)
        ↓
Firebase Performance + Google Monitoring + Sentry
```

---

## 💰 PRESUPUESTO DETALLADO ($200/mes)

### **Cloud Functions 2nd Gen: $60-80/mes**
- 3 min instances × 16 horas × 30 días = 1,440 instance-hours
- Costo min instances: ~$35-45/mes
- Invocaciones (30M/mes): ~$25-35/mes
- **Capacidad:** 10,000 requests simultáneos

### **Firebase Services: $45-65/mes**
- **Firestore:** $25-35/mes
  - 10GB almacenamiento
  - 50M lecturas/mes
  - 10M escrituras/mes
- **Realtime Database:** $20-30/mes
  - 1GB almacenamiento
  - Bandwidth para tracking en tiempo real
- **Auth:** $0 (gratis ilimitado)
- **Performance Monitoring:** $0 (gratis)

### **Supabase PostgreSQL Pro: $25/mes**
- 8GB base de datos
- 50GB bandwidth
- 500K API requests/día
- Connection pooling (crítico para 3000 usuarios)
- Backups automáticos diarios

### **Redis Cache (Upstash): $10-15/mes**
- Pay-as-you-go
- ~50M comandos/mes
- Latencia < 1ms
- **Reduce 80% de queries a Supabase**

### **Otros Servicios: $20-35/mes**
- **Google Cloud Monitoring:** $5-10/mes
- **API Gateway:** $10-15/mes (rate limiting, DDoS protection)
- **Sentry:** $0 (free tier: 5K errores/mes)
- **Cloud Storage:** $5-10/mes (fotos de vehículos, perfiles)

### **TOTAL: $160-195/mes**
### **MARGEN DE SEGURIDAD: $5-40/mes**

---

## 🎯 PLAN DE IMPLEMENTACIÓN GRADUAL

### **FASE 1: CLOUD FUNCTIONS 2ND GEN + MONITORING** ⚡
**Duración:** 3-4 horas  
**Prioridad:** 🔥 CRÍTICA  
**Impacto:** Capacidad de 1,000 → 10,000 requests simultáneos

#### **Tareas:**

1. **Actualizar dependencias**
   - ✅ `firebase-functions` v4.9.0 → v5.1.1
   - ✅ Crear configuraciones optimizadas
   - ✅ Instalar dependencias

2. **Migrar 28 funciones a 2nd Gen**
   
   **High Demand (3 min instances, 100 concurrency):**
   - `requestRide` - Solicitar viaje
   - `acceptRide` - Aceptar viaje
   - `startRide` - Iniciar viaje
   - `saveRideLocation` - Guardar ubicación
   - `getAvailableRides` - Obtener viajes disponibles
   - `updateDriverLocation` - Actualizar ubicación conductor
   
   **Medium Demand (2 min instances, 80 concurrency):**
   - `completeRide` - Completar viaje
   - `cancelRide` - Cancelar viaje
   - `createPaymentIntent` - Crear intención de pago
   - `capturePayment` - Capturar pago
   - `register` - Registro de usuarios
   - `login` - Login
   
   **Low Demand (0 min instances, 50 concurrency):**
   - `getRideDetails` - Detalles de viaje
   - `getUserProfile` - Perfil de usuario
   - `updateUserProfile` - Actualizar perfil
   - `getDriverProfile` - Perfil de conductor
   - `updateDriverStatus` - Actualizar estado conductor
   - `getPaymentDetails` - Detalles de pago
   - `cancelPaymentAuthorization` - Cancelar autorización
   
   **Webhooks (1 min instance, 100 concurrency):**
   - `stripeWebhookHandler` - Webhook de Stripe
   
   **Triggers (1 min instance, 50 concurrency):**
   - `onUserCreated` - Al crear usuario
   - `onUserDeleted` - Al eliminar usuario
   - `onRideStatusChanged` - Al cambiar estado de viaje
   - `onRideCreated` - Al crear viaje
   - `onPaymentCompleted` - Al completar pago
   
   **Scheduled (0 min instances, 1 concurrency):**
   - `cleanupOldRides` - Limpieza de viajes antiguos
   
   **Health Check (0 min instances, 10 concurrency):**
   - `healthCheck` - Verificación de salud

3. **Implementar Firebase Performance Monitoring**
   - Instalar SDK en Frontend
   - Configurar métricas automáticas
   - Crear dashboards personalizados
   - Alertas de performance

4. **Integrar Sentry**
   - Crear cuenta en Sentry.io
   - Instalar SDK en Frontend y Backend
   - Configurar source maps
   - Alertas de errores críticos

5. **Optimizar cold starts**
   - Implementar global initialization
   - Reutilizar conexiones de DB
   - Lazy loading de dependencias

#### **Archivos a crear/modificar:**
```
functions/
├── package.json (actualizar firebase-functions)
├── src/
│   ├── config/
│   │   └── functions-config.ts (✅ CREADO)
│   ├── api/v2/
│   │   ├── auth.ts (migrar a 2nd Gen)
│   │   ├── rides.ts (migrar a 2nd Gen)
│   │   ├── tracking.ts (migrar a 2nd Gen)
│   │   ├── payments.ts (migrar a 2nd Gen)
│   │   └── drivers.ts (migrar a 2nd Gen)
│   └── index.ts (actualizar exports)

Frontend/
├── package.json (agregar @sentry/react-native)
├── src/
│   ├── config/
│   │   └── performance.ts (nuevo)
│   └── App.tsx (integrar Sentry)
```

#### **Comandos:**
```bash
# Backend
cd functions
npm install firebase-functions@5.1.1
npm run build
firebase deploy --only functions

# Frontend
cd Frontend
npm install @sentry/react-native firebase/performance
npx @sentry/wizard -i reactNative
```

#### **Resultado esperado:**
- ✅ 28 funciones desplegadas en 2nd Gen
- ✅ Capacidad: 10,000 requests simultáneos
- ✅ Cold starts reducidos 80%
- ✅ Monitoring activo en Firebase Console
- ✅ Error tracking en Sentry

---

### **FASE 2: REDIS CACHE (UPSTASH)** 🚀
**Duración:** 2-3 horas  
**Prioridad:** 🔥 ALTA  
**Impacto:** Reduce latencia 80% (500ms → 10ms)

#### **Tareas:**

1. **Crear cuenta en Upstash**
   - Ir a https://upstash.com
   - Crear base de datos Redis (región: us-east-1)
   - Obtener credenciales (URL, token)

2. **Instalar cliente Redis**
   ```bash
   cd functions
   npm install @upstash/redis
   ```

3. **Implementar capa de cache**
   
   **Datos a cachear:**
   - **Ubicaciones de conductores activos** (TTL: 10s)
     - Key: `driver:location:{driverId}`
     - Reduce queries a Realtime DB
   
   - **Viajes disponibles** (TTL: 5s)
     - Key: `rides:available`
     - Lista de viajes sin conductor
   
   - **Perfiles de usuarios** (TTL: 5min)
     - Key: `user:profile:{userId}`
     - Reduce queries a Firestore
   
   - **ETAs calculados** (TTL: 30s)
     - Key: `ride:eta:{rideId}`
     - Evita recalcular rutas constantemente
   
   - **Precios estimados** (TTL: 1min)
     - Key: `price:estimate:{origin}:{destination}`
     - Cache de cálculos de precio

4. **Crear servicio de cache**
   ```typescript
   // functions/src/services/cache.service.ts
   import { Redis } from '@upstash/redis';
   
   const redis = new Redis({
     url: process.env.UPSTASH_REDIS_URL,
     token: process.env.UPSTASH_REDIS_TOKEN,
   });
   
   export const cacheService = {
     async get(key: string) { ... },
     async set(key: string, value: any, ttl: number) { ... },
     async del(key: string) { ... },
     async invalidatePattern(pattern: string) { ... }
   };
   ```

5. **Integrar cache en funciones críticas**
   - `getAvailableRides` - Cachear lista de viajes
   - `getDriverProfile` - Cachear perfil de conductor
   - `getUserProfile` - Cachear perfil de usuario
   - `updateDriverLocation` - Cachear ubicación

#### **Archivos a crear:**
```
functions/
├── .env (agregar UPSTASH_REDIS_URL y TOKEN)
├── src/
│   ├── services/
│   │   └── cache.service.ts (nuevo)
│   └── api/v2/
│       └── (actualizar funciones con cache)
```

#### **Resultado esperado:**
- ✅ Cache activo en Upstash
- ✅ Latencia reducida de 500ms a 10-20ms
- ✅ 80% menos queries a Supabase
- ✅ Ahorro de ~$10-15/mes en Supabase

---

### **FASE 3: API GATEWAY (GOOGLE CLOUD ENDPOINTS)** 🛡️
**Duración:** 3-4 horas  
**Prioridad:** 🟡 MEDIA  
**Impacto:** Seguridad, rate limiting, DDoS protection

#### **Tareas:**

1. **Habilitar Cloud Endpoints API**
   ```bash
   gcloud services enable endpoints.googleapis.com
   gcloud services enable servicemanagement.googleapis.com
   gcloud services enable servicecontrol.googleapis.com
   ```

2. **Crear configuración OpenAPI**
   ```yaml
   # openapi.yaml
   swagger: "2.0"
   info:
     title: "DriveAngel API"
     version: "1.0.0"
   host: "driveangel-ni.endpoints.driveangel-ni.cloud.goog"
   schemes:
     - "https"
   paths:
     /api/rides/request:
       post:
         operationId: "requestRide"
         x-google-quota:
           metricCosts:
             "rides-requests": 1
   ```

3. **Configurar rate limiting**
   
   **Límites por endpoint:**
   - Auth (login/register): 10 requests/min por IP
   - Rides: 100 requests/min por usuario
   - Tracking: 300 requests/min por conductor
   - Payments: 20 requests/min por usuario
   - General: 60 requests/min por usuario

4. **Implementar API Keys**
   - Generar API Key para app móvil
   - Configurar restricciones (solo desde app)
   - Rotar keys cada 90 días

5. **Configurar CORS**
   - Permitir solo dominios autorizados
   - Headers permitidos: Authorization, Content-Type
   - Métodos: GET, POST, PUT, DELETE

#### **Archivos a crear:**
```
api-gateway/
├── openapi.yaml (configuración API)
├── quota.yaml (límites de rate)
└── deploy.sh (script de despliegue)

Frontend/
└── src/config/api.ts (agregar API Key)
```

#### **Comandos:**
```bash
# Desplegar API Gateway
gcloud endpoints services deploy openapi.yaml
gcloud endpoints services add-iam-policy-binding driveangel-ni.endpoints.driveangel-ni.cloud.goog \
  --member="allUsers" \
  --role="roles/servicemanagement.serviceConsumer"
```

#### **Resultado esperado:**
- ✅ API Gateway activo
- ✅ Rate limiting funcionando
- ✅ Protección contra DDoS
- ✅ API Keys configuradas
- ✅ Logs centralizados

---

### **FASE 4: OPTIMIZACIONES FINALES** ⚡
**Duración:** 2-3 horas  
**Prioridad:** 🟢 BAJA  
**Impacto:** Mejoras incrementales 10-20%

#### **Tareas:**

1. **Optimizar índices en Supabase**
   ```sql
   -- Índices para rides
   CREATE INDEX idx_rides_status_created ON rides(status, created_at DESC);
   CREATE INDEX idx_rides_driver_status ON rides(driver_id, status);
   CREATE INDEX idx_rides_client_status ON rides(client_id, status);
   
   -- Índices para ride_locations
   CREATE INDEX idx_ride_locations_ride_timestamp ON ride_locations(ride_id, timestamp DESC);
   
   -- Índices para drivers
   CREATE INDEX idx_drivers_status ON drivers(status) WHERE status = 'available';
   ```

2. **Implementar connection pooling**
   ```typescript
   // functions/src/config/database.ts
   const pool = new Pool({
     max: 20, // Máximo 20 conexiones
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

3. **Batch operations**
   - Agrupar múltiples updates de ubicación
   - Batch writes en Firestore
   - Bulk inserts en PostgreSQL

4. **Lazy loading en Frontend**
   - Code splitting por pantalla
   - Lazy load de imágenes
   - Preload de rutas críticas

5. **Implementar CDN para assets**
   - Mover imágenes estáticas a Cloud Storage
   - Configurar CDN de Google Cloud
   - Comprimir imágenes automáticamente

#### **Resultado esperado:**
- ✅ Queries 20% más rápidas
- ✅ Menos conexiones a DB
- ✅ App más ligera (bundle size -30%)
- ✅ Assets cargando desde CDN

---

## 📈 CAPACIDAD FINAL

### **Con toda la infraestructura implementada:**

```
✅ 3,000 usuarios simultáneos (16 horas/día)
✅ 10,000 requests simultáneos (picos)
✅ 600 requests/segundo sostenidos
✅ 100,000 viajes/mes
✅ 500GB datos almacenados
✅ 1TB bandwidth/mes
✅ 99.9% uptime
✅ Latencia promedio: 50-100ms
✅ Latencia con cache: 10-20ms
```

---

## 🎯 MÉTRICAS DE ÉXITO

### **Performance:**
- ✅ Latencia API < 100ms (p95)
- ✅ Latencia con cache < 20ms (p95)
- ✅ Cold start < 500ms
- ✅ Uptime > 99.9%

### **Costos:**
- ✅ Total mensual < $200
- ✅ Costo por usuario activo < $0.07
- ✅ Costo por viaje < $0.002

### **Seguridad:**
- ✅ Rate limiting activo
- ✅ API Keys rotadas cada 90 días
- ✅ 0 errores críticos sin detectar (Sentry)
- ✅ Logs de auditoría completos

---

## 📅 CRONOGRAMA

### **Semana 1: FASE 1**
- Día 1-2: Migrar a Cloud Functions 2nd Gen
- Día 3: Implementar Firebase Performance
- Día 4: Integrar Sentry
- Día 5: Testing y optimización

### **Semana 2: FASE 2**
- Día 1: Configurar Upstash Redis
- Día 2-3: Implementar capa de cache
- Día 4: Integrar cache en funciones
- Día 5: Testing y medición de performance

### **Semana 3: FASE 3**
- Día 1-2: Configurar API Gateway
- Día 3: Implementar rate limiting
- Día 4: Configurar API Keys
- Día 5: Testing de seguridad

### **Semana 4: FASE 4**
- Día 1: Optimizar índices
- Día 2: Connection pooling
- Día 3: Batch operations
- Día 4: Lazy loading
- Día 5: Testing final y documentación

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### **FASE 1: Cloud Functions 2nd Gen**
- [ ] Actualizar `firebase-functions` a v5.1.1
- [ ] Crear `functions-config.ts` con configuraciones
- [ ] Migrar 28 funciones a 2nd Gen
- [ ] Implementar Firebase Performance Monitoring
- [ ] Integrar Sentry
- [ ] Optimizar cold starts
- [ ] Desplegar y verificar
- [ ] Monitorear métricas por 24 horas

### **FASE 2: Redis Cache**
- [ ] Crear cuenta en Upstash
- [ ] Instalar `@upstash/redis`
- [ ] Crear `cache.service.ts`
- [ ] Integrar cache en funciones críticas
- [ ] Configurar TTLs apropiados
- [ ] Testing de invalidación de cache
- [ ] Monitorear hit rate (objetivo: >80%)

### **FASE 3: API Gateway**
- [ ] Habilitar Cloud Endpoints API
- [ ] Crear `openapi.yaml`
- [ ] Configurar rate limiting
- [ ] Generar API Keys
- [ ] Configurar CORS
- [ ] Desplegar API Gateway
- [ ] Actualizar Frontend con API Key
- [ ] Testing de rate limits

### **FASE 4: Optimizaciones**
- [ ] Crear índices en Supabase
- [ ] Implementar connection pooling
- [ ] Batch operations
- [ ] Lazy loading en Frontend
- [ ] Configurar CDN
- [ ] Testing de performance
- [ ] Documentación final

---

## 🚨 ROLLBACK PLAN

Si algo sale mal en cualquier fase:

1. **Cloud Functions:**
   - Mantener versiones 1st Gen activas durante 1 semana
   - Rollback con: `firebase deploy --only functions --force`

2. **Redis Cache:**
   - Cache es opcional, desactivar si hay problemas
   - Funciones funcionan sin cache (solo más lentas)

3. **API Gateway:**
   - Mantener acceso directo a Cloud Functions
   - Cambiar URLs en Frontend si es necesario

---

## 📞 SOPORTE

**Documentación:**
- Firebase Functions 2nd Gen: https://firebase.google.com/docs/functions/2nd-gen
- Upstash Redis: https://docs.upstash.com/redis
- Google Cloud Endpoints: https://cloud.google.com/endpoints/docs
- Sentry: https://docs.sentry.io/platforms/react-native/

**Monitoreo:**
- Firebase Console: https://console.firebase.google.com/project/driveangel-ni
- Sentry Dashboard: https://sentry.io
- Upstash Console: https://console.upstash.com
- Google Cloud Console: https://console.cloud.google.com

---

## 🎉 RESULTADO FINAL

Al completar todas las fases, tendrás:

✅ **Infraestructura de clase mundial** comparable a Uber/Lyft
✅ **Capacidad para 3000 usuarios simultáneos** con margen de crecimiento
✅ **Latencia ultra-baja** (10-20ms con cache)
✅ **Seguridad robusta** (rate limiting, API Gateway, DDoS protection)
✅ **Monitoreo completo** (Firebase Performance + Sentry + Google Monitoring)
✅ **Costos optimizados** ($160-195/mes, dentro de presupuesto)
✅ **99.9% uptime** con auto-scaling
✅ **Preparado para producción** y lanzamiento público

---

**Fecha de creación:** 2025-10-12  
**Última actualización:** 2025-10-12  
**Versión:** 1.0  
**Estado:** ✅ LISTO PARA IMPLEMENTAR
