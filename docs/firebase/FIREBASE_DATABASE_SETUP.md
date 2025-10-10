# 🔥 Configurar Firebase Database - DriveAngel.ni

## 📋 Paso a Paso

### **1. Configurar Firestore Rules**

1. **Ir a Firestore:**
   ```
   https://console.firebase.google.com/project/driveangel-ni/firestore
   ```

2. **Ir a la pestaña "Rules"**

3. **Copiar y pegar el contenido de:**
   ```
   database/firestore.rules
   ```

4. **Clic en "Publish"**

---

### **2. Configurar Realtime Database Rules**

1. **Ir a Realtime Database:**
   ```
   https://console.firebase.google.com/project/driveangel-ni/database
   ```

2. **Ir a la pestaña "Rules"**

3. **Copiar y pegar el contenido de:**
   ```
   database/database.rules.json
   ```

4. **Clic en "Publish"**

---

### **3. Crear Índices en Firestore**

1. **Ir a Firestore → Indexes**

2. **Crear índices compuestos:**

```
Collection: users
Fields: role (Ascending), driverStatus (Ascending)

Collection: users
Fields: role (Ascending), createdAt (Descending)
```

**O usar este comando:**
```bash
firebase deploy --only firestore:indexes
```

---

### **4. Probar Estructura de Datos**

#### **Crear usuario de prueba en Firestore:**

```javascript
// En Firebase Console → Firestore → Add document

Collection: users
Document ID: [Auto-ID o Firebase UID]

{
  "id": "test-user-123",
  "email": "test@driveangel.ni",
  "name": "Usuario Test",
  "phone": "+50512345678",
  "role": "client",
  "profilePhoto": null,
  "createdAt": [timestamp],
  "updatedAt": [timestamp],
  "driverStatus": null,
  "currentRideId": null,
  "fcmToken": null,
  "notificationsEnabled": true,
  "stats": {
    "totalRides": 0,
    "averageRating": 0,
    "totalEarnings": 0
  }
}
```

#### **Crear viaje activo en Realtime Database:**

```javascript
// En Firebase Console → Realtime Database → Add child

Path: activeRides/test-ride-123

{
  "id": "test-ride-123",
  "clientId": "test-user-123",
  "driverId": null,
  "status": "requested",
  "origin": {
    "lat": 12.1364,
    "lng": -86.2514,
    "address": "Managua, Nicaragua"
  },
  "destination": {
    "lat": 12.1500,
    "lng": -86.2700,
    "address": "Metrocentro, Managua"
  },
  "driverLocation": null,
  "estimatedDistance": 5000,
  "estimatedDuration": 900,
  "estimatedPrice": 150,
  "eta": null,
  "requestedAt": 1696800000000,
  "acceptedAt": null,
  "startedAt": null,
  "lastUpdate": 1696800000000
}
```

---

## 🔄 Desplegar Reglas con Firebase CLI

### **Opción 1: Desplegar todo**

```bash
firebase deploy
```

### **Opción 2: Solo Firestore**

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### **Opción 3: Solo Realtime Database**

```bash
firebase deploy --only database
```

---

## 🧪 Probar Reglas de Seguridad

### **Firestore Rules Simulator:**

1. Ir a: Firestore → Rules → Rules Playground

2. **Probar lectura de usuario:**
   ```
   Operation: get
   Location: /users/test-user-123
   Authenticated: Yes
   UID: test-user-123
   ```
   **Resultado esperado:** ✅ Allow

3. **Probar escritura de otro usuario:**
   ```
   Operation: update
   Location: /users/test-user-123
   Authenticated: Yes
   UID: different-user-456
   ```
   **Resultado esperado:** ❌ Deny

### **Realtime Database Rules Simulator:**

1. Ir a: Realtime Database → Rules → Simulator

2. **Probar lectura de viaje:**
   ```
   Type: Read
   Location: /activeRides/test-ride-123
   Authenticated: Yes
   UID: test-user-123
   ```
   **Resultado esperado:** ✅ Allowed

---

## 📊 Estructura Final

```
FIREBASE FIRESTORE
├── users/
│   ├── {userId}/
│   │   ├── id
│   │   ├── email
│   │   ├── name
│   │   ├── role
│   │   └── stats
│   └── notifications/
│       └── {userId}/
│           └── items/
│               └── {notificationId}

FIREBASE REALTIME DATABASE
├── activeRides/
│   └── {rideId}/
│       ├── clientId
│       ├── driverId
│       ├── status
│       ├── origin
│       ├── destination
│       └── driverLocation
├── driverLocations/
│   └── {driverId}/
│       ├── lat
│       ├── lng
│       └── timestamp
├── chats/
│   └── {rideId}/
│       ├── messages/
│       └── typing/
└── presence/
    └── {userId}/
        ├── online
        └── lastSeen
```

---

## ✅ Checklist

- [ ] Firestore Rules desplegadas
- [ ] Realtime Database Rules desplegadas
- [ ] Índices de Firestore creados
- [ ] Usuario de prueba creado
- [ ] Viaje de prueba creado
- [ ] Reglas probadas en Simulator
- [ ] Todo funcionando correctamente

---

## 🎯 Próximo Paso

Una vez configurado Firebase Database, actualizar las Functions para usar ambas bases de datos:

1. **Firestore** para usuarios y notificaciones
2. **Realtime Database** para tracking y chat
3. **Supabase PostgreSQL** para datos históricos

---

**¡Configuración de Firebase Database completa!** 🔥
