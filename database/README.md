# 📁 Database Schemas - DriveAngel.ni

## 📊 Archivos Disponibles

### **1. supabase-only.sql** ✅
Schema SOLO para Supabase PostgreSQL (Datos Históricos)

**Contenido:**
- 7 Tablas: drivers, vehicles, rides, payments, ratings, ride_locations, analytics_events
- Índices optimizados
- Triggers para updated_at
- Vistas útiles
- Comentarios explicativos

**Uso:**
```bash
# Ir a: https://supabase.com/dashboard/project/ceytngpresytjhafcadu/sql
# Copiar y ejecutar todo el contenido de este archivo
```

---

### **2. firebase-only.json** ✅
Schema SOLO para Firebase (Datos en Tiempo Real)

**Contenido:**
- **Firestore Collections:**
  - users (perfiles de usuarios)
  - notifications (subcollection)

- **Realtime Database Paths:**
  - activeRides (viajes activos)
  - driverLocations (ubicación de conductores)
  - chats (chat en tiempo real)
  - presence (estado online)

- Estructura de documentos
- Reglas de seguridad
- Flujos de sincronización

**Uso:**
```bash
# Este archivo es de referencia
# Las reglas se despliegan con:
firebase deploy --only "firestore,database"
```

---

### **3. complete-hybrid-schema.md** ✅
Schema 100% COMPLETO (Supabase + Firebase Fusionados)

**Contenido:**
- Arquitectura completa visual
- Distribución de datos
- Flujos de sincronización (4 flujos completos)
- Comparación Firebase vs PostgreSQL
- Reglas de seguridad
- Guía de deployment
- Verificación
- Costos

**Uso:**
```bash
# Abrir y leer para entender la arquitectura completa
```

---

### **4. firestore.rules** ✅
Reglas de seguridad para Firestore

**Collections:**
- users
- notifications/{userId}/items

**Deployment:**
```bash
firebase deploy --only firestore:rules
```

---

### **5. database.rules.json** ✅
Reglas de seguridad para Realtime Database

**Paths:**
- activeRides
- driverLocations
- chats (messages, typing, metadata)
- presence

**Deployment:**
```bash
firebase deploy --only database
```

---

### **6. firestore.indexes.json** ✅
Índices de Firestore

**Índices:**
- users: role + driverStatus
- users: role + createdAt
- items (notifications): read + createdAt

**Deployment:**
```bash
firebase deploy --only firestore:indexes
```

---

## 🚀 Deployment Completo

### **Paso 1: Supabase PostgreSQL**
```bash
# 1. Ir a: https://supabase.com/dashboard/project/ceytngpresytjhafcadu/sql
# 2. Copiar contenido de: supabase-only.sql
# 3. Ejecutar
# 4. Verificar que se crearon 7 tablas
```

### **Paso 2: Firebase**
```bash
# Desplegar todo Firebase
firebase deploy --only "firestore,database"

# O por separado:
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only database
```

### **Paso 3: Verificación**

**Supabase:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
-- Debe mostrar: 7 tablas
```

**Firebase:**
```bash
# Firestore
https://console.firebase.google.com/project/driveangel-ni/firestore

# Realtime DB
https://console.firebase.google.com/project/driveangel-ni/database
```

---

## 📊 Distribución de Datos

### **FIREBASE (Tiempo Real):**
```
✅ Auth: Autenticación de usuarios
✅ Firestore:
   - users (perfil básico)
   - notifications (notificaciones)
✅ Realtime DB:
   - activeRides (tracking en vivo)
   - driverLocations (ubicación actual)
   - chats (mensajes en tiempo real)
   - presence (estado online/offline)
```

### **SUPABASE POSTGRESQL (Histórico):**
```
✅ drivers (licencia, documentos, verificación)
✅ vehicles (datos completos, matrícula, seguro)
✅ rides (historial completo de viajes)
✅ payments (Stripe, historial de pagos)
✅ ratings (calificaciones bidireccionales)
✅ ride_locations (historial de tracking)
✅ analytics_events (logs y métricas)
```

---

## 🔄 Flujo de Sincronización

### **Registro de Usuario:**
```
1. Firebase Auth crea usuario
2. Cloud Function crea perfil en Firestore (users)
3. Si es conductor → PostgreSQL (drivers + vehicles)
```

### **Solicitar Viaje:**
```
1. Cloud Function valida datos
2. Inserta en PostgreSQL (rides)
3. Publica en Realtime DB (activeRides)
4. Conductores reciben notificación
```

### **Tracking en Tiempo Real:**
```
1. Conductor acepta viaje
2. Actualiza Realtime DB (activeRides)
3. Conductor envía ubicación cada 3 segundos
4. Actualiza Realtime DB (driverLocations)
5. Cliente ve ubicación en mapa
```

### **Completar Viaje:**
```
1. Cloud Function actualiza PostgreSQL (rides)
2. Guarda tracking en PostgreSQL (ride_locations)
3. Elimina de Realtime DB (activeRides)
4. Actualiza stats en Firestore (users)
5. Crea notificación en Firestore
```

---

## 💰 Costos

```
Firebase Functions:    $0/mes (2M invocaciones gratis)
Firebase Firestore:    $0/mes (10GB gratis)
Firebase Realtime DB:  $0/mes (10GB gratis)
Firebase Auth:         $0/mes (ilimitado)
Supabase PostgreSQL:   $0/mes (500MB gratis)
────────────────────────────────────────────────
TOTAL:                 $0/mes ✅
```

---

## ✅ Estado Actual

```
✅ Supabase Schema: Listo para ejecutar
✅ Firebase Schema: Documentado y listo
✅ Firestore Rules: Actualizadas
✅ Realtime DB Rules: Actualizadas
✅ Firestore Indexes: Configurados
✅ Documentación: Completa
```

---

**Última actualización:** 2025-10-08
