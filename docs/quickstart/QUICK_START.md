# ⚀ Quick Start - DriveAngel.ni

## ⚡ CAMBIO IMPORTANTE

**Ahora usamos `.env.template` como archivo de configuración real** (ya no necesitas copiar a `.env`)

## ✅ Credenciales Configuradas

### **Supabase PostgreSQL:**
URL: https://ceytngpresytjhafcadu.supabase.co
Database: postgres
User: postgres
Password: appdriveangel2025
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🚀 Setup en 5 Pasos

### **Paso 1: Crear Tablas en Supabase** (2 minutos)

1. **Ir al SQL Editor:**
   ```
   https://supabase.com/dashboard/project/ceytngpresytjhafcadu/sql
   ```

2. **Copiar y pegar el contenido de:**
   ```
   database/schema.sql
   ```

3. **Ejecutar** (botón "Run")

4. **Verificar:** Deberías ver las tablas creadas en el panel izquierdo

---

### **Paso 2: Login en Firebase** (1 minuto)

```bash
firebase login
```

Esto abrirá tu navegador para iniciar sesión.

---

### **Paso 3: Crear Proyecto en Firebase Console** (3 minutos)

1. **Ir a:** https://console.firebase.google.com

2. **Crear proyecto:**
   - Nombre: `DriveAngel`
   - ID: `driveangel-ni`
   - Google Analytics: Opcional

3. **Habilitar servicios:**
   - Authentication → Email/Password
   - Firestore Database → Modo producción
   - Realtime Database → Modo bloqueado

4. **Actualizar plan a Blaze:**
   - Settings → Usage and billing
   - Modify plan → Blaze (pay as you go)
   - **No te preocupes:** Es gratis hasta 2M invocaciones/mes

---

### **Paso 4: Compilar Functions** (1 minuto)

```bash
cd functions
npm install
npm run build
```

---

### **Paso 5: Probar Localmente** (1 minuto)

```bash
firebase emulators:start
```

Deberías ver:
```
✔  functions: Loaded functions definitions from source
✔  functions[us-central1-healthCheck]: http function initialized
✔  functions[us-central1-register]: http function initialized
...
```

**Probar Health Check:**
```
http://localhost:5001/driveangel-ni/us-central1/healthCheck
```

---

## 🧪 Probar Auth API

### **Registrar usuario:**

```bash
curl -X POST http://localhost:5001/driveangel-ni/us-central1/register \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "email": "test@test.com",
      "password": "123456",
      "name": "Usuario Test",
      "phone": "+50512345678",
      "role": "client"
    }
  }'
```

**Respuesta esperada:**
```json
{
  "result": {
    "success": true,
    "userId": "abc123...",
    "message": "Usuario registrado exitosamente"
  }
}
```

---

## 🚀 Deploy a Producción

Cuando estés listo:

```bash
firebase deploy --only functions
```

Las functions estarán en:
```
https://us-central1-driveangel-ni.cloudfunctions.net/register
https://us-central1-driveangel-ni.cloudfunctions.net/healthCheck
```

---

## 📊 Verificar en Dashboards

### **Supabase:**
- **Tablas:** https://supabase.com/dashboard/project/ceytngpresytjhafcadu/editor
- **Logs:** https://supabase.com/dashboard/project/ceytngpresytjhafcadu/logs

### **Firebase:**
- **Functions:** https://console.firebase.google.com/project/driveangel-ni/functions
- **Auth:** https://console.firebase.google.com/project/driveangel-ni/authentication
- **Firestore:** https://console.firebase.google.com/project/driveangel-ni/firestore

---

## 🐛 Troubleshooting

### **Error: "Cannot find module 'pg'"**
```bash
cd functions
npm install
```

### **Error: "Firebase project not found"**
```bash
firebase use driveangel-ni
```

### **Error: "Connection refused" (Supabase)**
Verificar password en `functions/src/config/database.ts`

### **Functions no compilan**
```bash
cd functions
rm -rf node_modules
npm install
npm run build
```

---

## ✅ Checklist

- [ ] Tablas creadas en Supabase
- [ ] Login en Firebase
- [ ] Proyecto Firebase creado
- [ ] Plan Blaze habilitado
- [ ] Functions compiladas
- [ ] Emuladores funcionando
- [ ] Auth API probada
- [ ] Deploy a producción (opcional)

---

## 📚 Próximos Pasos

1. ✅ Migrar Rides API
2. ✅ Migrar Payments API
3. ✅ Migrar Drivers API
4. ✅ Actualizar Frontend
5. ✅ Testing completo
6. ✅ Deploy final

---

**¡Todo listo para empezar!** 🎉
