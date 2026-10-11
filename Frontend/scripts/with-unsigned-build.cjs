/**
 * Config plugin: con EXPO_UNSIGNED=1 elimina entitlements que exigen firma
 * real (Apple Sign In), permitiendo compilar en simulador sin appleTeamId
 * ni certificados. Sign In with Apple quedará inoperativo en esa build.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withUnsignedBuild(config) {
  if (process.env.EXPO_UNSIGNED !== '1') return config;
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['com.apple.developer.applesignin'];
    return c;
  });
};
