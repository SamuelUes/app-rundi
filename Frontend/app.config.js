export default {
  name: 'DriveAngel.ni',
  slug: 'driveangel-ni',
  version: '1.0.5',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  updates: {
    enabled: true,
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'ON_LOAD',
    url: 'https://u.expo.dev/e8f4c3b2-9d1a-4e7f-8c5b-2a3d4e5f6a7b'
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.driveangel.app',
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
    package: 'com.driveangel.app',
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
      name: 'DriveAngel',
      shortName: 'DriveAngel'
    }
  },
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: 'Permitir a DriveAngel acceder a tu ubicación.',
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
      projectId: 'e8f4c3b2-9d1a-4e7f-8c5b-2a3d4e5f6a7b'
    },
    apiUrl: process.env.API_URL || 'https://api.driveangel.com',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    sentryDsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV || 'development'
  },
  runtimeVersion: {
    policy: 'sdkVersion'
  },
  owner: 'samuelues',
  privacy: 'unlisted'
};
