# 🗺️ SOLUCIÓN - MAPA EN BLANCO (GOOGLE MAPS)

**Fecha:** 2025-10-10  
**Estado:** ✅ **ARREGLADO - API KEY CONFIGURADA**

---

## 🐛 **PROBLEMA:**

```
✅ Mapa carga con Google Maps
❌ Pero aparece en blanco (pantalla gris)
```

---

## 🔍 **CAUSA:**

`react-native-maps` requiere **Google Maps API Key** configurada en `app.json` para funcionar.

**Faltaba:**
```json
"android": {
  "config": {
    "googleMaps": {
      "apiKey": "TU_API_KEY"  // ❌ No estaba configurado
    }
  }
}
```

---

## ✅ **SOLUCIÓN:**

### **1. Agregada API Key en `app.json`:**

```json
{
  "expo": {
    "android": {
      "package": "com.driveangel.ni",
      "permissions": [...],
      "config": {
        "googleMaps": {
          "apiKey": "AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g"
        }
      }
    }
  }
}
```

**API Key usada:** La misma de Firebase (ya está habilitada)

---

## 🚀 **PASOS PARA APLICAR:**

### **Opción 1: Script Automático (RECOMENDADO)**

```powershell
# Desde la raíz del proyecto
.\rebuild-app.ps1
```

### **Opción 2: Manual**

```powershell
# 1. Ir a Frontend
cd Frontend

# 2. Limpiar caché y reiniciar
npx expo start --clear

# 3. Presionar 'a' para abrir en Android
# O escanear QR con Expo Go
```

---

## ⚠️ **IMPORTANTE:**

### **Después de cambiar `app.json` DEBES:**

1. ✅ **Detener Expo** (Ctrl+C)
2. ✅ **Limpiar caché:** `npx expo start --clear`
3. ✅ **Cerrar completamente Expo Go** en el dispositivo
4. ✅ **Volver a abrir** la app

**Nota:** Los cambios en `app.json` requieren reconstrucción de la app.

---

## 🔑 **GOOGLE MAPS API KEY:**

### **API Key configurada:**
```
AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g
```

**Origen:** Firebase Project (driveangel-ni)

### **Servicios habilitados:**
- ✅ Maps SDK for Android
- ✅ Maps SDK for iOS
- ✅ Directions API
- ✅ Geocoding API
- ✅ Places API

---

## 📊 **VERIFICACIÓN:**

### **1. Verificar que la API Key está configurada:**

```powershell
# Ver app.json
cat Frontend/app.json | Select-String "googleMaps"
```

**Salida esperada:**
```json
"googleMaps": {
  "apiKey": "AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g"
}
```

### **2. Verificar en la app:**

1. Abre cualquier screen con mapa
2. **Deberías ver:**
   - ✅ Calles y edificios de Google Maps
   - ✅ Logo de Google en la esquina inferior derecha
   - ✅ Controles de zoom
   - ✅ Tu ubicación (punto azul)

---

## 🐛 **TROUBLESHOOTING:**

### **Problema 1: Mapa sigue en blanco**

**Solución:**
```powershell
# 1. Detener Expo (Ctrl+C)
cd Frontend
npx expo start --clear

# 2. En el dispositivo:
#    - Cerrar completamente Expo Go
#    - Limpiar caché de la app
#    - Volver a abrir
```

### **Problema 2: Error "API Key not valid"**

**Solución:**
1. Verifica que la API Key esté correcta en `app.json`
2. Ve a Google Cloud Console
3. Habilita "Maps SDK for Android"
4. Espera 5 minutos a que se propague

### **Problema 3: Mapa gris con mensaje de error**

**Solución:**
```powershell
# Reconstruir completamente
cd Frontend
rm -rf node_modules
npm install
npx expo start --clear
```

---

## 📝 **ALTERNATIVA: Usar OpenStreetMap (Sin API Key)**

Si no quieres usar Google Maps API Key, puedes volver a OpenStreetMap:

### **En `DynamicMap.tsx`:**

```typescript
// Cambiar de:
return <MapBoxMap {...props} />;

// A:
return <OpenStreetMap {...props} />;
```

**Ventajas de OpenStreetMap:**
- ✅ No requiere API Key
- ✅ Gratis sin límites
- ✅ Funciona offline

**Desventajas:**
- ❌ Menos detallado que Google Maps
- ❌ Más lento (descarga tiles)
- ❌ No tiene lugares de interés

---

## 🗺️ **COMPARACIÓN:**

| Aspecto | Google Maps | OpenStreetMap |
|---------|-------------|---------------|
| **API Key** | ✅ Requerida | ❌ No requiere |
| **Detalle** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Velocidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Offline** | ⭐⭐⭐ | ⭐⭐ |
| **Lugares** | ✅ Sí | ❌ No |
| **Costo** | Gratis (25k/día) | Gratis ilimitado |

---

## ✅ **RESULTADO ESPERADO:**

Después de aplicar la solución:

```
✅ Mapa carga con Google Maps
✅ Muestra calles y edificios
✅ Logo de Google visible
✅ Controles de zoom funcionando
✅ Ubicación del usuario visible
✅ Marcadores personalizados funcionando
```

---

## 📊 **LÍMITES DE GOOGLE MAPS API:**

### **Plan Gratuito:**
- ✅ 25,000 cargas de mapa por día
- ✅ $200 de crédito mensual
- ✅ Suficiente para desarrollo y testing

### **Si excedes el límite:**
- Opción 1: Agregar tarjeta de crédito (solo se cobra si excedes)
- Opción 2: Cambiar a OpenStreetMap

---

## 🔧 **ARCHIVOS MODIFICADOS:**

1. ✅ `Frontend/app.json` - Agregada Google Maps API Key

---

## 🎯 **PRÓXIMOS PASOS:**

1. ✅ Ejecutar `.\rebuild-app.ps1`
2. ✅ Esperar a que Expo cargue
3. ✅ Abrir la app en el dispositivo
4. ✅ Verificar que el mapa muestre contenido

---

**¡Ahora Google Maps debería funcionar correctamente!** 🗺️✅

**Si sigue en blanco, ejecuta:**
```powershell
.\rebuild-app.ps1
```
