// EXPO_UNSIGNED=1 (firma con Apple ID gratuito / Personal Team): el bundle id real
// ya está registrado por otro equipo de Apple y los equipos gratuitos solo pueden
// registrar IDs que no existan, así que usamos uno propio para esas builds.
const iosBundleIdentifier =
  process.env.EXPO_UNSIGNED === '1' ? 'com.samuelues.rundi' : 'com.driveangel.rundidev';
const androidPackage = 'com.gruporzc.rundi';
const androidFirebaseClient = require('./google-services.json').client.find(
  (client) => client.client_info.android_client_info.package_name === androidPackage
);
const androidGoogleWebClientId = androidFirebaseClient?.oauth_client.find(
  (client) => client.client_type === 3
)?.client_id;

export default {
  name: 'Rundi',
  slug: 'rundidev',
  version: '2',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './src/assets/images/rundi_logo.png',
  scheme: 'com.driveangel.rundidev',
  ios: {
    supportsTablet: true,
    deploymentTarget: '16.4',
    bundleIdentifier: iosBundleIdentifier,
    icon: './src/assets/images/rundi_logo.png',
    urlSchemes: ['driveangel', 'tel', 'mailto', 'whatsapp', 'waze', 'googlemaps'],
    userInterfaceStyle: 'automatic',
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || 'YOUR_IOS_GOOGLE_MAPS_API_KEY',
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'La aplicación necesita acceder a tu ubicación para mostrarte conductores cercanos.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'La aplicación necesita acceder a tu ubicación en segundo plano para seguir tu viaje.',
      NSCameraUsageDescription: 'La aplicación necesita acceder a tu cámara para tomar fotos de perfil.',
      NSPhotoLibraryUsageDescription: 'La aplicación necesita acceder a tu galería de fotos para subir imágenes.',
      NSMotionUsageDescription: 'Rundi utiliza tu actividad física para detectar cuándo estás manejando y mejorar la asignación de viajes.',
      UIBackgroundModes: ['location', 'fetch'],
      NSSupportsLiveActivities: true,
    },
    // Requerido por expo-secure-store/notifications en iOS Simulator (sin perfil de
    // aprovisionamiento real, Keychain rechaza el acceso con errSecMissingEntitlement).
    entitlements: {
      'keychain-access-groups': [`$(AppIdentifierPrefix)${iosBundleIdentifier}`],
    },
    // EXPO_UNSIGNED=1 omite capabilities que exigen firma real (Apple Sign In),
    // permitiendo builds de simulador sin appleTeamId ni certificados.
    // usesAppleSignIn: true,
    usesAppleSignIn: process.env.EXPO_UNSIGNED !== '1',
    googleServicesFile: "./GoogleService-Info.plist"
  },
  android: {
    package: androidPackage,
    versionCode: 1,
    userInterfaceStyle: 'automatic',
    allowBackup: false,
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      foregroundImage: './src/assets/images/rundi_icon-android3.png',
      backgroundColor: '#FFFFFF',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'SYSTEM_ALERT_WINDOW',
      'INTERNET',
      'VIBRATE',
      'WAKE_LOCK',
      'ACTIVITY_RECOGNITION',
      'CAMERA',
      'RECORD_AUDIO',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'POST_NOTIFICATIONS',
      'RECEIVE_BOOT_COMPLETED',
      'com.anddoes.launcher.permission.UPDATE_COUNT',
      'com.google.android.c2dm.permission.RECEIVE',
      'com.google.android.gms.permission.ACTIVITY_RECOGNITION',
      'com.htc.launcher.permission.READ_SETTINGS',
      'com.htc.launcher.permission.UPDATE_SHORTCUT',
      'com.majeur.launcher.permission.UPDATE_BADGE',
      'com.sec.android.provider.badge.permission.READ',
      'com.sec.android.provider.badge.permission.WRITE',
      'com.sonyericsson.home.permission.BROADCAST_BADGE',
    ],
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY || 'YOUR_ANDROID_GOOGLE_MAPS_API_KEY',
      },
    },
    intentFilters: [
      {
        action: 'VIEW',
        data: {
          scheme: 'rundi',
        },
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    build: {
      babel: {
        include: [
          '@babel/preset-react',
          'react-native-reanimated/plugin',
          'react-native-svg'
        ]
      }
    },
    pwa: {
      name: 'Rundi',
      shortName: 'Rundi'
    }
  },
  plugins: [
    '@bacons/apple-targets',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: 'Permitir a Rundi acceder a tu ubicación.',
        isAndroidBackgroundLocationEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    'expo-secure-store',
    'expo-font',
    'expo-asset',
    'expo-image',
    "expo-web-browser",
    [
      'expo-splash-screen',
      {
        image: './src/assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#dfd4b8',
        dark: {
          image: './src/assets/images/splash-icon.png',
          backgroundColor: '#343286',
        },
      },
    ],
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Permitir uso de FaceID',
      },
    ],
    './modules/rundi-native/app.plugin.js',
    [
      'expo-notifications',
      {
        icon: './src/assets/images/notification_icon.png',
        color: '#b6915a',
        sounds: ['./src/assets/sounds/notification.wav'],
        defaultChannel: 'rundi-default-v2',
        mode: 'production',
        enableBackgroundRemoteNotifications: true,
      },
    ],
    // [
    //   'expo-google-app-auth',
    //   {
    //     iosClientId: '1040329608349-tl5cpqbf5gn10atmspkq7ligjivebuji.apps.googleusercontent.com',
    //     androidClientId: '1040329608349-t11k2f7tu1gtrh8fpogu3n1gmf2gi8p3.apps.googleusercontent.com',
    //   },
    // ],
    // [
    //   'react-native-firebase',
    //   {
    //     messaging_android_notification_channel_id: 'default',
    //     messaging_android_notification_priority: 'priority_high',
    //   },
    // ],
    'expo-localization',
    'expo-status-bar',
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
          enableSceneSupport: true,
          // Xcode 27 trae Swift 6.4 y los XCFrameworks precompilados de Expo/RN
          // se generaron con Swift 6.3.1 -> compilar todo desde fuente.
          buildReactNativeFromSource: true,
          usePrecompiledModules: false,
          extraPods: [
            // Firebase Auth reCAPTCHA Enterprise (SMS fraud defense) requiere el
            // SDK nativo linkeado; sin él falla con ERROR_RECAPTCHA_SDK_NOT_LINKED.
            // >=18.9.0 evita crashes en iOS 27 beta según doc oficial.
            { name: 'RecaptchaEnterprise', version: '~> 18.9' },
          ],
        },
      },
    ],
    './scripts/with-unsigned-build.cjs',
    './modules/rundi-native/app.plugin.js',
  ],
  extra: {
    androidGoogleWebClientId,
    eas: {
      projectId: 'e2fb53cb-9a9b-41a7-add2-9d172115fd77'
    },
    notificationsProjectId:
      process.env.EXPO_PUBLIC_NOTIFICATIONS_PROJECT_ID ||
      process.env.EXPO_NOTIFICATIONS_PROJECT_ID ||
      'e2fb53cb-9a9b-41a7-add2-9d172115fd77',
    domain: process.env.EXPO_PUBLIC_DOMAIN || 'rundiapp.com',
    apiUrl: process.env.API_URL || '',
    wsUrl: process.env.WS_URL || '',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    sentryDsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
  },
  owner: 'rundi-dev',
};
