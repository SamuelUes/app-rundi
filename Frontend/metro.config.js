const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @expo/cli >= 55 (los scripts `start`/`ios` usan `npx expo@57.0.27` por
// compatibilidad con Device Hub de Xcode 27) redirige a la fuerza
// `react-native/Libraries/Utilities/HMRClient` hacia
// `expo/src/async-require/hmr.ts`. En SDK 54 ese archivo es la variante
// solo-web y crashea en nativo (`window.location` no existe en Hermes).
// Aquí volvemos a resolver la implementación real de RN en plataformas nativas.
const rnHmrClientPattern = /[\/]react-native[\/]Libraries[\/]Utilities[\/]HMRClient(\.js)?$/;
const rnHmrClientPath = path.resolve(
  __dirname,
  'node_modules/react-native/Libraries/Utilities/HMRClient.js'
);
const defaultResolveRequest = config.resolver.resolveRequest;

function isReactNativeHmrClient(moduleName, originModulePath) {
  const normalized = moduleName.replace(/\\/g, '/');
  if (rnHmrClientPattern.test(`/${normalized}`)) return true;
  if (normalized.startsWith('.')) {
    const target = path
      .resolve(path.dirname(originModulePath || ''), moduleName)
      .replace(/\\/g, '/');
    return rnHmrClientPattern.test(target);
  }
  return false;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web' && isReactNativeHmrClient(moduleName, context.originModulePath)) {
    return { type: 'sourceFile', filePath: rnHmrClientPath };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
