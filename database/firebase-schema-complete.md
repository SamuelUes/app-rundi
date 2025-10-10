# 🔥 Firebase Database Schema COMPLETO - DriveAngel.ni

**Actualizado:** 2025-10-08

---

## 📊 DISTRIBUCIÓN DE DATOS

### **FIREBASE (Tiempo Real):**
- ✅ Auth: Autenticación de usuarios
- ✅ Firestore: users, notifications
- ✅ Realtime DB: activeRides, driverLocations, chats, presence

### **SUPABASE POSTGRESQL (Histórico):**
- ✅ drivers, vehicles, rides, payments, ratings, ride_locations, analytics_events

---

## 🔥 FIRESTORE DATABASE

### **Collection: users**

```javascript
users/{userId} {
  // Datos básicos (sincronizado con Firebase Auth)
  id: string,                    // Firebase UID
  email: string,
  name: string,
  phone: string,
  role: "client" | "driver" | "admin",
  
  // Perfil
  profilePhoto: string | null,
  createdAt: timestamp,
  updatedAt: timestamp,
  
  // Solo para conductores
  driverStatus: "offline" | "available" | "busy" | null,
  currentRideId: string | null,
  currentLocation: {
    lat: number,
    lng: number,
    timestamp: number
  } | null,
  
  // Notificaciones
  fcmToken: string | null,
  notificationsEnabled: boolean,
  
  // Estadísticas (cache - datos reales en PostgreSQL)
  stats: {
    totalRides: number,
    averageRating: number,
    totalEarnings: number  // Solo conductores
  }
}
```

**Índices:**
```javascript
// Firestore Indexes
users:
  - role (Ascending), driverStatus (Ascending)
  - role (Ascending), createdAt (Descending)
  - driverStatus (Ascending), currentLocation (Geopoint)
```

---

### **Collection: notifications**

```javascript
notifications/{userId}/items/{notificationId} {
  id: string,
  type: "ride_requested" | "ride_accepted" | "ride_started" | 
        "ride_completed" | "payment_received" | "new_message" | 
        "rating_received" | "driver_nearby",
  
  title: string,
  body: string,
  
  data: {
    rideId?: string,
    driverId?: string,
    amount?: number,
    // ... datos específicos del tipo
  },
  
  read: boolean,
  readAt: timestamp | null,
  
  createdAt: timestamp
}
```

**Subcollection de users para mejor organización**

---

## 🔥 REALTIME DATABASE

### **Path: activeRides**

```javascript
activeRides/{rideId} {
  // Datos básicos
  id: string,
  clientId: string,
  driverId: string | null,
  status: "requested" | "accepted" | "in_progress" | "completed" | "canceled",
  
  // Ubicaciones
  origin: {
    lat: number,
    lng: number,
    address: string
  },
  destination: {
    lat: number,
    lng: number,
    address: string
  },
  
  // Tracking en tiempo real
  driverLocation: {
    lat: number,
    lng: number,
    heading: number,        // Dirección en grados (0-360)
    speed: number,          // km/h
    accuracy: number,       // metros
    timestamp: number       // Unix timestamp
  } | null,
  
  // Métricas en tiempo real
  estimatedDistance: number,      // metros
  estimatedDuration: number,      // segundos
  estimatedPrice: number,         // córdobas
  eta: number | null,             // Minutos restantes (dinámico)
  distanceTraveled: number,       // metros
  
  // Información adicional
  rideType: "normal" | "premium" | "shared",
  notes: string | null,
  
  // Timestamps
  requestedAt: number,
  acceptedAt: number | null,
  startedAt: number | null,
  
  // Metadata
  lastUpdate: number
}
```

**Reglas de seguridad:**
```json
{
  "rules": {
    "activeRides": {
      "$rideId": {
        ".read": "auth != null && (data.child('clientId').val() === auth.uid || data.child('driverId').val() === auth.uid)",
        ".write": "auth != null && (data.child('clientId').val() === auth.uid || data.child('driverId').val() === auth.uid || !data.exists())",
        ".validate": "newData.hasChildren(['id', 'clientId', 'status', 'origin', 'destination'])"
      }
    }
  }
}
```

---

### **Path: driverLocations**

```javascript
driverLocations/{driverId} {
  // Ubicación actual
  lat: number,
  lng: number,
  heading: number,
  speed: number,
  accuracy: number,
  
  // Estado
  status: "available" | "busy",
  currentRideId: string | null,
  
  // Timestamps
  timestamp: number,
  lastUpdate: number
}
```

**Reglas de seguridad:**
```json
{
  "rules": {
    "driverLocations": {
      "$driverId": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $driverId",
        ".validate": "newData.hasChildren(['lat', 'lng', 'timestamp'])"
      }
    }
  }
}
```

---

### **Path: chats**

```javascript
chats/{rideId}/messages/{messageId} {
  id: string,
  senderId: string,
  senderName: string,
  senderRole: "client" | "driver",
  
  // Contenido
  text: string,
  type: "text" | "predefined" | "location",
  
  // Metadata
  timestamp: number,
  read: boolean,
  readAt: number | null
}

chats/{rideId}/typing/{userId} {
  isTyping: boolean,
  timestamp: number
}

chats/{rideId}/metadata {
  participants: {
    [userId]: {
      name: string,
      role: string,
      lastSeen: number
    }
  },
  createdAt: number,
  lastMessage: {
    text: string,
    timestamp: number,
    senderId: string
  }
}
```

**Mensajes predefinidos:**
```javascript
const PREDEFINED_MESSAGES = [
  { id: 1, text: "👍 Ok", emoji: "👍" },
  { id: 2, text: "⏱️ Llegando en 2 minutos", emoji: "⏱️" },
  { id: 3, text: "📍 Ya llegué", emoji: "📍" },
  { id: 4, text: "🚗 En camino", emoji: "🚗" },
  { id: 5, text: "✅ Perfecto", emoji: "✅" },
  { id: 6, text: "❓ ¿Dónde estás?", emoji: "❓" }
];
```

---

### **Path: presence**

```javascript
presence/{userId} {
  online: boolean,
  lastSeen: number,
  device: string,
  platform: "ios" | "android" | "web"
}
```

---

## 🔄 FLUJO DE SINCRONIZACIÓN

### **1. Registro de Usuario**

```
1. Cliente se registra
   ↓
2. Firebase Auth crea usuario
   ↓
3. Cloud Function crea perfil en Firestore (users)
   ↓
4. Si es conductor → PostgreSQL (drivers table)
   ↓
5. Frontend recibe usuario completo
```

### **2. Solicitar Viaje**

```
1. Cliente solicita viaje
   ↓
2. Cloud Function valida datos
   ↓
3. Inserta en PostgreSQL (rides table)
   ↓
4. Publica en Realtime DB (activeRides)
   ↓
5. Conductores cercanos reciben notificación
   ↓
6. Actualiza Firestore (user.stats)
```

### **3. Tracking en Tiempo Real**

```
1. Conductor acepta viaje
   ↓
2. Actualiza Realtime DB (activeRides/{rideId})
   ↓
3. Cliente escucha cambios en tiempo real
   ↓
4. Conductor envía ubicación cada 3 segundos
   ↓
5. Actualiza Realtime DB (driverLocations/{driverId})
   ↓
6. Actualiza Realtime DB (activeRides/{rideId}/driverLocation)
   ↓
7. Cliente ve ubicación en mapa en tiempo real
```

### **4. Completar Viaje**

```
1. Conductor completa viaje
   ↓
2. Cloud Function actualiza PostgreSQL (rides)
   ↓
3. Guarda tracking history en PostgreSQL (ride_locations)
   ↓
4. Elimina de Realtime DB (activeRides/{rideId})
   ↓
5. Actualiza estadísticas en Firestore (users/{userId}/stats)
   ↓
6. Crea notificación en Firestore (notifications)
```

---

## 📊 COMPARACIÓN DE DATOS

| Dato | Firebase | PostgreSQL | Razón |
|------|----------|------------|-------|
| **User Profile** | ✅ Firestore | ❌ | Acceso rápido, auth integrado |
| **Driver License** | ❌ | ✅ PostgreSQL | Datos sensibles, validación |
| **Active Ride** | ✅ Realtime DB | ✅ PostgreSQL | Tiempo real + Historial |
| **Ride History** | ❌ | ✅ PostgreSQL | Consultas complejas |
| **Chat Messages** | ✅ Realtime DB | ❌ | Tiempo real |
| **Driver Location** | ✅ Realtime DB | ❌ | Actualización constante |
| **Payments** | ❌ | ✅ PostgreSQL | Datos financieros |
| **Analytics** | ❌ | ✅ PostgreSQL | Reportes complejos |
| **Notifications** | ✅ Firestore | ❌ | Push notifications |
| **User Stats** | ✅ Firestore (cache) | ✅ PostgreSQL (real) | Performance |

---

## 🔒 REGLAS DE SEGURIDAD COMPLETAS

### **Firestore Rules:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    function isDriver() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'driver';
    }
    
    function isAdmin() {
      return isAuthenticated() && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create: if isOwner(userId);
      allow update: if isOwner(userId);
      allow delete: if false;
    }
    
    // Notifications subcollection
    match /notifications/{userId}/items/{notificationId} {
      allow read: if isOwner(userId);
      allow update: if isOwner(userId) && 
                      request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read', 'readAt']);
      allow create: if false; // Solo via Cloud Functions
      allow delete: if isOwner(userId);
    }
  }
}
```

### **Realtime Database Rules:**

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    
    "activeRides": {
      "$rideId": {
        ".read": "auth != null && (data.child('clientId').val() === auth.uid || data.child('driverId').val() === auth.uid)",
        ".write": "auth != null && (data.child('clientId').val() === auth.uid || data.child('driverId').val() === auth.uid || !data.exists())"
      }
    },
    
    "driverLocations": {
      "$driverId": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $driverId"
      }
    },
    
    "chats": {
      "$rideId": {
        "messages": {
          ".read": "auth != null",
          "$messageId": {
            ".write": "auth != null && !data.exists()"
          }
        },
        "typing": {
          "$userId": {
            ".read": "auth != null",
            ".write": "auth != null && auth.uid === $userId"
          }
        }
      }
    },
    
    "presence": {
      "$userId": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $userId"
      }
    }
  }
}
```

---

## ✅ RESUMEN

### **Firebase Firestore:**
- 2 Collections principales
- ~1,000 documentos esperados
- Uso: Perfiles, notificaciones

### **Firebase Realtime Database:**
- 4 Paths principales
- Actualización en tiempo real
- Uso: Tracking, chat, presencia

### **Supabase PostgreSQL:**
- 7 Tablas principales
- Datos históricos y analytics
- Uso: Historial, reportes, datos sensibles

**Total: Base de datos híbrida optimizada para tiempo real y análisis** 🚀
