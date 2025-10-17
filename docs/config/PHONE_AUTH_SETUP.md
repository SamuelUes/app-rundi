# 📱 Configuración de Autenticación por Teléfono en Firebase

## 🎯 Objetivo
Habilitar la autenticación por número de teléfono en Firebase Authentication para permitir que los usuarios se registren con su número telefónico (+505XXXXXXXX).

---

## 📋 Pasos para Habilitar en Firebase Console

### 1. **Acceder a Firebase Console**
1. Ve a: https://console.firebase.google.com/
2. Selecciona tu proyecto: **driveangel-ni**

### 2. **Habilitar Phone Authentication**
1. En el menú lateral, haz clic en **"Authentication"**
2. Ve a la pestaña **"Sign-in method"**
3. Busca **"Phone"** en la lista de proveedores
4. Haz clic en **"Phone"**
5. Activa el interruptor **"Enable"**
6. Haz clic en **"Save"**

### 3. **Configurar reCAPTCHA (Opcional para Web)**
Si vas a usar autenticación por teléfono en web:
1. Ve a **"Settings"** > **"Project settings"**
2. En la pestaña **"General"**, busca **"Your apps"**
3. Agrega tu dominio web en **"Authorized domains"**

### 4. **Configurar Test Phone Numbers (Opcional)**
Para testing sin enviar SMS reales:
1. En **"Authentication"** > **"Sign-in method"**
2. Scroll hasta **"Phone numbers for testing"**
3. Agrega números de prueba con sus códigos de verificación
   - Ejemplo: `+50512345678` → Código: `123456`

---

## 🔧 Configuración en React Native

### **Instalación de Dependencias**
```bash
npm install @react-native-firebase/auth @react-native-firebase/app
```

### **Configuración de Firebase en Android**
1. Descarga `google-services.json` desde Firebase Console
2. Colócalo en `android/app/google-services.json`
3. Asegúrate de tener en `android/build.gradle`:
```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.3.15'
    }
}
```

4. En `android/app/build.gradle`:
```gradle
apply plugin: 'com.google.gms.google-services'
```

### **Configuración de Firebase en iOS**
1. Descarga `GoogleService-Info.plist` desde Firebase Console
2. Colócalo en `ios/YourAppName/GoogleService-Info.plist`
3. Ejecuta:
```bash
cd ios && pod install
```

---

## 📱 Implementación Actual

### **RegisterScreen.tsx**
- ✅ Campo de teléfono obligatorio
- ✅ Prefijo +505 automático (Nicaragua)
- ✅ Validación de 8 dígitos
- ✅ Formato: `+505XXXXXXXX`

### **firebaseAuthService.ts**
- ✅ Registro con teléfono incluido
- ✅ Almacenamiento en Firestore
- ✅ Login automático después del registro

---

## 🔐 Flujo de Autenticación

### **Registro Actual (Email + Teléfono):**
```
1. Usuario ingresa:
   - Nombre
   - Email
   - Teléfono (+505XXXXXXXX)
   - Contraseña

2. Backend (Firebase Function):
   - Crea usuario en Firebase Auth (email/password)
   - Guarda teléfono en Firestore
   - Retorna usuario creado

3. Frontend:
   - Login automático
   - Navega a HomeScreen
```

### **Autenticación por Teléfono (Futuro):**
```
1. Usuario ingresa teléfono (+505XXXXXXXX)
2. Firebase envía SMS con código
3. Usuario ingresa código de 6 dígitos
4. Firebase verifica código
5. Usuario autenticado
```

---

## 🚀 Próximos Pasos (Opcional)

### **Para implementar autenticación SOLO por teléfono:**

1. **Crear PhoneAuthScreen.tsx:**
```typescript
import auth from '@react-native-firebase/auth';

const signInWithPhoneNumber = async (phoneNumber: string) => {
  const confirmation = await auth().signInWithPhoneNumber(phoneNumber);
  // Guardar confirmation para verificar código
};

const confirmCode = async (code: string) => {
  await confirmation.confirm(code);
  // Usuario autenticado
};
```

2. **Actualizar firebaseAuthService.ts:**
```typescript
async registerWithPhone(phoneNumber: string) {
  const confirmation = await auth().signInWithPhoneNumber(phoneNumber);
  return confirmation;
}

async verifyPhoneCode(confirmation: any, code: string) {
  const userCredential = await confirmation.confirm(code);
  return userCredential.user;
}
```

---

## ⚠️ Consideraciones Importantes

### **Costos:**
- Firebase cobra por SMS enviados
- Plan Spark (gratuito): 10 SMS/día
- Plan Blaze (pago por uso): $0.01 - $0.05 por SMS

### **Seguridad:**
- Implementar rate limiting para evitar abuso
- Usar reCAPTCHA en web
- Validar números de teléfono en backend

### **UX:**
- Mostrar claramente el costo del SMS (si aplica)
- Permitir reenvío de código después de 60 segundos
- Timeout de verificación: 2-5 minutos

---

## 📚 Documentación Oficial

- [Firebase Phone Auth](https://firebase.google.com/docs/auth/web/phone-auth)
- [React Native Firebase Auth](https://rnfirebase.io/auth/phone-auth)
- [Firebase Pricing](https://firebase.google.com/pricing)

---

## ✅ Estado Actual

- ✅ Teléfono obligatorio en registro
- ✅ Formato +505 automático
- ✅ Validación de 8 dígitos
- ✅ Almacenamiento en Firestore
- ⏳ Autenticación por SMS (pendiente)

**Fecha de actualización:** 2025-10-12
