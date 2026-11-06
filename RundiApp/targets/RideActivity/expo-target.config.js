/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'RideActivity',
  displayName: 'Rundi Viajes',
  deploymentTarget: '16.4',
  bundleIdentifier: '.RideActivity',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $accent: '#FF9800',
    $widgetBackground: '#110f28',
    rideBackground: { light: '#282171', dark: '#282171' },
    rideAccent: { light: '#FF9800', dark: '#FFB74D' },
    rideText: { light: '#FFFFFF', dark: '#FFFFFF' },
    rideSubtext: { light: '#B0BEC5', dark: '#90A4AE' },
  },
  images: {
    appIcon: '../../src/assets/images/rundi_mark.png',
  },
};
