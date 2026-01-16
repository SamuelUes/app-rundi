export default {
  name: 'Rundi',
  slug: 'rundi',
  version: 'Beta - 1.6.4',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './src/assets/images/icon.png',
  scheme: 'com.driveangel.rundidev',
  updates: {
    enabled: true,
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'ON_LOAD',
    url: 'https://u.expo.dev/98fe5b45-4177-4d65-8ce3-6b783abfe196'
  },
  assetBundlePatterns: ['**/*'],
  splash: {
    image: './src/assets/images/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.driveangel.rundidev',
    icon: './src/assets/images/icon.png',
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
    },
    usesAppleSignIn: true,
    googleServicesFile: "./GoogleService-Info.plist"
  },
  android: {
    package: 'com.driveangel.rundidev',
    versionCode: 1,
    userInterfaceStyle: 'automatic',
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: './src/assets/images/icon.png',
      backgroundColor: '#0F2628',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'INTERNET',
      'VIBRATE',
      'WAKE_LOCK',
      'ACTIVITY_RECOGNITION',
      'CAMERA',
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
    'expo-splash-screen',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Permitir uso de FaceID',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './src/assets/images/icon.png',
        color: '#FF9800',
        sounds: ['./src/assets/sounds/notification.wav'],
        mode: 'production',
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
  ],
  extra: {
    eas: {
      projectId: '98fe5b45-4177-4d65-8ce3-6b783abfe196'
    },
    notificationsProjectId:
      process.env.EXPO_PUBLIC_NOTIFICATIONS_PROJECT_ID ||
      process.env.EXPO_NOTIFICATIONS_PROJECT_ID ||
      '98fe5b45-4177-4d65-8ce3-6b783abfe196',
    domain: process.env.EXPO_PUBLIC_DOMAIN || 'rundiapp.com',
    apiUrl: process.env.API_URL || '',
    wsUrl: process.env.WS_URL || '',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    sentryDsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    EXPO_PUBLIC_SUPABASE_URL:
      process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY,
    supabaseUrl: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://cypllfzespkzhtyeitlv.supabase.co',
    supabaseKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_KEY ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5cGxsZnplc3Bremh0eWVpdGx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNTExMTMsImV4cCI6MjA3OTgyNzExM30.8PN8T7kaf_acPFJAkONgqec8zxePnu8hwZ_gXkkGJ78',
  },
  runtimeVersion: 'Beta - 1.6.4',
  owner: 'samuelues',
};
