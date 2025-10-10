# 🔥 Configuración de Firebase - DriveAngel.ni

## 📋 Paso 1: Crear Proyecto en Firebase

1. **Ir a Firebase Console:**
   ```
   https://console.firebase.google.com
   ```

2. **Crear nuevo proyecto:**
   - Clic en "Agregar proyecto"
   - Nombre: `DriveAngel`
   - ID del proyecto: `driveangel-ni`
   - Habilitar Google Analytics (opcional)
   - Crear proyecto

---

## 🔑 Paso 2: Configurar Authentication

1. **En el menú lateral, ir a "Authentication"**
2. **Clic en "Comenzar"**
3. **Habilitar método de inicio de sesión:**
   - Seleccionar "Correo electrónico/contraseña"
   - Activar el interruptor
   - Guardar

---

## 📊 Paso 3: Configurar Firestore Database

1. **En el menú lateral, ir a "Firestore Database"**
2. **Clic en "Crear base de datos"**
3. **Seleccionar modo:**
   - Modo de producción (más seguro)
   - Ubicación: `us-central1` o la más cercana
4. **Crear**

### **Reglas de seguridad iniciales:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuarios solo pueden leer/escribir su propio perfil
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Notificaciones solo para el usuario autenticado
    match /notifications/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 🔄 Paso 4: Configurar Realtime Database

1. **En el menú lateral, ir a "Realtime Database"**
2. **Clic en "Crear base de datos"**
3. **Seleccionar ubicación:** `us-central1`
4. **Modo:** Bloqueado (configuraremos reglas después)
5. **Crear**

### **Reglas de seguridad:**
```json
{
  "rules": {
    "activeRides": {
      ".read": "auth != null",
      "$rideId": {
        ".write": "auth != null"
      }
    },
    "drivers": {
      "$driverId": {
        "location": {
          ".read": "auth != null",
          ".write": "auth != null && auth.uid == $driverId"
        }
      }
    },
    "chats": {
      "$rideId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

---

## 🔐 Paso 5: Obtener Credenciales para Backend

### **5.1 Generar clave privada:**

1. **Ir a Configuración del proyecto** (ícono de engranaje)
2. **Ir a "Cuentas de servicio"**
3. **Clic en "Generar nueva clave privada"**
4. **Descargar el archivo JSON**

### **5.2 Extraer credenciales del JSON:**

El archivo descargado tendrá esta estructura:
```json
{
  "type": "service_account",
  "project_id": "driveangel-ni",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@driveangel-ni.iam.gserviceaccount.com",
  ...
}
```

### **5.3 Configurar en Backend/.env:**

```env
FIREBASE_PROJECT_ID=driveangel-ni
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@driveangel-ni.iam.gserviceaccount.com
```

**⚠️ IMPORTANTE:** 
- Mantener las comillas dobles en `FIREBASE_PRIVATE_KEY`
- NO commitear este archivo a Git

---

## 📱 Paso 6: Obtener Credenciales para Frontend

### **6.1 Agregar app web:**

1. **En Configuración del proyecto**
2. **Ir a "Tus apps"**
3. **Clic en el ícono de Web (</>)**
4. **Registrar app:**
   - Nombre: `DriveAngel Web`
   - NO marcar "Firebase Hosting"
   - Registrar app

### **6.2 Copiar configuración:**

Firebase te mostrará algo como:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "driveangel-ni.firebaseapp.com",
  projectId: "driveangel-ni",
  storageBucket: "driveangel-ni.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
  databaseURL: "https://driveangel-ni.firebaseio.com"
};
```

### **6.3 Configurar en Frontend/.env:**

```env
FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
FIREBASE_AUTH_DOMAIN=driveangel-ni.firebaseapp.com
FIREBASE_PROJECT_ID=driveangel-ni
FIREBASE_STORAGE_BUCKET=driveangel-ni.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef123456
FIREBASE_DATABASE_URL=https://driveangel-ni.firebaseio.com
```

---

## 🧪 Paso 7: Probar Conexión

### **Backend:**

```bash
cd Backend
npm run start:dev
```

Deberías ver:
```
🔥 Firebase Admin SDK inicializado correctamente
```

### **Frontend:**

```bash
cd Frontend
npm start
```

La app debería iniciar sin errores de Firebase.

---

## 📊 Paso 8: Configurar Índices en Firestore (Opcional)

Para consultas complejas, crear índices:

1. **Ir a Firestore Database**
2. **Ir a "Índices"**
3. **Crear índices compuestos:**

```
Collection: users
Fields: role (Ascending), createdAt (Descending)

Collection: notifications
Fields: userId (Ascending), read (Ascending), createdAt (Descending)
```

---

## 🔔 Paso 9: Configurar Cloud Messaging (Notificaciones Push)

### **9.1 Habilitar Cloud Messaging:**

1. **Ir a "Cloud Messaging"**
2. **Habilitar API**

### **9.2 Obtener Server Key:**

1. **En Cloud Messaging**
2. **Copiar "Server key"**
3. **Guardar para uso futuro**

---

## 💰 Paso 10: Verificar Límites del Plan Gratuito

### **Plan Spark (Gratuito):**

| Recurso | Límite Gratuito |
|---------|-----------------|
| **Firestore** | 1 GB almacenamiento |
| **Firestore** | 50K lecturas/día |
| **Firestore** | 20K escrituras/día |
| **Realtime DB** | 1 GB almacenamiento |
| **Realtime DB** | 10 GB transferencia/mes |
| **Authentication** | Ilimitado |
| **Cloud Functions** | 125K invocaciones/mes |

**Suficiente para:**
- ~1,000 usuarios activos
- ~100 viajes/día
- ~10,000 mensajes de chat/día

---

## 🔐 Seguridad

### **Mejores Prácticas:**

1. ✅ **Nunca exponer credenciales en Git**
2. ✅ **Usar reglas de seguridad estrictas**
3. ✅ **Habilitar App Check (producción)**
4. ✅ **Monitorear uso en Firebase Console**
5. ✅ **Configurar alertas de cuota**

### **Reglas de Seguridad Recomendadas:**

**Firestore:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Función helper para verificar autenticación
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Función helper para verificar si es el mismo usuario
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // Usuarios
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isOwner(userId);
    }
    
    // Notificaciones
    match /notifications/{userId}/{notificationId} {
      allow read, write: if isOwner(userId);
    }
  }
}
```

**Realtime Database:**
```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "activeRides": {
      ".read": "auth != null",
      "$rideId": {
        ".write": "auth != null"
      }
    },
    "drivers": {
      "$driverId": {
        "location": {
          ".read": "auth != null",
          ".write": "auth != null && auth.uid == $driverId"
        }
      }
    }
  }
}
```

---

## 🐛 Troubleshooting

### **Error: "Firebase: Error (auth/invalid-api-key)"**
**Solución:** Verifica que `FIREBASE_API_KEY` sea correcta

### **Error: "Firebase Admin SDK not initialized"**
**Solución:** Verifica las credenciales en Backend/.env

### **Error: "Permission denied"**
**Solución:** Revisa las reglas de seguridad en Firebase Console

### **Error: "Quota exceeded"**
**Solución:** Verifica el uso en Firebase Console → Usage

---

## ✅ Checklist de Configuración

- [ ] Proyecto creado en Firebase Console
- [ ] Authentication habilitado (Email/Password)
- [ ] Firestore Database creado
- [ ] Realtime Database creado
- [ ] Reglas de seguridad configuradas
- [ ] Clave privada descargada (Backend)
- [ ] Credenciales web obtenidas (Frontend)
- [ ] Variables de entorno configuradas
- [ ] Backend inicia sin errores
- [ ] Frontend inicia sin errores
- [ ] Conexión probada

---

## 📚 Recursos

- **Documentación Firebase:** https://firebase.google.com/docs
- **Console:** https://console.firebase.google.com
- **Precios:** https://firebase.google.com/pricing
- **Status:** https://status.firebase.google.com

---

**¡Firebase configurado y listo para usar!** 🔥

**Última actualización:** 2025-10-08
