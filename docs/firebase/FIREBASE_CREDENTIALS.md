# 🔑 Firebase Credentials - DriveAngel.ni

## 📋 Instrucciones

Una vez que crees el proyecto en Firebase Console, pega aquí las credenciales:

---

## 🌐 Frontend (Web/Mobile)

Ir a: Project Settings → Your apps → Web app

```javascript
const firebaseConfig = {
  apiKey: "PEGAR_AQUI",
  authDomain: "PEGAR_AQUI",
  projectId: "PEGAR_AQUI",
  storageBucket: "PEGAR_AQUI",
  messagingSenderId: "PEGAR_AQUI",
  appId: "PEGAR_AQUI",
  databaseURL: "PEGAR_AQUI"
};
```

---

## 🔧 Backend (Service Account)

Ir a: Project Settings → Service accounts → Generate new private key

Descargar el archivo JSON y guardar en un lugar seguro.

**NO subir a Git**

---

## 📱 Para actualizar en el proyecto:

### Frontend (.env):
```env
FIREBASE_API_KEY=xxx
FIREBASE_AUTH_DOMAIN=xxx
FIREBASE_PROJECT_ID=xxx
FIREBASE_STORAGE_BUCKET=xxx
FIREBASE_MESSAGING_SENDER_ID=xxx
FIREBASE_APP_ID=xxx
FIREBASE_DATABASE_URL=xxx
```

### Backend (Service Account JSON):
Guardar en: `Backend/firebase-service-account.json`
Y agregarlo a `.gitignore`

---

**Una vez que tengas las credenciales, pégalas aquí y te ayudo a configurarlas.** 🚀
