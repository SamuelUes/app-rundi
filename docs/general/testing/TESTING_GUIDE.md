# 🧪 GUÍA DE TESTING - DriveAngel

## 📋 **PREPARACIÓN ANTES DE PROBAR**

### **1. Instalar Dependencias**

```bash
# Frontend - Notificaciones
cd Frontend
npx expo install expo-notifications expo-constants expo-device
npm install

# Backend NestJS (para historial y emergencias)
cd ../Backend
npm install @supabase/supabase-js
npm install

# Firebase Functions (opcional)
cd ../functions
npm install @supabase/supabase-js
npm run build
```

---

### **2. Configurar Variables de Entorno**

#### **Frontend/.env**
```env
# Backend Mode
BACKEND_MODE=local
USE_FIREBASE_EMULATORS=false

# Firebase
FIREBASE_API_KEY=AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g
FIREBASE_AUTH_DOMAIN=driveangel-ni.firebaseapp.com
FIREBASE_PROJECT_ID=driveangel-ni
FIREBASE_STORAGE_BUCKET=driveangel-ni.appspot.com
FIREBASE_MESSAGING_SENDER_ID=1040329608349
FIREBASE_APP_ID=1:1040329608349:web:abc123

# API URLs
API_BASE_URL_LOCAL=http://localhost:3000/api
API_BASE_URL_FIREBASE=https://us-central1-driveangel-ni.cloudfunctions.net

# Supabase
SUPABASE_URL=https://ceytngpresytjhafcadu.supabase.co
SUPABASE_ANON_KEY=<tu_anon_key>

# Stripe
STRIPE_PUBLIC_KEY=pk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH

# Google Maps
GOOGLE_MAPS_API_KEY=<tu_google_maps_key>
```

#### **Backend/.env**
```env
# Supabase
SUPABASE_URL=https://ceytngpresytjhafcadu.supabase.co
SUPABASE_SERVICE_KEY=<tu_service_role_key>

# Database PostgreSQL
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=driveangel

# JWT
JWT_SECRET=your_jwt_secret_key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

### **3. Aplicar Schema en Supabase**

1. Ir a: https://ceytngpresytjhafcadu.supabase.co
2. SQL Editor → New Query
3. Ejecutar: `database/migrations/add_emergency_calls.sql`
4. Verificar que se creó la tabla `emergency_calls`

---

### **4. Iniciar Servicios**

#### **Opción A: Backend NestJS (Recomendado para testing)**
```bash
cd Backend
npm run start:dev
# Backend en: http://localhost:3000/api
```

#### **Opción B: Firebase Functions**
```bash
# Ya desplegadas en producción
# URL: https://us-central1-driveangel-ni.cloudfunctions.net
```

#### **Frontend**
```bash
cd Frontend
npm start -- --clear
# Escanear QR con Expo Go
```

---

## ✅ **CHECKLIST DE TESTING**

### **1. Dark Mode** 🌙

#### **Acceso a Settings:**
- [ ] Abrir app e iniciar sesión
- [ ] **Cliente:** Tocar botón ⚙️ en la esquina superior derecha del HomeScreen
- [ ] **Conductor:** Ir a navegación y seleccionar "Configuración"

#### **Cambiar Tema:**
- [ ] Cambiar tema a "Oscuro"
- [ ] Verificar que todos los colores cambien
- [ ] Cambiar a "Claro"
- [ ] Cambiar a "Auto" (debe seguir el tema del sistema)
- [ ] Cerrar y abrir app (debe mantener el tema seleccionado)

**Resultado esperado:**
- ✅ Colores se adaptan correctamente
- ✅ StatusBar cambia de color
- ✅ Tema persiste después de cerrar app

---

### **2. Notificaciones Push** 🔔

#### **Permisos:**
- [ ] Al abrir app por primera vez, debe solicitar permisos
- [ ] Aceptar permisos de notificaciones

#### **Notificaciones de Nuevos Viajes:**
- [ ] Iniciar sesión como conductor
- [ ] Ir a "Viajes Disponibles"
- [ ] Crear un nuevo viaje desde otra cuenta (cliente)
- [ ] Verificar que aparece notificación local
- [ ] Verificar que badge se actualiza

#### **Badge:**
- [ ] Verificar que el ícono de la app muestra el número de viajes
- [ ] Al aceptar un viaje, el badge debe disminuir

**Resultado esperado:**
- ✅ Notificaciones aparecen correctamente
- ✅ Badge se actualiza
- ✅ Al tocar notificación, abre la app

---

### **3. Botón de Emergencia** 🚨

#### **En DriverHomeScreen:**
- [ ] Iniciar sesión como conductor
- [ ] Verificar botón SOS flotante (esquina inferior derecha)
- [ ] Tocar botón SOS
- [ ] Verificar que aparece modal con 2 opciones

#### **Llamada a Policía:**
- [ ] Seleccionar "👮 Policía (118)"
- [ ] Verificar que se abre el dialer con número 118
- [ ] Cancelar llamada

#### **Llamada a Ambulancia:**
- [ ] Tocar botón SOS nuevamente
- [ ] Seleccionar "🚑 Ambulancia (102)"
- [ ] Verificar que se abre el dialer con número 102
- [ ] Cancelar llamada

**Resultado esperado:**
- ✅ Modal aparece correctamente
- ✅ Dialer se abre con número correcto
- ✅ Ubicación se captura (verificar en logs)

---

### **4. Historial del Día** 📊

#### **Prerequisito: Tener Backend NestJS corriendo**

- [ ] Iniciar sesión como conductor
- [ ] Ir a "Viajes de Hoy" (desde navegación)
- [ ] Verificar estadísticas: Viajes y Ganancias
- [ ] Verificar lista de viajes del día

#### **Con Viajes:**
- [ ] Completar al menos 1 viaje
- [ ] Refrescar pantalla (pull to refresh)
- [ ] Verificar que aparece el viaje
- [ ] Verificar estadísticas actualizadas
- [ ] Tocar un viaje para ver detalles

#### **Sin Viajes:**
- [ ] Si no hay viajes, debe mostrar mensaje vacío
- [ ] Verificar botón "Actualizar"

**Resultado esperado:**
- ✅ Estadísticas correctas
- ✅ Lista de viajes se muestra
- ✅ Pull to refresh funciona
- ✅ Navegación a detalles funciona

---

### **5. Filtros de Viajes** 🎛️

#### **Abrir Filtros:**
- [ ] Ir a "Viajes Disponibles"
- [ ] Tocar botón 🎛️ en header
- [ ] Verificar que aparece modal de filtros

#### **Filtro por Distancia:**
- [ ] Establecer mínimo: 0 km
- [ ] Establecer máximo: 5 km
- [ ] Aplicar filtros
- [ ] Verificar que solo aparecen viajes cercanos
- [ ] Verificar contador: "X de Y viajes"

#### **Filtro por Precio:**
- [ ] Abrir filtros nuevamente
- [ ] Establecer mínimo: C$50
- [ ] Establecer máximo: C$200
- [ ] Aplicar filtros
- [ ] Verificar que solo aparecen viajes en ese rango

#### **Filtro por Tipo:**
- [ ] Abrir filtros
- [ ] Seleccionar "Normal"
- [ ] Aplicar filtros
- [ ] Verificar que solo aparecen viajes normales

#### **Restablecer:**
- [ ] Abrir filtros
- [ ] Tocar "Restablecer"
- [ ] Verificar que todos los filtros vuelven a default
- [ ] Aplicar
- [ ] Verificar que aparecen todos los viajes

**Resultado esperado:**
- ✅ Filtros se aplican correctamente
- ✅ Contador muestra viajes filtrados
- ✅ Restablecer funciona
- ✅ Filtros persisten al navegar

---

### **6. Mapa con Pins** 🗺️

#### **Toggle Vista:**
- [ ] Ir a "Viajes Disponibles"
- [ ] Tocar botón 🗺️ en header
- [ ] Verificar que cambia a vista de mapa
- [ ] Tocar botón 📋 en header
- [ ] Verificar que vuelve a lista

#### **Vista de Mapa:**
- [ ] Cambiar a vista de mapa
- [ ] Verificar que aparece el mapa
- [ ] Verificar que aparece tu ubicación (punto azul)
- [ ] Verificar que aparecen pins verdes (viajes disponibles)

#### **Interacción con Pins:**
- [ ] Tocar un pin verde
- [ ] Verificar que aparece callout con info del viaje
- [ ] Tocar el callout
- [ ] Verificar que aparece card flotante en la parte inferior

#### **Card Flotante:**
- [ ] Verificar que muestra:
  - Precio
  - Origen
  - Destino
  - Distancia y duración
  - Botón "Aceptar Viaje"
- [ ] Tocar botón X para cerrar
- [ ] Verificar que el card desaparece

#### **Aceptar desde Mapa:**
- [ ] Tocar un pin
- [ ] Tocar "Aceptar Viaje" en el card
- [ ] Verificar que aparece confirmación
- [ ] Confirmar
- [ ] Verificar que navega a pantalla de viaje activo

**Resultado esperado:**
- ✅ Toggle funciona correctamente
- ✅ Mapa muestra ubicación y pins
- ✅ Callouts funcionan
- ✅ Card flotante se muestra correctamente
- ✅ Aceptar viaje funciona

---

## 🐛 **PROBLEMAS COMUNES**

### **Notificaciones no aparecen:**
```bash
# Verificar permisos
# iOS: Settings → [App] → Notifications → Allow
# Android: Settings → Apps → [App] → Notifications → Allow
```

### **Backend NestJS no conecta:**
```bash
# Verificar que está corriendo
cd Backend
npm run start:dev

# Verificar URL en Frontend/.env
API_BASE_URL_LOCAL=http://localhost:3000/api
```

### **Historial vacío:**
```bash
# Verificar que Supabase está configurado
# Verificar SUPABASE_SERVICE_KEY en Backend/.env
# Verificar que la tabla emergency_calls existe
```

### **Mapa no carga:**
```bash
# Verificar permisos de ubicación
# iOS: Settings → [App] → Location → While Using
# Android: Settings → Apps → [App] → Permissions → Location
```

### **Filtros no funcionan:**
```bash
# Limpiar caché
cd Frontend
npm start -- --clear
```

---

## 📊 **CHECKLIST FINAL**

```
✅ Dark Mode funciona
✅ Notificaciones aparecen
✅ Botón de emergencia abre dialer
✅ Historial del día muestra viajes
✅ Filtros aplican correctamente
✅ Mapa muestra pins
✅ Toggle lista/mapa funciona
✅ Card flotante aparece
✅ Aceptar viaje desde mapa funciona
```

---

## 🎯 **PRÓXIMOS PASOS DESPUÉS DEL TESTING**

1. **Reportar bugs** encontrados
2. **Ajustar estilos** si es necesario
3. **Optimizar rendimiento** si hay lag
4. **Agregar más features** (opcional)
5. **Preparar para producción**

---

**Última actualización:** 2025-10-09 20:10
**Estado:** Listo para testing completo
