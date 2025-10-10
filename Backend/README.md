# App Uber - Backend

Backend profesional para aplicación móvil tipo Uber desarrollado con **NestJS**, **TypeORM**, **PostgreSQL**, **Redis**, **Firebase** y **Stripe**.

## 🏗️ Arquitectura

```
Backend/
├── src/
│   ├── auth/              # Autenticación Firebase
│   ├── users/             # Gestión de usuarios
│   │   └── entities/      # User entity con roles (client/driver/admin)
│   ├── drivers/           # Gestión de conductores
│   │   └── entities/      # Driver y Vehicle entities
│   ├── rides/             # Gestión de viajes
│   │   └── entities/      # Ride y Rating entities
│   ├── payments/          # Pagos con Stripe
│   │   └── entities/      # Payment entity
│   ├── tracking/          # WebSockets (tracking en tiempo real)
│   ├── notifications/     # Firebase Cloud Messaging (FCM)
│   ├── storage/           # Firebase Storage
│   ├── middlewares/       # Auth JWT, Logger, Rate Limiting
│   ├── config/            # Configuración (DB, Redis, Firebase, env validation)
│   └── utils/             # Helpers (geocoding, tarifas, validaciones)
│
├── .env                   # Variables de entorno
├── docker-compose.yml     # Postgres + Redis + Backend
└── dockerfile             # Imagen Docker del backend
```

## 🔑 Características Principales

### ✅ Implementado
- **Autenticación Firebase Admin SDK**: Verificación de tokens JWT
- **TypeORM + PostgreSQL**: ORM robusto con entities relacionadas
- **Validación de ENV**: Validación automática con `class-validator`
- **WebSockets**: Tracking en tiempo real con Socket.io
- **Redis**: Caché y gestión de sesiones
- **Stripe Integration**: Pagos con tarjeta
- **Firebase Cloud Messaging**: Notificaciones push
- **Firebase Storage**: Subida de archivos (fotos, documentos)
- **Rate Limiting**: Protección contra abuso
- **Middlewares**: Logger, Auth, Rate Limit
- **Docker**: Contenedores para desarrollo y producción

### 📦 Entidades de Base de Datos

#### **User** (`users`)
- `id`, `firebaseUid`, `email`, `name`, `phone`, `avatar`
- `role`: client | driver | admin
- `status`: active | inactive | suspended
- `rating`, `totalRides`, `fcmToken`
- **Relaciones**: driverProfile, ridesAsClient, ridesAsDriver, ratings

#### **Driver** (`drivers`)
- `id`, `userId`, `licenseNumber`, `licenseExpiry`, `licensePhoto`
- `status`: offline | available | busy
- `currentLat`, `currentLng`, `lastLocationUpdate`
- `totalTrips`, `totalEarnings`, `rating`, `isVerified`
- **Relaciones**: user, vehicles, rides

#### **Vehicle** (`vehicles`)
- `id`, `driverId`, `plate`, `brand`, `model`, `year`, `color`
- `type`: sedan | suv | van | moto
- `photo`, `isActive`
- **Relaciones**: driver

#### **Ride** (`rides`)
- `id`, `clientId`, `driverId`
- `origin`: lat, lng, address
- `destination`: lat, lng, address
- `estimatedDistance`, `estimatedDuration`, `estimatedFare`, `finalFare`
- `surgeMultiplier`
- `status`: requested | accepted | driver_arrived | in_progress | completed | canceled
- `cancelReason`, timestamps
- **Relaciones**: client, driver, payment, ratings

#### **Payment** (`payments`)
- `id`, `rideId`, `amount`
- `method`: cash | card | wallet
- `status`: pending | processing | completed | failed | refunded
- `stripePaymentIntentId`, `stripeChargeId`, `transactionId`
- **Relaciones**: ride

#### **Rating** (`ratings`)
- `id`, `rideId`, `ratedById`, `ratedUserId`
- `score` (1-5), `comment`
- **Relaciones**: ride, ratedBy, ratedUser

## 🚀 Setup Local

### 1. Prerrequisitos
- Node.js 20+
- PostgreSQL 15+ (o Docker)
- Redis 7+ (o Docker)
- Cuenta Firebase (para Auth, FCM, Storage)
- Cuenta Stripe (para pagos)

### 2. Instalación

```bash
# Clonar el repositorio
cd Backend

# Instalar dependencias
npm install
```

### 3. Configuración de Variables de Entorno

Copia `.env.example` a `.env` y configura:

```env
# Server
NODE_ENV=development
PORT=3000

# Database (Postgres)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=app_uber

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Firebase
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
FIREBASE_PROJECT_ID=tu-proyecto-firebase
FIREBASE_STORAGE_BUCKET=tu-proyecto-firebase.appspot.com

# Stripe
STRIPE_SECRET_KEY=sk_test_tu_clave_secreta
STRIPE_WEBHOOK_SECRET=whsec_tu_webhook_secret

# JWT (opcional)
JWT_SECRET=tu-super-secreto-cambiar-en-produccion
JWT_EXPIRES_IN=7d

# App Config
BASE_FARE_MXN=25
PER_KM_FARE_MXN=6
MAX_DRIVER_DISTANCE_KM=10
SURGE_MULTIPLIER=1.5
```

### 4. Configurar Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un proyecto nuevo
3. Descarga el archivo de credenciales:
   - Ve a **Configuración del proyecto** > **Cuentas de servicio**
   - Click en **Generar nueva clave privada**
   - Guarda el JSON como `firebase-service-account.json` en la raíz del Backend
4. Habilita:
   - **Authentication** (Email/Password, Google, etc.)
   - **Cloud Messaging** (FCM)
   - **Storage**

### 5. Ejecutar con Docker (Recomendado)

```bash
# Levantar Postgres + Redis + Backend
docker compose up --build

# Backend estará disponible en http://localhost:3000/api
```

### 6. Ejecutar sin Docker

```bash
# Inicia Postgres y Redis localmente primero

# Modo desarrollo (con hot-reload)
npm run start:dev

# Modo producción
npm run build
npm run start:prod
```

### 7. Verificar

Abre `http://localhost:3000/api` en tu navegador o Postman.

## 📡 Endpoints Principales

### Auth
- `POST /api/auth/login` - Login con Firebase token
- `GET /api/auth/profile` - Obtener perfil del usuario

### Users
- `GET /api/users` - Listar usuarios
- `GET /api/users/:id` - Obtener usuario
- `POST /api/users` - Crear usuario

### Drivers
- `GET /api/drivers` - Listar conductores
- `POST /api/drivers` - Registrar conductor

### Rides
- `GET /api/rides` - Listar viajes
- `POST /api/rides/request` - Solicitar viaje

### Payments
- `POST /api/payments/intent` - Crear intención de pago Stripe
- `POST /api/payments/webhook` - Webhook de Stripe

### WebSockets
- **Namespace**: `ws://localhost:3000/tracking`
- **Eventos**:
  - `location:update` → Enviar ubicación del conductor
  - `location:driver` → Recibir ubicación de conductores

## 🔐 Seguridad

### Middlewares Aplicados
1. **LoggerMiddleware**: Registra todas las peticiones
2. **RateLimitMiddleware**: 60 requests/min por IP
3. **FirebaseAuthMiddleware**: Verifica token JWT de Firebase en header `Authorization: Bearer <token>`

### Protección de Rutas
Las rutas protegidas requieren header de autenticación:
```
Authorization: Bearer <firebase-id-token>
```

## 🧪 Tests

```bash
# Unit tests
npm test

# Test con coverage
npm run test:cov

# Tests en modo watch
npm run test:watch
```

## 🌍 Deployment a Firebase

### Opción 1: Cloud Run (Recomendado)

```bash
# 1. Instalar Google Cloud CLI
# https://cloud.google.com/sdk/docs/install

# 2. Login
gcloud auth login

# 3. Configurar proyecto
gcloud config set project TU_PROJECT_ID

# 4. Build y deploy
gcloud run deploy app-uber-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,DB_HOST=..."
```

### Opción 2: Cloud Functions

```bash
# 1. Instalar Firebase CLI
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Inicializar Functions
firebase init functions

# 4. Deploy
firebase deploy --only functions
```

### Configurar Base de Datos en la Nube

**PostgreSQL**: Usa Cloud SQL de Google:
```bash
gcloud sql instances create app-uber-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1
```

**Redis**: Usa Memorystore de Google:
```bash
gcloud redis instances create app-uber-redis \
  --size=1 \
  --region=us-central1
```

## 📊 Monitoreo

- **Logs**: Cloud Logging de Google
- **Métricas**: Cloud Monitoring
- **Errores**: Cloud Error Reporting

## 🛣️ Roadmap

### Próximos pasos (pendientes)
- [ ] DTOs y validación con `class-validator` en todos los endpoints
- [ ] Guards personalizados (@Roles, @CurrentUser)
- [ ] Refactorizar services para usar TypeORM repositories
- [ ] Algoritmo de matching conductor-pasajero por distancia
- [ ] Cálculo dinámico de tarifas (hora pico, demanda)
- [ ] Sistema completo de ratings y reviews
- [ ] Pasarela de pago local para Nicaragua
- [ ] Tests E2E completos
- [ ] Documentación API con Swagger

## 🇳🇮 Pasarelas de Pago Nicaragua

Para Nicaragua, considera integrar:
- **BAC Credomatic** (tarjetas locales)
- **Banpro** (transferencias)
- **Ficohsa** (pagos móviles)
- **Stripe** (internacional, ya integrado)

## 📞 Soporte

Para cualquier duda o problema:
1. Revisa los logs: `docker compose logs -f backend`
2. Verifica las variables de entorno en `.env`
3. Asegúrate de que Firebase y Stripe estén correctamente configurados

## 📄 Licencia

MIT
