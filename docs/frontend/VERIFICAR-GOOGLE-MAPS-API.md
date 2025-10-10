# 🗺️ Verificar Google Maps API Key

**Problema**: El logo de Google aparece pero el mapa no se renderiza  
**Causa**: La API key necesita tener habilitado "Maps SDK for Android"

---

## ✅ VERIFICAR Y HABILITAR LA API

### **Paso 1: Ir a Google Cloud Console**

1. Abre: https://console.cloud.google.com/
2. Selecciona tu proyecto o crea uno nuevo

### **Paso 2: Habilitar Maps SDK for Android**

1. Ve a: **APIs & Services → Library**
2. Busca: **"Maps SDK for Android"**
3. Click en el resultado
4. Click en **"ENABLE"** (Habilitar)

### **Paso 3: Verificar la API Key**

1. Ve a: **APIs & Services → Credentials**
2. Encuentra tu API key: `AIzaSyBQx3SVauc0jsLQU9eT11px5kqbtAVPUoI`
3. Click en la API key para editarla

### **Paso 4: Configurar Restricciones**

**Opción A: Sin restricciones (Desarrollo)**
- Application restrictions: **None**
- API restrictions: **Don't restrict key**

**Opción B: Con restricciones (Producción)**
- Application restrictions: **Android apps**
- Add package name: `com.appuber.app`
- SHA-1 certificate fingerprint: (obtener con keytool)

### **Paso 5: Asegurar que estén habilitadas estas APIs**

- ✅ Maps SDK for Android
- ✅ Places API (para búsqueda de lugares)
- ✅ Directions API (para rutas)
- ✅ Geocoding API (para direcciones)

---

## 🔧 SOLUCIÓN TEMPORAL: Usar Ubicación por Defecto

Mientras verificas la API key, voy a actualizar el código para que use una ubicación por defecto de Guatemala:

**Coordenadas de Guatemala City:**
```
Latitude: 14.6349
Longitude: -90.5069
```

---

## 🧪 PROBAR SI LA API KEY FUNCIONA

### **Test desde navegador:**

Abre esta URL en tu navegador (reemplaza con tu API key):

```
https://maps.googleapis.com/maps/api/staticmap?center=14.6349,-90.5069&zoom=13&size=400x400&key=AIzaSyBQx3SVauc0jsLQU9eT11px5kqbtAVPUoI
```

**Si funciona**: Verás un mapa estático  
**Si no funciona**: Verás un error de API key

---

## 🔍 LOGS PARA DEBUGGEAR

En la terminal de Expo, deberías ver:
```
Map is ready!
```

Si ves errores como:
```
Map error: API key not valid
```

Entonces necesitas verificar la configuración en Google Cloud Console.

---

## ✅ CHECKLIST

- [ ] Google Cloud Console abierto
- [ ] Maps SDK for Android habilitado
- [ ] API key sin restricciones (o con package name correcto)
- [ ] Places API habilitado (para búsqueda)
- [ ] App recargada después de cambios

---

## 🚀 DESPUÉS DE HABILITAR LA API

1. **No necesitas recompilar** la app
2. Solo **recarga** presionando `r` en la terminal
3. El mapa debería aparecer inmediatamente

---

**Verifica la API key en Google Cloud Console y avísame si necesitas ayuda.** 🗺️
