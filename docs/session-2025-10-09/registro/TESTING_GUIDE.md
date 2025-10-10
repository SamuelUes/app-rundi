# 🧪 GUÍA DE TESTING - REGISTRO DE USUARIOS

## ✅ BACKEND DESPLEGADO:

```
✅ functions[register(us-central1)] Successful update operation
✅ Validaciones robustas implementadas
✅ Verificación de duplicados activa
✅ Manejo de errores específicos
```

---

## 🚀 REINICIAR FRONTEND:

```bash
cd Frontend
npm start -- --clear
# Presionar 'r' para recargar
```

---

## 🧪 CASOS DE PRUEBA:

### **TEST 1: CLIENTE CON DATOS VÁLIDOS** ✅

```
Nombre:   Juan Pérez
Email:    juan@test.com
Password: Test123456
Teléfono: +50512345678 (o vacío)
Rol:      Cliente
```

**Resultado esperado:**
```
✅ Usuario registrado exitosamente
✅ Login automático
✅ Redirección a pantalla principal
```

---

### **TEST 2: CONDUCTOR CON DATOS VÁLIDOS** ✅

```
Nombre:   María González
Email:    maria@test.com
Password: Test123456
Teléfono: +50587654321
Rol:      Conductor

Licencia: 001121242341
Vencimiento: 2025-12-31

Placa:    M123342
Marca:    Hyundai
Modelo:   Elantra
Año:      2020
Color:    Rojo
Tipo:     SEDAN
```

**Resultado esperado:**
```
✅ Usuario registrado exitosamente
✅ Datos guardados en PostgreSQL
✅ Login automático
✅ Redirección a pantalla principal
```

---

### **TEST 3: EMAIL DUPLICADO** ❌

```
Email: juan@test.com (ya registrado)
```

**Resultado esperado:**
```
❌ Error: "Este email ya está registrado"
```

---

### **TEST 4: EMAIL INVÁLIDO** ❌

```
Email: juantest.com (sin @)
```

**Resultado esperado:**
```
❌ Error: "Formato de email inválido"
```

---

### **TEST 5: PASSWORD MUY CORTA** ❌

```
Password: 12345 (5 caracteres)
```

**Resultado esperado:**
```
❌ Error: "La contraseña debe tener al menos 6 caracteres"
```

---

### **TEST 6: CONDUCTOR SIN DATOS DE LICENCIA** ❌

```
Rol: Conductor
(No llenar datos de licencia)
```

**Resultado esperado:**
```
❌ Error: "Los conductores requieren datos de licencia y vehículo"
```

---

### **TEST 7: LICENCIA DUPLICADA** ❌

```
Licencia: 001121242341 (ya registrada)
```

**Resultado esperado:**
```
❌ Error: "Este número de licencia ya está registrado"
```

---

### **TEST 8: PLACA DUPLICADA** ❌

```
Placa: M123342 (ya registrada)
```

**Resultado esperado:**
```
❌ Error: "Esta placa de vehículo ya está registrada"
```

---

### **TEST 9: AÑO DE VEHÍCULO INVÁLIDO** ❌

```
Año: 1800 (muy antiguo)
```

**Resultado esperado:**
```
❌ Error: "Año del vehículo debe estar entre 1900 y 2026"
```

---

### **TEST 10: TIPO DE VEHÍCULO INVÁLIDO** ❌

```
Tipo: CAMION (no válido)
```

**Resultado esperado:**
```
❌ Error: "Tipo de vehículo inválido. Debe ser: sedan, suv, van o moto"
```

---

## 📊 VERIFICAR EN CONSOLAS:

### **Firebase Auth:**
```
https://console.firebase.google.com/project/driveangel-ni/authentication/users
```

Verificar:
- ✅ Usuario aparece en la lista
- ✅ Email correcto
- ✅ Nombre correcto

---

### **Firestore:**
```
https://console.firebase.google.com/project/driveangel-ni/firestore
```

Verificar en `users/{userId}`:
- ✅ id, email, name, phone, role
- ✅ stats: totalRides: 0, averageRating: 0
- ✅ createdAt, updatedAt

---

### **Supabase (Solo conductores):**
```
https://supabase.com/dashboard/project/ceytngpresytjhafcadu/editor
```

Verificar en tabla `drivers`:
- ✅ user_id, license_number, license_expiry
- ✅ status: "pending"

Verificar en tabla `vehicles`:
- ✅ driver_id, plate, brand, model, year, color, type
- ✅ is_active: true

---

## 🔍 VER LOGS EN TIEMPO REAL:

### **Opción 1: Firebase Console**
```
https://console.firebase.google.com/project/driveangel-ni/functions/logs
```

### **Opción 2: Terminal**
```bash
firebase functions:log --only register
```

**Logs esperados:**
```
📝 Registro iniciado: email (rol)
✅ Usuario creado en Firebase Auth: uid
✅ Perfil guardado en Firestore
✅ Conductor guardado en PostgreSQL: id (si es conductor)
✅ Vehículo guardado: placa (si es conductor)
🎉 Registro completado exitosamente: uid (rol)
```

---

## ✅ CHECKLIST DE TESTING:

```
[ ] TEST 1: Cliente válido
[ ] TEST 2: Conductor válido
[ ] TEST 3: Email duplicado
[ ] TEST 4: Email inválido
[ ] TEST 5: Password corta
[ ] TEST 6: Conductor sin datos
[ ] TEST 7: Licencia duplicada
[ ] TEST 8: Placa duplicada
[ ] TEST 9: Año inválido
[ ] TEST 10: Tipo inválido
[ ] Verificar Firebase Auth
[ ] Verificar Firestore
[ ] Verificar Supabase (conductores)
[ ] Verificar logs
```

---

## 🐛 SI ALGO FALLA:

### **1. Ver logs del backend:**
```bash
firebase functions:log --only register
```

### **2. Ver logs del frontend:**
```
Buscar en la consola del emulador:
- ❌ Error en registro: [mensaje]
```

### **3. Verificar datos enviados:**
```
Buscar en logs:
- 📤 Enviando datos de registro: {...}
```

---

## 📱 EMPEZAR A PROBAR:

```bash
# 1. Reiniciar frontend
cd Frontend
npm start -- --clear

# 2. Presionar 'r' para recargar

# 3. Ir a "Registrarse"

# 4. Probar cada caso de prueba
```

---

**¡Listo para probar! Empieza con TEST 1 (Cliente válido)** 🚀
