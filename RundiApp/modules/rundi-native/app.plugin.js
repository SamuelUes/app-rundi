const { withAndroidManifest, withStringsXml, withAndroidColors, AndroidConfig, withPodfile, withPodfileProperties, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

function withRundiNative(config) {
  // 1. AndroidManifest: permissions + service declaration + tools:replace for Firebase
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = getMainApplicationOrThrow(manifest);

    // Google Maps vector renderer + stacked MapView instances exceed the default
    // ~192MB heap and crash with OutOfMemoryError inside policy_maps_core_dynamite.
    mainApplication.$['android:largeHeap'] = 'true';

    // Add tools namespace if not present
    if (!manifest.manifest.$['xmlns:tools']) {
      manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Add tools:replace to Firebase default_notification_color meta-data
    // Note: expo-notifications adds this meta-data AFTER our plugin, so we handle it
    // in a second withAndroidManifest pass below
    const metaData = mainApplication['meta-data'] || [];
    let modified = false;
    for (const meta of metaData) {
      if (meta.$ && meta.$['android:name'] === 'com.google.firebase.messaging.default_notification_channel_id') {
        meta.$['tools:replace'] = 'android:value';
        modified = true;
      }
    }
    for (const meta of metaData) {
      if (meta.$ && meta.$['android:name'] === 'com.google.firebase.messaging.default_notification_color') {
        meta.$['tools:replace'] = 'android:resource';
        modified = true;
      }
    }
    if (modified) {
      mainApplication['meta-data'] = metaData;
    }

    // Also add tools:replace to expo.modules.notifications.default_notification_color
    for (const meta of metaData) {
      if (meta.$ && meta.$['android:name'] === 'expo.modules.notifications.default_notification_color') {
        meta.$['tools:replace'] = 'android:resource';
        modified = true;
      }
    }
    if (modified) {
      mainApplication['meta-data'] = metaData;
    }

    const permissionsToAdd = [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.RECORD_AUDIO',
    ];

    const existingPermissions = manifest.manifest['uses-permission'] || [];
    for (const perm of permissionsToAdd) {
      const alreadyExists = existingPermissions.some(
        (p) => p.$['android:name'] === perm
      );
      if (!alreadyExists) {
        existingPermissions.push({
          $: { 'android:name': perm },
        });
      }
    }
    manifest.manifest['uses-permission'] = existingPermissions;

    const services = mainApplication.service || [];
    const serviceClassName =
      'com.gruporzc.rundi.rundinative.service.TrackingForegroundService';
    const alreadyDeclared = services.some(
      (s) => s.$['android:name'] === serviceClassName
    );
    if (!alreadyDeclared) {
      services.push({
        $: {
          'android:name': serviceClassName,
          'android:foregroundServiceType': 'location',
          'android:exported': 'false',
        },
      });
    }
    mainApplication.service = services;

    return config;
  });

  // 2. Strings: tracking foreground notification strings
  config = withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string || [];
    const stringsToAdd = [
      { name: 'tracking_foreground_channel_name', value: 'Seguimiento en segundo plano' },
      { name: 'tracking_foreground_channel_description', value: 'Muestra una notificación persistente cuando el seguimiento de ubicación está activo.' },
      { name: 'tracking_foreground_title', value: 'Rundi está rastreando tu viaje' },
      { name: 'tracking_foreground_message', value: 'Tu ubicación se comparte para ofrecer el mejor servicio.' },
      { name: 'default_notification_channel_id', value: 'rundi-default-v2' },
      { name: 'default_notification_channel_name', value: 'Notificaciones de Rundi' },
      { name: 'default_notification_channel_description', value: 'Alertas y notificaciones generales de la app.' },
    ];
    for (const s of stringsToAdd) {
      const exists = strings.some((existing) => existing.$.name === s.name);
      if (!exists) {
        strings.push({ $: { name: s.name }, _: s.value });
      }
    }
    config.modResults.resources.string = strings;
    return config;
  });

  // 3. Colors: notification icon color, primary colors
  config = withAndroidColors(config, (config) => {
    const colors = config.modResults.resources.color || [];
    const colorsToAdd = [
      { name: 'notification_icon_color', value: '#FF9800' },
      { name: 'colorPrimary', value: '#0F2628' },
      { name: 'colorPrimaryDark', value: '#0A1A1C' },
    ];
    for (const c of colorsToAdd) {
      const exists = colors.some((existing) => existing.$.name === c.name);
      if (!exists) {
        colors.push({ $: { name: c.name }, _: c.value });
      }
    }
    config.modResults.resources.color = colors;
    return config;
  });

  // 4. iOS Podfile.properties.json: compilar Expo modules y React Native desde
  // fuente. Los XCFrameworks precompilados de Expo/RN se generan con una versión
  // fija de Swift (6.3.x) y fallan al importarse con toolchains más nuevos
  // (p.ej. Xcode 27 / Swift 6.4: "cannot find type '__ObjC::expo' in scope").
  config = withPodfileProperties(config, (config) => {
    config.modResults['EXPO_USE_PRECOMPILED_MODULES'] = 'false';
    config.modResults['ios.buildReactNativeFromSource'] = 'true';
    return config;
  });

  // 5. iOS Podfile: re-inject custom post_install modifications
  config = withPodfile(config, (config) => {
    // El plugin vendored de Expo (withMapsCocoaPods) emite `pod 'react-native-google-maps'`,
    // podspec que no existe en react-native-maps >= 1.21. La versión instalada (1.29.x)
    // usa el subspec `react-native-maps/Google` del podspec raíz del paquete.
    config.modResults.contents = config.modResults.contents.replace(
      /pod 'react-native-google-maps', path: File\.dirname\(`node --print "require\.resolve\('react-native-maps\/package\.json'\)"`\)/,
      'rn_maps_path = File.dirname(`node --print "require.resolve(\'react-native-maps/package.json\')"`)\n  pod \'react-native-maps/Google\', :path => rn_maps_path'
    );

    const podfile = config.modResults.contents;

    // RNFB v26 resuelve Firebase via SPM por defecto, incompatible con
    // use_frameworks! :linkage => :static → opt-out para usar los pods de CocoaPods.
    const rnfbGlobals = [
      '$RNFirebaseAsStaticFramework = true',
      '$RNFirebaseDisableSPM = true',
    ]
      .filter((line) => !podfile.includes(line))
      .join('\n');
    if (rnfbGlobals) {
      config.modResults.contents = podfile.replace(
        /prepare_react_native_project!/,
        `${rnfbGlobals}\n\nprepare_react_native_project!`
      );
    }

    // `ios.useFrameworks: 'static'` (expo-build-properties) hace que el Podfile generado
    // ya incluya use_frameworks! vía Podfile.properties.json — solo inyectar si faltara.
    if (!config.modResults.contents.includes("use_frameworks!")) {
      config.modResults.contents = config.modResults.contents.replace(
        /use_expo_modules!/,
        "use_expo_modules!\n  use_frameworks! :linkage => :static"
      );
    }

    const postInstallMarker = "RundiNative: custom post_install";
    if (!config.modResults.contents.includes(postInstallMarker)) {
      const customPostInstall = `
    # ${postInstallMarker}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |config|
        config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'

        %w[OTHER_CFLAGS OTHER_CPLUSPLUSFLAGS OTHER_SWIFT_FLAGS].each do |key|
          flags = config.build_settings[key]
          next unless flags
          if flags.is_a?(String)
            config.build_settings[key] = flags.gsub(' -Werror', '').gsub('-Werror', '')
          elsif flags.is_a?(Array)
            config.build_settings[key] = flags.reject { |f| f == '-Werror' }
          end
        end

        # Normalizar deployment target al del proyecto (evita warnings de mismatch)
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = podfile_properties['ios.deploymentTarget'] || '16.4'

        if t.name.include?('react_native_maps') || t.name.include?('react-native-maps') || t.name.include?('AIRMap')
          config.build_settings['DEFINES_MODULE'] = 'NO'
          # Limpiar MODULEMAP_FILE para evitar el warning "MODULEMAP_FILE has no effect if DEFINES_MODULE is not set"
          config.build_settings.delete('MODULEMAP_FILE') if config.build_settings['MODULEMAP_FILE']
        end
      end
    end

    # Desactivar "Based on dependency analysis" en build phases de scripts
    # para evitar warnings de "ambiguous dependencies" (Xcode 15+)
    installer.pods_project.targets.each do |t|
      t.shell_script_build_phases.each do |phase|
        phase.always_out_of_date = '1'
      end
    end

    # También aplicar al target principal de la app
    installer.aggregate_targets.each do |agg|
      agg.user_project.native_targets.each do |native_t|
        native_t.shell_script_build_phases.each do |phase|
          phase.always_out_of_date = '1'
        end
      end
      agg.user_project.save
    end rescue nil
`;

      // Match the closing "end" of post_install block followed by closing "end" of target block
      // The generated Podfile ends with:
      //   post_install do |installer|
      //     react_native_post_install(...)
      //   end
      // end
      config.modResults.contents = config.modResults.contents.replace(
        /(\n  end\nend)\s*$/,
        `\n${customPostInstall}  end\nend\n`
      );
    }

    return config;
  });

  // 6. Second pass: directly modify AndroidManifest.xml to add tools:replace
  // This runs after all other manifest mods have been applied
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const manifestPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'AndroidManifest.xml'
      );
      let manifestContent = fs.readFileSync(manifestPath, 'utf8');

      // Ensure xmlns:tools is present
      if (!manifestContent.includes('xmlns:tools')) {
        manifestContent = manifestContent.replace(
          /<manifest /,
          '<manifest xmlns:tools="http://schemas.android.com/tools" '
        );
      }

      manifestContent = manifestContent.replace(
        /(<meta-data android:name="com\.google\.firebase\.messaging\.default_notification_channel_id"\s+android:value="[^"]*")\/>/,
        '$1 tools:replace="android:value"/>'
      );

      // Add tools:replace to the Firebase default_notification_color meta-data
      manifestContent = manifestContent.replace(
        /(<meta-data android:name="com\.google\.firebase\.messaging\.default_notification_color")(\s+android:resource="[^"]*")\/>/,
        '$1$2 tools:replace="android:resource"/>'
      );

      // Add tools:replace to expo.modules.notifications.default_notification_color meta-data
      manifestContent = manifestContent.replace(
        /(<meta-data android:name="expo\.modules\.notifications\.default_notification_color")(\s+android:resource="[^"]*")\/>/,
        '$1$2 tools:replace="android:resource"/>'
      );

      fs.writeFileSync(manifestPath, manifestContent);
      return config;
    },
  ]);

  // 7. Android: inject Google Services plugin into root and app build.gradle
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const rootBuildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'build.gradle'
      );
      let rootBuildGradle = fs.readFileSync(rootBuildGradlePath, 'utf8');

      if (!rootBuildGradle.includes('com.google.gms:google-services')) {
        rootBuildGradle = rootBuildGradle.replace(
          /classpath\('org\.jetbrains\.kotlin:kotlin-gradle-plugin'\)/,
          "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath('com.google.gms:google-services:4.4.2')"
        );
        fs.writeFileSync(rootBuildGradlePath, rootBuildGradle);
      }

      const appBuildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'build.gradle'
      );
      let appBuildGradle = fs.readFileSync(appBuildGradlePath, 'utf8');

      if (!appBuildGradle.includes('com.google.gms.google-services')) {
        appBuildGradle = appBuildGradle.replace(
          /apply plugin: "com\.facebook\.react"/,
          'apply plugin: "com.facebook.react"\napply plugin: "com.google.gms.google-services"'
        );
        fs.writeFileSync(appBuildGradlePath, appBuildGradle);
      }

      // Ensure local.properties exists with SDK path (prebuild --clean deletes it)
      const localPropsPath = path.join(
        config.modRequest.platformProjectRoot,
        'local.properties'
      );
      if (!fs.existsSync(localPropsPath)) {
        const homeDir = require('os').homedir();
        const defaultSdkPath = path.join(homeDir, 'Library', 'Android', 'sdk');
        if (fs.existsSync(defaultSdkPath)) {
          fs.writeFileSync(localPropsPath, `sdk.dir=${defaultSdkPath}\n`);
          console.log('✅ [rundi-native] Created local.properties with SDK path');
        } else if (process.env.ANDROID_HOME) {
          fs.writeFileSync(localPropsPath, `sdk.dir=${process.env.ANDROID_HOME}\n`);
          console.log('✅ [rundi-native] Created local.properties with ANDROID_HOME');
        } else {
          console.warn('⚠️ [rundi-native] Could not find Android SDK path for local.properties');
        }
      }
      
      return config;
    },
  ]);

  // 8. iOS: inject FirebaseCore import and FirebaseApp.configure() into AppDelegate.swift
  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const appDelegatePath = path.join(
        config.modRequest.platformProjectRoot,
        'Rundi',
        'AppDelegate.swift'
      );
      let appDelegateContent = fs.readFileSync(appDelegatePath, 'utf8');

      // Add import FirebaseCore if not present
      if (!appDelegateContent.includes('import FirebaseCore')) {
        appDelegateContent = appDelegateContent.replace(
          /import ReactAppDependencyProvider/,
          'import ReactAppDependencyProvider\nimport FirebaseCore'
        );
      }

      // Add FirebaseApp.configure() if not present
      // Anchor: `reactNativeFactory = factory` existe tanto en el AppDelegate estándar
      // del template SDK 57 como en la variante con ios.enableSceneSupport.
      if (!appDelegateContent.includes('FirebaseApp.configure()')) {
        const factoryAnchor = 'reactNativeFactory = factory';
        if (!appDelegateContent.includes(factoryAnchor)) {
          throw new Error(
            '[rundi-native] AppDelegate.swift no contiene el anchor esperado ' +
            `"${factoryAnchor}". El template de Expo pudo cambiar; revisar app.plugin.js.`
          );
        }
        appDelegateContent = appDelegateContent.replace(
          factoryAnchor,
          `${factoryAnchor}\n\n    FirebaseApp.configure()`
        );
      }

      fs.writeFileSync(appDelegatePath, appDelegateContent);
      return config;
    },
  ]);

  // 9. iOS: remove duplicate -lc++ from OTHER_LDFLAGS in project.pbxproj (Pods already link it)
  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const pbxprojPath = path.join(
        config.modRequest.platformProjectRoot,
        'Rundi.xcodeproj',
        'project.pbxproj'
      );
      if (!fs.existsSync(pbxprojPath)) return config;

      let pbxContent = fs.readFileSync(pbxprojPath, 'utf8');
      // Remove "-lc++" from OTHER_LDFLAGS arrays (Pods already link it, causing duplicate warning)
      pbxContent = pbxContent.replace(/"\-lc\+\+",/g, '');
      fs.writeFileSync(pbxprojPath, pbxContent);
      return config;
    },
  ]);

  return config;
}

module.exports = withRundiNative;
