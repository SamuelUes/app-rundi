# 📁 Estructura del Proyecto - DriveAngel.ni

## 🎯 Arquitectura de 3 Capas

```
┌─────────────────────────────────────┐
│         FRONTEND                    │
│      (React Native)                 │
│                                     │
│  Puede conectarse a:                │
│  ├─ Firebase Functions              │
│  ├─ Firebase Emulators              │
│  └─ Backend NestJS (respaldo)       │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│         BACKEND (2 opciones)        │
│                                     │
│  Opción 1: functions/               │
│  ✅ Firebase Functions              │
│  ✅ Desplegado en producción        │
│  ✅ 28 functions activas            │
│                                     │
│  Opción 2: Backend/                 │
│  ✅ NestJS tradicional              │
│  ✅ Respaldo y desarrollo           │
│  ✅ Control total                   │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│         DATABASES                   │
│                                     │
│  Firebase:                          │
│  ├─ Auth                            │
│  ├─ Firestore (users, notif)        │
│  └─ Realtime DB (tracking, chat)    │
│                                     │
│  Supabase PostgreSQL:               │
│  └─ 7 tablas (drivers, rides, etc)  │
└─────────────────────────────────────┘
```

---

## 📂 ESTRUCTURA DE CARPETAS

### **Backend/ (NestJS - RESPALDO)**

```
Backend/
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── dto/
│   ├── rides/
│   │   ├── rides.controller.ts
│   │   ├── rides.service.ts
│   │   └── dto/
│   ├── drivers/
│   ├── payments/
│   ├── tracking/
│   ├── notifications/
│   └── upload/
├── package.json
├── .env
└── README.md
```

**Propósito:**
- ✅ Respaldo completo del backend
- ✅ Desarrollo local con hot reload
- ✅ Debugging profundo
- ✅ Referencia para migrar a Functions

**Estado:** ✅ Funcional, mantenido

**Comando:** `npm run start:dev`

---

### **functions/ (Firebase Functions - PRODUCCIÓN)**

```
functions/
├── src/
│   ├── index.ts                    (punto de entrada)
│   ├── config/
│   │   ├── firebase.ts
│   │   └── database.ts            (Supabase)
│   ├── api/
│   │   ├── auth.ts                ✅ Migrado
│   │   ├── rides.ts               ⏳ Por migrar
│   │   ├── drivers.ts             ⏳ Por migrar
│   │   ├── payments.ts            ⏳ Por migrar
│   │   └── users.ts               ⏳ Por migrar
│   ├── triggers/
│   │   ├── auth.ts
│   │   ├── rides.ts
│   │   └── payments.ts
│   ├── webhooks/
│   │   └── stripe.ts
│   └── services/
├── package.json
├── .env.example
└── README.md
```

**Propósito:**
- ✅ Backend en producción
- ✅ Serverless, escalable
- ✅ Integrado con Firebase

**Estado:** ✅ Desplegado, 28 functions activas

**Comando:** `firebase deploy --only functions`

---

### **Frontend/ (React Native)**

```
Frontend/
├── src/
│   ├── config/
│   │   ├── backendConfig.ts       ✅ Sistema dual
│   │   └── firebase.ts            ✅ Firebase + Emulators
│   ├── services/
│   │   ├── auth/
│   │   │   ├── authService.ts         ✅ Router dual
│   │   │   ├── firebaseAuthService.ts ✅ Firebase
│   │   │   └── localAuthService.ts    ✅ NestJS
│   │   ├── rides/                 ⏳ Por migrar
│   │   ├── drivers/               ⏳ Por migrar
│   │   └── payments/              ⏳ Por migrar
│   ├── screens/
│   ├── components/
│   └── hooks/
├── .env                           ✅ BACKEND_MODE aquí
├── .env.example
└── package.json
```

**Propósito:**
- ✅ App móvil React Native
- ✅ Puede usar Firebase o NestJS
- ✅ Sistema dual implementado

**Estado:** ✅ Funcional, parcialmente migrado

---

### **database/ (Schemas y Reglas)**

```
database/
├── schema.sql                     ✅ PostgreSQL (Supabase)
├── firestore.rules                ✅ Firestore security
├── database.rules.json            ✅ Realtime DB security
├── firestore.indexes.json         ✅ Firestore indexes
└── firebase-schema.md             ✅ Documentación
```

**Propósito:**
- ✅ Definición de schemas
- ✅ Reglas de seguridad
- ✅ Documentación de estructura

---

## 🔄 FLUJO DE MIGRACIÓN

### **De Backend/ a functions/:**

```
1. Desarrollar en Backend/src/rides/rides.service.ts
   ↓
2. Probar localmente
   ↓
3. Copiar lógica a functions/src/api/rides.ts
   ↓
4. Adaptar a Firebase Functions
   ↓
5. Desplegar: firebase deploy --only functions
   ↓
6. Mantener Backend/ como respaldo
```

---

## 🎯 CUÁNDO USAR CADA UNO

### **Usar Backend/ (NestJS) cuando:**
- 🔧 Desarrollas features nuevas complejas
- 🐛 Necesitas debugging profundo
- 📊 Quieres consultas SQL complejas
- 🔄 Necesitas hot reload rápido
- 💻 Trabajas offline sin Firebase

### **Usar functions/ (Firebase) cuando:**
- 🚀 Despliegas a producción
- ⚡ Necesitas escalabilidad automática
- 🔥 Usas features de Firebase (Auth, Realtime)
- 💰 Quieres minimizar costos
- 🌍 Necesitas CDN global

---

## 📊 COMPARACIÓN

| Aspecto | Backend/ (NestJS) | functions/ (Firebase) |
|---------|-------------------|----------------------|
| **Estado** | Respaldo | Producción |
| **Despliegue** | Manual (VPS) | Automático |
| **Escalabilidad** | Manual | Automática |
| **Costos** | $5-20/mes | $0-5/mes |
| **Control** | Total | Limitado |
| **Hot Reload** | Sí | Solo emulators |
| **Offline** | Sí | Solo emulators |
| **Debugging** | Fácil | Medio |

---

## ✅ ESTADO ACTUAL

### **Backend/ (NestJS):**
```
✅ Código completo
✅ Funcional
✅ Mantenido como respaldo
✅ Listo para desarrollo
```

### **functions/ (Firebase):**
```
✅ 28 functions desplegadas
✅ Auth migrado
⏳ Rides por migrar
⏳ Payments por migrar
⏳ Drivers por migrar
```

### **Frontend/:**
```
✅ Sistema dual implementado
✅ Auth service migrado
⏳ Otros servicios por migrar
```

---

## 🎯 RECOMENDACIÓN

### **Mantener AMBOS:**

1. **Backend/** - Como respaldo y desarrollo
2. **functions/** - Como producción

### **Ventajas:**
- ✅ Flexibilidad total
- ✅ Respaldo completo
- ✅ Migración gradual
- ✅ Sin riesgo

---

## 📝 PRÓXIMOS PASOS

1. ✅ Mantener Backend/ funcional
2. ⏳ Migrar servicios de Backend/ a functions/
3. ⏳ Actualizar Frontend/ para usar ambos
4. ✅ Documentar diferencias
5. ✅ Testing en ambos backends

---

**Ambos backends coexisten y se complementan** 🚀
