# 🔧 Configuración de Variables de Entorno

## ⚡ INICIO RÁPIDO

```powershell
# Desde la raíz del proyecto:
.\setup-env.ps1

# Luego iniciar frontend:
cd Frontend
npm start -- --clear
```

---

## 📁 ESTRUCTURA

```
App-Uber/
├── Frontend/
│   ├── .env.template  → Template (commiteable)
│   └── .env           → Archivo real (NO commitear)
│
├── Backend/
│   ├── .env.template  → Template (commiteable)
│   └── .env           → Archivo real (NO commitear)
│
└── functions/
    ├── .env.template  → Template (commiteable)
    └── .env           → Archivo real (NO commitear)
```

---

## ✅ LO QUE HACE EL SCRIPT

1. Copia `Frontend/.env.template` → `Frontend/.env`
2. Copia `Backend/.env.template` → `Backend/.env`
3. Copia `functions/.env.template` → `functions/.env`
4. Elimina archivos viejos (`.env.production`, `.env.example`)

---

## 🔒 SEGURIDAD

- ✅ `.env.template` → SÍ commitear (sin datos sensibles reales)
- ❌ `.env` → NO commitear (con datos reales)
- ✅ `.gitignore` ya está configurado correctamente

---

## 📝 CONFIGURACIÓN ACTUAL

### **Frontend/.env**
```env
BACKEND_MODE=firebase
USE_FIREBASE_EMULATORS=false
FIREBASE_API_KEY=AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g
```

### **Backend/.env** (Respaldo)
```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
STRIPE_SECRET_KEY=...
```

### **functions/.env** (Principal)
```env
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=...
```

---

## 🚀 DESPUÉS DE EJECUTAR EL SCRIPT

```bash
cd Frontend
npm start -- --clear
```

Deberías ver:
```
✅ Backend Mode: firebase
✅ API URL: https://us-central1-driveangel-ni.cloudfunctions.net
```

---

**¡Listo para desarrollar!** 🎉
