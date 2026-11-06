/**
 * Config plugin: con EXPO_UNSIGNED=1 elimina entitlements que exigen firma
 * real (Apple Sign In, Push Notifications), permitiendo compilar sin appleTeamId
 * ni certificados — incluido el flujo de Xcode Archive con Apple ID gratuito
 * (Personal Team). Sign In with Apple y push quedan inoperativos en esa build.
 */
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

module.exports = function withUnsignedBuild(config) {
  if (process.env.EXPO_UNSIGNED !== '1') return config;

  config = withEntitlementsPlist(config, (c) => {
    delete c.modResults['com.apple.developer.applesignin'];
    delete c.modResults['aps-environment'];
    return c;
  });

  // El bundle id alternativo (com.gruporzc.rundi) usa su propio iOS OAuth client;
  // registrar su reversed client id como URL scheme para que Google Sign-In responda.
  const iosClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID_IOS_AUTO_GOOGLE;
  if (iosClientId) {
    const reversed = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`;
    config = withInfoPlist(config, (c) => {
      const urlTypes = c.modResults.CFBundleURLTypes || [];
      const exists = urlTypes.some(
        (t) => Array.isArray(t.CFBundleURLSchemes) && t.CFBundleURLSchemes.includes(reversed)
      );
      if (!exists) {
        urlTypes.push({ CFBundleURLSchemes: [reversed] });
        c.modResults.CFBundleURLTypes = urlTypes;
      }
      return c;
    });
  }

  return config;
};
