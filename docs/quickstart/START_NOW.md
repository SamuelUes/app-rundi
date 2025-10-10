# 🚀 INICIAR BACKEND Y FRONTEND - AHORA

## ✅ LO QUE YA ESTÁ LISTO:

```
✅ Backend: 28 functions desplegadas
✅ Firestore: Rules activas
✅ Realtime DB: Rules activas
✅ Stripe Webhook: Implementado y desplegando
✅ Frontend/.env: Creado y configurado
✅ Backend/.env: Creado
✅ functions/.env: Creado
```

---

## 🚀 PASO 1: EJECUTAR SCHEMA EN SUPABASE (2 MINUTOS)

### **Abrir en navegador:**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/sql/new
```

### **Copiar y ejecutar:**

Abrir el archivo: `database/supabase-only.sql`

Copiar TODO el contenido y pegarlo en el SQL Editor de Supabase.

Click en "RUN" o presionar Ctrl+Enter.

**Resultado esperado:**
```
✅ 7 tablas creadas:
   - drivers
   - vehicles
   - rides
   - payments
   - ratings
   - ride_locations
   - analytics_events
```

---

## 🚀 PASO 2: INICIAR FRONTEND (1 MINUTO)

### **Ejecutar en terminal:**

```bash
cd Frontend
npm start -- --clear
```

### **Cuando aparezca el QR:**

Presionar:
- **'a'** para abrir en Android
- **'w'** para abrir en Web
- **'i'** para abrir en iOS (solo Mac)

---

## ✅ VERIFICAR QUE FUNCIONA

### **En los logs del Frontend deberías ver:**

```
✅ Backend Mode: firebase
✅ API URL: https://us-central1-driveangel-ni.cloudfunctions.net
✅ Firebase Auth conectado
✅ Firestore conectado
✅ Realtime DB conectado
```

### **Si ves esto, significa que está MAL:**

```
❌ API URL: http://192.168.1.18:3000/api
❌ Network Error
```

**Solución:**
```bash
# Detener la app (Ctrl+C)
# Verificar .env
cat .env | grep BACKEND_MODE
# Debe decir: BACKEND_MODE=firebase

# Si no, editar .env y cambiar a:
# BACKEND_MODE=firebase

# Reiniciar
npm start -- --clear
```

---

## 🧪 PROBAR REGISTRO DE USUARIO

### **1. En la app, ir a "Registrarse"**

### **2. Llenar datos:**
```
Email:    test@driveangel.ni
Password: Test123456
Nombre:   Usuario Test
Teléfono: +50512345678
Rol:      Cliente
```

### **3. Click "Registrar"**

### **Resultado esperado:**

**En Firebase Console:**
```
https://console.firebase.google.com/project/driveangel-ni/authentication/users
```
- ✅ Usuario aparece en Authentication
- ✅ Perfil creado en Firestore (users collection)

**En la app:**
- ✅ Registro exitoso
- ✅ Redirección a pantalla principal
- ✅ Usuario logueado

---

## 🧪 PROBAR LOGIN

### **1. Cerrar sesión (si está logueado)**

### **2. Ir a "Iniciar Sesión"**

### **3. Ingresar:**
```
Email:    test@driveangel.ni
Password: Test123456
```

### **4. Click "Iniciar Sesión"**

### **Resultado esperado:**
- ✅ Login exitoso
- ✅ Token de Firebase Auth
- ✅ Datos del usuario cargados
- ✅ Redirección a pantalla principal

---

## 🧪 PROBAR SOLICITAR VIAJE

### **1. En la pantalla principal (como Cliente)**

### **2. Seleccionar origen en el mapa**

### **3. Seleccionar destino**

### **4. Ver precio estimado**

### **5. Click "Solicitar Viaje"**

### **Resultado esperado:**

**En Supabase:**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/editor
```
- ✅ Tabla "rides" tiene un nuevo registro

**En Firebase Realtime DB:**
```
https://console.firebase.google.com/project/driveangel-ni/database/data
```
- ✅ Path "activeRides" tiene el viaje

**En la app:**
- ✅ Viaje solicitado
- ✅ Esperando conductor
- ✅ Mapa mostrando origen y destino

---

## 🔍 VER LOGS EN TIEMPO REAL

### **Firebase Functions Logs:**
```bash
firebase functions:log --only register,login,requestRide
```

O en consola:
```
https://console.firebase.google.com/project/driveangel-ni/functions/logs
```

---

## 🐛 TROUBLESHOOTING

### **Error: "Network Error" al registrar**

**Solución:**
```bash
# Verificar que Frontend/.env tenga:
cat Frontend/.env | grep BACKEND_MODE
# Debe ser: BACKEND_MODE=firebase

# Si no, editar y cambiar a firebase
# Luego reiniciar:
npm start -- --clear
```

---

### **Error: "Firebase Auth not initialized"**

**Solución:**
```bash
# Verificar credenciales
cat Frontend/.env | grep FIREBASE_API_KEY
# Debe ser: FIREBASE_API_KEY=AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g
```

---

### **Error: "Cannot connect to database"**

**Solución:**
1. Ir a Supabase SQL Editor
2. Ejecutar `database/supabase-only.sql`
3. Verificar que se crearon 7 tablas

---

## 📊 CHECKLIST

```
✅ Schema ejecutado en Supabase
✅ Frontend/.env configurado (BACKEND_MODE=firebase)
✅ Frontend iniciado
✅ Logs muestran conexión a Firebase
✅ Registro de usuario funciona
✅ Login funciona
✅ Solicitar viaje funciona
```

---

## 🎯 COMANDOS PARA COPIAR Y PEGAR

```bash
# Terminal 1: Iniciar Frontend
cd d:\Documentos\GitHub\App-Uber\Frontend
npm start -- --clear

# Terminal 2: Ver logs de Functions (opcional)
cd d:\Documentos\GitHub\App-Uber
firebase functions:log
```

---

## 🔗 URLS ÚTILES

**Firebase Console:**
```
https://console.firebase.google.com/project/driveangel-ni/overview
```

**Supabase SQL Editor:**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/sql/new
```

**Health Check:**
```
https://us-central1-driveangel-ni.cloudfunctions.net/healthCheck
```

---

**¡TODO LISTO! SOLO EJECUTA LOS COMANDOS** 🚀
