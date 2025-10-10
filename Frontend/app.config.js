export default {
  name: 'AppUber',
  slug: 'app-uber',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  updates: {
    enabled: true,
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'ON_LOAD',
    url: 'https://u.expo.dev/your-project-id'
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.yourapp.appuber',
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
    package: 'com.yourapp.appuber',
    versionCode: 1,
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
      name: 'AppUber',
      shortName: 'AppUber'
    }
  },
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: 'Permitir a AppUber acceder a tu ubicación.',
        isAndroidBackgroundLocationEnabled: true,
        isIosBackgroundLocationEnabled: true
      }
    ],
    'expo-font',
    'expo-asset',
    'expo-splash-screen'
  ],
  extra: {
    eas: {
      projectId: 'your-project-id'
    },
    apiUrl: process.env.API_URL || 'https://api.appuber.com',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    sentryDsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV || 'development'
  },
  runtimeVersion: {
    policy: 'sdkVersion'
  },
  updates: {
    url: 'https://u.expo.dev/your-project-id'
  },
  owner: 'youraccount',
  privacy: 'unlisted'
};
