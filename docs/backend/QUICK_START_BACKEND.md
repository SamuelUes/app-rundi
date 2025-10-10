# 🚀 QUICK START - Conectar Backend con Frontend

## ✅ PASO 1: EJECUTAR SCHEMA EN SUPABASE (2 minutos)

### **Ir a Supabase SQL Editor:**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/sql/new
```

### **Copiar y ejecutar el schema:**

Abrir el archivo: `database/supabase-only.sql`

O ejecutar este SQL directamente:

```sql
-- Verificar si las tablas ya existen
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

Si no hay tablas, ejecutar todo el contenido de `database/supabase-only.sql`

---

## ✅ PASO 2: CONFIGURAR FRONTEND .env (1 minuto)

### **Crear archivo .env:**

```bash
cd Frontend
cp .env.template .env
```

### **Editar Frontend/.env:**

Asegurarse que tenga:

```env
# Backend Mode
BACKEND_MODE=firebase
USE_FIREBASE_EMULATORS=false

# Firebase
FIREBASE_API_KEY=AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g
FIREBASE_AUTH_DOMAIN=driveangel-ni.firebaseapp.com
FIREBASE_PROJECT_ID=driveangel-ni
FIREBASE_STORAGE_BUCKET=driveangel-ni.appspot.com
FIREBASE_MESSAGING_SENDER_ID=1040329608349
FIREBASE_APP_ID=1:1040329608349:web:PENDING
FIREBASE_DATABASE_URL=https://driveangel-ni-default-rtdb.firebaseio.com

# Firebase Functions URL
API_BASE_URL_FIREBASE=https://us-central1-driveangel-ni.cloudfunctions.net

# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://ceytngpresytjhafcadu.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNleXRuZ3ByZXN5dGpoYWZjYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5Nzg4NzIsImV4cCI6MjA3NTU1NDg3Mn0.3G9aCmJsjOIL-VG6E49sNnxvKBLITX-I1gFFlWKVslo

# Maps
MAPBOX_TOKEN=pk.eyJ1Ijoic2FtdWVsdWVzIiwiYSI6ImNtZ2k5OHdzbDA3NW8ybXB4OXM5Y2E2ZzYifQ.rTD0LZ2w9t_jQxEV2MR_Sg
TOMTOM_API_KEY=3NDFoFMjpXAs6W2PbCIEAMG0eAlQymMA
```

---

## ✅ PASO 3: REDESPLEGAR FUNCTIONS (2 minutos)

```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## ✅ PASO 4: INICIAR FRONTEND (1 minuto)

```bash
cd Frontend
npm start -- --clear
```

**Presionar 'a' para Android o 'w' para Web**

---

## ✅ PASO 5: PROBAR CONEXIÓN

### **Verificar en logs del Frontend:**

Deberías ver:
```
✅ Backend Mode: firebase
✅ API URL: https://us-central1-driveangel-ni.cloudfunctions.net
✅ Firebase conectado
```

### **Probar Health Check:**

```bash
curl https://us-central1-driveangel-ni.cloudfunctions.net/healthCheck
```

Resultado esperado:
```json
{
  "status": "ok",
  "timestamp": "2025-10-08T...",
  "service": "DriveAngel.ni Functions",
  "version": "1.0.0"
}
```

---

## 🧪 PASO 6: PROBAR FLUJO COMPLETO

### **1. Registrar Usuario:**
```
1. Abrir app
2. Ir a "Registrarse"
3. Llenar datos:
   - Email: test@driveangel.ni
   - Password: Test123456
   - Nombre: Usuario Test
   - Teléfono: +50512345678
   - Rol: Cliente
4. Click "Registrar"
```

**Resultado esperado:**
- ✅ Usuario creado en Firebase Auth
- ✅ Perfil creado en Firestore (users)
- ✅ Redirección a pantalla principal

---

### **2. Login:**
```
1. Email: test@driveangel.ni
2. Password: Test123456
3. Click "Iniciar Sesión"
```

**Resultado esperado:**
- ✅ Login exitoso
- ✅ Token de Firebase Auth
- ✅ Datos del usuario cargados

---

### **3. Solicitar Viaje (Cliente):**
```
1. Seleccionar origen en mapa
2. Seleccionar destino
3. Ver precio estimado
4. Click "Solicitar Viaje"
```

**Resultado esperado:**
- ✅ Viaje creado en PostgreSQL (rides)
- ✅ Viaje publicado en Realtime DB (activeRides)
- ✅ Conductores reciben notificación

---

## 🔍 VERIFICAR EN CONSOLAS

### **Firebase Console:**
```
https://console.firebase.google.com/project/driveangel-ni/overview
```

Verificar:
- ✅ Authentication → Usuarios registrados
- ✅ Firestore → Collection "users"
- ✅ Realtime Database → Path "activeRides"
- ✅ Functions → Logs de invocaciones

---

### **Supabase Console:**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/editor
```

Verificar:
- ✅ Tabla "rides" → Viajes creados
- ✅ Tabla "drivers" → Conductores registrados (si hay)
- ✅ Tabla "payments" → Pagos (si hay)

---

## 🐛 TROUBLESHOOTING

### **Error: "Network Error"**

**Causa:** Frontend no puede conectarse a Firebase Functions

**Solución:**
```bash
# Verificar .env
cat Frontend/.env | grep BACKEND_MODE
# Debe ser: BACKEND_MODE=firebase

# Limpiar caché
cd Frontend
npm start -- --clear
```

---

### **Error: "Firebase Auth not initialized"**

**Causa:** Credenciales de Firebase incorrectas

**Solución:**
```bash
# Verificar credenciales en Frontend/.env
cat Frontend/.env | grep FIREBASE_API_KEY
# Debe ser: FIREBASE_API_KEY=AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g
```

---

### **Error: "Database connection failed"**

**Causa:** PostgreSQL no está configurado

**Solución:**
1. Ir a Supabase SQL Editor
2. Ejecutar `database/supabase-only.sql`
3. Verificar que se crearon 7 tablas

---

### **Error: "Function not found"**

**Causa:** Functions no están desplegadas

**Solución:**
```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## 📊 CHECKLIST FINAL

```
✅ Schema ejecutado en Supabase (7 tablas)
✅ Frontend/.env configurado (BACKEND_MODE=firebase)
✅ Functions desplegadas (28 functions)
✅ Frontend iniciado
✅ Health check respondiendo
✅ Usuario registrado exitosamente
✅ Login funcionando
✅ Viaje solicitado correctamente
```

---

## 🎯 COMANDOS RÁPIDOS

```bash
# Ejecutar todo de una vez:

# 1. Configurar Frontend
cd Frontend
cp .env.template .env
# Editar .env: BACKEND_MODE=firebase

# 2. Redesplegar Functions
cd ../functions
npm run build
firebase deploy --only functions

# 3. Iniciar Frontend
cd ../Frontend
npm start -- --clear

# 4. Verificar Health Check
curl https://us-central1-driveangel-ni.cloudfunctions.net/healthCheck
```

---

**¡Listo para probar!** 🚀
