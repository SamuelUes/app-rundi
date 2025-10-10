# 🏗️ Arquitectura del Sistema - App Uber

## 📐 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React Native)                 │
│  - Expo                                                      │
│  - React Navigation                                          │
│  - Socket.io Client (tracking en tiempo real)               │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP/REST + WebSockets
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (NestJS)                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Middlewares (Logger, Rate Limit, Firebase Auth)    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Auth    │  │  Users   │  │ Drivers  │  │  Rides   │  │
│  │  Module  │  │  Module  │  │  Module  │  │  Module  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Payments │  │ Tracking │  │  Notify  │  │ Storage  │  │
│  │  Module  │  │ Gateway  │  │  Module  │  │  Module  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└──────┬──────────────┬──────────────┬──────────────┬────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│ PostgreSQL│  │  Redis   │  │ Firebase │  │    Stripe    │
│  (TypeORM)│  │  (Cache) │  │ (Auth,   │  │   (Pagos)    │
│           │  │          │  │  FCM,    │  │              │
│           │  │          │  │  Storage)│  │              │
└───────────┘  └──────────┘  └──────────┘  └──────────────┘
```

## 🗂️ Modelo de Datos

### Relaciones Entre Entidades

```
User (1) ←→ (0..1) Driver
User (1) → (N) Ride (como cliente)
User (1) → (N) Ride (como conductor)
User (1) → (N) Rating (dados)
User (1) → (N) Rating (recibidos)

Driver (1) → (N) Vehicle
Driver (1) → (N) Ride

Ride (1) ←→ (1) Payment
Ride (1) → (N) Rating
```

### Diagrama ER

```
┌──────────────┐
│     User     │
├──────────────┤
│ id (PK)      │──┐
│ firebaseUid  │  │
│ email        │  │ 1
│ name         │  │
│ role         │  │
│ status       │  │
│ rating       │  │
└──────────────┘  │
                  │
                  │ 0..1
                  ▼
            ┌──────────────┐
            │    Driver    │
            ├──────────────┤
            │ id (PK)      │──┐
            │ userId (FK)  │  │
            │ license      │  │ 1
            │ status       │  │
            │ currentLat   │  │
            │ currentLng   │  │
            │ totalTrips   │  │
            │ totalEarnings│  │
            └──────────────┘  │
                              │ N
                              ▼
                        ┌──────────────┐
                        │   Vehicle    │
                        ├──────────────┤
                        │ id (PK)      │
                        │ driverId (FK)│
                        │ plate        │
                        │ brand        │
                        │ model        │
                        │ type         │
                        └──────────────┘

┌──────────────┐         ┌──────────────┐
│     User     │         │    Driver    │
│  (Cliente)   │         │              │
└──────┬───────┘         └──────┬───────┘
       │ 1                      │ 1
       │                        │
       │ N                      │ N
       ▼                        │
┌──────────────┐                │
│     Ride     │◄───────────────┘
├──────────────┤
│ id (PK)      │
│ clientId (FK)│
│ driverId (FK)│
│ origin       │
│ destination  │
│ status       │
│ estimatedFare│
│ finalFare    │
│ surgeMulti..│
└──────┬───────┘
       │ 1
       │
       │ 1
       ▼
┌──────────────┐         ┌──────────────┐
│   Payment    │         │    Rating    │
├──────────────┤         ├──────────────┤
│ id (PK)      │         │ id (PK)      │
│ rideId (FK)  │         │ rideId (FK)  │
│ amount       │         │ ratedById    │
│ method       │         │ ratedUserId  │
│ status       │         │ score (1-5)  │
│ stripeId     │         │ comment      │
└──────────────┘         └──────────────┘
```

## 🔄 Flujo de un Viaje (Ride Flow)

```
1. Cliente solicita viaje
   ↓
2. Backend calcula tarifa estimada
   ↓
3. Backend busca conductores disponibles cercanos
   ↓
4. Backend asigna conductor más cercano
   ↓
5. Conductor recibe notificación push (FCM)
   ↓
6. Conductor acepta viaje
   ↓
7. Cliente recibe datos del conductor
   ↓
8. Tracking en tiempo real (WebSockets)
   ├─ Conductor envía ubicación cada 5s
   └─ Cliente ve ubicación del conductor en mapa
   ↓
9. Conductor llega al origen
   ↓
10. Conductor inicia viaje
   ↓
11. Tracking durante el viaje
   ↓
12. Conductor completa viaje
   ↓
13. Backend procesa pago (Stripe/Cash)
   ↓
14. Ambos califican (Rating)
   ↓
15. Viaje finalizado
```

## 🔐 Sistema de Autenticación

### Firebase Auth + JWT

```
Mobile App
   │
   │ 1. Login (email/password o Google)
   ▼
Firebase Auth
   │
   │ 2. Retorna ID Token (JWT)
   ▼
Mobile App
   │
   │ 3. Envía request con header:
   │    Authorization: Bearer <firebase-token>
   ▼
Backend Middleware (FirebaseAuthMiddleware)
   │
   │ 4. Verifica token con Firebase Admin SDK
   ▼
   ├─ ✅ Token válido → req.user = decoded
   │                    → Next()
   │
   └─ ❌ Token inválido → 401 Unauthorized
```

### Roles y Permisos

```typescript
enum UserRole {
  CLIENT = 'client',    // Puede solicitar viajes
  DRIVER = 'driver',    // Puede aceptar viajes
  ADMIN = 'admin',      // Acceso total
}
```

**Ejemplo de protección:**
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DRIVER)
@Get('earnings')
getEarnings() { ... }  // Solo conductores pueden ver ganancias
```

## 📍 Sistema de Tracking en Tiempo Real

### WebSockets con Socket.io

```
Backend (NestJS Gateway)
Namespace: /tracking

Eventos:

Client → Server:
├─ location:update
│  { driverId, lat, lng }
│
Server → Clients:
└─ location:driver
   { driverId, lat, lng, timestamp }

Flujo:
1. Conductor envía su ubicación cada 5 segundos
2. Backend valida y retransmite a clientes interesados
3. Cliente actualiza pin del conductor en el mapa
```

### Redis para Caché de Ubicaciones

```typescript
// Guardar ubicación del conductor en Redis (expire en 30s)
await redis.setex(
  `driver:location:${driverId}`,
  30,
  JSON.stringify({ lat, lng, timestamp })
);

// Buscar conductores cercanos (usando geospatial de Redis)
await redis.georadius(
  'drivers:locations',
  clientLng,
  clientLat,
  10, // km
  'km'
);
```

## 💰 Sistema de Tarifas

### Cálculo Dinámico

```typescript
function calculateFare(ride: Ride): number {
  const baseFare = config.BASE_FARE_MXN;  // 25 MXN
  const perKm = config.PER_KM_FARE_MXN;   // 6 MXN/km
  
  // Tarifa base
  let fare = baseFare + (ride.estimatedDistance * perKm);
  
  // Factor de demanda (surge pricing)
  if (isHighDemand()) {
    fare *= config.SURGE_MULTIPLIER; // 1.5x
  }
  
  // Redondear
  return Math.round(fare * 100) / 100;
}
```

### Factores que afectan la tarifa:
- **Distancia**: Calculada con fórmula de Haversine
- **Tiempo estimado**: Basado en distancia / velocidad promedio
- **Hora pico**: Mañana (7-9am), Tarde (5-7pm)
- **Demanda**: Más solicitudes que conductores disponibles
- **Clima**: (Futuro) Lluvia/tráfico aumenta tarifa

## 💳 Integración de Pagos

### Stripe Payment Flow

```
1. Cliente selecciona método de pago
   ↓
2. Backend crea Payment Intent en Stripe
   POST /api/payments/intent
   {
     amount: 150.50,
     currency: 'mxn'
   }
   ↓
3. Stripe retorna client_secret
   ↓
4. Frontend confirma pago con Stripe SDK
   ↓
5. Stripe procesa pago
   ↓
6. Stripe envía webhook a Backend
   POST /api/payments/webhook
   ↓
7. Backend verifica firma y actualiza Payment entity
   ↓
8. Backend marca Ride como paid
```

### Métodos de Pago Soportados

```typescript
enum PaymentMethod {
  CASH = 'cash',      // Efectivo al conductor
  CARD = 'card',      // Tarjeta (Stripe)
  WALLET = 'wallet',  // (Futuro) Wallet in-app
}
```

## 🔔 Sistema de Notificaciones

### Firebase Cloud Messaging (FCM)

```typescript
// Guardar token FCM del usuario
user.fcmToken = '<device-fcm-token>';

// Enviar notificación
await messaging.send({
  token: driver.user.fcmToken,
  notification: {
    title: '¡Nuevo viaje disponible!',
    body: 'A 2.5 km de tu ubicación'
  },
  data: {
    rideId: ride.id,
    type: 'NEW_RIDE_REQUEST'
  }
});
```

### Tipos de Notificaciones:
- `NEW_RIDE_REQUEST` → Conductor: Nuevo viaje disponible
- `RIDE_ACCEPTED` → Cliente: Conductor asignado
- `DRIVER_ARRIVED` → Cliente: Conductor llegó
- `RIDE_STARTED` → Cliente: Viaje iniciado
- `RIDE_COMPLETED` → Ambos: Viaje completado
- `PAYMENT_SUCCESS` → Cliente: Pago exitoso

## 🧪 Testing Strategy

### Pirámide de Tests

```
         /\
        /  \
       /E2E \        ← Pocos (5-10%)
      /------\
     /  Integ \      ← Algunos (20-30%)
    /----------\
   /   Unit     \    ← Muchos (60-70%)
  /--------------\
```

**Unit Tests**: Services, Utils, Helpers
**Integration Tests**: Controllers + Services + DB
**E2E Tests**: Flujos completos (request → response)

## 🚀 Deployment Strategy

### Desarrollo Local
```
Docker Compose → Postgres + Redis + Backend
```

### Staging/Producción (Firebase)
```
┌──────────────────────────────────────┐
│      Cloud Run (Backend NestJS)      │
│  - Auto-scaling                      │
│  - HTTPS automático                  │
│  - Logging integrado                 │
└──────────┬───────────────────────────┘
           │
           ├─→ Cloud SQL (PostgreSQL)
           ├─→ Memorystore (Redis)
           ├─→ Firebase Auth
           ├─→ Firebase Storage
           └─→ Cloud Monitoring
```

## 📊 Monitoreo y Observabilidad

### Métricas Clave (KPIs)

**Performance:**
- Tiempo de respuesta promedio (< 200ms)
- Throughput (requests/segundo)
- Error rate (< 1%)

**Business:**
- Viajes completados por hora
- Ingresos por conductor
- Rating promedio
- Tiempo de espera promedio

**Infraestructura:**
- CPU/Memory usage
- Conexiones DB activas
- Redis hit rate

### Logs Estructurados

```typescript
logger.log({
  level: 'info',
  message: 'Ride completed',
  rideId: ride.id,
  duration: ride.completedAt - ride.startedAt,
  fare: ride.finalFare,
  driverId: ride.driverId,
  timestamp: new Date()
});
```

## 🔒 Seguridad

### Capas de Seguridad

1. **Rate Limiting**: 60 requests/min por IP
2. **JWT Validation**: Todos los endpoints protegidos
3. **Input Validation**: DTOs con class-validator
4. **SQL Injection**: TypeORM previene automáticamente
5. **XSS**: NestJS sanitiza inputs
6. **CORS**: Configurado solo para dominios permitidos
7. **HTTPS**: Obligatorio en producción
8. **Secrets**: Variables de entorno, nunca en código

## 📈 Escalabilidad

### Estrategia de Escalado

**Horizontal (más instancias):**
- Cloud Run auto-scale basado en requests
- Load balancer distribuye tráfico

**Vertical (más recursos):**
- Upgrade de DB tier en Cloud SQL
- Más memoria para Redis

**Caché:**
- Redis para ubicaciones de conductores
- Redis para sessiones
- CDN para assets estáticos

**Optimizaciones:**
- Índices en DB (lat/lng para geoqueries)
- Connection pooling
- Query optimization
- Lazy loading de relaciones

---

## 📚 Referencias

- [NestJS Docs](https://docs.nestjs.com/)
- [TypeORM Docs](https://typeorm.io/)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Stripe API](https://stripe.com/docs/api)
- [Socket.io Docs](https://socket.io/docs/v4/)
