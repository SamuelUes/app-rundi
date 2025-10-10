# ✅ Firebase Setup Checklist - DriveAngel.ni

## 🎯 Progreso Actual

- [x] Firebase CLI instalado
- [x] Login en Firebase (`contact.sues14@gmail.com`)
- [ ] Proyecto creado en Firebase Console
- [ ] Authentication habilitado
- [ ] Firestore Database creado
- [ ] Realtime Database creado
- [ ] Plan Blaze activado
- [ ] Credenciales obtenidas
- [ ] Functions desplegadas

---

## 📋 Paso a Paso

### ✅ Paso 1: Login (COMPLETADO)
```bash
firebase login
# ✅ Logged in as contact.sues14@gmail.com
```

---

### ⏳ Paso 2: Crear Proyecto (EN PROGRESO)

**URL:** https://console.firebase.google.com

1. [ ] Clic en "Add project"
2. [ ] Nombre: `DriveAngel`
3. [ ] ID: `driveangel-ni` (o similar)
4. [ ] Google Analytics: Opcional
5. [ ] Clic en "Create project"
6. [ ] Esperar ~30 segundos

**Cuando termines, pega aquí el Project ID:**
```
Project ID: _______________
```

---

### ⏳ Paso 3: Habilitar Authentication

1. [ ] Ir a: Authentication
2. [ ] Clic en "Get started"
3. [ ] Seleccionar "Email/Password"
4. [ ] Activar toggle
5. [ ] Guardar

---

### ⏳ Paso 4: Crear Firestore Database

1. [ ] Ir a: Firestore Database
2. [ ] Clic en "Create database"
3. [ ] Modo: **Production mode**
4. [ ] Ubicación: **us-central1**
5. [ ] Clic en "Enable"

---

### ⏳ Paso 5: Crear Realtime Database

1. [ ] Ir a: Realtime Database
2. [ ] Clic en "Create Database"
3. [ ] Ubicación: **United States**
4. [ ] Modo: **Locked mode**
5. [ ] Clic en "Enable"

---

### ⏳ Paso 6: Actualizar a Plan Blaze

1. [ ] Ir a: Settings → Usage and billing
2. [ ] Clic en "Modify plan"
3. [ ] Seleccionar "Blaze (Pay as you go)"
4. [ ] Agregar tarjeta de crédito
5. [ ] Confirmar

**Nota:** Sigue siendo gratis hasta 2M invocaciones/mes

---

### ⏳ Paso 7: Obtener Credenciales Web

1. [ ] Ir a: Settings → Project settings
2. [ ] Scroll down a "Your apps"
3. [ ] Clic en "</>" (Web)
4. [ ] Nombre: `DriveAngel Web`
5. [ ] Registrar app
6. [ ] Copiar firebaseConfig

**Pegar aquí:**
```javascript
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  databaseURL: ""
};
```

---

### ⏳ Paso 8: Descargar Service Account

1. [ ] Ir a: Settings → Service accounts
2. [ ] Clic en "Generate new private key"
3. [ ] Descargar JSON
4. [ ] Guardar en lugar seguro

---

### ⏳ Paso 9: Vincular Proyecto Local

```bash
cd D:\Documentos\GitHub\App-Uber
firebase use --add
# Seleccionar el proyecto que creaste
# Alias: default
```

---

### ⏳ Paso 10: Compilar Functions

```bash
cd functions
npm install
npm run build
```

---

### ⏳ Paso 11: Desplegar Functions

```bash
firebase deploy --only functions
```

---

## 🎉 Cuando Todo Esté Listo

Deberías poder ver:

- ✅ Functions desplegadas en: https://console.firebase.google.com/project/driveangel-ni/functions
- ✅ Auth funcionando en: https://console.firebase.google.com/project/driveangel-ni/authentication
- ✅ Firestore en: https://console.firebase.google.com/project/driveangel-ni/firestore
- ✅ Realtime DB en: https://console.firebase.google.com/project/driveangel-ni/database

---

## 💡 Tips

- **No te preocupes por los costos:** El plan Blaze es gratis hasta ciertos límites
- **Configura alertas:** Settings → Usage and billing → Set budget alerts
- **Guarda las credenciales:** Anótalas en un lugar seguro

---

## 📞 ¿Necesitas Ayuda?

Si te trabas en algún paso, dime en cuál y te ayudo específicamente.

---

**Última actualización:** 2025-10-08
