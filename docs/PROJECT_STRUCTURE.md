# 📁 Estructura del Proyecto - DriveAngel.ni

## 🏗️ Arquitectura General

```
app-uber/
├── Frontend/           # App móvil (React Native + Expo)
├── functions/          # Firebase Cloud Functions (Backend principal)
├── Backend/           # NestJS (Respaldo, NO se sube al repo)
├── database/          # Schemas y migraciones de PostgreSQL
├── docs/              # Documentación completa
├── .gitignore         # Archivos ignorados por Git
├── README.md          # Descripción del proyecto
├── SETUP.md           # Guía de instalación
└── git-push.md        # Guía para subir a GitHub
```

---

## 📱 Frontend (React Native + Expo)

```
Frontend/
├── src/
│   ├── components/         # Componentes reutilizables
│   │   ├── AnimatedButton.tsx
│   │   ├── LoadingSpinner.tsx
│   │   └── ...
│   │
│   ├── screens/            # Pantallas de la app
│   │   ├── Auth/           # Login, Register
│   │   ├── Client/         # Pantallas de cliente
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── RideTrackingScreen.tsx
│   │   │   ├── CashPaymentScreen.tsx
│   │   │   └── ...
│   │   ├── Driver/         # Pantallas de conductor
│   │   │   ├── AvailableRidesScreen.tsx
│   │   │   ├── ActiveRideScreen.tsx
│   │   │   └── ...
│   │   └── Shared/         # Pantallas compartidas
│   │       ├── RatingScreen.tsx
│   │       └── ...
│   │
│   ├── navigation/         # Navegación de la app
│   │   ├── AppNavigator.tsx
│   │   ├── ClientStack.tsx
│   │   ├── DriverStack.tsx
│   │   └── AuthStack.tsx
│   │
│   ├── services/           # Servicios de API
│   │   ├── auth/
│   │   │   ├── authService.ts          # Router principal
│   │   │   ├── firebaseAuthService.ts  # Implementación Firebase
│   │   │   └── localAuthService.ts     # Implementación NestJS
│   │   ├── ridesService.ts
│   │   ├── trackingService.ts
│   │   └── ...
│   │
│   ├── context/            # Context API (Estado global)
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   └── LocationContext.tsx
│   │
│   ├── hooks/              # Custom Hooks
│   │   ├── useLocation.ts
│   │   ├── useTracking.ts
│   │   └── ...
│   │
│   ├── constants/          # Constantes y configuración
│   │   ├── nicaraguaLocations.ts  # Departamentos y municipios
│   │   └── ...
│   │
│   ├── config/             # Configuración
│   │   ├── firebase.ts
│   │   └── backendConfig.ts
│   │
│   └── utils/              # Utilidades
│       ├── formatters.ts
│       └── validators.ts
│
├── .env                    # ✅ Variables de entorno (SE SUBE - públicas)
├── .env.example            # ✅ Plantilla de .env
├── app.json                # Configuración de Expo
├── package.json            # Dependencias
└── tsconfig.json           # Configuración de TypeScript
```

---

## ⚡ Functions (Firebase Cloud Functions)

```
functions/
├── src/
│   ├── api/                # Endpoints de la API
│   │   ├── auth.ts         # Registro, login
│   │   ├── rides.ts        # CRUD de viajes
│   │   │   ├── requestRide()
│   │   │   ├── acceptRide()      # Conductor crea oferta
│   │   │   ├── confirmDriver()   # Cliente selecciona conductor
│   │   │   ├── startRide()
│   │   │   ├── completeRide()
│   │   │   └── cancelRide()
│   │   │
│   │   ├── ratings.ts      # Sistema de calificaciones
│   │   │   ├── submitRating()    # Calificar viaje
│   │   │   ├── skipRating()      # Omitir calificación
│   │   │   └── getUserRating()   # Obtener rating de usuario
│   │   │
│   │   ├── tracking-optimized.ts  # Tracking en tiempo real
│   │   ├── drivers.ts      # Gestión de conductores
│   │   ├── payments.ts     # Pagos (Stripe + Cash)
│   │   ├── users.ts        # Gestión de usuarios
│   │   └── ...
│   │
│   ├── scheduled/          # Funciones programadas (cron jobs)
│   │   ├── cleanupOldRides.ts     # Archivar viajes viejos
│   │   └── ...
│   │
│   ├── helpers/            # Funciones auxiliares
│   │   ├── cleanupHelpers.ts
│   │   ├── supabaseClient.ts
│   │   └── ...
│   │
│   ├── config/             # Configuración
│   │   └── supabase.ts
│   │
│   └── index.ts            # Exportar todas las funciones
│
├── .env                    # ❌ Variables de entorno (NO SE SUBE - secrets)
├── .env.example            # ✅ Plantilla de .env
├── package.json            # Dependencias
└── tsconfig.json           # Configuración de TypeScript
```

---

## 🗄️ Database (PostgreSQL - Supabase)

```
database/
├── supabase-only.sql       # Schema completo (última versión)
│
├── migrations/             # Migraciones incrementales
│   ├── add-driver-location-fields.sql
│   ├── ratings-update.sql
│   └── ...
│
├── seeds/                  # Datos de prueba
│   └── test-data.sql
│
└── docs/                   # Documentación de BD
    ├── SCHEMA_CHANGES_2025-10-15.md
    └── ...
```

### Tablas Principales:

1. **users** (Firestore) - Perfil básico, auth
2. **drivers** (PostgreSQL) - Licencia, documentos, ubicación
3. **vehicles** (PostgreSQL) - Datos completos del vehículo
4. **rides** (PostgreSQL) - Historial de viajes
5. **payments** (PostgreSQL) - Historial de pagos
6. **ratings** (PostgreSQL) - Calificaciones detalladas
7. **ride_locations** (PostgreSQL) - Tracking comprimido
8. **activeRides** (Firebase Realtime) - Viajes en tiempo real
9. **driverLocations** (Firebase Realtime) - Ubicación de conductores

---

## 📚 Docs (Documentación)

```
docs/
├── general/
│   ├── architecture/       # Arquitectura del sistema
│   │   ├── FIREBASE_HYBRID_ARCHITECTURE.md
│   │   └── ...
│   │
│   └── features/           # Documentación de features
│       ├── PENDING_RATING_SYSTEM.md
│       ├── SKIP_RATING_FEATURE.md
│       ├── DRIVER_LOCATION_FIELDS.md
│       └── ...
│
├── api/                    # Documentación de API
│   ├── rides-api.md
│   ├── ratings-api.md
│   └── ...
│
├── database/               # Documentación de BD
│   ├── RATINGS_SUPABASE_INTEGRATION.md
│   ├── PAYMENTS_SUPABASE_FIX.md
│   └── ...
│
└── deployment/             # Guías de deployment
    ├── DEPLOYMENT_GUIDE.md
    └── ...
```

---

## 🔐 Archivos de Configuración

### ✅ SE SUBEN AL REPO:

```
Frontend/.env              # Credenciales públicas de Firebase
Frontend/.env.example      # Plantilla
functions/.env.example     # Plantilla
.gitignore                 # Configuración de Git
firebase.json              # Configuración de Firebase
package.json               # Dependencias
tsconfig.json              # Configuración de TypeScript
README.md                  # Descripción del proyecto
SETUP.md                   # Guía de instalación
git-push.md                # Guía de Git
PROJECT_STRUCTURE.md       # Este archivo
```

### ❌ NO SE SUBEN AL REPO:

```
functions/.env             # ❌ Secrets del backend
Backend/.env               # ❌ Secrets de NestJS
*-firebase-adminsdk-*.json # ❌ Service accounts
*.pem, *.key, *.cert       # ❌ Certificados
node_modules/              # ❌ Dependencias
.expo/                     # ❌ Cache de Expo
dist/, build/              # ❌ Builds
*.log                      # ❌ Logs
```

---

## 🔄 Flujo de Datos

### 1. Autenticación
```
Cliente → Firebase Auth → Firestore (perfil) → PostgreSQL (si es conductor)
```

### 2. Solicitar Viaje
```
Cliente → requestRide() → Firebase Realtime (activeRides)
```

### 3. Conductor Acepta
```
Conductor → acceptRide() → Crear oferta en activeRides
```

### 4. Cliente Confirma
```
Cliente → confirmDriver() → Actualizar viaje, rechazar otros
```

### 5. Viaje en Progreso
```
Conductor → updateLocation() → Firebase Realtime (cada 5s)
                             → PostgreSQL (cada 30s o 50m)
```

### 6. Completar Viaje
```
Conductor → completeRide() → Estado: pending_rating
Cliente → submitRating() → Marca clientRated
Conductor → submitRating() → Marca driverRated
Sistema → Archiva viaje → PostgreSQL (después de 1h)
```

---

## 🚀 Tecnologías Utilizadas

### Frontend:
- React Native + Expo
- TypeScript
- React Navigation
- Firebase SDK (Auth, Realtime DB, Firestore)
- Google Maps API
- Stripe SDK

### Backend:
- Firebase Cloud Functions (Node.js 18)
- TypeScript
- PostgreSQL (Supabase)
- Firebase Admin SDK
- Stripe API
- Google Maps API

### Base de Datos:
- Firebase Realtime Database (tiempo real)
- Firestore (perfiles)
- PostgreSQL (Supabase) (datos estructurados)

### DevOps:
- Git + GitHub
- Firebase Hosting
- Supabase Cloud

---

## 📊 Estadísticas del Proyecto

- **Funciones de Backend:** 28 Cloud Functions
- **Pantallas de Frontend:** 30+ pantallas
- **Tablas de BD:** 9 tablas en PostgreSQL
- **Líneas de Código:** ~15,000 líneas
- **Documentación:** 50+ archivos MD

---

## 🎯 Próximos Pasos

1. ✅ Sistema de múltiples ofertas
2. ✅ Calificaciones detalladas
3. ✅ Tracking optimizado
4. ✅ Campos de ubicación geográfica
5. ⏳ Sistema de chat en tiempo real
6. ⏳ Notificaciones push
7. ⏳ Panel de administración
8. ⏳ Analytics y reportes

---

**Última actualización:** 2025-10-16
