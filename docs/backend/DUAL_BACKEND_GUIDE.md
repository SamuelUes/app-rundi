# 🔄 Guía de Backend Dual - DriveAngel.ni

## 🎯 Sistema Dual Implementado

Tu frontend ahora puede trabajar con **DOS backends diferentes**:

1. ✅ **Firebase Functions** (Producción + Emuladores locales)
2. ✅ **NestJS Local** (Respaldo/Desarrollo)

---

## 🚀 MODO 1: Firebase (Producción)

### **Configurar:**

```env
# Frontend/.env
BACKEND_MODE=firebase
USE_FIREBASE_EMULATORS=false
```

### **Características:**
- ✅ Usa Firebase Functions en la nube
- ✅ Usa Firebase Realtime Database
- ✅ Usa Firebase Auth
- ✅ Funciona sin backend local
- ✅ Escalable automáticamente

### **Iniciar:**
```bash
cd Frontend
npm start
```

---

## 🔧 MODO 2: Firebase Emulators (Desarrollo Local)

### **Configurar:**

```env
# Frontend/.env
BACKEND_MODE=firebase
USE_FIREBASE_EMULATORS=true
FIREBASE_EMULATOR_HOST=localhost
```

### **Iniciar Emuladores:**

```bash
# Terminal 1: Iniciar emuladores
firebase emulators:start

# Terminal 2: Iniciar frontend
cd Frontend
npm start
```

### **Características:**
- ✅ Todo funciona offline
- ✅ Datos de prueba locales
- ✅ Hot reload de functions
- ✅ Sin costos
- ✅ Dashboard en http://localhost:4000

### **Emuladores Disponibles:**
```
Functions:     http://localhost:5001
Firestore:     http://localhost:8080
Realtime DB:   http://localhost:9000
Auth:          http://localhost:9099
UI Dashboard:  http://localhost:4000
```

---

## 💻 MODO 3: NestJS Local (Respaldo)

### **Configurar:**

```env
# Frontend/.env
BACKEND_MODE=local
API_BASE_URL_LOCAL=http://192.168.1.18:3000/api
WS_URL_LOCAL=http://192.168.1.18:3000
```

### **Iniciar:**

```bash
# Terminal 1: Iniciar backend NestJS
cd Backend
npm run start:dev

# Terminal 2: Iniciar frontend
cd Frontend
npm start
```

### **Características:**
- ✅ Backend NestJS tradicional
- ✅ PostgreSQL local
- ✅ WebSocket para tracking
- ✅ Control total del código

---

## 🔄 Cambiar Entre Modos

### **Cambio Rápido:**

Solo cambia la variable `BACKEND_MODE` en `.env`:

```env
# Usar Firebase
BACKEND_MODE=firebase

# Usar NestJS local
BACKEND_MODE=local
```

**Reinicia la app** y listo.

---

## 📊 Comparación de Modos

| Aspecto | Firebase Prod | Firebase Emulators | NestJS Local |
|---------|---------------|-------------------|--------------|
| **Internet** | Requerido | No | No |
| **Costos** | $0 (gratis) | $0 | $0 |
| **Velocidad** | Rápido | Muy rápido | Rápido |
| **Datos** | Producción | Prueba | Desarrollo |
| **Hot Reload** | No | Sí | Sí |
| **Offline** | No | Sí | Sí |
| **Escalable** | Sí | No | No |

---

## 🧪 Testing

### **Probar que funciona:**

```typescript
import authService from './services/auth/authService';
import backendConfig from './config/backendConfig';

// Ver qué backend estás usando
console.log('Backend Mode:', backendConfig.mode);
console.log('API URL:', backendConfig.getApiUrl());

// Registrar usuario (funciona en ambos modos)
const user = await authService.register(
  'test@test.com',
  'password123',
  'Test User',
  '+50512345678',
  'client'
);

console.log('Usuario creado:', user);
```

---

## 🎯 Recomendaciones

### **Para Desarrollo:**
```
✅ Usa Firebase Emulators
   - Rápido
   - Sin costos
   - Datos de prueba
```

### **Para Testing:**
```
✅ Usa Firebase Producción
   - Datos reales
   - Pruebas de integración
```

### **Para Debugging:**
```
✅ Usa NestJS Local
   - Control total
   - Breakpoints
   - Logs detallados
```

---

## 📁 Estructura de Archivos

```
Frontend/
├── src/
│   ├── config/
│   │   ├── firebase.ts          ✅ Config Firebase + Emulators
│   │   └── backendConfig.ts     ✅ Config dual
│   └── services/
│       └── auth/
│           ├── authService.ts         ✅ Servicio principal (dual)
│           ├── firebaseAuthService.ts ✅ Implementación Firebase
│           └── localAuthService.ts    ✅ Implementación NestJS
└── .env                         ✅ Configuración del modo
```

---

## 🔧 Comandos Útiles

### **Firebase Emulators:**

```bash
# Iniciar todos los emulators
firebase emulators:start

# Iniciar solo functions
firebase emulators:start --only functions

# Iniciar con datos de prueba
firebase emulators:start --import=./emulator-data

# Exportar datos
firebase emulators:export ./emulator-data
```

### **Ver Logs:**

```bash
# Firebase Functions (producción)
firebase functions:log

# Firebase Emulators
# Ver en: http://localhost:4000

# NestJS Local
# Ver en la terminal donde corre
```

---

## 🐛 Troubleshooting

### **Error: "Cannot connect to emulators"**

**Solución:**
```bash
# Verificar que los emulators estén corriendo
firebase emulators:start

# Verificar puerto
netstat -an | findstr "5001"
```

### **Error: "Backend mode not recognized"**

**Solución:**
```env
# Verificar .env
BACKEND_MODE=firebase  # o 'local'
```

### **Frontend no se conecta:**

**Solución:**
```bash
# 1. Verificar .env
cat .env

# 2. Reiniciar app
npm start

# 3. Ver logs
console.log(backendConfig.mode);
```

---

## ✅ Checklist

- [ ] `.env` configurado con `BACKEND_MODE`
- [ ] Firebase emulators instalados (`firebase-tools`)
- [ ] Backend NestJS funcional (respaldo)
- [ ] Servicios duales creados
- [ ] Probado cambio entre modos
- [ ] Todo funcionando

---

## 🎉 Beneficios del Sistema Dual

1. ✅ **Flexibilidad:** Cambia de backend en segundos
2. ✅ **Desarrollo offline:** Usa emulators sin internet
3. ✅ **Respaldo:** Si Firebase falla, usa NestJS
4. ✅ **Testing:** Prueba en ambos backends
5. ✅ **Migración gradual:** Migra servicios uno por uno

---

**¡Sistema dual completamente funcional!** 🚀
