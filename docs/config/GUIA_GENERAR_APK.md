# 📦 GUÍA PARA GENERAR APK - DRIVEANGEL.NI

**Fecha:** 2025-01-10  
**Proyecto:** DriveAngel.ni - App de Transporte

---

## 🎯 **OBJETIVO:**

Generar un APK descargable para instalar en dispositivos Android sin Google Play Store.

---

## 📋 **REQUISITOS PREVIOS:**

1. ✅ Cuenta en Expo (https://expo.dev)
2. ✅ Node.js instalado
3. ✅ Proyecto funcionando sin errores

---

## 🚀 **OPCIÓN 1: BUILD EN LA NUBE (RECOMENDADO)**

### **Ventajas:**
- ✅ No requiere Android Studio
- ✅ Build optimizado
- ✅ Firmado automático
- ✅ Más confiable

### **Pasos:**

```powershell
# Ejecutar desde la raíz del proyecto
.\build-apk.ps1
```

O manualmente:

```powershell
cd Frontend

# 1. Instalar EAS CLI
npm install -g eas-cli

# 2. Login en Expo
eas login

# 3. Configurar proyecto (solo primera vez)
eas build:configure

# 4. Generar APK
eas build --platform android --profile preview
```

### **Tiempo estimado:** 10-15 minutos

### **Resultado:**
- APK disponible en: https://expo.dev/accounts/[tu-usuario]/projects/driveangel-ni/builds
- Descarga directa desde el navegador
- Tamaño aproximado: 50-80 MB

---

## 🏃 **OPCIÓN 2: BUILD LOCAL (MÁS RÁPIDO)**

### **Ventajas:**
- ✅ Más rápido (5-10 min)
- ✅ No requiere internet
- ✅ APK inmediato

### **Requisitos adicionales:**
- Android Studio instalado
- JDK 11 o superior
- Android SDK configurado

### **Pasos:**

```powershell
# Ejecutar desde la raíz del proyecto
.\build-apk-local.ps1
```

O manualmente:

```powershell
cd Frontend

# Generar APK local
npx eas build --platform android --profile preview --local
```

### **Tiempo estimado:** 5-10 minutos

### **Resultado:**
- APK en: `Frontend/android/app/build/outputs/apk/release/app-release.apk`
- Tamaño aproximado: 50-80 MB

---

## 📱 **INSTALAR EL APK:**

### **En el mismo dispositivo:**
1. Descarga el APK
2. Abre el archivo
3. Permite "Instalar apps de fuentes desconocidas"
4. Instala

### **En otro dispositivo:**
1. Copia el APK al dispositivo (USB, email, Drive, etc.)
2. Abre el archivo
3. Permite "Instalar apps de fuentes desconocidas"
4. Instala

---

## ⚙️ **CONFIGURACIÓN DEL PROYECTO:**

### **app.json - Información de la App:**

```json
{
  "expo": {
    "name": "DriveAngel.ni",
    "slug": "driveangel-ni",
    "version": "1.0.0",
    "android": {
      "package": "com.driveangel.ni",
      "versionCode": 1,
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ],
      "config": {
        "googleMaps": {
          "apiKey": "AIzaSyAMeFnZTR6jspAZi3kYphjQQSksWvpM4g"
        }
      }
    }
  }
}
```

### **eas.json - Configuración de Build:**

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      },
      "distribution": "internal"
    }
  }
}
```

---

## 🐛 **TROUBLESHOOTING:**

### **Error: "No Expo account found"**
```powershell
eas login
```

### **Error: "Android SDK not found" (Build local)**
- Instala Android Studio
- Configura ANDROID_HOME en variables de entorno

### **Error: "Build failed"**
- Verifica que no haya errores en el código
- Ejecuta: `npm run build` para verificar

### **APK muy grande (>100MB)**
- Normal para apps con muchas dependencias
- Considera optimizar imágenes
- Revisa dependencias no usadas

---

## 📊 **INFORMACIÓN DEL APK:**

### **Versión actual:**
- **Nombre:** DriveAngel.ni
- **Versión:** 1.0.0
- **Package:** com.driveangel.ni
- **Min SDK:** 21 (Android 5.0)
- **Target SDK:** 33 (Android 13)

### **Permisos:**
- ✅ Ubicación (GPS)
- ✅ Cámara (fotos de perfil)
- ✅ Almacenamiento (guardar fotos)

### **Características:**
- ✅ Mapas (OpenStreetMap)
- ✅ Tracking en tiempo real
- ✅ Chat
- ✅ Pagos con Stripe
- ✅ Calificaciones
- ✅ Historial de viajes

---

## 🔄 **ACTUALIZAR LA APP:**

Para generar una nueva versión:

1. **Actualizar versión en `app.json`:**
   ```json
   {
     "version": "1.0.1",
     "android": {
       "versionCode": 2
     }
   }
   ```

2. **Generar nuevo APK:**
   ```powershell
   eas build --platform android --profile preview
   ```

3. **Distribuir:**
   - Envía el nuevo APK a los usuarios
   - Los usuarios desinstalan la versión anterior
   - Instalan la nueva versión

---

## 📤 **DISTRIBUIR EL APK:**

### **Opciones:**

1. **Google Drive / Dropbox:**
   - Sube el APK
   - Comparte el link
   - Los usuarios descargan e instalan

2. **Email:**
   - Adjunta el APK (si es <25MB)
   - O comparte link de Drive

3. **WhatsApp / Telegram:**
   - Envía el APK directamente
   - O comparte link de descarga

4. **Servidor propio:**
   - Sube a tu servidor
   - Crea página de descarga
   - Ejemplo: https://driveangel.online/download

5. **Firebase App Distribution:**
   - Distribución profesional
   - Notificaciones de actualización
   - Analytics de instalaciones

---

## 🎯 **PRÓXIMOS PASOS (PRODUCCIÓN):**

### **Para publicar en Google Play Store:**

1. **Crear cuenta de desarrollador:**
   - Costo: $25 USD (una vez)
   - https://play.google.com/console

2. **Generar App Bundle:**
   ```powershell
   eas build --platform android --profile production
   ```

3. **Subir a Play Store:**
   - Completa información de la app
   - Sube screenshots
   - Define categoría
   - Publica

### **Tiempo de revisión:**
- Primera publicación: 1-7 días
- Actualizaciones: 1-3 días

---

## 📝 **CHECKLIST ANTES DE GENERAR APK:**

- [ ] ✅ App funciona sin errores
- [ ] ✅ Todas las pantallas probadas
- [ ] ✅ Mapas funcionando
- [ ] ✅ Backend conectado
- [ ] ✅ Permisos configurados
- [ ] ✅ Íconos y splash screen
- [ ] ✅ Versión actualizada en app.json
- [ ] ✅ API Keys configuradas
- [ ] ✅ Firebase conectado
- [ ] ✅ Stripe configurado

---

## 🎉 **RESULTADO FINAL:**

Después de ejecutar el build, tendrás:

```
✅ APK descargable (50-80 MB)
✅ Instalable en cualquier Android 5.0+
✅ Sin necesidad de Google Play Store
✅ Listo para distribuir a usuarios
```

---

## 📞 **SOPORTE:**

Si tienes problemas:
1. Revisa los logs del build
2. Verifica que el código compile sin errores
3. Consulta la documentación de Expo: https://docs.expo.dev/build/setup/

---

**¡Listo para generar tu APK!** 🚀

**Ejecuta:** `.\build-apk.ps1`
