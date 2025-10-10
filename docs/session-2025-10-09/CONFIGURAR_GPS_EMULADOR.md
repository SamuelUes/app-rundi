# 📍 CONFIGURAR GPS EN EMULADOR ANDROID

## 🎯 PROBLEMA:
El emulador de Android no tiene GPS real y no detecta automáticamente tu ubicación en Managua.

## ✅ SOLUCIONES:

---

### **SOLUCIÓN 1: Configurar desde Android Studio (MÁS FÁCIL)**

#### **Pasos:**

1. **Abre Extended Controls del Emulador:**
   - Click en los `...` (tres puntos) en el panel lateral derecho del emulador
   - O presiona: `Ctrl + Shift + P` (Windows/Linux) o `Cmd + Shift + P` (Mac)

2. **Ve a la sección "Location":**
   - En el menú lateral izquierdo, click en "Location"

3. **Configura Managua, Nicaragua:**
   ```
   Latitude:  12.1364
   Longitude: -86.2514
   ```

4. **Envía la ubicación:**
   - Click en el botón "SEND" o "SET LOCATION"
   - Verás un mensaje de confirmación

5. **Verifica:**
   - Abre Google Maps en el emulador
   - Deberías ver que estás en Managua

---

### **SOLUCIÓN 2: Usar ADB (Terminal)**

```bash
# Conectar al emulador
adb devices

# Configurar ubicación (Managua)
adb emu geo fix -86.2514 12.1364

# Formato: adb emu geo fix <longitude> <latitude>
```

**Nota:** El orden es `longitud` primero, luego `latitud`.

---

### **SOLUCIÓN 3: Usar Telnet**

```bash
# Conectar al emulador (puerto por defecto: 5554)
telnet localhost 5554

# Configurar ubicación
geo fix -86.2514 12.1364

# Salir
quit
```

---

### **SOLUCIÓN 4: Simular Ruta (Para Testing de Tracking)**

1. **En Extended Controls → Location:**
   - Ve a la pestaña "Routes"

2. **Crea una ruta:**
   - Click en "Load GPX/KML"
   - O usa "Single points" para agregar puntos manualmente

3. **Reproduce la ruta:**
   - Ajusta la velocidad (Speed multiplier)
   - Click en "PLAY ROUTE"
   - El emulador simulará movimiento

---

## 🔧 UBICACIONES ÚTILES EN MANAGUA:

### **Puntos de Interés:**

```javascript
// Managua Centro
Lat: 12.1364, Lng: -86.2514

// Metrocentro
Lat: 12.1258, Lng: -86.2674

// Plaza Inter
Lat: 12.1167, Lng: -86.2362

// Aeropuerto Internacional
Lat: 12.1415, Lng: -86.1682

// UCA (Universidad Centroamericana)
Lat: 12.1167, Lng: -86.2697

// Rotonda El Güegüense
Lat: 12.1308, Lng: -86.2508
```

---

## 🚀 UBICACIÓN MOCK AUTOMÁTICA (YA IMPLEMENTADO)

He actualizado el código para que **automáticamente use Managua** si no puede obtener GPS:

### **Archivo: `Frontend/src/hooks/useLocation.ts`**

```typescript
// Si no hay GPS o permisos, usa Managua por defecto
const DEFAULT_LOCATION = {
  latitude: 12.1364,
  longitude: -86.2514,
};
```

### **Cómo funciona:**

1. ✅ Intenta obtener ubicación real (10 segundos timeout)
2. ⚠️ Si falla o no hay permisos → Usa Managua
3. 📍 Muestra en consola si está usando ubicación mock
4. 🔄 Puedes refrescar con `refreshLocation()`

### **Ver en logs:**

```
✅ Ubicación obtenida: 12.1364, -86.2514
// O
⚠️ Error al obtener ubicación GPS. Usando ubicación mock: Managua
```

---

## 🧪 TESTING CON UBICACIONES MOCK

### **Archivo creado: `Frontend/src/utils/mockLocation.ts`**

Puedes usar ubicaciones predefinidas:

```typescript
import { getMockLocation, MOCK_LOCATIONS } from '../utils/mockLocation';

// Usar Metrocentro
const coords = getMockLocation('metrocentro');

// Ubicaciones disponibles:
// - managua
// - metrocentro
// - plazaInter
// - aeropuerto
// - uca
// - rotondaGueguense
```

---

## 🐛 TROUBLESHOOTING:

### **Problema 1: "Location services are disabled"**

**Solución:**
1. En el emulador, ve a Settings → Location
2. Activa "Use location"
3. Asegúrate que "Google Location Accuracy" esté ON

### **Problema 2: "Permission denied"**

**Solución:**
1. Settings → Apps → DriveAngel → Permissions
2. Location → "Allow all the time" o "Allow only while using the app"

### **Problema 3: La ubicación no se actualiza**

**Solución:**
1. Cierra y vuelve a abrir la app
2. O usa el botón de refresh en la app (si existe)
3. O llama a `refreshLocation()` desde el código

### **Problema 4: Sigue mostrando ubicación incorrecta**

**Solución:**
1. Reinicia el emulador
2. Vuelve a configurar la ubicación desde Extended Controls
3. Verifica en Google Maps que la ubicación sea correcta

---

## 📱 VERIFICAR QUE FUNCIONA:

### **1. Abre Google Maps en el emulador:**
```
- Deberías ver el punto azul en Managua
- Si no, configura la ubicación de nuevo
```

### **2. En tu app DriveAngel:**
```
- Abre la consola (npm start logs)
- Busca: "✅ Ubicación obtenida" o "⚠️ Usando ubicación mock"
- Verifica las coordenadas
```

### **3. En SearchRideScreen:**
```
- El origen debería mostrar una dirección en Managua
- El mapa debería centrarse en Managua
```

---

## 💡 TIPS:

1. **Siempre configura la ubicación ANTES de abrir la app**
2. **Usa Google Maps para verificar** que el GPS funciona
3. **Los logs te dirán** si está usando ubicación mock
4. **Para testing de tracking**, usa la función "Routes" para simular movimiento
5. **Si todo falla**, la app usará Managua automáticamente

---

## 🎯 COMANDO RÁPIDO:

```bash
# Configurar Managua en el emulador
adb emu geo fix -86.2514 12.1364
```

**¡Copia y pega este comando cada vez que inicies el emulador!**

---

**Guía creada el 2025-10-09 a las 17:35** 📍✨

**Estado:** Ubicación mock automática implementada + Guía completa
