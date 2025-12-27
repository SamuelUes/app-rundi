export default {
  name: 'Rundi',
  slug: 'rundi',
  version: 'Beta - 1.6.4',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './src/assets/images/icon_1.2.jpg',
  updates: {
    enabled: true,
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'ON_LOAD',
    url: 'https://u.expo.dev/79fc9fff-5481-4aba-a29a-632db706c382'
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.driveangel.rundidev',
    icon: './src/assets/images/icon_1.2.jpg',
    config: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || 'YOUR_IOS_GOOGLE_MAPS_API_KEY',
      usesNonExemptEncryption: false
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'La aplicación necesita acceder a tu ubicación para mostrarte conductores cercanos.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'La aplicación necesita acceder a tu ubicación en segundo plano para seguir tu viaje.',
      NSCameraUsageDescription: 'La aplicación necesita acceder a tu cámara para tomar fotos de perfil.',
      NSPhotoLibraryUsageDescription: 'La aplicación necesita acceder a tu galería de fotos para subir imágenes.',
      UIBackgroundModes: ['location', 'fetch']
    },
    usesAppleSignIn: true
  },
  android: {
    package: 'com.driveangel.rundidev',
    versionCode: 1,
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: './src/assets/images/icon_1.2.jpg',
      backgroundColor: '#0F2628'
    },
    notification: {
      icon: './src/assets/images/icon_1.2.jpg',
      color: '#D4AF37'
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'INTERNET',
      'VIBRATE',
      'WAKE_LOCK',
      'com.anddoes.launcher.permission.UPDATE_COUNT',
      'com.google.android.c2dm.permission.RECEIVE',
      'com.google.android.gms.permission.ACTIVITY_RECOGNITION',
      'com.htc.launcher.permission.READ_SETTINGS',
      'com.htc.launcher.permission.UPDATE_SHORTCUT',
      'com.majeur.launcher.permission.UPDATE_BADGE',
      'com.sec.android.provider.badge.permission.READ',
      'com.sec.android.provider.badge.permission.WRITE',
      'com.sonyericsson.home.permission.BROADCAST_BADGE'
    ],
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY || 'YOUR_ANDROID_GOOGLE_MAPS_API_KEY'
      }
    },
    useNextNotificationsApi: true
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
        isIosBackgroundLocationEnabled: true
      }
    ],
    'expo-secure-store',
    'expo-font',
    'expo-asset',
    'expo-splash-screen'
  ],
  extra: {
    eas: {
      projectId: '79fc9fff-5481-4aba-a29a-632db706c382'
    },
    apiUrl: process.env.API_URL || '',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    sentryDsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    EXPO_PUBLIC_SUPABASE_URL:
      process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY,
    supabaseUrl: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY
  },
  runtimeVersion: {
    policy: 'sdkVersion'
  },
  owner: 'samuelues',
  privacy: 'unlisted'
};
