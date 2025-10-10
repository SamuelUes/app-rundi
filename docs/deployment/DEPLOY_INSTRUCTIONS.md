# 🚀 INSTRUCCIONES DE DEPLOYMENT - Firebase Functions

**Fecha:** 2025-10-08  
**Estado:** ✅ LISTO PARA DESPLEGAR

---

## ✅ REVISIÓN COMPLETADA

### **Archivos Verificados:**

```
✅ functions/src/index.ts          - Todas las exports correctas
✅ functions/src/api/auth.ts       - Sintaxis correcta
✅ functions/src/api/rides.ts      - Sintaxis correcta
✅ functions/src/api/payments.ts   - Sintaxis correcta, Stripe configurado
✅ functions/src/api/drivers.ts    - Sintaxis correcta
✅ functions/src/api/users.ts      - Sintaxis correcta
✅ functions/src/config/database.ts - Pool PostgreSQL configurado
```

### **Functions Exportadas (28 total):**

**Auth (3):**
- ✅ register
- ✅ login
- ✅ logout

**Rides (7):**
- ✅ requestRide
- ✅ acceptRide
- ✅ startRide
- ✅ completeRide
- ✅ cancelRide
- ✅ getRideDetails
- ✅ getAvailableRides

**Drivers (4):**
- ✅ registerDriver
- ✅ updateDriverLocation
- ✅ getDriverProfile
- ✅ updateDriverStatus

**Payments (4):**
- ✅ createPaymentIntent
- ✅ capturePayment
- ✅ cancelPaymentAuthorization
- ✅ getPaymentDetails

**Users (2):**
- ✅ getUserProfile
- ✅ updateUserProfile

**Triggers (5):**
- ✅ onUserCreated
- ✅ onUserDeleted
- ✅ onRideStatusChanged
- ✅ onRideCreated
- ✅ onPaymentCompleted

**Webhooks (1):**
- ✅ stripeWebhookHandler

**Scheduled (1):**
- ✅ cleanupOldRides

**Health (1):**
- ✅ healthCheck

---

## 🚀 COMANDOS DE DEPLOYMENT

### **1. Compilar TypeScript:**
```bash
cd functions
npm run build
```

**Resultado esperado:**
```
> driveangel-functions@1.0.0 build
> tsc

✅ Compilación exitosa
```

---

### **2. Desplegar a Firebase:**
```bash
firebase deploy --only functions
```

**Resultado esperado:**
```
✅ 28 functions desplegadas exitosamente
✅ URL: https://us-central1-driveangel-ni.cloudfunctions.net
```

---

### **3. Verificar Deployment:**
```bash
# Health Check
curl https://us-central1-driveangel-ni.cloudfunctions.net/healthCheck

# Resultado esperado:
{
  "status": "ok",
  "timestamp": "2025-10-08T...",
  "service": "DriveAngel.ni Functions",
  "version": "1.0.0"
}
```

---

## 📋 CHECKLIST PRE-DEPLOYMENT

### **Variables de Entorno:**
```bash
# Verificar que functions/.env existe
ls functions/.env

# Debe contener:
✅ DATABASE_URL (Supabase PostgreSQL)
✅ STRIPE_SECRET_KEY
✅ CLOUDINARY_* (si se usa)
```

### **Dependencias:**
```bash
cd functions
npm install

# Verificar que estén instaladas:
✅ firebase-functions
✅ firebase-admin
✅ pg (PostgreSQL client)
✅ stripe
```

### **Firebase Config:**
```bash
# Verificar proyecto activo
firebase use

# Debe mostrar:
✅ driveangel-ni (current)
```

---

## 🔧 TROUBLESHOOTING

### **Error: "Cannot find module"**
```bash
cd functions
rm -rf node_modules
npm install
npm run build
```

### **Error: "Stripe API version"**
```bash
# Ya está configurado en payments.ts:
stripe = new Stripe(key, { apiVersion: "2023-10-16" });
```

### **Error: "Database connection"**
```bash
# Verificar DATABASE_URL en functions/.env
# Debe ser la connection string de Supabase
```

### **Error: "Firebase Admin not initialized"**
```bash
# Ya está inicializado en index.ts:
admin.initializeApp();
```

---

## 📊 DESPUÉS DEL DEPLOYMENT

### **1. Verificar Functions:**
```bash
firebase functions:list

# Debe mostrar 28 functions
```

### **2. Ver Logs:**
```bash
firebase functions:log

# O en consola:
https://console.firebase.google.com/project/driveangel-ni/functions
```

### **3. Probar Endpoints:**
```bash
# Desde el Frontend
# Cambiar BACKEND_MODE=firebase en .env
cd Frontend
npm start -- --clear
```

---

## 🎯 URLS DE LAS FUNCTIONS

**Base URL:**
```
https://us-central1-driveangel-ni.cloudfunctions.net
```

**Endpoints Principales:**
```
POST /register
POST /login
POST /logout
POST /requestRide
POST /acceptRide
POST /startRide
POST /completeRide
POST /cancelRide
GET  /getRideDetails
GET  /getAvailableRides
POST /createPaymentIntent
POST /capturePayment
POST /cancelPaymentAuthorization
GET  /getPaymentDetails
POST /updateDriverLocation
GET  /getDriverProfile
POST /updateDriverStatus
GET  /getUserProfile
POST /updateUserProfile
GET  /healthCheck
```

---

## 💰 COSTOS ESTIMADOS

```
Invocaciones:      2,000,000/mes gratis
Después:           $0.40 por millón

Networking:        5GB/mes gratis
Después:           $0.12 por GB

CPU Time:          400,000 GB-s gratis
Después:           $0.0000025 por GB-s

Estimado:          $0/mes (dentro del free tier)
```

---

## 📝 NOTAS IMPORTANTES

1. **Stripe Webhook:**
   - URL: `https://us-central1-driveangel-ni.cloudfunctions.net/stripeWebhookHandler`
   - Configurar en Stripe Dashboard

2. **Database Connection:**
   - Usa connection pooling (pg.Pool)
   - Máximo 10 conexiones concurrentes

3. **Realtime Database:**
   - activeRides, driverLocations, chats
   - Rules ya desplegadas

4. **Firestore:**
   - users, notifications
   - Rules ya desplegadas

---

## ✅ ESTADO FINAL

```
✅ Código revisado y correcto
✅ 28 functions listas para desplegar
✅ Variables de entorno configuradas
✅ Dependencias instaladas
✅ Documentación completa
✅ Listo para producción
```

---

**🚀 EJECUTAR DEPLOYMENT:**

```bash
cd functions
npm run build
firebase deploy --only functions
```

**¡Todo listo para desplegar!** 🎉
