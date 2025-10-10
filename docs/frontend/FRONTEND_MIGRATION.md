# 📱 Migración Frontend: NestJS → Firebase Functions

## ❌ ESTADO ACTUAL (NO FUNCIONARÁ)

Tu frontend actualmente está configurado para usar:
```
❌ Backend NestJS local: http://192.168.1.18:3000/api
❌ WebSocket local: http://192.168.1.18:3000
```

**Esto YA NO EXISTE** porque migramos todo a Firebase Functions.

---

## ✅ NUEVO BACKEND (Firebase Functions)

```
✅ Firebase Functions: https://us-central1-driveangel-ni.cloudfunctions.net
✅ Firebase Realtime DB: https://driveangel-ni-default-rtdb.firebaseio.com
✅ Firebase Auth: Integrado
```

---

## 🔧 PASOS PARA CONECTAR EL FRONTEND

### **Paso 1: Actualizar Variables de Entorno**

1. **Copiar `.env.example` a `.env`:**
   ```bash
   cd Frontend
   cp .env.example .env
   ```

2. **El archivo `.env` ya tiene las credenciales correctas:**
   ```env
   API_BASE_URL=https://us-central1-driveangel-ni.cloudfunctions.net
   FIREBASE_API_KEY=AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g
   FIREBASE_PROJECT_ID=driveangel-ni
   # ... etc
   ```

---

### **Paso 2: Cambiar de Axios a Firebase SDK**

**ANTES (con NestJS):**
```typescript
// ❌ Esto ya no funciona
import axios from 'axios';

const response = await axios.post(
  `${API_BASE_URL}/auth/register`,
  userData
);
```

**DESPUÉS (con Firebase Functions):**
```typescript
// ✅ Nuevo método
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../config/firebase';

const functions = getFunctions();
const register = httpsCallable(functions, 'register');

const result = await register(userData);
```

---

### **Paso 3: Actualizar Servicios**

#### **A) Auth Service**

**Archivo:** `Frontend/src/services/authService.ts`

**ANTES:**
```typescript
async register(userData) {
  const response = await axios.post(
    `${API_BASE_URL}/auth/register`,
    userData
  );
  return response.data;
}
```

**DESPUÉS:**
```typescript
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, firestore } from '../config/firebase';

async register(email, password, name, role) {
  // 1. Crear usuario en Firebase Auth
  const userCredential = await createUserWithEmailAndPassword(
    auth, 
    email, 
    password
  );
  
  // 2. Guardar perfil en Firestore
  await setDoc(doc(firestore, 'users', userCredential.user.uid), {
    id: userCredential.user.uid,
    email,
    name,
    role,
    createdAt: new Date()
  });
  
  return userCredential.user;
}
```

#### **B) Rides Service**

**ANTES:**
```typescript
async requestRide(rideData) {
  const response = await axios.post(
    `${API_BASE_URL}/rides/request`,
    rideData
  );
  return response.data;
}
```

**DESPUÉS:**
```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

async requestRide(rideData) {
  const requestRide = httpsCallable(functions, 'requestRide');
  const result = await requestRide(rideData);
  return result.data;
}
```

#### **C) Tracking (WebSocket → Realtime Database)**

**ANTES:**
```typescript
import io from 'socket.io-client';

const socket = io(WS_URL);
socket.on('locationUpdate', (data) => {
  console.log(data);
});
```

**DESPUÉS:**
```typescript
import { ref, onValue } from 'firebase/database';
import { database } from '../config/firebase';

const locationRef = ref(database, `driverLocations/${driverId}`);
onValue(locationRef, (snapshot) => {
  const location = snapshot.val();
  console.log(location);
});
```

---

### **Paso 4: Actualizar Configuración de Firebase**

**Archivo:** `Frontend/src/config/firebase.ts`

Ya está actualizado con las credenciales correctas:
```typescript
const firebaseConfig = {
  apiKey: "AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g",
  authDomain: "driveangel-ni.firebaseapp.com",
  projectId: "driveangel-ni",
  storageBucket: "driveangel-ni.appspot.com",
  messagingSenderId: "1040329608349",
  appId: "1:1040329608349:web:PENDING",
  databaseURL: "https://driveangel-ni-default-rtdb.firebaseio.com"
};
```

---

## 📋 CHECKLIST DE MIGRACIÓN

### **Archivos a Actualizar:**

- [ ] `src/services/authService.ts` - Usar Firebase Auth
- [ ] `src/services/ridesService.ts` - Usar Firebase Functions
- [ ] `src/services/driversService.ts` - Usar Firebase Functions
- [ ] `src/services/paymentsService.ts` - Usar Firebase Functions
- [ ] `src/hooks/useTracking.ts` - Usar Realtime Database
- [ ] `src/hooks/useChat.ts` - Usar Realtime Database
- [ ] `.env` - Copiar de `.env.example`

---

## 🧪 PROBAR LA CONEXIÓN

### **1. Verificar que Firebase está configurado:**

```typescript
// En cualquier componente
import { auth } from './config/firebase';

console.log('Firebase Auth:', auth);
console.log('Project ID:', auth.app.options.projectId);
// Debería mostrar: driveangel-ni
```

### **2. Probar Health Check:**

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const healthCheck = httpsCallable(functions, 'healthCheck');

const result = await healthCheck();
console.log(result.data);
// Debería mostrar: { status: "ok", service: "DriveAngel.ni Functions" }
```

### **3. Probar Registro:**

```typescript
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from './config/firebase';

const userCredential = await createUserWithEmailAndPassword(
  auth,
  'test@test.com',
  'password123'
);
console.log('Usuario creado:', userCredential.user.uid);
```

---

## ⚠️ CAMBIOS IMPORTANTES

### **1. Autenticación:**
- ❌ Ya NO usas JWT tokens
- ✅ Ahora usas Firebase Auth tokens (automático)

### **2. API Calls:**
- ❌ Ya NO usas axios
- ✅ Ahora usas `httpsCallable` de Firebase

### **3. Tracking en Tiempo Real:**
- ❌ Ya NO usas Socket.IO
- ✅ Ahora usas Firebase Realtime Database

### **4. Chat:**
- ❌ Ya NO usas WebSocket
- ✅ Ahora usas Firebase Realtime Database

---

## 🚀 COMANDOS PARA EMPEZAR

```bash
# 1. Actualizar .env
cd Frontend
cp .env.example .env

# 2. Instalar dependencias (ya instaladas)
npm install

# 3. Iniciar app
npm start

# 4. Probar en emulador
# Android: a
# iOS: i
```

---

## 📊 COMPARACIÓN

| Aspecto | Antes (NestJS) | Ahora (Firebase) |
|---------|----------------|------------------|
| **Auth** | JWT manual | Firebase Auth automático |
| **API** | axios + REST | Firebase Functions |
| **Tracking** | Socket.IO | Realtime Database |
| **Chat** | WebSocket | Realtime Database |
| **Offline** | No | Sí (automático) |
| **Escalabilidad** | Manual | Automática |

---

## ❓ PREGUNTAS FRECUENTES

### **¿Necesito cambiar todo el código?**
No, solo los servicios que hacen llamadas al backend.

### **¿Funcionará offline?**
Sí, Firebase tiene soporte offline automático.

### **¿Es más rápido?**
Sí, Firebase tiene CDN global y caché automático.

### **¿Puedo seguir usando axios?**
Técnicamente sí, pero es mejor usar Firebase SDK para aprovechar todas las ventajas.

---

## 🎯 PRÓXIMO PASO

**Opción 1: Migración Gradual (Recomendada)**
1. Primero migra Auth
2. Luego Rides
3. Luego Payments
4. Finalmente Tracking y Chat

**Opción 2: Migración Completa**
Actualizar todos los servicios de una vez.

---

**¿Quieres que te ayude a migrar algún servicio específico ahora?** 🚀
