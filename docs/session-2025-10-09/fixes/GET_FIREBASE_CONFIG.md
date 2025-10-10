# 🔧 OBTENER CONFIGURACIÓN COMPLETA DE FIREBASE

## ❌ PROBLEMA ACTUAL:

```
Error: auth/api-key-not-valid.-please-pass-a-valid-api-key
```

**Causa:** El `FIREBASE_APP_ID` está como "PENDING" en el `.env`

---

## ✅ SOLUCIÓN: OBTENER APP ID REAL

### **Opción 1: Firebase Console (MÁS FÁCIL)**

1. Ve a: https://console.firebase.google.com/project/driveangel-ni/settings/general

2. Busca la sección **"Tus apps"**

3. Si NO hay una app web, créala:
   - Click en **"</> Web"**
   - Nombre: **"DriveAngel Web"**
   - Click **"Registrar app"**

4. Copia la configuración que aparece:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g",
  authDomain: "driveangel-ni.firebaseapp.com",
  projectId: "driveangel-ni",
  storageBucket: "driveangel-ni.appspot.com",
  messagingSenderId: "1040329608349",
  appId: "1:1040329608349:web:XXXXXXXXXX",  // ← ESTE ES EL QUE NECESITAS
  databaseURL: "https://driveangel-ni-default-rtdb.firebaseio.com"
};
```

5. Copia el `appId` completo

---

### **Opción 2: Firebase CLI**

```bash
firebase apps:list
```

Busca el App ID de la app web.

---

## 📝 ACTUALIZAR .env:

Una vez que tengas el `appId`, actualiza el archivo:

```bash
# Frontend/.env
FIREBASE_APP_ID=1:1040329608349:web:XXXXXXXXXX
```

**NO uses "PENDING"**, debe ser el ID real.

---

## 🔄 REINICIAR FRONTEND:

```bash
cd Frontend
npm start -- --clear
# Presionar 'r' para recargar
```

---

## 🧪 PROBAR DE NUEVO:

Intenta registrarte otra vez. Ahora el login automático debería funcionar.

---

**Ve a Firebase Console y obtén el App ID real** 🚀
