# 📱 Solución: Login desde Móvil

**Problema**: Error de credenciales al usar Expo Go en móvil físico  
**Causa**: El móvil no puede conectarse al backend

---

## ✅ CAMBIOS REALIZADOS

### **1. Firewall de Windows** 🟢
```bash
# Regla agregada para permitir conexiones en puerto 3000
netsh advfirewall firewall add rule name="Node Backend Port 3000" dir=in action=allow protocol=TCP localport=3000
```

### **2. API_BASE_URL actualizada** 🟢
```env
# Antes (solo emulador):
API_BASE_URL=http://10.0.2.2:3000/api

# Ahora (móvil y emulador):
API_BASE_URL=http://192.168.1.18:3000/api
```

### **3. Backend con CORS habilitado** 🟢
```typescript
app.enableCors({ origin: '*'});
```

---

## 🧪 PROBAR CONEXIÓN DESDE MÓVIL

### **Opción 1: Desde el navegador del móvil**
1. Abre el navegador en tu móvil
2. Ve a: `http://192.168.1.18:3000/api/users`
3. **Debería** mostrar JSON con usuarios
4. **Si no carga**: Problema de red/firewall

### **Opción 2: Desde la app**
1. Abre Expo Go en el móvil
2. Escanea el QR de Expo
3. Intenta login con: `se@gmail.com` / `1234`
4. **Debería** funcionar ahora

---

## ⚠️ SI AÚN NO FUNCIONA

### **Verificar que estén en la misma red WiFi:**
```
Computadora: 192.168.1.18
Móvil: 192.168.1.X (debe empezar con 192.168.1)
```

### **Verificar que el backend esté corriendo:**
```bash
# En la terminal del backend debería decir:
Backend running on http://localhost:3000/api
```

### **Probar ping desde el móvil:**
1. Instala "Network Utilities" o similar en el móvil
2. Haz ping a `192.168.1.18`
3. **Debería** responder

---

## 🔄 ALTERNATIVA: Usar ngrok (Túnel público)

Si el firewall sigue bloqueando, usa ngrok:

### **1. Instalar ngrok:**
```bash
npm install -g ngrok
```

### **2. Crear túnel:**
```bash
ngrok http 3000
```

### **3. Copiar URL pública:**
```
Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

### **4. Actualizar .env:**
```env
API_BASE_URL=https://abc123.ngrok.io/api
```

---

## 📝 RESUMEN DE IPs

| Dispositivo | IP | URL Backend |
|-------------|----|----|
| Emulador Android | 10.0.2.2 | http://10.0.2.2:3000/api |
| Móvil (misma WiFi) | 192.168.1.X | http://192.168.1.18:3000/api |
| Móvil (ngrok) | Cualquiera | https://abc123.ngrok.io/api |

---

## ✅ VERIFICACIÓN FINAL

**En el móvil, abre el navegador y ve a:**
```
http://192.168.1.18:3000/api/users
```

**Si ves JSON con usuarios** → Todo está bien, recarga la app  
**Si no carga** → Problema de firewall/red, usa ngrok

---

**¿Qué ves cuando abres esa URL en el navegador del móvil?** 🔍
