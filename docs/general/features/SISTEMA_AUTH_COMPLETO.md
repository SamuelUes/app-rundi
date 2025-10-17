# 🔐 Sistema de Autenticación Completo - DriveAngel

## Fecha: 10 de Octubre 2025, 23:31

---

## 📊 **Arquitectura de Autenticación:**

### **Firebase Auth (Principal):**
- Maneja autenticación de usuarios
- Genera tokens JWT
- Proporciona `auth.currentUser.uid`
- Persiste sesión automáticamente

### **Firestore (Perfil Básico):**
- Colección: `users/{uid}`
- Datos: email, name, phone, role, stats
- Sincronizado con Firebase Auth

### **PostgreSQL (Datos Sensibles - Solo Conductores):**
- Tabla: `drivers` - Licencia, documentos, verificación
- Tabla: `vehicles` - Vehículo completo con documentación
- Vinculado por: `user_id` (Firebase Auth UID)

---

## 🔄 **Flujo de Registro:**

### **1. Cliente se Registra:**
```
Frontend → Firebase Auth
   ↓
Firebase Auth crea usuario (UID generado)
   ↓
Backend Function: register()
   ↓
Firestore: users/{uid}
   - id: uid
   - email, name, phone
   - role: 'client'
   - stats: {totalRides: 0, averageRating: 0}
   ↓
✅ Registro completo
```

### **2. Conductor se Registra:**
```
Frontend → Firebase Auth
   ↓
Firebase Auth crea usuario (UID generado)
   ↓
Backend Function: register()
   ↓
Firestore: users/{uid}
   - id: uid
   - email, name, phone
   - role: 'driver'
   - driverStatus: 'offline'
   - stats: {totalRides: 0, averageRating: 0}
   ↓
PostgreSQL: drivers table
   - user_id: uid (FK a Firebase Auth)
   - license_number, license_expiry, license_photo
   - status: 'pending'
   ↓
PostgreSQL: vehicles table
   - driver_id: (FK a drivers)
   - plate, brand, model, year, color, type
   - registration_number, insurance_number
   - is_active: true
   ↓
✅ Registro completo
```

---

## 🔑 **Flujo de Login:**

### **Frontend:**
```typescript
// 1. Login con Firebase Auth (cliente)
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './config/firebase';

const userCredential = await signInWithEmailAndPassword(auth, email, password);
const firebaseUser = userCredential.user;

// 2. Obtener datos adicionales del backend
const loginFunction = httpsCallable(functions, 'login');
const response = await loginFunction();
const userData = response.data.user;

// 3. Guardar en contexto
setUser({
  id: firebaseUser.uid,  // ← IMPORTANTE: Usar Firebase UID
  email: firebaseUser.email,
  name: userData.name,
  role: userData.role,
});
```

### **Backend Function: login():**
```typescript
export const login = functions.https.onCall(async (data, context) => {
  // Verificar autenticación
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const userId = context.auth.uid;  // ← UID de Firebase Auth

  // Obtener perfil de Firestore
  const userDoc = await admin.firestore()
    .collection("users")
    .doc(userId)
    .get();

  const userData = userDoc.data();

  // Si es conductor, obtener datos de PostgreSQL
  if (userData?.role === "driver") {
    const result = await client.query(
      `SELECT d.*, v.plate, v.brand, v.model, v.color, v.type
       FROM drivers d
       LEFT JOIN vehicles v ON v.driver_id = d.id
       WHERE d.user_id = $1`,
      [userId]
    );

    if (result.rows.length > 0) {
      userData.driverData = result.rows[0];
    }
  }

  return {
    success: true,
    user: userData,
  };
});
```

---

## 🚪 **Flujo de Logout:**

### **Frontend:**
```typescript
const logout = async () => {
  try {
    // 1. Marcar como offline en Firebase Realtime DB (solo conductores)
    if (user?.role === 'driver' && backendConfig.isFirebase()) {
      try {
        const firebaseUser = auth.currentUser;  // ← Usar Firebase Auth
        if (firebaseUser) {
          const driverLocationRef = ref(database, `driverLocations/${firebaseUser.uid}`);
          await set(driverLocationRef, {
            status: 'offline',
            updatedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
          });
        }
      } catch (fbError) {
        // Ignorar errores, continuar con logout
      }
    }
    
    // 2. Logout de Firebase Auth
    await authService.logout();
    
    // 3. Limpiar storage local
    await AsyncStorage.removeItem('user');
    setUser(null);
  } catch (error) {
    // Forzar logout local aunque falle
    setUser(null);
    await AsyncStorage.removeItem('user');
  }
};
```

### **Backend Function: logout():**
```typescript
export const logout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }

  const userId = context.auth.uid;

  try {
    // Actualizar estado del conductor si aplica
    const userDoc = await admin.firestore()
      .collection("users")
      .doc(userId)
      .get();

    if (userDoc.exists && userDoc.data()?.role === "driver") {
      // Marcar como offline en Firestore
      await admin.firestore()
        .collection("users")
        .doc(userId)
        .update({
          driverStatus: "offline",
          currentRideId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    return {
      success: true,
      message: "Sesión cerrada exitosamente",
    };
  } catch (error: any) {
    console.error("❌ Error en logout:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
```

---

## 🔐 **Sistema de Presencia (usePresence):**

### **Hook de Presencia:**
```typescript
export function usePresence() {
  const { user } = useAuth();

  useEffect(() => {
    // Solo para conductores autenticados
    if (!user?.id || user.role !== 'driver') {
      return;
    }

    // IMPORTANTE: Usar Firebase Auth UID
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      console.log('⚠️ Usuario no autenticado en Firebase Auth');
      return;
    }

    // Usar firebaseUser.uid (NO user.id)
    const driverLocationRef = ref(database, `driverLocations/${firebaseUser.uid}`);

    const setupPresence = async () => {
      try {
        // Marcar como offline al iniciar
        await set(driverLocationRef, {
          status: 'offline',
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        });
        
        // Configurar onDisconnect
        await onDisconnect(driverLocationRef).update({
          status: 'offline',
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        });

        console.log('✅ Sistema de presencia configurado');
      } catch (error: any) {
        console.error('❌ Error configurando presencia:', error?.message);
      }
    };

    setupPresence();

    // Cleanup
    return () => {
      const firebaseUser = auth.currentUser;
      if (firebaseUser && user?.role === 'driver') {
        const cleanupRef = ref(database, `driverLocations/${firebaseUser.uid}`);
        set(cleanupRef, {
          status: 'offline',
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        }).catch(error => {
          console.error('❌ Error en cleanup:', error?.message);
        });
      }
    };
  }, [user?.id, user?.role]);

  return null;
}
```

---

## 🔑 **IDs y UIDs - IMPORTANTE:**

### **Firebase Auth UID:**
```typescript
// Obtener UID de Firebase Auth
const firebaseUser = auth.currentUser;
const uid = firebaseUser.uid;  // ← Este es el ID real
```

### **Context User ID:**
```typescript
// En AuthContext
const { user } = useAuth();
const userId = user.id;  // ← Debe ser igual a firebaseUser.uid
```

### **Regla de Oro:**
```typescript
// ✅ CORRECTO: Usar auth.currentUser.uid
const firebaseUser = auth.currentUser;
if (firebaseUser) {
  const ref = ref(database, `driverLocations/${firebaseUser.uid}`);
}

// ❌ INCORRECTO: Usar user.id del contexto
const ref = ref(database, `driverLocations/${user.id}`);
// Puede causar PERMISSION_DENIED si los IDs no coinciden
```

---

## 🔒 **Firebase Realtime Database Rules:**

```json
{
  "rules": {
    "driverLocations": {
      "$driverId": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $driverId"
      }
    }
  }
}
```

**Explicación:**
- `.read`: Cualquier usuario autenticado puede leer
- `.write`: Solo el conductor puede escribir su propia ubicación
- `auth.uid === $driverId`: Valida que el UID de Firebase Auth coincida con el path

---

## 📊 **Estructura de Datos:**

### **Firebase Auth:**
```json
{
  "uid": "2rGXWVGF6ne48y11NCJmTFKMut73",
  "email": "conductor@example.com",
  "displayName": "Juan Pérez",
  "phoneNumber": "+50512345678"
}
```

### **Firestore - users/{uid}:**
```json
{
  "id": "2rGXWVGF6ne48y11NCJmTFKMut73",
  "email": "conductor@example.com",
  "name": "Juan Pérez",
  "phone": "+50512345678",
  "role": "driver",
  "profilePhoto": null,
  "driverStatus": "offline",
  "currentRideId": null,
  "currentLocation": null,
  "fcmToken": null,
  "notificationsEnabled": true,
  "stats": {
    "totalRides": 0,
    "averageRating": 0,
    "totalEarnings": 0
  },
  "createdAt": "2025-10-10T23:00:00Z",
  "updatedAt": "2025-10-10T23:00:00Z"
}
```

### **PostgreSQL - drivers:**
```sql
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) UNIQUE NOT NULL,  -- Firebase Auth UID
  license_number VARCHAR(50) UNIQUE NOT NULL,
  license_expiry DATE,
  license_photo TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  total_rides INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **PostgreSQL - vehicles:**
```sql
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES drivers(id),
  plate VARCHAR(20) UNIQUE NOT NULL,
  brand VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  year INTEGER NOT NULL,
  color VARCHAR(30) NOT NULL,
  type VARCHAR(20) NOT NULL,
  registration_number VARCHAR(50),
  registration_expiry DATE,
  registration_photo TEXT,
  insurance_number VARCHAR(50),
  insurance_company VARCHAR(100),
  insurance_expiry DATE,
  insurance_photo TEXT,
  is_4x4 BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Firebase Realtime DB - driverLocations:**
```json
{
  "driverLocations": {
    "2rGXWVGF6ne48y11NCJmTFKMut73": {
      "lat": 12.1364,
      "lng": -86.2514,
      "status": "offline",
      "designatedDriverMode": false,
      "updatedAt": 1760157251306,
      "lastSeen": 1760157251306
    }
  }
}
```

---

## ✅ **Validaciones Implementadas:**

### **Registro:**
- ✅ Email único (Firestore)
- ✅ Licencia única (PostgreSQL)
- ✅ Placa única (PostgreSQL)
- ✅ Formato de email válido
- ✅ Password mínimo 6 caracteres
- ✅ Nombre mínimo 2 caracteres
- ✅ Rol válido (client/driver)
- ✅ Datos de conductor completos (si role === 'driver')
- ✅ Datos de vehículo completos (si role === 'driver')

### **Login:**
- ✅ Usuario autenticado en Firebase Auth
- ✅ Perfil existe en Firestore
- ✅ Datos de conductor cargados (si role === 'driver')

### **Logout:**
- ✅ Usuario autenticado
- ✅ Status actualizado a offline (conductores)
- ✅ Cleanup de presencia
- ✅ Logout local forzado si falla backend

---

## 🔧 **Troubleshooting:**

### **Error: PERMISSION_DENIED**
**Causa:** Usando `user.id` en lugar de `auth.currentUser.uid`

**Solución:**
```typescript
// ❌ INCORRECTO
const ref = ref(database, `driverLocations/${user.id}`);

// ✅ CORRECTO
const firebaseUser = auth.currentUser;
if (firebaseUser) {
  const ref = ref(database, `driverLocations/${firebaseUser.uid}`);
}
```

### **Error: Usuario no autenticado**
**Causa:** `auth.currentUser` es null

**Solución:**
```typescript
// Verificar antes de usar
const firebaseUser = auth.currentUser;
if (!firebaseUser) {
  console.log('⚠️ Usuario no autenticado');
  return;
}
```

### **Error: Usuario no encontrado en Firestore**
**Causa:** Registro incompleto o eliminado

**Solución:**
- Verificar que el registro se completó correctamente
- Re-registrar usuario si es necesario

---

## 📝 **Archivos Clave:**

### **Backend:**
1. `functions/src/api/auth.ts` - Functions de autenticación
2. `functions/src/config/database.ts` - Conexión PostgreSQL
3. `functions/src/index.ts` - Exports de functions

### **Frontend:**
4. `Frontend/src/config/firebase.ts` - Configuración Firebase
5. `Frontend/src/context/AuthContext.tsx` - Contexto de autenticación
6. `Frontend/src/hooks/usePresence.ts` - Sistema de presencia
7. `Frontend/src/services/auth/firebaseAuthService.ts` - Servicio Firebase Auth

---

## 🎯 **Resumen:**

### **Flujo Completo:**
```
1. Usuario se registra
   ↓
2. Firebase Auth crea usuario (UID)
   ↓
3. Firestore guarda perfil básico
   ↓
4. PostgreSQL guarda datos sensibles (conductores)
   ↓
5. Usuario hace login
   ↓
6. Firebase Auth valida credenciales
   ↓
7. Backend carga datos completos
   ↓
8. Frontend guarda en contexto
   ↓
9. usePresence configura sistema de presencia (conductores)
   ↓
10. Usuario usa la app
   ↓
11. Usuario hace logout
   ↓
12. Status actualizado a offline
   ↓
13. Firebase Auth cierra sesión
   ↓
14. Storage local limpiado
```

---

**Última actualización:** 10 de Octubre 2025, 23:31  
**Estado:** ✅ SISTEMA DE AUTH COMPLETO Y DOCUMENTADO
