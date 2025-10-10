# 🗺️ CONFIGURAR GOOGLE MAPS API

## 🚨 PROBLEMA ACTUAL:

```
ERROR  ❌ Google Directions error: REQUEST_DENIED
```

**Causa:** La API key de Google Maps no está configurada o no tiene los permisos necesarios.

---

## ✅ SOLUCIÓN:

### **PASO 1: Obtener API Key de Google Maps**

1. **Ve a Google Cloud Console:**
   - https://console.cloud.google.com/

2. **Crea un proyecto (si no tienes uno):**
   - Click en el selector de proyectos (arriba)
   - Click en "Nuevo Proyecto"
   - Nombre: `DriveAngel` o similar
   - Click "Crear"

3. **Habilita las APIs necesarias:**
   - Ve a "APIs y Servicios" → "Biblioteca"
   - Busca y habilita las siguientes APIs:
     - ✅ **Maps SDK for Android**
     - ✅ **Maps SDK for iOS**
     - ✅ **Maps JavaScript API**
     - ✅ **Directions API** ⭐ (Para routing)
     - ✅ **Geocoding API** ⭐ (Para direcciones)
     - ✅ **Places API** ⭐ (Para autocompletado)
     - ✅ **Distance Matrix API** (Para distancias)

4. **Crea una API Key:**
   - Ve a "APIs y Servicios" → "Credenciales"
   - Click "Crear credenciales" → "Clave de API"
   - Copia la API key generada

5. **Configura restricciones (Opcional pero recomendado):**
   - Click en la API key creada
   - En "Restricciones de aplicación":
     - Selecciona "Aplicaciones de Android"
     - Agrega tu package name: `com.driveangel.ni`
     - Agrega tu SHA-1 fingerprint
   - En "Restricciones de API":
     - Selecciona "Restringir clave"
     - Marca solo las APIs que necesitas (las de arriba)
   - Click "Guardar"

---

### **PASO 2: Configurar en el Proyecto**

#### **Actualizar `.env`:**

```env
# Frontend/.env
GOOGLE_MAPS_API_KEY=AIzaSy...tu_api_key_real_aqui
```

**⚠️ IMPORTANTE:**
- Reemplaza `your_google_maps_api_key` con tu API key real
- NO commitees el archivo `.env` a Git
- Mantén el `.env.template` con el placeholder

---

### **PASO 3: Verificar Configuración**

#### **Reinicia la app:**
```bash
# En la terminal donde corre npm start
# Presiona: r
```

#### **Verifica en los logs:**
```
✅ Éxito con GOOGLE
```

En lugar de:
```
❌ Google Directions error: REQUEST_DENIED
```

---

## 🔍 TROUBLESHOOTING:

### **Error: REQUEST_DENIED**

**Causas posibles:**
1. ❌ API key no configurada
2. ❌ API key inválida
3. ❌ APIs no habilitadas en Google Cloud
4. ❌ Restricciones muy estrictas

**Solución:**
- Verifica que la API key esté en `.env`
- Verifica que las APIs estén habilitadas
- Temporalmente, quita las restricciones para testing

---

### **Error: OVER_QUERY_LIMIT**

**Causa:** Has excedido el límite gratuito

**Solución:**
- Google Maps da $200 USD gratis al mes
- Configura límites de uso en Google Cloud
- Usa MapBox como principal (gratis hasta 100k requests)

---

### **Error: INVALID_REQUEST**

**Causa:** Parámetros incorrectos en la solicitud

**Solución:**
- Verifica que las coordenadas sean válidas
- Verifica el formato de la solicitud

---

## 💰 COSTOS:

### **Google Maps Pricing:**

**Gratis:**
- $200 USD de crédito mensual
- ~28,500 solicitudes de Directions API
- ~40,000 solicitudes de Geocoding API

**Después del crédito:**
- Directions API: $5 USD por 1,000 requests
- Geocoding API: $5 USD por 1,000 requests
- Places API: $17 USD por 1,000 requests

### **Recomendación:**
- Usa Google Maps para usuarios con buena conectividad
- Usa MapBox como fallback (mejor para Nicaragua)
- Implementa caché para reducir requests

---

## 🌍 COMPARACIÓN: GOOGLE VS MAPBOX

### **Google Maps:**
✅ Mejor para zonas urbanas grandes
✅ Datos de tráfico en tiempo real
✅ Street View
✅ Más lugares de interés
❌ Más caro después del crédito
❌ Menor cobertura en zonas rurales de Nicaragua

### **MapBox:**
✅ Gratis hasta 100,000 requests/mes
✅ Mejor cobertura en Nicaragua
✅ Datos actualizados de OpenStreetMap
✅ Rutas más precisas en zonas rurales
✅ Mejor manejo de rotondas
❌ Sin datos de tráfico en tiempo real
❌ Menos lugares de interés

---

## 🎯 CONFIGURACIÓN RECOMENDADA:

### **Para Desarrollo:**
```env
# Usar MapBox como principal (gratis)
GOOGLE_MAPS_API_KEY=  # Dejar vacío o comentar
MAPBOX_TOKEN=pk.eyJ1Ijoic2FtdWVsdWVzIiwiYSI6ImNtZ2k5OHdzbDA3NW8ybXB4OXM5Y2E2ZzYifQ.rTD0LZ2w9t_jQxEV2MR_Sg
```

### **Para Producción:**
```env
# Usar Google Maps con MapBox como fallback
GOOGLE_MAPS_API_KEY=AIzaSy...tu_api_key_real
MAPBOX_TOKEN=pk.eyJ1Ijoic2FtdWVsdWVzIiwiYSI6ImNtZ2k5OHdzbDA3NW8ybXB4OXM5Y2E2ZzYifQ.rTD0LZ2w9t_jQxEV2MR_Sg
```

---

## 📝 CHECKLIST:

### **Google Maps Setup:**
- [ ] Crear proyecto en Google Cloud Console
- [ ] Habilitar Directions API
- [ ] Habilitar Geocoding API
- [ ] Habilitar Places API
- [ ] Crear API Key
- [ ] Copiar API Key a `.env`
- [ ] Reiniciar app
- [ ] Verificar que funcione

### **Verificación:**
- [ ] Mapa visual se muestra correctamente
- [ ] Autocompletado de direcciones funciona
- [ ] Cálculo de rutas funciona
- [ ] No aparece error `REQUEST_DENIED`

---

## 🚀 COMANDOS ÚTILES:

### **Ver logs de Google Maps:**
```bash
# En la terminal donde corre npm start
# Busca líneas que digan:
🗺️ Intentando con GOOGLE...
✅ Éxito con GOOGLE
```

### **Forzar uso de MapBox (para testing):**
```env
# Comentar o eliminar Google Maps API Key
# GOOGLE_MAPS_API_KEY=
MAPBOX_TOKEN=pk.eyJ1Ijoic2FtdWVsdWVzIiwiYSI6ImNtZ2k5OHdzbDA3NW8ybXB4OXM5Y2E2ZzYifQ.rTD0LZ2w9t_jQxEV2MR_Sg
```

---

## 📚 RECURSOS:

- **Google Cloud Console:** https://console.cloud.google.com/
- **Google Maps Platform:** https://developers.google.com/maps
- **Pricing Calculator:** https://mapsplatform.google.com/pricing/
- **MapBox Pricing:** https://www.mapbox.com/pricing

---

**Documentación creada:** 2025-10-09 18:21
**Estado:** ⚠️ Pendiente configurar Google Maps API Key
