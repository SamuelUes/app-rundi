# 🗺️ Solución: Google Maps en Android

**Problema**: El mapa no aparece en la app  
**Causa**: Google Maps (react-native-maps) no funciona con Expo Go  
**Solución**: Crear un Development Build

---

## ⚠️ POR QUÉ NO FUNCIONA

Expo Go es una app genérica que no incluye módulos nativos como `react-native-maps`. Para usar Google Maps necesitas:

1. **Development Build** (recomendado)
2. O **Expo Prebuild** + compilación manual

---

## ✅ SOLUCIÓN 1: Development Build (Recomendado)

### **Paso 1: Instalar EAS CLI**
```bash
npm install -g eas-cli
```

### **Paso 2: Login en Expo**
```bash
eas login
```

### **Paso 3: Configurar EAS**
```bash
cd Frontend
eas build:configure
```

### **Paso 4: Crear Development Build**
```bash
eas build --profile development --platform android
```

Esto creará un APK que puedes instalar en tu emulador o dispositivo.

### **Paso 5: Instalar el APK**
```bash
# Descargar el APK cuando termine el build
# Instalarlo en el emulador:
adb install app-development.apk
```

### **Paso 6: Iniciar dev server**
```bash
npx expo start --dev-client
```

---

## ✅ SOLUCIÓN 2: Prebuild Local (Más Rápido)

### **Paso 1: Hacer Prebuild**
```bash
cd Frontend
npx expo prebuild --platform android
```

Esto generará la carpeta `android/` con el proyecto nativo.

### **Paso 2: Abrir en Android Studio**
```bash
# Abrir Android Studio
# File → Open → Seleccionar carpeta Frontend/android
```

### **Paso 3: Sync Gradle**
En Android Studio:
- Click en "Sync Project with Gradle Files"
- Esperar a que descargue dependencias

### **Paso 4: Run en Emulador**
- Click en el botón "Run" (▶️)
- Seleccionar tu emulador
- La app se compilará e instalará

### **Paso 5: Iniciar Metro**
```bash
npx expo start
```

---

## ✅ SOLUCIÓN 3: Alternativa Temporal (Sin Mapa Real)

Mientras configuras el build, puedes usar un mapa estático o placeholder:

### **Opción A: Mapa Estático de Google**
```typescript
<Image
  source={{
    uri: `https://maps.googleapis.com/maps/api/staticmap?center=${coords.latitude},${coords.longitude}&zoom=15&size=400x400&markers=color:red%7C${coords.latitude},${coords.longitude}&key=AIzaSyBQx3SVauc0jsLQU9eT11px5kqbtAVPUoI`
  }}
  style={styles.map}
/>
```

### **Opción B: WebView con Google Maps**
```bash
npx expo install react-native-webview
```

```typescript
<WebView
  source={{
    html: `
      <html>
        <body>
          <div id="map" style="width:100%;height:100%"></div>
          <script src="https://maps.googleapis.com/maps/api/js?key=AIzaSyBQx3SVauc0jsLQU9eT11px5kqbtAVPUoI"></script>
          <script>
            const map = new google.maps.Map(document.getElementById('map'), {
              center: {lat: ${coords.latitude}, lng: ${coords.longitude}},
              zoom: 15
            });
          </script>
        </body>
      </html>
    `
  }}
  style={styles.map}
/>
```

---

## 🎯 RECOMENDACIÓN

**Para desarrollo rápido**: Usa **Solución 2 (Prebuild Local)**

1. Es más rápido que EAS Build
2. No requiere cuenta de Expo
3. Puedes debuggear directamente en Android Studio

**Para producción**: Usa **Solución 1 (EAS Build)**

1. Builds optimizados
2. Fácil distribución
3. CI/CD integrado

---

## 📝 COMANDOS RÁPIDOS

### **Prebuild + Android Studio**
```bash
# 1. Generar proyecto Android
cd Frontend
npx expo prebuild --platform android --clean

# 2. Abrir Android Studio
# File → Open → Frontend/android

# 3. Run en emulador desde Android Studio

# 4. En otra terminal, iniciar Metro
npx expo start
```

---

## ✅ VERIFICAR QUE FUNCIONA

Después de hacer el build, deberías ver:

1. ✅ Mapa de Google Maps renderizado
2. ✅ Tu ubicación actual marcada
3. ✅ Controles de zoom funcionando
4. ✅ Botón "Mi ubicación" funcionando

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### **Error: Google Maps API key inválida**
- Verifica que la API key tenga habilitado "Maps SDK for Android"
- Ve a Google Cloud Console → APIs & Services → Credentials
- Asegúrate de que no tenga restricciones de aplicación

### **Error: Mapa en blanco**
- Verifica permisos de ubicación en AndroidManifest.xml
- Asegúrate de que el emulador tenga ubicación habilitada

### **Error al compilar**
- Limpia el proyecto: `cd android && ./gradlew clean`
- Reinstala dependencias: `rm -rf node_modules && npm install`

---

## 🚀 PRÓXIMOS PASOS

Una vez que el mapa funcione:

1. **Agregar búsqueda de lugares**
   - Usar Google Places API
   - Autocompletado de direcciones

2. **Calcular rutas**
   - Google Directions API
   - Mostrar polyline en el mapa

3. **Tracking en tiempo real**
   - WebSockets para ubicación del conductor
   - Actualizar marcadores en tiempo real

---

**¿Qué solución prefieres usar?**
1. Development Build (EAS)
2. Prebuild Local (Android Studio) ← **Recomendado**
3. Alternativa temporal (WebView/Static)
