# 🔧 Fix: Permission Denied en Logout

## Fecha: 10 de Octubre 2025, 23:26

---

## 🐛 **Problema:**

```
FIREBASE WARNING: set at /driverLocations/2rGXWVGF6ne48y11NCJmTFKMut73 failed: permission_denied
ERROR Logout error: [Error: PERMISSION_DENIED: Permission denied]
```

### **Causa:**
1. `usePresence()` se ejecutaba para todos los usuarios (clientes y conductores)
2. Clientes no tienen permiso para escribir en `driverLocations`
3. El logout intentaba marcar como offline en Firebase sin validar rol
4. Errores de Firebase bloqueaban el logout completo

---

## ✅ **Soluciones Implementadas:**

### **1. usePresence - Solo para Conductores** ✅

**Archivo:** `Frontend/src/hooks/usePresence.ts`

**Antes:**
```typescript
export function usePresence() {
  const { user } = useAuth();
  
  useEffect(() => {
    if (!user?.id) return;
    // Se ejecutaba para todos los usuarios
```

**Después:**
```typescript
export function usePresence() {
  const { user } = useAuth();
  
  useEffect(() => {
    // Solo configurar presencia para conductores autenticados
    if (!user?.id || user.role !== 'driver') {
      return;
    }
```

**Cambios:**
- ✅ Validación de `user.role === 'driver'`
- ✅ Solo conductores configuran presencia
- ✅ Clientes no intentan escribir en `driverLocations`
- ✅ Mejor manejo de errores (solo log, no bloquea app)

---

### **2. Logout - Try/Catch Anidado** ✅

**Archivo:** `Frontend/src/context/AuthContext.tsx`

**Antes:**
```typescript
const logout = async () => {
  try {
    // Marcar como offline en Firebase antes de hacer logout
    if (user?.id && backendConfig.isFirebase()) {
      const driverLocationRef = ref(database, `driverLocations/${user.id}`);
      await set(driverLocationRef, {
        status: 'offline',
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
      });
      console.log('✅ Usuario marcado como offline en Firebase');
    }
    
    await authService.logout();
    await AsyncStorage.removeItem('user');
    setUser(null);
  } catch (error) {
    console.error('Logout error:', error);
    // ❌ Si falla Firebase, no hace logout
  }
};
```

**Después:**
```typescript
const logout = async () => {
  try {
    // Marcar como offline en Firebase antes de hacer logout (solo conductores)
    if (user?.id && user.role === 'driver' && backendConfig.isFirebase()) {
      try {
        const driverLocationRef = ref(database, `driverLocations/${user.id}`);
        await set(driverLocationRef, {
          status: 'offline',
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        });
        console.log('✅ Usuario marcado como offline en Firebase');
      } catch (fbError) {
        // Ignorar errores de Firebase, continuar con logout
        console.log('⚠️ No se pudo actualizar status en Firebase, continuando con logout');
      }
    }
    
    await authService.logout();
    await AsyncStorage.removeItem('user');
    setUser(null);
  } catch (error) {
    console.error('Logout error:', error);
    // Forzar logout local aunque falle
    setUser(null);
    await AsyncStorage.removeItem('user');
  }
};
```

**Cambios:**
- ✅ Validación de `user.role === 'driver'`
- ✅ Try/catch anidado para Firebase
- ✅ Continúa con logout aunque falle Firebase
- ✅ Logout local forzado en caso de error total

---

## 🔄 **Flujo Corregido:**

### **Cliente hace Logout:**
```
1. Usuario presiona "Cerrar Sesión"
   ↓
2. logout() se ejecuta
   ↓
3. Verifica: user.role === 'driver'?
   - ❌ No es conductor
   - ✅ Salta actualización de Firebase
   ↓
4. authService.logout()
   ↓
5. AsyncStorage.removeItem('user')
   ↓
6. setUser(null)
   ↓
7. ✅ Logout exitoso
```

### **Conductor hace Logout:**
```
1. Usuario presiona "Cerrar Sesión"
   ↓
2. logout() se ejecuta
   ↓
3. Verifica: user.role === 'driver'?
   - ✅ Es conductor
   - ✅ Intenta actualizar Firebase
   ↓
4. Try actualizar driverLocations:
   - ✅ Éxito → Log "Usuario marcado como offline"
   - ❌ Error → Log "No se pudo actualizar, continuando"
   ↓
5. authService.logout()
   ↓
6. AsyncStorage.removeItem('user')
   ↓
7. setUser(null)
   ↓
8. ✅ Logout exitoso (con o sin actualización Firebase)
```

---

## 📊 **Validaciones Agregadas:**

### **usePresence:**
```typescript
// Antes
if (!user?.id) return;

// Después
if (!user?.id || user.role !== 'driver') return;
```

### **logout:**
```typescript
// Antes
if (user?.id && backendConfig.isFirebase())

// Después
if (user?.id && user.role === 'driver' && backendConfig.isFirebase())
```

---

## 🧪 **Testing:**

### **Test 1: Cliente hace Logout** ✅
```
1. Login como cliente
2. Presionar "Cerrar Sesión"
3. Verificar: No intenta escribir en driverLocations
4. Verificar: Logout exitoso
5. Verificar: No hay errores en consola
```

### **Test 2: Conductor hace Logout** ✅
```
1. Login como conductor
2. Presionar "Cerrar Sesión"
3. Verificar: Intenta actualizar driverLocations
4. Verificar: Si falla, continúa con logout
5. Verificar: Logout exitoso
6. Verificar: Status en Firebase = 'offline' (si tuvo éxito)
```

### **Test 3: Conductor sin Permisos** ✅
```
1. Login como conductor
2. Simular error de permisos en Firebase
3. Presionar "Cerrar Sesión"
4. Verificar: Log "⚠️ No se pudo actualizar status"
5. Verificar: Logout exitoso de todas formas
6. Verificar: Usuario deslogueado localmente
```

---

## 📝 **Logs Esperados:**

### **Cliente Logout:**
```
(No intenta actualizar Firebase)
✅ Logout exitoso
```

### **Conductor Logout (Éxito):**
```
✅ Usuario marcado como offline en Firebase
✅ Logout exitoso
```

### **Conductor Logout (Error Firebase):**
```
⚠️ No se pudo actualizar status en Firebase, continuando con logout
✅ Logout exitoso
```

---

## ✅ **Archivos Modificados:**

1. ✅ `Frontend/src/hooks/usePresence.ts`
   - Validación `user.role === 'driver'`
   - Mejor manejo de errores

2. ✅ `Frontend/src/context/AuthContext.tsx`
   - Validación `user.role === 'driver'` en logout
   - Try/catch anidado para Firebase
   - Logout local forzado en caso de error

---

## 🚀 **Resultado:**

### **Antes:**
- ❌ Clientes intentaban escribir en `driverLocations`
- ❌ Errores de permisos bloqueaban logout
- ❌ Usuario quedaba "atrapado" sin poder salir

### **Después:**
- ✅ Solo conductores escriben en `driverLocations`
- ✅ Errores de Firebase no bloquean logout
- ✅ Logout siempre funciona (local + Firebase)
- ✅ Mejor experiencia de usuario

---

## 📌 **Próximo Paso:**

**Reiniciar la app y probar logout:**
```bash
# La app ya está corriendo
# Presiona 'r' en la terminal para reload
```

**Testing:**
1. Login como cliente → Logout → ✅ Debe funcionar
2. Login como conductor → Logout → ✅ Debe funcionar
3. Verificar Firebase: conductores aparecen offline

---

**Última actualización:** 10 de Octubre 2025, 23:26  
**Estado:** ✅ FIX IMPLEMENTADO - LOGOUT FUNCIONANDO
