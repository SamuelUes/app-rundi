# 🧪 Guía Completa para Probar Login - App Uber

**Fecha**: 2025-10-07 18:25  
**Estado**: Backend ✅ | Frontend ⏳

---

## 🎯 OBJETIVO

Probar el flujo completo de registro y login en la aplicación.

---

## ✅ PREREQUISITOS

### **Backend** ✅
```
Estado: Corriendo en http://localhost:3000/api
Base de datos: Conectada (2 usuarios existentes)
```

### **Frontend** ⏳
```
Estado: Necesita iniciarse
Comando: npm start (en carpeta Frontend)
```

---

## 🚀 PASO A PASO

### **Paso 1: Iniciar Frontend**

```bash
# Abrir una nueva terminal
cd d:\Documentos\GitHub\App-Uber\Frontend

# Iniciar Expo
npm start

# Esperar a que aparezca el QR code y las opciones
```

### **Paso 2: Abrir en Navegador**

```bash
# En la terminal de Expo, presionar:
w

# Se abrirá automáticamente en:
# http://localhost:8081
```

### **Paso 3: Ver LoginScreen**

Deberías ver:
```
┌─────────────────────────┐
│   Bienvenido a App Uber │
│                         │
│  [Email]                │
│  [Password]             │
│                         │
│  [Entrar]               │
│                         │
│  ¿No tienes cuenta?     │
│  Regístrate             │
│                         │
│  [Usar credenciales     │
│   de prueba]            │
└─────────────────────────┘
```

---

## 🧪 OPCIÓN 1: CREAR USUARIO NUEVO (RECOMENDADO)

### **Paso 1: Ir a Registro**
```
1. Click en "Regístrate" (abajo del botón Entrar)
```

### **Paso 2: Completar Formulario**
```
Nombre:    Demo User
Email:     demo@demo.com
Teléfono:  1234567890
Password:  demo123
Confirmar: demo123
Rol:       Cliente
```

### **Paso 3: Registrarse**
```
1. Click en "Registrarse"
2. Esperar respuesta del backend
3. Si es exitoso, debería:
   - Guardar el token
   - Guardar el usuario
   - Navegar automáticamente a HomeScreen
```

### **Paso 4: Verificar en Backend**
```bash
# En PowerShell
(Invoke-WebRequest -Uri http://localhost:3000/api/users -UseBasicParsing).Content | 
  ConvertFrom-Json | 
  Where-Object { $_.email -eq "demo@demo.com" } | 
  Format-List
```

---

## 🧪 OPCIÓN 2: USAR USUARIO EXISTENTE

### **Usuarios Disponibles:**

#### **Usuario 1: Admin**
```
Email: ses@gmail.com
Password: (necesitas conocer la contraseña)
Rol: admin
```

#### **Usuario 2: Cliente de Prueba**
```
Email: test@test.com
Password: (necesitas conocer la contraseña)
Rol: client
```

**Nota**: Si no conoces las contraseñas, usa la Opción 1 (crear nuevo usuario).

---

## 🧪 OPCIÓN 3: MODO DESARROLLO (SI ESTÁ HABILITADO)

### **Paso 1: Usar Credenciales de Prueba**
```
1. En LoginScreen, buscar botón:
   "Usar credenciales de prueba"
2. Click en el botón
3. Debería auto-completar email y password
4. Click "Entrar"
```

**Nota**: Esto solo funciona si el modo desarrollo está habilitado en el código.

---

## 🔍 VERIFICAR QUE FUNCIONA

### **1. Ver Logs en Consola del Navegador**

```javascript
// Abrir DevTools (F12)
// En la pestaña Console, deberías ver:

AuthContext - Loading user from storage...
AuthContext - Saved user: null
AuthContext - No saved user found
AuthContext - Finished loading user
AppNavigator - Rendering navigation. User: Not authenticated
```

### **2. Después del Registro Exitoso**

```javascript
// En Console:
AuthContext - Register successful
AuthContext - User saved: {email: "demo@demo.com", ...}
AppNavigator - User state changed: { hasUser: true, ... }
AppNavigator - Rendering navigation. User: Authenticated
```

### **3. Verificar LocalStorage**

```javascript
// En Console del navegador:
localStorage.getItem('authToken')
// Debería mostrar: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

localStorage.getItem('user')
// Debería mostrar: '{"id":"...","email":"demo@demo.com",...}'
```

### **4. Verificar Navegación**

Después del login exitoso, deberías:
- ✅ Ver HomeScreen (si eres cliente)
- ✅ Ver DriverHomeScreen (si eres conductor)
- ✅ Ver el mapa con tu ubicación
- ✅ Ver botones de navegación

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### **Problema 1: Frontend no inicia**
```bash
# Limpiar caché
npx expo start --clear

# Si sigue sin funcionar
Remove-Item -Recurse -Force node_modules
npm install
npm start
```

### **Problema 2: Error "Cannot connect to backend"**
```bash
# Verificar que Backend esté corriendo
Invoke-WebRequest -Uri http://localhost:3000/api/users -UseBasicParsing

# Si no responde, reiniciar Backend:
cd Backend
npm run start:dev
```

### **Problema 3: Error en registro**
```javascript
// Ver error en Console del navegador (F12)
// Buscar mensajes de error rojos

// Errores comunes:
- "Email already exists" → Usar otro email
- "Network Error" → Backend no está corriendo
- "Validation failed" → Revisar campos del formulario
```

### **Problema 4: Loading infinito**
```bash
# Verificar logs en Console:
# Si se queda en "Loading user from storage..."
# Limpiar localStorage:

localStorage.clear()
location.reload()
```

### **Problema 5: No navega después del login**
```javascript
// Verificar en Console:
console.log(localStorage.getItem('user'))
console.log(localStorage.getItem('authToken'))

// Si están vacíos, el login falló
// Revisar respuesta del backend en Network tab (F12)
```

---

## 📊 FLUJO ESPERADO

### **Registro Exitoso**
```
1. Usuario completa formulario
   ↓
2. Frontend envía POST /api/users
   ↓
3. Backend crea usuario en BD
   ↓
4. Backend devuelve usuario + token
   ↓
5. Frontend guarda en AsyncStorage/localStorage
   ↓
6. AuthContext actualiza estado (user != null)
   ↓
7. AppNavigator detecta usuario autenticado
   ↓
8. Navega a HomeScreen (cliente) o DriverHomeScreen (conductor)
```

### **Login Exitoso**
```
1. Usuario ingresa email + password
   ↓
2. Frontend envía POST /api/auth/login
   ↓
3. Backend verifica credenciales
   ↓
4. Backend devuelve usuario + token
   ↓
5. Frontend guarda en AsyncStorage/localStorage
   ↓
6. AuthContext actualiza estado
   ↓
7. Navega a pantalla correspondiente
```

---

## 🎯 CHECKLIST DE PRUEBA

### **Antes de Probar**
- [ ] Backend corriendo en puerto 3000
- [ ] Frontend corriendo en puerto 8081
- [ ] Navegador abierto en http://localhost:8081
- [ ] DevTools abierto (F12) para ver logs

### **Durante el Registro**
- [ ] Formulario se muestra correctamente
- [ ] Todos los campos son editables
- [ ] Validaciones funcionan (email, password match)
- [ ] Botón "Registrarse" está habilitado
- [ ] Loading spinner aparece al enviar

### **Después del Registro**
- [ ] No hay errores en Console
- [ ] Token guardado en localStorage
- [ ] Usuario guardado en localStorage
- [ ] Navegó a HomeScreen
- [ ] Mapa se muestra (si está implementado)

### **Durante el Login**
- [ ] Campos de email y password funcionan
- [ ] Botón "Entrar" está habilitado
- [ ] Loading spinner aparece al enviar

### **Después del Login**
- [ ] Token actualizado en localStorage
- [ ] Usuario actualizado en localStorage
- [ ] Navegó a pantalla correcta según rol
- [ ] Datos del usuario se muestran

---

## 📱 COMANDOS RÁPIDOS

### **Iniciar Todo**
```bash
# Terminal 1 - Backend
cd d:\Documentos\GitHub\App-Uber\Backend
npm run start:dev

# Terminal 2 - Frontend
cd d:\Documentos\GitHub\App-Uber\Frontend
npm start
# Luego presionar 'w' para web
```

### **Verificar Estado**
```bash
# Backend
Invoke-WebRequest -Uri http://localhost:3000/api/users -UseBasicParsing

# Frontend (después de iniciar)
# Abrir http://localhost:8081 en navegador
```

### **Ver Usuarios en BD**
```bash
(Invoke-WebRequest -Uri http://localhost:3000/api/users -UseBasicParsing).Content | 
  ConvertFrom-Json | 
  Format-Table email, name, role, status
```

### **Limpiar Todo y Reiniciar**
```bash
# Frontend
cd Frontend
npx expo start --clear

# Si es necesario, limpiar localStorage en navegador:
# F12 → Console → localStorage.clear() → Enter
```

---

## 🎉 RESULTADO ESPERADO

Al completar esta guía, deberías poder:

✅ Iniciar Frontend y Backend  
✅ Ver LoginScreen correctamente  
✅ Crear un nuevo usuario  
✅ Verificar usuario en base de datos  
✅ Hacer login con el usuario creado  
✅ Navegar a HomeScreen después del login  
✅ Ver datos del usuario en la app  

---

## 📞 SIGUIENTE PASO

Una vez que el login funcione:

1. **Probar navegación** entre pantallas
2. **Probar logout** desde ProfileScreen
3. **Crear un conductor** (registro con role="driver")
4. **Probar solicitud de viaje** desde HomeScreen
5. **Verificar datos** en base de datos

---

**¡Listo para probar! Inicia el Frontend con `npm start` y presiona `w` para abrir en navegador.** 🚀

---

**Archivos de referencia:**
- `ESTADO-COMPLETO-PROYECTO.md` - Estado general
- `ESTADO-BASE-DATOS.md` - Estado de la BD
- `CORRECCION-FINAL.md` - Correcciones aplicadas
- `GUIA-PRUEBA-LOGIN.md` - Esta guía
