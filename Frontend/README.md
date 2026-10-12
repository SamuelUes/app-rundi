# Rundi — Frontend

App móvil de Rundi construida con Expo (CNG — Continuous Native Generation), React Native, Firebase, Supabase, Google Maps y módulos nativos custom (overlay flotante, foreground service, work manager y battery optimization) integrados via Expo Modules autolinked en `modules/rundi-native/`.

---

## Requisitos previos

- **Node.js** LTS (>= 20.19.4 recomendado para SDK 57)
- **Xcode** (versión reciente) + Command Line Tools
- **Android Studio** con SDK Platform/Build-Tools instalados y licencias aceptadas
- **JDK 17** para compilar Android con el Gradle Wrapper actual (8.14.3)
- **JDK 21 o superior** para ejecutar Firebase Emulator Suite con `npm run start:local`
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
| `npm start` | Inicia Metro con caché limpia |
| `npm run start:dev` | Cambia a env de desarrollo e inicia Metro |
| `npm run start:prod` | Cambia a env de producción e inicia Metro |
| `npm run start:local` | Inicia Supabase, Firebase Emulator Suite y Metro local (requiere Docker y JDK 21+) |
| `npm run android` | Compila e instala en emulador/dispositivo Android (`expo run:android`) |
| `npm run ios` | Compila e instala en simulador/dispositivo iOS |
| `npm run web` | Inicia la versión web (`expo start --web`) |
| `npm test` | Ejecuta tests con Jest |

Los scripts `start`, `start:dev`, `start:prod` e `ios` usan la CLI de Expo `57.0.27` para compatibilidad con Device Hub de Xcode 27. La app y sus dependencias siguen en Expo SDK 54.

### Desarrollo local con Android e iOS

El stack local (`npm run start:local`) requiere Java 21 o superior para Firebase Emulator Suite, mientras que el build Android usa el JDK 17 configurado para el Gradle Wrapper actual. Ejecuta cada proceso en una terminal distinta:

**Terminal 1 — Supabase, Firebase Emulator Suite y Metro** (mantener ejecutándose):

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21+) # Selecciona un JDK 21 o superior
export PATH="$JAVA_HOME/bin:$PATH"
java -version
npm run start:local
```

**Terminal 2 — compilar e instalar Android** (JDK 17):

```bash
source ~/.zshrc
java -version # Debe mostrar Java 17
npm run android -- --no-bundler
```

`--no-bundler` reutiliza Metro, que ya está iniciado en la primera terminal. Si no usas zsh o no tienes Java 17 seleccionado en `~/.zshrc`, configura `JAVA_HOME` con la ruta de tu JDK 17 antes de ejecutar el comando.

#### ¿Se puede usar Java 27 para ambos?

En principio, sí: Java 27 requiere Gradle 9.8 o posterior para estar soportado al ejecutar Gradle. Este proyecto usa Gradle 8.14.3, la versión de su configuración actual de Expo, y el build ya muestra advertencias por APIs obsoletas incompatibles con Gradle 9. Actualizar el wrapper no necesariamente será un cambio aislado: puede requerir adaptar el Android Gradle Plugin, Kotlin, los plugins Gradle de Expo/React Native y módulos nativos. Hasta probar y validar esa actualización, usa Java 21+ para `start:local` y Java 17 para compilar Android.

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

### FCM en iOS: `messaging/third-party-auth-error` / `Invalid APNs credential`

Este error significa que FCM encontró un token, pero APNs rechazó el envío porque la credencial APNs falta, es inválida o ya fue revocada. No se corrige desplegando Functions ni cambiando las reglas de Realtime Database.

#### Crear u obtener una clave APNs

1. Iniciar sesión en [Apple Developer — Keys](https://developer.apple.com/account/resources/authkeys/list) con el equipo propietario del Bundle ID de iOS.
2. Si ya existe una clave APNs válida y se conserva su archivo `.p8`, reutilizarla. Apple permite descargar una clave privada una sola vez; si el archivo se perdió, crear otra y no revocar la anterior hasta verificar la nueva.
3. Para crearla, seleccionar **+**, asignar un nombre, habilitar **Apple Push Notifications service (APNs)**, continuar, registrar y descargar el archivo `.p8`.
4. Guardar de forma segura el **Key ID** mostrado por Apple y el **Team ID** del equipo (Membership details). La clave Team Scoped puede usarse para varias apps del mismo equipo y para sandbox y producción.

Referencias oficiales: [crear una clave privada](https://developer.apple.com/help/account/keys/create-a-private-key) y [comunicarse con APNs usando tokens de autenticación](https://developer.apple.com/help/account/capabilities/communicate-with-apns-using-authentication-tokens/).

#### Cargarla en Firebase

1. Abrir **Firebase Console → Project settings → Cloud Messaging**.
2. Seleccionar la app iOS cuyo Bundle ID coincide exactamente con el build instalado.
3. En **APNs authentication key**, subir el `.p8` e ingresar el **Key ID** y **Team ID**; guardar.
4. Verificar que el App ID de Apple tenga la capacidad **Push Notifications** y que el provisioning profile usado para firmar la app incluya el entitlement APNs correspondiente.

Para el entorno de desarrollo de Rundi, comprobar que Firebase sea `rundi-dev` y el Bundle ID sea `com.driveangel.rundidev`. Si se cambia de entorno, usar el proyecto Firebase, Bundle ID, equipo y provisioning profile que correspondan a ese build.

**Seguridad:** el `.p8` es una clave privada. No incluirlo en Git, en el README ni en mensajes; subirlo directamente a Firebase Console y conservar una copia en un almacén seguro. No revocar una clave compartida por otras apps sin coordinar la rotación.

#### Validar la entrega

- Probar en un iPhone físico. Con React Native Firebase v26, el simulador iOS ARM64 no proporciona un token APNs real para una prueba FCM de extremo a extremo.
- En la app deben aparecer `Token FCM obtenido` y `Token FCM registrado en backend`.
- Después de enviar un mensaje, revisar `firebase functions:log --only onSupportChatMessage`. La notificación debe encontrar tokens y no reportar `Invalid APNs credential`.
- Cambiar la clave APNs en Firebase Console no requiere volver a desplegar Functions; reinstalar o reconstruir la app solo es necesario si también cambian Bundle ID, capabilities, entitlements o firma.

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
| `start` | `npx --yes expo@57.0.27 start --clear` | Inicia Metro con caché limpia |
| `start:dev` | `node scripts/switch-env.js development && npx --yes expo@57.0.27 start --clear` | Env de desarrollo + Metro |
| `start:prod` | `node scripts/switch-env.js production && npx --yes expo@57.0.27 start --clear` | Env de producción + Metro |
| `start:local` | `node scripts/dev-local.cjs` | Stack local + Metro (Docker y JDK 21+) |
| `android` | `expo run:android` | Build y run en Android |
| `ios` | `npx --yes expo@57.0.27 run:ios` | Build y run en iOS con soporte para Device Hub |
| `web` | `expo start --web` | Versión web |
| `test` | `jest` | Tests unitarios |
| `env:dev` | `node scripts/switch-env.js development` | Cambia a env de desarrollo |
| `env:prod` | `node scripts/switch-env.js production` | Cambia a env de producción |
| `prebuild:clean` | `npx expo prebuild --clean` | Regenera `android/` e `ios/` desde cero |
| `prebuild:clean:android` | `npx expo prebuild --clean --platform android` | Regenera solo `android/` desde cero |
| `prebuild:clean:ios` | `npx expo prebuild --clean --platform ios` | Regenera solo `ios/` desde cero |
