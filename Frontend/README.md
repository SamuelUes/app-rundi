# Rundi — Frontend

App móvil de Rundi construida con Expo (bare workflow con carpetas nativas `android/` e `ios/`), React Native, Firebase, Supabase, Google Maps y módulos nativos custom (overlay flotante y foreground service).

---

## Requisitos previos

- **Node.js** LTS (>= 20.19.4 recomendado para SDK 57)
- **Xcode** (versión reciente) + Command Line Tools
- **Android Studio** con SDK Platform/Build-Tools instalados y licencias aceptadas
- **CocoaPods** (`sudo gem install cocoapods` o `brew install cocoapods`)
- **Watchman** (`brew install watchman`) — recomendado para Metro
- **EAS CLI** (`npm i -g eas-cli`)
- **Expo Orbit** — descargar desde https://expo.dev/orbit, instalar e iniciar sesión con la cuenta de Expo

---

## Instalación

```bash
# Instalar dependencias
npm ci

# Alinear versiones de paquetes Expo (tras cambios de SDK)
npx expo install --fix

# Instalar pods de iOS (requiere Xcode y CocoaPods)
npx pod-install
```

---

## Variables de entorno

El proyecto usa `react-native-dotenv` y un script para cambiar entre entornos.

```bash
# Cambiar a entorno de desarrollo (copia .env.development → .env)
npm run env:dev

# Cambiar a entorno de producción (copia .env.productions → .env)
npm run env:prod
```

> Después de cambiar el entorno, reiniciar Metro (`npm start`).

---

## Desarrollo

### Comandos existentes (definidos en `package.json`)

| Comando | Descripción |
|---|---|
| `npm start` | Inicia Metro con caché limpia (`expo start --clear`) |
| `npm run start:dev` | Cambia a env de desarrollo e inicia Metro |
| `npm run start:prod` | Cambia a env de producción e inicia Metro |
| `npm run android` | Compila e instala en emulador/dispositivo Android (`expo run:android`) |
| `npm run ios` | Compila e instala en simulador/dispositivo iOS (`expo run:ios`) |
| `npm run web` | Inicia la versión web (`expo start --web`) |
| `npm test` | Ejecuta tests con Jest |

### Parar Metro / servidor de desarrollo

- Presionar `Ctrl+C` en la terminal donde corre Metro.
- Si el puerto 8081 queda ocupado:

```bash
lsof -ti:8081 | xargs kill -9
```

### Limpiar cachés

```bash
# Watchman
watchman watch-del-all

# Metro con caché limpia
npx expo start -c

# Reinstalar node_modules desde cero
rm -rf node_modules && npm ci
```

### Limpiar caché de Gradle (Android)

```bash
cd android && ./gradlew clean
```

### Limpiar pods (iOS)

```bash
cd ios && rm -rf Pods Podfile.lock && pod install
```

---

## Prebuild (CNG)

Este proyecto usa bare workflow con carpetas nativas commiteadas. Los comandos de prebuild regeneran `android/` e `ios/` desde `app.config.js`:

```bash
# Generar nativo sin borrar cambios existentes
npx expo prebuild

# Regenerar nativo desde cero (BORRA android/ e ios/ y los recrea)
npx expo prebuild --clean

# Generar sin limpiar (mantiene carpetas existentes)
npx expo prebuild --no-clean
```

> **Advertencia:** `--clean` borra las carpetas nativas y las regenera. Las personalizaciones nativas manuales (módulos Kotlin de overlay/service, tweaks del Podfile) se pierden. Solo usar cuando se haya migrado el código custom a config plugins / Expo Modules.

---

## Pods de iOS

```bash
# Forma recomendada (usa la versión correcta de CocoaPods)
npx pod-install

# Forma manual
cd ios && pod install
```

---

## Diagnóstico

```bash
# Verificar compatibilidad del proyecto con la versión de Expo instalada
npx expo-doctor

# Verificar tipos de TypeScript
npx tsc --noEmit
```

---

## Builds locales

### iOS (Release)

```bash
npx expo run:ios --configuration Release
```

### Android (Release)

```bash
# APK
cd android && ./gradlew assembleRelease

# AAB (App Bundle para Play Store)
cd android && ./gradlew bundleRelease
```

Los artefactos se generan en:
- **APK:** `android/app/build/outputs/apk/release/`
- **AAB:** `android/app/build/outputs/bundle/release/`

---

## EAS Build (builds en la nube)

Los perfiles están definidos en `eas.json`:

| Perfil | Plataforma | Tipo | Distribución |
|---|---|---|---|
| `development` | iOS (simulador) | Dev client | Interna |
| `preview` | Android (APK) | — | Interna |
| `production` | Android (AAB) / iOS (store) | — | Store |

```bash
# Build de desarrollo (dev client)
eas build --profile development --platform ios
eas build --profile development --platform android

# Build de preview (APK interno)
eas build --profile preview --platform android

# Build de producción
eas build --profile production --platform ios
eas build --profile production --platform android
```

### EAS Submit (enviar a stores)

```bash
eas submit --platform ios
eas submit --platform android
```

### EAS Update (actualizaciones OTA)

```bash
eas update --branch production
eas update --branch preview
```

---

## Expo Orbit

Expo Orbit permite instalar y lanzar dev builds directamente en simuladores iOS y emuladores Android desde la barra de menú de macOS.

1. Descargar e instalar desde https://expo.dev/orbit
2. Iniciar sesión con la cuenta de Expo (`samuelues`)
3. **Lanzar dev build en iOS:** seleccionar el simulador y el build desde la lista de Orbit
4. **Lanzar dev build en Android:** seleccionar el emulador y el build desde la lista de Orbit
5. **Seleccionar dispositivo:** Orbit muestra simuladores/emuladores disponibles; elegir el destino antes de lanzar

> Orbit es útil para alternar rápidamente entre builds sin pasar por Xcode o Android Studio.

---

## Android Studio

Para depuración nativa en Android:

1. Abrir Android Studio
2. Seleccionar **Open an existing project**
3. Navegar a `Frontend/android/` y abrir
4. Esperar a que Gradle sincronice
5. Seleccionar emulador o dispositivo conectado
6. Click en **Run** o **Debug**

**Casos de uso:**
- Inspeccionar logs nativos (Logcat)
- Depurar código Kotlin (breakpoints en `overlay/` o `service/`)
- Editar configuración de Gradle, manifest o recursos
- Generar APK/AAB desde **Build > Generate Signed Bundle/APK**

---

## Xcode

Para depuración nativa en iOS:

1. Abrir Xcode
2. Seleccionar **Open** y navegar a `Frontend/ios/Rundi.xcworkspace` (NO `Rundi.xcodeproj`)
3. Seleccionar simulador o dispositivo conectado
4. Click en **Run** o **Debug**

> Siempre abrir el `.xcworkspace`, no el `.xcodeproj`, para que CocoaPods se resuelva correctamente.

**Casos de uso:**
- Inspeccionar logs nativos (Console)
- Depurar código Swift/Objective-C
- Editar esquema de build, capacidades o entitlements
- Firmar la app con un provisioning profile
- Generar archive para App Store: **Product > Archive**

---

## Troubleshooting

### Error: "Unable to resolve module" al iniciar Metro

```bash
watchman watch-del-all
rm -rf node_modules && npm ci
npx expo start -c
```

### Error: "No pods installed" o errores de compilación iOS

```bash
cd ios && rm -rf Pods Podfile.lock && pod install
npx expo run:ios
```

### Error: "Dev client desactualizado" o pantalla roja tras upgrade de SDK

El dev client instalado en el dispositivo fue compilado con una versión anterior del SDK. Hay que recompilarlo:

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android

# O vía EAS
eas build --profile development --platform ios
eas build --profile development --platform android
```

### Error: Gradle sync failed en Android Studio

```bash
cd android && ./gradlew clean
# En Android Studio: File > Sync Project with Gradle Files
```

### Error: "Metro no conecta con el dispositivo"

1. Verificar que el dispositivo y la computadora estén en la misma red Wi-Fi
2. Agregar la IP de la computadora: en el dispositivo, shake → **Change Bundle Location** → ingresar `http://<IP>:8081`
3. Si hay firewall, permitir conexiones entrantes a Node/Metro

### Error: "Google Maps no carga en Android"

Verificar que la API key de Google Maps esté configurada en `android/app/src/main/AndroidManifest.xml` (meta-data `com.google.android.geo.API_KEY`) y en `app.config.js > android.config.googleMaps.apiKey`.

### Error: "Firebase no inicializa"

Verificar que `google-services.json` (Android) y `GoogleService-Info.plist` (iOS) estén presentes y actualizados:
- Android: `android/app/google-services.json`
- iOS: `ios/Rundi/GoogleService-Info.plist`

---

## Scripts disponibles

| Script | Comando | Descripción |
|---|---|---|
| `start` | `expo start --clear` | Inicia Metro con caché limpia |
| `start:dev` | `node scripts/switch-env.js development && expo start --clear` | Env de desarrollo + Metro |
| `start:prod` | `node scripts/switch-env.js production && expo start --clear` | Env de producción + Metro |
| `android` | `expo run:android` | Build y run en Android |
| `ios` | `expo run:ios` | Build y run en iOS |
| `web` | `expo start --web` | Versión web |
| `test` | `jest` | Tests unitarios |
| `env:dev` | `node scripts/switch-env.js development` | Cambia a env de desarrollo |
| `env:prod` | `node scripts/switch-env.js production` | Cambia a env de producción |
