# 🎨 Crear Assets Faltantes - Solución Rápida

**Problema**: Expo necesita imágenes que no existen

---

## ✅ SOLUCIÓN RÁPIDA (Recomendada)

### **Opción 1: Descargar Assets de Expo**

```bash
# En la carpeta Frontend, ejecuta:
npx expo install expo-splash-screen
npx expo prebuild --clean
```

### **Opción 2: Crear Imágenes Simples**

Crea estas imágenes en `src/assets/`:

1. **icon.png** (1024x1024px) - Ícono de la app
2. **splash.png** (1284x2778px) - Pantalla de carga
3. **adaptive-icon.png** (1024x1024px) - Ícono Android

**Herramientas online para crear:**
- https://www.canva.com (gratis)
- https://www.figma.com (gratis)
- Paint / Photoshop

---

## 🚀 SOLUCIÓN INMEDIATA (Sin imágenes)

He simplificado `app.json` y `app.config.js` para que **NO requieran** estas imágenes.

### **Reinicia Expo:**

```bash
# Presiona Ctrl+C en la terminal de Expo
# Luego ejecuta:
npx expo start --clear
```

### **Ahora debería funcionar sin errores de assets**

---

## 📱 DESPUÉS DE REINICIAR

1. **Presiona `w`** para abrir en web
2. **Deberías ver** la app cargando correctamente
3. **Si ves LoginScreen** = ¡Éxito! ✅

---

## 🐛 SI SIGUE SIN FUNCIONAR

### **Ver errores en la terminal:**
```
Busca líneas rojas con "Error:"
```

### **Errores comunes:**

1. **"Cannot find module"**
   ```bash
   npm install
   npx expo start --clear
   ```

2. **"Port 8081 already in use"**
   ```bash
   # Matar proceso:
   netstat -ano | findstr :8081
   taskkill /PID <PID> /F
   npm start
   ```

3. **"Manifest error"**
   ```bash
   # Limpiar caché completamente:
   Remove-Item -Recurse -Force .expo
   Remove-Item -Recurse -Force node_modules/.cache
   npx expo start --clear
   ```

---

## ✅ CAMBIOS APLICADOS

He removido de `app.json`:
- ❌ `icon`
- ❌ `splash`
- ❌ `adaptiveIcon`
- ❌ `favicon`

Ahora Expo usará valores por defecto y la app debería cargar.

---

**Reinicia Expo ahora con: `npx expo start --clear`**
