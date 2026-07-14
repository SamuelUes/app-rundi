const { withAndroidManifest, withStringsXml, withAndroidColors, AndroidConfig, withPodfile, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

function withRundiNative(config) {
  // 1. AndroidManifest: permissions + service declaration + tools:replace for Firebase
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = getMainApplicationOrThrow(manifest);

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
      'com.driveangel.rundidev.rundinative.service.TrackingForegroundService';
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
      { name: 'default_notification_channel_id', value: 'rundi_default_channel' },
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

  // 4. iOS Podfile: re-inject custom post_install modifications
  config = withPodfile(config, (config) => {
    const podfile = config.modResults.contents;

    if (!podfile.includes('$RNFirebaseAsStaticFramework = true')) {
      config.modResults.contents = podfile.replace(
        /prepare_react_native_project!/,
        "$RNFirebaseAsStaticFramework = true\n\nprepare_react_native_project!"
      );
    }

    if (!config.modResults.contents.includes("react-native-google-maps")) {
      config.modResults.contents = config.modResults.contents.replace(
        /config = use_native_modules!\(config_command\)/,
        `pod 'react-native-google-maps', path: File.dirname(\`node --print "require.resolve('react-native-maps/package.json')"\`)\n  config = use_native_modules!(config_command)`
      );
    }

    if (!config.modResults.contents.includes("use_frameworks! :linkage => :static")) {
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

        if t.name.start_with?('RNFB') || t.name.include?('react_native_maps') || t.name.include?('react-native-maps') || t.name.include?('AIRMap')
          config.build_settings['DEFINES_MODULE'] = 'NO'
        end
      end
    end
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

  // 5. Second pass: directly modify AndroidManifest.xml to add tools:replace
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

  // 6. iOS: inject FirebaseCore import and FirebaseApp.configure() into AppDelegate.swift
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
      if (!appDelegateContent.includes('FirebaseApp.configure()')) {
        appDelegateContent = appDelegateContent.replace(
          /bindReactNativeFactory\(factory\)/,
          'bindReactNativeFactory(factory)\n\n    FirebaseApp.configure()'
        );
      }

      fs.writeFileSync(appDelegatePath, appDelegateContent);
      return config;
    },
  ]);

  return config;
}

module.exports = withRundiNative;
