# 🔥 Arquitectura Híbrida: Firebase + PostgreSQL

## 🎯 Objetivo

Usar Firebase para datos en tiempo real y autenticación, y PostgreSQL para datos históricos y análisis.

---

## 📊 Distribución de Datos

### **FIREBASE (Firestore + Realtime Database)**

#### **1. Authentication (Firebase Auth)**
```javascript
{
  uid: "abc123",
  email: "user@example.com",
  phoneNumber: "+50512345678",
  emailVerified: true,
  disabled: false
}
```

#### **2. Users Collection (Firestore)**
```javascript
users/{userId} {
  id: "abc123",
  email: "user@example.com",
  name: "Juan Pérez",
  phone: "+50512345678",
  role: "client" | "driver" | "admin",
  profilePhoto: "https://...",
  fcmToken: "...",
  createdAt: timestamp,
  updatedAt: timestamp,
  
  // Solo para conductores
  driverStatus: "offline" | "available" | "busy",
  currentLocation: {
    lat: 12.1234,
    lng: -86.1234,
    timestamp: timestamp
  }
}
```

#### **3. Active Rides (Realtime Database)**
```javascript
activeRides/{rideId} {
  id: "ride123",
  clientId: "abc123",
  driverId: "def456",
  status: "in_progress",
  
  // Ubicación en tiempo real
  driverLocation: {
    lat: 12.1234,
    lng: -86.1234,
    timestamp: 1234567890
  },
  
  // ETA dinámico
  eta: 5, // minutos
  
  // Datos básicos
  origin: {...},
  destination: {...}
}
```

#### **4. Chat Messages (Realtime Database)**
```javascript
chats/{rideId}/messages/{messageId} {
  id: "msg123",
  senderId: "abc123",
  text: "Ya voy llegando",
  timestamp: 1234567890,
  read: false
}
```

#### **5. Notifications (Firestore)**
```javascript
notifications/{userId}/items/{notificationId} {
  id: "notif123",
  type: "ride_accepted" | "ride_completed" | "payment_received",
  title: "Viaje aceptado",
  body: "Tu conductor va en camino",
  data: {...},
  read: false,
  createdAt: timestamp
}
```

---

### **POSTGRESQL (Tu Servidor)**

#### **1. Drivers Table**
```sql
CREATE TABLE drivers (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL, -- Firebase UID
  license_number VARCHAR(50) NOT NULL,
  license_expiry DATE,
  license_photo VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending', -- pending, verified, rejected
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **2. Vehicles Table**
```sql
CREATE TABLE vehicles (
  id UUID PRIMARY KEY,
  driver_id UUID REFERENCES drivers(id),
  plate VARCHAR(20) NOT NULL,
  brand VARCHAR(50),
  model VARCHAR(50),
  year INTEGER,
  color VARCHAR(30),
  type VARCHAR(20), -- sedan, suv, van, moto
  
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
```

#### **3. Rides Table (Historial Completo)**
```sql
CREATE TABLE rides (
  id UUID PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL, -- Firebase UID
  driver_id VARCHAR(255), -- Firebase UID
  
  -- Ubicaciones
  origin_lat DECIMAL(10, 8),
  origin_lng DECIMAL(11, 8),
  origin_address TEXT,
  destination_lat DECIMAL(10, 8),
  destination_lng DECIMAL(11, 8),
  destination_address TEXT,
  
  -- Métricas
  estimated_distance INTEGER, -- metros
  estimated_duration INTEGER, -- segundos
  actual_distance INTEGER,
  actual_duration INTEGER,
  
  -- Precios
  estimated_price DECIMAL(10, 2),
  final_fare DECIMAL(10, 2),
  
  -- Estados
  status VARCHAR(20), -- requested, accepted, in_progress, completed, canceled
  cancel_reason VARCHAR(100),
  
  -- Timestamps
  requested_at TIMESTAMP,
  accepted_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  canceled_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **4. Payments Table**
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  amount DECIMAL(10, 2) NOT NULL,
  tip DECIMAL(10, 2) DEFAULT 0,
  payment_method VARCHAR(20), -- card, cash
  status VARCHAR(20), -- pending, completed, failed, refunded
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255),
  
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **5. Ratings Table**
```sql
CREATE TABLE ratings (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  from_user_id VARCHAR(255) NOT NULL, -- Firebase UID
  to_user_id VARCHAR(255) NOT NULL, -- Firebase UID
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### **6. Ride Locations (Tracking History)**
```sql
CREATE TABLE ride_locations (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  speed DECIMAL(5, 2), -- km/h
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 Sincronización

### **Estrategia de Sincronización:**

#### **1. Usuario se registra:**
```
Firebase Auth → Crea usuario
↓
Firebase Firestore → Guarda perfil básico
↓
Backend → Si es conductor, guarda en PostgreSQL
```

#### **2. Viaje en progreso:**
```
PostgreSQL → Guarda viaje inicial
↓
Firebase Realtime → Tracking en tiempo real
↓
PostgreSQL → Guarda historial de ubicaciones
↓
PostgreSQL → Actualiza viaje al finalizar
```

#### **3. Consultas:**
```
Datos en tiempo real → Firebase
Historial y reportes → PostgreSQL
```

---

## 🔧 Implementación

### **Fase 1: Setup Firebase**
1. Crear proyecto en Firebase Console
2. Configurar Authentication
3. Configurar Firestore
4. Configurar Realtime Database
5. Obtener credenciales

### **Fase 2: Backend Integration**
1. Instalar Firebase Admin SDK
2. Crear FirebaseService
3. Middleware de autenticación con Firebase
4. Sincronización con PostgreSQL

### **Fase 3: Frontend Integration**
1. Instalar Firebase SDK
2. Configurar Firebase en la app
3. Implementar login con Firebase
4. Sincronizar con backend

### **Fase 4: Migración de Datos**
1. Migrar usuarios a Firebase Auth
2. Mantener datos de conductores en PostgreSQL
3. Migrar tracking a Firebase Realtime
4. Mantener historial en PostgreSQL

---

## 💰 Costos

### **Firebase (Plan Gratuito):**
- ✅ 10GB almacenamiento
- ✅ 50K lecturas/día
- ✅ 20K escrituras/día
- ✅ 10GB transferencia/mes
- ✅ Authentication ilimitado

**Suficiente para:**
- ~1,000 usuarios activos
- ~100 viajes/día
- ~10,000 mensajes de chat/día

### **PostgreSQL:**
- ✅ Gratis (tu servidor)
- ✅ Solo datos históricos
- ✅ Menos carga

---

## 🎯 Ventajas

### **1. Performance:**
- ⚡ Firebase: Tiempo real ultra-rápido
- ⚡ PostgreSQL: Consultas complejas eficientes

### **2. Escalabilidad:**
- 📈 Firebase escala automáticamente
- 📈 PostgreSQL solo para datos necesarios

### **3. Offline-First:**
- 📱 Firebase sincroniza automáticamente
- 📱 App funciona sin conexión

### **4. Seguridad:**
- 🔐 Firebase: Auth robusta
- 🔐 PostgreSQL: Datos sensibles protegidos

### **5. Desarrollo:**
- 🚀 Firebase: Menos código backend
- 🚀 PostgreSQL: Control total

---

## 📊 Comparación

| Aspecto | Solo PostgreSQL | Híbrido Firebase+PostgreSQL |
|---------|-----------------|----------------------------|
| **Tiempo real** | Complejo (WebSocket) | **Fácil (Firebase)** ✅ |
| **Autenticación** | Custom | **Firebase Auth** ✅ |
| **Offline** | Complejo | **Automático** ✅ |
| **Escalabilidad** | Manual | **Automática** ✅ |
| **Costos** | Servidor | **Gratis hasta 10GB** ✅ |
| **Control** | Total | Parcial |
| **Consultas complejas** | **Fácil** ✅ | Limitado |
| **Analytics** | **Total** ✅ | Limitado |

---

## 🚀 Próximos Pasos

1. ✅ Crear proyecto Firebase
2. ✅ Configurar Authentication
3. ✅ Instalar Firebase Admin SDK en backend
4. ✅ Crear FirebaseService
5. ✅ Migrar autenticación a Firebase
6. ✅ Implementar tracking en tiempo real
7. ✅ Sincronizar datos con PostgreSQL

---

## 📝 Notas

- Firebase se usa para datos "calientes" (en tiempo real)
- PostgreSQL se usa para datos "fríos" (históricos)
- Sincronización automática entre ambos
- Mejor de ambos mundos

---

**¿Listo para implementar?** 🚀
