# 🔨 Plan de Reconstrucción del Frontend

**Fecha**: 2025-10-07 20:44  
**Objetivo**: Rehacer el Frontend desde cero de forma limpia y funcional

---

## 🎯 DECISIONES TOMADAS

### **Plataforma**
- ✅ **Expo con Android Studio**
- ✅ Sin soporte web (evita conflictos de react-native-web)
- ✅ Enfocado en Android nativo

### **Stack Tecnológico**
```
- Expo SDK 51
- React Native 0.74.5
- React Navigation 6
- TypeScript
- Google Maps (react-native-maps)
- AsyncStorage
- Axios
```

---

## 📋 PASOS DE RECONSTRUCCIÓN

### **Paso 1: Limpiar Proyecto Actual** ✅
```bash
# Detener todos los procesos
taskkill /F /IM node.exe

# Respaldar .env
# Ya tenemos: API_BASE_URL, GOOGLE_MAPS_API_KEY, STRIPE_PUBLIC_KEY
```

### **Paso 2: Reemplazar Archivos de Configuración**
```bash
# Reemplazar con versiones limpias:
- package.json → package-new.json
- app.json → app-new.json
- babel.config.js → babel-new.config.js
- metro.config.js → metro-new.config.js
- App.tsx → App-new.tsx
- index.js → index-new.js
```

### **Paso 3: Reinstalar Dependencias**
```bash
cd Frontend
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

### **Paso 4: Crear Estructura de Carpetas**
```
src/
├── api/
│   ├── client.ts
│   └── authService.ts
├── components/
│   ├── Button.tsx
│   └── Input.tsx
├── config/
│   └── constants.ts
├── context/
│   └── AuthContext.tsx
├── navigation/
│   ├── AppNavigator.tsx
│   ├── AuthStack.tsx
│   └── ClientStack.tsx
├── screens/
│   ├── Auth/
│   │   ├── LoginScreen.tsx
│   │   └── RegisterScreen.tsx
│   └── Client/
│       └── HomeScreen.tsx
├── services/
│   └── authService.ts
└── types/
    └── index.ts
```

### **Paso 5: Crear Archivos Core**

#### **AuthContext.tsx**
- Manejo de estado de autenticación
- Login/Logout
- Persistencia con AsyncStorage

#### **authService.ts**
- Llamadas a API de auth
- POST /api/auth/login
- POST /api/auth/register

#### **AppNavigator.tsx**
- Navegación condicional
- AuthStack si no está logueado
- ClientStack si está logueado

#### **LoginScreen.tsx**
- Formulario de login
- Email + Password
- Botón de registro

#### **HomeScreen.tsx**
- Mapa de Google Maps
- Ubicación actual
- Botón "Solicitar Viaje"

### **Paso 6: Configurar Google Maps**
```typescript
// En HomeScreen.tsx
import MapView, { Marker } from 'react-native-maps';

// API Key ya está en app.json
```

### **Paso 7: Probar en Android Studio**
```bash
# Iniciar emulador Android
# Luego:
npm run android
```

---

## 📦 DEPENDENCIAS MÍNIMAS

```json
{
  "expo": "~51.0.0",
  "react": "18.2.0",
  "react-native": "0.74.5",
  "expo-location": "~17.0.1",
  "react-native-maps": "1.14.0",
  "@react-navigation/native": "^6.1.18",
  "@react-navigation/native-stack": "^6.11.0",
  "@react-native-async-storage/async-storage": "1.23.1",
  "axios": "^1.7.7"
}
```

---

## 🎯 FUNCIONALIDADES CORE

### **Fase 1: Autenticación** (Prioridad Alta)
- [x] Login con email/password
- [x] Registro de usuarios
- [x] Persistencia de sesión
- [x] Logout

### **Fase 2: Navegación** (Prioridad Alta)
- [x] Stack de autenticación
- [x] Stack de cliente
- [x] Navegación condicional

### **Fase 3: Mapa** (Prioridad Media)
- [ ] Mostrar mapa de Google
- [ ] Obtener ubicación actual
- [ ] Marcador en ubicación

### **Fase 4: Viajes** (Prioridad Media)
- [ ] Solicitar viaje
- [ ] Ver viajes activos
- [ ] Historial de viajes

---

## 🚀 COMANDOS DE EJECUCIÓN

### **Desarrollo**
```bash
# Iniciar Expo
npm start

# Abrir en Android
npm run android

# O presionar 'a' en la terminal de Expo
```

### **Limpiar Caché**
```bash
npx expo start --clear
```

### **Reinstalar**
```bash
Remove-Item -Recurse -Force node_modules
npm install
```

---

## ✅ VENTAJAS DE ESTA RECONSTRUCCIÓN

1. **Sin conflictos de react-native-web**
   - Solo Android nativo
   - Sin errores de Platform

2. **Dependencias mínimas**
   - Solo lo necesario
   - Menos conflictos

3. **Configuración simple**
   - Metro config por defecto
   - Babel mínimo

4. **Enfoque en funcionalidad**
   - Login/Register funcionando
   - Mapa de Google
   - Navegación fluida

5. **Fácil de debuggear**
   - Código limpio
   - Estructura clara
   - Sin complejidad innecesaria

---

## 📱 RESULTADO ESPERADO

Al finalizar tendremos:

✅ App funcionando en Android Studio  
✅ Login/Register con Backend  
✅ Mapa de Google Maps  
✅ Navegación entre pantallas  
✅ Persistencia de sesión  
✅ Código limpio y mantenible  

---

## 🔄 PRÓXIMOS PASOS

1. **Confirmar que quieres proceder** con esta reconstrucción
2. **Respaldar archivos importantes** (si hay algo que quieras conservar)
3. **Ejecutar los comandos** de reemplazo
4. **Crear los archivos core** uno por uno
5. **Probar en Android Studio**

---

**¿Procedemos con la reconstrucción?** 🚀
