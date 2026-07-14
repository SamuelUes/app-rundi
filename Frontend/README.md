# Rundi — Frontend

App móvil de Rundi construida con Expo (CNG — Continuous Native Generation), React Native, Firebase, Supabase, Google Maps y módulos nativos custom (overlay flotante, foreground service, work manager y battery optimization) integrados via Expo Modules autolinked en `modules/rundi-native/`.

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

Este proyecto usa **CNG (Continuous Native Generation)**. Las carpetas `android/` e `ios/` se generan desde `app.config.js` y el config plugin de `modules/rundi-native/`. Todo el código nativo custom (overlay, foreground service, work manager, battery optimization) vive en el módulo Expo y se reinyecta automáticamente en cada prebuild.

```bash
# Regenerar ambas plataformas desde cero (borra y recrea android/ e ios/)
npm run prebuild:clean

# Regenerar solo Android desde cero
npm run prebuild:clean:android

# Regenerar solo iOS desde cero
npm run prebuild:clean:ios

# Generar nativo sin borrar cambios existentes
npx expo prebuild
```

> **Importante:** Después de `prebuild --clean` o `prebuild:clean:android`, recrear `android/local.properties`:
> ```bash
> echo "sdk.dir=/Users/$USER/Library/Android/sdk" > android/local.properties
> ```

> El código nativo custom **no se pierde** con `--clean` porque está en `modules/rundi-native/` (Expo Module autolinked) y el config plugin `app.plugin.js` reinyecta permisos, servicios, strings, colores y modificaciones del Podfile automáticamente.

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
- Depurar código Kotlin (breakpoints en `modules/rundi-native/android/`)
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

Verificar que la API key de Google Maps esté configurada en `app.config.js > android.config.googleMaps.apiKey`. El config plugin la inyecta automáticamente en el `AndroidManifest.xml` durante el prebuild.

### Error: "Firebase no inicializa"

Verificar que `google-services.json` (Android) y `GoogleService-Info.plist` (iOS) estén presentes y actualizados:
- Android: `android/app/google-services.json`
- iOS: `ios/Rundi/GoogleService-Info.plist`

> Estos archivos no se borran con `prebuild --clean` si están commiteados. Si no, colocarlos manualmente después de prebuild.

### Error: Manifest merger failed (tools:replace)

Si aparece un conflicto de `meta-data#com.google.firebase.messaging.default_notification_color`, el config plugin de `rundi-native` ya inyecta `tools:replace="android:resource"` automáticamente. Si persiste, verificar que `./modules/rundi-native/app.plugin.js` esté **primero** en el array `plugins` de `app.config.js`.

---

## Módulo nativo custom (`modules/rundi-native/`)

El módulo Expo `rundi-native` contiene todo el código nativo custom de la app:

**Android (`android/`):**
- **`overlay/`** — OverlayManager, OverlayView, OverlayConfig, OverlayContract, OverlayModule (permiso de superposición, burbuja flotante, eventos)
- **`service/`** — TrackingForegroundService, LocationIntegrityWorker, ForegroundServiceModule, WorkManagerModule, BatteryOptimizationModule

**iOS (`ios/`):**
- **`RundiNativeModule.swift`** — Módulo Expo placeholder con registro de eventos (preparado para futura funcionalidad nativa en iOS)

**Compartido:**
- **`app.plugin.js`** — Config plugin que inyecta permisos, servicio, strings, colores y `tools:replace` en Android; y modificaciones de Podfile en iOS
- **`expo-module.config.json`** — Registro de módulos para autolinking (Android: 4 módulos Kotlin, iOS: 1 módulo Swift)
- **`src/index.ts`** — API TypeScript del módulo

> **No editar** `android/` ni `ios/` directamente para cambios en overlay/service. Editar los archivos en `modules/rundi-native/` y correr `npm run prebuild:clean`.

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
| `prebuild:clean` | `npx expo prebuild --clean` | Regenera `android/` e `ios/` desde cero |
| `prebuild:clean:android` | `npx expo prebuild --clean --platform android` | Regenera solo `android/` desde cero |
| `prebuild:clean:ios` | `npx expo prebuild --clean --platform ios` | Regenera solo `ios/` desde cero |
