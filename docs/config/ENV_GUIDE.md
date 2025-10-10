# 📝 Guía de Variables de Entorno - DriveAngel.ni

## 🎯 ESTRUCTURA SIMPLIFICADA

Ahora solo hay **1 archivo .env por carpeta**:

```
App-Uber/
├── Frontend/
│   ├── .env.template     (template)
│   └── .env              ✅ Archivo real (copiado de template)
│
├── Backend/
│   ├── .env.template     (template)
│   └── .env              ✅ Archivo real (copiado de template)
│
└── functions/
    ├── .env.template     (template)
    └── .env              ✅ Archivo real (copiado de template)
```

**IMPORTANTE:** Los archivos `.env` NO se commitean (están en .gitignore). Los `.env.template` SÍ se commitean.

---

## 🚀 CONFIGURACIÓN RÁPIDA

### **Opción 1: Script Automático (Recomendado)**

```powershell
# Ejecutar desde la raíz del proyecto
.\setup-env.ps1
```

Esto:
- ✅ Copia `.env.template` a `.env` en cada carpeta
- ✅ Elimina archivos viejos
- ✅ Configura todo automáticamente

---

### **Opción 2: Manual**

```bash
# Frontend
cp Frontend/.env.template Frontend/.env

# Backend (solo si usas NestJS local)
cp Backend/.env.template Backend/.env

# Functions
cp functions/.env.template functions/.env
```

---

## 📁 DESCRIPCIÓN DE CADA .env

### **1. Frontend/.env** (Principal)

**Propósito:** Configurar la app React Native

**Variables importantes:**
```env
BACKEND_MODE=firebase              # 'firebase' o 'local'
USE_FIREBASE_EMULATORS=false       # true para desarrollo local
FIREBASE_API_KEY=...               # Credenciales Firebase
EXPO_PUBLIC_SUPABASE_URL=...       # Supabase PostgreSQL
```

**Cuándo usar cada modo:**
- `BACKEND_MODE=firebase` → Usa Firebase Functions (RECOMENDADO)
- `BACKEND_MODE=local` → Usa NestJS local (solo desarrollo)

---

### **2. Backend/.env** (Respaldo)

**Propósito:** Configurar NestJS (solo como respaldo)

**Variables importantes:**
```env
PORT=3000
DATABASE_URL=postgresql://...      # Supabase
JWT_SECRET=...                     # Para autenticación
STRIPE_SECRET_KEY=...              # Pagos
```

**Nota:** Este backend es **respaldo**. El principal es Firebase Functions.

---

### **3. functions/.env** (Principal)

**Propósito:** Configurar Firebase Functions (backend principal)

**Variables importantes:**
```env
DATABASE_URL=postgresql://...      # Supabase
STRIPE_SECRET_KEY=...              # Pagos
CLOUDINARY_CLOUD_NAME=...          # Upload de imágenes
```

**Nota:** Este es el **backend principal** en producción.

---

## 🔄 CAMBIAR ENTRE MODOS

### **Usar Firebase (Producción):**

```env
# Frontend/.env
BACKEND_MODE=firebase
USE_FIREBASE_EMULATORS=false
```

### **Usar Firebase Emulators (Desarrollo Local):**

```env
# Frontend/.env
BACKEND_MODE=firebase
USE_FIREBASE_EMULATORS=true
```

Luego iniciar emulators:
```bash
firebase emulators:start
```

### **Usar NestJS Local (Respaldo):**

```env
# Frontend/.env
BACKEND_MODE=local
```

Luego iniciar NestJS:
```bash
cd Backend
npm run start:dev
```

---

## 🧹 ARCHIVOS ELIMINADOS

Los siguientes archivos ya NO son necesarios:

```
❌ Frontend/.env.production
❌ Frontend/.env.example
❌ Backend/.env.production
❌ Backend/.env.example
❌ functions/.env.example
```

Ahora solo usamos:
```
✅ Frontend/.env.template  → copiar a .env
✅ Backend/.env.template   → copiar a .env
✅ functions/.env.template → copiar a .env
```

---

## 🔒 SEGURIDAD

### **Archivos en .gitignore:**

```gitignore
# NO commitear estos archivos:
.env
.env.local
.env.development
.env.production

# SÍ commitear estos:
.env.template
.env.example (si existe)
```

### **Archivos seguros para Git:**

```
✅ .env.template   (sin datos sensibles)
❌ .env            (con datos reales)
```

---

## 📊 FLUJO DE TRABAJO

### **Desarrollo:**

```bash
# 1. Configurar .env
.\setup-env.ps1

# 2. Iniciar Frontend
cd Frontend
npm start

# 3. (Opcional) Iniciar emulators
firebase emulators:start
```

### **Producción:**

```bash
# 1. Asegurar que Frontend/.env tenga:
BACKEND_MODE=firebase
USE_FIREBASE_EMULATORS=false

# 2. Desplegar Functions
cd functions
npm run build
firebase deploy --only functions

# 3. Iniciar Frontend
cd Frontend
npm start
```

---

## ⚙️ VARIABLES POR SERVICIO

### **Firebase:**
```env
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
FIREBASE_DATABASE_URL
```

### **Supabase:**
```env
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_KEY
DATABASE_URL
```

### **Stripe:**
```env
STRIPE_PUBLIC_KEY    (Frontend)
STRIPE_SECRET_KEY    (Backend/Functions)
STRIPE_WEBHOOK_SECRET
```

### **Maps:**
```env
GOOGLE_MAPS_API_KEY
MAPBOX_TOKEN
TOMTOM_API_KEY
```

---

## 🆘 TROUBLESHOOTING

### **Error: "Cannot find module '@env'"**

```bash
# Limpiar caché
cd Frontend
npm start -- --clear
```

### **Error: "Network Error"**

Verificar que `BACKEND_MODE` esté correcto en `Frontend/.env`:
```bash
cat Frontend/.env | grep BACKEND_MODE
```

### **Error: "Firebase not configured"**

Verificar que las credenciales Firebase estén en `Frontend/.env`:
```bash
cat Frontend/.env | grep FIREBASE_API_KEY
```

---

## ✅ CHECKLIST

Antes de iniciar la app:

- [ ] Ejecuté `.\setup-env.ps1` o copié los templates
- [ ] `Frontend/.env` existe y tiene `BACKEND_MODE=firebase`
- [ ] Las credenciales Firebase están correctas
- [ ] Las credenciales Supabase están correctas
- [ ] Si uso emulators: `firebase emulators:start` está corriendo
- [ ] Si uso NestJS: `Backend/.env` está configurado

---

**¡Listo! Ahora tienes una estructura de .env limpia y organizada** 🎉
