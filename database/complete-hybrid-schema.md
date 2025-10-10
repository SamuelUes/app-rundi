# 🔥 SCHEMA COMPLETO 100% - ARQUITECTURA HÍBRIDA
# DriveAngel.ni - Supabase PostgreSQL + Firebase
# Actualizado: 2025-10-08

---

## 📊 ARQUITECTURA HÍBRIDA COMPLETA

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React Native)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              FIREBASE FUNCTIONS (Backend)                   │
│              28 Cloud Functions                             │
└────────┬────────────────────────────────────┬───────────────┘
         │                                    │
         ▼                                    ▼
┌────────────────────────┐         ┌─────────────────────────┐
│   FIREBASE             │         │   SUPABASE              │
│   (Tiempo Real)        │         │   POSTGRESQL            │
│                        │         │   (Histórico)           │
│ ✅ Auth                │         │                         │
│ ✅ Firestore           │         │ ✅ drivers              │
│    - users             │         │ ✅ vehicles             │
│    - notifications     │         │ ✅ rides                │
│                        │         │ ✅ payments             │
│ ✅ Realtime DB         │         │ ✅ ratings              │
│    - activeRides       │         │ ✅ ride_locations       │
│    - driverLocations   │         │ ✅ analytics_events     │
│    - chats             │         │                         │
│    - presence          │         │                         │
└────────────────────────┘         └─────────────────────────┘
```

---

## 🗄️ DISTRIBUCIÓN DE DATOS

### **FIREBASE (Datos en Tiempo Real)**

#### **Firestore Collections:**

**1. users** (Perfil básico)
```javascript
users/{userId} {
  id: string,                    // Firebase UID
  email: string,
  name: string,
  phone: string,
  role: "client" | "driver" | "admin",
  profilePhoto: string | null,
  driverStatus: "offline" | "available" | "busy" | null,
  currentRideId: string | null,
  currentLocation: { lat, lng, timestamp } | null,
  fcmToken: string | null,
  notificationsEnabled: boolean,
  stats: {
    totalRides: number,          // Cache de PostgreSQL
    averageRating: number,       // Cache de PostgreSQL
    totalEarnings: number        // Cache de PostgreSQL
  },
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**2. notifications** (Subcollection)
```javascript
notifications/{userId}/items/{notificationId} {
  id: string,
  type: string,
  title: string,
  body: string,
  data: object,
  read: boolean,
  readAt: timestamp | null,
  createdAt: timestamp
}
```

#### **Realtime Database Paths:**

**1. activeRides** (Viajes activos)
```javascript
activeRides/{rideId} {
  id: string,
  clientId: string,              // Firebase UID
  driverId: string | null,       // Firebase UID
  status: string,
  origin: { lat, lng, address },
  destination: { lat, lng, address },
  driverLocation: { lat, lng, heading, speed, accuracy, timestamp } | null,
  estimatedDistance: number,
  estimatedDuration: number,
  estimatedPrice: number,
  eta: number | null,
  distanceTraveled: number,
  rideType: string,
  notes: string | null,
  requestedAt: number,
  acceptedAt: number | null,
  startedAt: number | null,
  lastUpdate: number
}
```

**2. driverLocations** (Ubicación de conductores)
```javascript
driverLocations/{driverId} {
  lat: number,
  lng: number,
  heading: number,
  speed: number,
  accuracy: number,
  status: "available" | "busy",
  currentRideId: string | null,
  timestamp: number,
  lastUpdate: number
}
```

**3. chats** (Chat en tiempo real)
```javascript
chats/{rideId}/messages/{messageId} {
  id: string,
  senderId: string,
  senderName: string,
  senderRole: "client" | "driver",
  text: string,
  type: "text" | "predefined" | "location",
  timestamp: number,
  read: boolean,
  readAt: number | null
}

chats/{rideId}/typing/{userId} {
  isTyping: boolean,
  timestamp: number
}
```

**4. presence** (Estado online)
```javascript
presence/{userId} {
  online: boolean,
  lastSeen: number,
  device: string,
  platform: "ios" | "android" | "web"
}
```

---

### **SUPABASE POSTGRESQL (Datos Históricos)**

#### **Tablas:**

**1. drivers** (Datos sensibles de conductores)
```sql
CREATE TABLE drivers (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL,  -- Firebase UID
  license_number VARCHAR(50),
  license_expiry DATE,
  license_photo VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending',
  verified_at TIMESTAMP,
  total_rides INTEGER DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0,
  total_earnings DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**2. vehicles** (Vehículos con documentación)
```sql
CREATE TABLE vehicles (
  id UUID PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id),
  plate VARCHAR(20) NOT NULL,
  brand VARCHAR(50),
  model VARCHAR(50),
  year INTEGER,
  color VARCHAR(30),
  type VARCHAR(20),
  registration_number VARCHAR(50),
  registration_expiry DATE,
  registration_photo VARCHAR(500),
  insurance_number VARCHAR(50),
  insurance_company VARCHAR(100),
  insurance_expiry DATE,
  insurance_photo VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**3. rides** (Historial completo de viajes)
```sql
CREATE TABLE rides (
  id UUID PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL,       -- Firebase UID
  driver_id VARCHAR(255),                -- Firebase UID
  origin_lat DECIMAL(10, 8),
  origin_lng DECIMAL(11, 8),
  origin_address TEXT,
  destination_lat DECIMAL(10, 8),
  destination_lng DECIMAL(11, 8),
  destination_address TEXT,
  estimated_distance INTEGER,
  estimated_duration INTEGER,
  actual_distance INTEGER,
  actual_duration INTEGER,
  estimated_price DECIMAL(10, 2),
  final_fare DECIMAL(10, 2),
  client_suggested_price DECIMAL(10, 2),
  notes TEXT,
  ride_type VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(20) DEFAULT 'requested',
  cancel_reason VARCHAR(100),
  canceled_by VARCHAR(255),
  requested_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  canceled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**4. payments** (Historial de pagos Stripe)
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  amount DECIMAL(10, 2) NOT NULL,
  tip DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) GENERATED ALWAYS AS (amount + tip) STORED,
  payment_method VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**5. ratings** (Calificaciones)
```sql
CREATE TABLE ratings (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  from_user_id VARCHAR(255) NOT NULL,    -- Firebase UID
  to_user_id VARCHAR(255) NOT NULL,      -- Firebase UID
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  punctuality INTEGER CHECK (punctuality >= 1 AND punctuality <= 5),
  cleanliness INTEGER CHECK (cleanliness >= 1 AND cleanliness <= 5),
  communication INTEGER CHECK (communication >= 1 AND communication <= 5),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**6. ride_locations** (Historial de tracking)
```sql
CREATE TABLE ride_locations (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  speed DECIMAL(5, 2),
  heading DECIMAL(5, 2),
  accuracy DECIMAL(5, 2),
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**7. analytics_events** (Logs y métricas)
```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255),                  -- Firebase UID
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  platform VARCHAR(20),
  app_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 FLUJO DE SINCRONIZACIÓN COMPLETO

### **1. Registro de Usuario**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Cliente/Conductor se registra en la app                 │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Firebase Auth crea usuario                              │
│    - UID generado                                           │
│    - Email verificado                                       │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Cloud Function: register()                              │
│    a) Crea perfil en Firestore (users collection)          │
│    b) Si es conductor:                                      │
│       - Inserta en PostgreSQL (drivers table)              │
│       - Inserta en PostgreSQL (vehicles table)             │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Frontend recibe usuario completo                        │
└─────────────────────────────────────────────────────────────┘
```

### **2. Solicitar Viaje**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Cliente solicita viaje (origen, destino, precio)        │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Cloud Function: requestRide()                           │
│    a) Valida datos (distancia, precio)                     │
│    b) Inserta en PostgreSQL (rides table)                  │
│    c) Publica en Realtime DB (activeRides/{rideId})        │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Conductores cercanos reciben notificación               │
│    - Escuchan activeRides en Realtime DB                   │
│    - Ven viaje en AvailableRidesScreen                     │
└─────────────────────────────────────────────────────────────┘
```

### **3. Tracking en Tiempo Real**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Conductor acepta viaje                                  │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Cloud Function: acceptRide()                            │
│    a) Actualiza PostgreSQL (rides.driver_id)               │
│    b) Actualiza Realtime DB (activeRides/{rideId})         │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Cliente escucha cambios en tiempo real                  │
│    - Realtime DB: activeRides/{rideId}                     │
│    - Ve datos del conductor                                │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Conductor inicia viaje                                  │
│    - Cloud Function: startRide()                           │
│    - Actualiza PostgreSQL y Realtime DB                    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Conductor envía ubicación cada 3 segundos               │
│    - Actualiza Realtime DB:                                │
│      * driverLocations/{driverId}                          │
│      * activeRides/{rideId}/driverLocation                 │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Cliente ve ubicación en mapa en tiempo real             │
│    - Escucha activeRides/{rideId}/driverLocation           │
│    - Mapa se actualiza automáticamente                     │
└─────────────────────────────────────────────────────────────┘
```

### **4. Completar Viaje**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Conductor completa viaje                                │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Cloud Function: completeRide()                          │
│    a) Actualiza PostgreSQL (rides.status = 'completed')    │
│    b) Guarda tracking en PostgreSQL (ride_locations)       │
│    c) Elimina de Realtime DB (activeRides/{rideId})        │
│    d) Actualiza stats en Firestore (users/{userId}/stats)  │
│    e) Crea notificación en Firestore (notifications)       │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Cliente recibe notificación                             │
│    - Navega a RatingScreen                                 │
│    - Califica al conductor                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 COMPARACIÓN DE DATOS

| Dato | Firebase | PostgreSQL | Sincronización |
|------|----------|------------|----------------|
| **User Profile** | ✅ Firestore | ❌ | Creado en registro |
| **Driver License** | ❌ | ✅ PostgreSQL | Creado en registro |
| **Active Ride** | ✅ Realtime DB | ✅ PostgreSQL | Bidireccional |
| **Ride History** | ❌ | ✅ PostgreSQL | Al completar |
| **Chat Messages** | ✅ Realtime DB | ❌ | Solo tiempo real |
| **Driver Location** | ✅ Realtime DB | ✅ PostgreSQL (history) | Continua |
| **Payments** | ❌ | ✅ PostgreSQL | Al pagar |
| **Analytics** | ❌ | ✅ PostgreSQL | Eventos |
| **Notifications** | ✅ Firestore | ❌ | Creadas por triggers |
| **User Stats** | ✅ Firestore (cache) | ✅ PostgreSQL (real) | Actualización periódica |

---

## 🔒 SEGURIDAD

### **Firebase Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
    match /notifications/{userId}/items/{notificationId} {
      allow read: if request.auth.uid == userId;
      allow update: if request.auth.uid == userId;
    }
  }
}
```

### **Firebase Realtime Database Rules:**
```json
{
  "rules": {
    "activeRides": {
      "$rideId": {
        ".read": "auth != null && (data.child('clientId').val() === auth.uid || data.child('driverId').val() === auth.uid)",
        ".write": "auth != null"
      }
    },
    "driverLocations": {
      "$driverId": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $driverId"
      }
    }
  }
}
```

### **Supabase PostgreSQL:**
```sql
-- Row Level Security deshabilitado
-- Acceso controlado por Firebase Functions
ALTER TABLE drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE rides DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ratings DISABLE ROW LEVEL SECURITY;
ALTER TABLE ride_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events DISABLE ROW LEVEL SECURITY;
```

---

## 📁 ARCHIVOS DEL PROYECTO

```
database/
├── supabase-only.sql              ✅ Schema SOLO Supabase
├── firebase-only.json             ✅ Schema SOLO Firebase
├── complete-hybrid-schema.md      ✅ Este archivo (100% completo)
├── firestore.rules                ✅ Reglas Firestore
├── database.rules.json            ✅ Reglas Realtime DB
└── firestore.indexes.json         ✅ Índices Firestore
```

---

## 🚀 DEPLOYMENT

### **1. Supabase PostgreSQL:**
```bash
# Ir a: https://supabase.com/dashboard/project/ceytngpresytjhafcadu/sql
# Copiar y ejecutar: database/supabase-only.sql
```

### **2. Firebase Firestore:**
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### **3. Firebase Realtime Database:**
```bash
firebase deploy --only database
```

### **4. Firebase Functions:**
```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## ✅ VERIFICACIÓN

### **Supabase:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
-- Debe mostrar: 7 tablas
```

### **Firebase:**
```bash
# Firestore: Ver en consola
https://console.firebase.google.com/project/driveangel-ni/firestore

# Realtime DB: Ver en consola
https://console.firebase.google.com/project/driveangel-ni/database
```

---

## 💰 COSTOS

```
Firebase Functions:    $0/mes (2M invocaciones gratis)
Firebase Firestore:    $0/mes (10GB gratis)
Firebase Realtime DB:  $0/mes (10GB gratis)
Firebase Auth:         $0/mes (ilimitado)
Supabase PostgreSQL:   $0/mes (500MB gratis)
────────────────────────────────────────────────
TOTAL:                 $0/mes ✅
```

---

**🎉 ARQUITECTURA HÍBRIDA 100% COMPLETA Y LISTA PARA PRODUCCIÓN**
